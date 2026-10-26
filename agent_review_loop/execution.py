"""One native WorkBuddy turn, then the existing fixed-snapshot review pipeline."""
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import time
from uuid import uuid4

from .processes import ProcessTree
from .review_jobs import ReviewJobs
from .snapshots import canonical, current_tree
from .store import StoreError, _text

ROOT = Path(__file__).resolve().parents[1]
DRIVER = ROOT / 'integrations/workbuddy/native-driver.mjs'


def node_executable():
    node = os.environ.get('ARL_NODE') or shutil.which('node')
    if not node or not Path(node).is_file():
        raise StoreError('NODE_NOT_FOUND', 'Set ARL_NODE to the existing Node.js 22+ executable')
    return Path(node).resolve()


def native_run(payload, directory, executable, *, cancel_check=lambda: False, on_event=lambda event: None,
               timeout=900):
    """JSONL only; an interrupted dispatch is never retried. Own only the helper process."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    events = queue.Queue(maxsize=100)
    with ProcessTree([str(executable), str(DRIVER)], ROOT, directory / 'helper.stderr') as child:
        child.stdin.write(canonical(payload) + b'\n')
        child.stdin.flush()

        def read():
            try:
                while True:
                    line = child.stdout.readline(128 * 1024 + 1)
                    if not line:
                        break
                    if len(line) > 128 * 1024:
                        events.put({'event': 'error', 'error': 'Oversized native response'})
                        break
                    value = json.loads(line)
                    if not isinstance(value, dict) or not isinstance(value.get('event'), str):
                        raise ValueError('Invalid native response')
                    events.put(value)
            except Exception:
                events.put({'event': 'error', 'error': 'Invalid native helper response'})
            finally:
                events.put(None)

        threading.Thread(target=read, daemon=True).start()
        started, stop_at, cancelling = time.monotonic(), None, False
        submitted = False
        while True:
            now = time.monotonic()
            if (cancel_check() or now - started > timeout) and not cancelling:
                cancelling = True
                stop_at = now + 12
                try:
                    child.stdin.write(b'{"command":"cancel"}\n')
                    child.stdin.flush()
                except OSError:
                    pass
            if stop_at and now > stop_at:
                raise StoreError('EXECUTION_STOP_UNKNOWN', 'WorkBuddy stop was not confirmed; inspect the dedicated native session')
            try:
                event = events.get(timeout=.2)
            except queue.Empty:
                continue
            if event is None:
                break
            on_event(event)
            if event['event'] == 'dispatched':
                submitted = True
            if event['event'] == 'error':
                raise StoreError('DISPATCH_UNKNOWN' if submitted or payload.get('command') == 'run' else 'WORKBUDDY_NOT_CONNECTED',
                                 event.get('error', 'Native execution failed'))
            if event['event'] in ('turn_ended', 'cancelled', 'connected') or (payload.get('command') == 'inspect' and event['event'] == 'state'):
                return event
        raise StoreError('DISPATCH_UNKNOWN', 'Native helper closed without a confirmed terminal receipt')


def workbuddy_connection(root, launch=False):
    try:
        executable = node_executable()
        if launch:
            buddy = Path(os.environ.get('ARL_WORKBUDDY_EXECUTABLE') or
                         Path(os.environ.get('LOCALAPPDATA', '')) / 'Programs/WorkBuddy/WorkBuddy.exe').resolve()
            if not buddy.is_file():
                raise StoreError('WORKBUDDY_NOT_FOUND', 'WorkBuddy desktop executable was not found')
            # The persistent user app must NOT inherit the helper's kill-on-close Job.
            subprocess.Popen([str(buddy)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             close_fds=True, env={**os.environ, 'WORKBUDDY_REMOTE_DEBUGGING_PORT': os.environ.get('ARL_WORKBUDDY_CDP_PORT', '18493')},
                             creationflags=(subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS) if os.name == 'nt' else 0)
            time.sleep(3)
        directory = Path(root) / 'connections' / uuid4().hex
        return native_run({'command': 'status'}, directory, executable, timeout=20)
    except StoreError as error:
        return {'connected': False, 'code': error.code, 'error': str(error)}


class ExecutionJobs(ReviewJobs):
    table = 'execution_jobs'
    error_prefix = 'EXECUTION'

    def __init__(self, store, tasks, plans, reviews, root=None, *, runner=native_run, executable=None):
        super().__init__(store, root or reviews.root, runner=runner,
                         executable=executable or os.environ.get('ARL_NODE') or shutil.which('node'), backend='workbuddy-native')
        self.tasks, self.plans, self.reviews = tasks, plans, reviews

    @staticmethod
    def _public(row):
        result = ReviewJobs._public(row)
        details = json.loads(row['result_json']) if row['result_json'] else {}
        return {**result, **{key: details.get(key) for key in
                            ('session_id', 'phase', 'review_job_id', 'review_error', 'summary', 'model')}}

    def start_execution(self, task_id, request_id):
        context = self.tasks.context(task_id)
        _text(request_id, 'request_id', 128)
        with self.store._connection() as db:
            previous = db.execute('SELECT * FROM execution_jobs WHERE task_id=?', (task_id,)).fetchone()
        if previous:
            if previous['request_id'] != request_id:
                raise StoreError('EXECUTION_EXISTS', 'This task already has an execution receipt; inspect it rather than dispatch again')
            return self.status(previous['id'])
        if context['task']['status'] != 'ready':
            raise StoreError('TASK_NOT_READY', 'Task is already claimed or submitted')
        plan_id = context['latest_plan_job_id']
        if not plan_id:
            raise StoreError('PLAN_REQUIRED', 'Generate a plan before dispatching WorkBuddy')
        plan = self.plans.read_plan(plan_id)
        if plan['freshness'] != 'current':
            raise StoreError('PLAN_STALE', 'Code changed after planning; update the plan first')
        if self.runner is native_run:
            connection = workbuddy_connection(self.root)
            if not connection.get('connected'):
                raise StoreError('WORKBUDDY_NOT_CONNECTED', connection.get('error', 'WorkBuddy is not connected'))
        if not self.executable:
            self.executable = str(node_executable())
        return self.start_review(task_id, context['workspace'], context['base_commit'], request_id)

    def _save_details(self, job_id, details):
        with self.store._connection(write=True) as db:
            db.execute('UPDATE execution_jobs SET result_json=?,updated_at=? WHERE id=?',
                       (json.dumps(details, ensure_ascii=False), time.time(), job_id))

    def _work(self, job_id, task, repo, base_ref, directory, executable, lock):
        details = {'session_id': str(uuid4()), 'phase': 'preparing', 'review_job_id': None,
                   'wake_id': 'wake-run-' + str(uuid4())}
        try:
            context = self.tasks.context(task['task_id'])
            plan = self.plans.read_plan(context['latest_plan_job_id'])
            if plan['freshness'] != 'current':
                raise StoreError('PLAN_STALE', 'Plan changed before dispatch')
            details.update(plan_id=plan['plan_id'], input_tree=current_tree(repo))
            self._save_details(job_id, details)  # Save identity BEFORE any native request.
            owner = 'rondo-workbuddy-' + job_id
            prompt = (
                '你是 Rondo 的 WorkBuddy 执行者。使用你当前的模型、Skills 和工具完成下面的开发任务。\n'
                '先通过 agent-review-loop MCP 的 get_task_context 读取任务，并核对返回的 workspace 与以下路径完全一致。'
                '若工具不可用或目录不一致，停止并说明原因。\n'
                f"task_id={task['task_id']}\nworkspace={repo}\n"
                f"使用 claim_task 领取，owner 必须是 {owner}；expected_version 使用刚读取的版本；lease_seconds=900。\n"
                '只在指定工作区修改代码，先读项目约定，再按计划实现并运行相关检查。长任务及时 renew_claim。'
                '完成后必须通过 submit_result 提交真实修改和检查摘要，使用领取返回的 attempt_id、claim_token、version；'
                f'request_id 使用 {job_id}。不要自行调用规划或审查工具，Rondo 会自动接续审查。'
                '不要承诺未执行的检查，不要修改其他目录，不要提交Git或发送外部消息。\n'
                + canonical({'title': task['title'], 'instructions': task['instructions'],
                             'acceptance': task['acceptance'], 'plan': plan['plan']}).decode('utf-8')
            )
            payload = {'command': 'run', 'session_id': details['session_id'], 'wake_id': details['wake_id'],
                       'workspace': str(repo), 'title': task['title'], 'prompt': prompt}
            model = os.environ.get('ARL_WORKBUDDY_MODEL')
            if model:
                payload['model'] = model
            (directory / 'input.json').write_bytes(canonical(payload) + b'\n')

            def event(value):
                phase = value['event']
                if phase == 'state':
                    phase = 'waiting_input' if value.get('state') == 'waiting_input' else 'running'
                details['phase'] = phase
                if value['event'] == 'dispatched' and value.get('model'):
                    details['model'] = value['model']
                self._save_details(job_id, details)
                if value['event'] == 'session_created' and os.name == 'nt' and self.runner is native_run:
                    # Adapted from Kxiandaoyan's activate_via_deeplink: open ONLY our new session.
                    try:
                        os.startfile('workbuddy://chat/' + details['session_id'])
                    except OSError:
                        details['activation_notice'] = 'Open the dedicated session in WorkBuddy to inspect its progress'
                if value['event'] == 'dispatched':
                    with self.store._connection(write=True) as db:
                        db.execute("UPDATE execution_jobs SET state='running' WHERE id=? AND state='preparing'", (job_id,))

            result = self.runner(payload, directory / 'runtime', executable,
                                 cancel_check=lambda: self._cancelled(job_id), on_event=event)
            if result.get('event') == 'cancelled':
                details['phase'] = 'cancelled'
                self._finish(job_id, 'cancelled', details)
                return
            if self._cancelled(job_id):
                raise StoreError('EXECUTION_STOP_UNKNOWN', 'Cancellation did not return a confirmed native stop')
            submitted = self.store.get_task(task['task_id'])
            report = submitted.get('result') or {}
            with self.store._connection() as db:
                attempt = db.execute('SELECT owner FROM attempts WHERE id=? AND task_id=?',
                                     (report.get('attempt_id'), task['task_id'])).fetchone()
            if submitted['status'] != 'submitted' or not attempt or attempt['owner'] != owner:
                raise StoreError('EXECUTION_REPORT_MISSING', 'Native turn ended without a result from this WorkBuddy execution')
            details.update(phase='submitted', summary=report['summary'], output_tree=current_tree(repo))
            self._finish(job_id, 'succeeded', details)
            try:
                review = self.reviews.start_review(task['task_id'], str(repo), base_ref, 'execution-' + job_id)
                details['review_job_id'] = review['job_id']
            except Exception as error:
                details['review_error'] = getattr(error, 'code', 'AUTO_REVIEW_FAILED')
            self._save_details(job_id, details)
        except Exception as error:
            code = getattr(error, 'code', 'EXECUTION_FAILED')
            details.update(phase='dispatch_unknown' if code in ('DISPATCH_UNKNOWN', 'EXECUTION_STOP_UNKNOWN') else 'failed',
                           summary=str(error)[:1400])
            self._finish(job_id, 'failed', details, code)
        finally:
            lock.close()
            with self._guard:
                self._workers.pop(job_id, None)
