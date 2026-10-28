"""One native WorkBuddy turn, then the existing fixed-snapshot review pipeline."""
import json
import os
from pathlib import Path
import queue
import re
import shutil
import sqlite3
import subprocess
import threading
import time
from uuid import uuid4

from .processes import ProcessTree
from .review_jobs import ReviewJobs
from .repair import repair_context, unauthorized_changed_files
from .snapshots import _git, canonical, current_tree
from .store import StoreError, _text, _timestamp
from .native_session import write_state, interactive_request
from .codex_rpc import ReviewCancelled
from .workbuddy_progress import project_update, public_text
from .model_settings import model_selection, validate_choice, validate_model_choice

ROOT = Path(__file__).resolve().parents[1]
DRIVER = ROOT / 'integrations/workbuddy/native-driver.mjs'


def node_executable():
    node = os.environ.get('ARL_NODE') or shutil.which('node')
    if not node or not Path(node).is_file():
        raise StoreError('NODE_NOT_FOUND', 'Set ARL_NODE to the existing Node.js 22+ executable')
    return Path(node).resolve()


def native_run(payload, directory, executable, *, cancel_check=lambda: False, on_event=lambda event: None,
               timeout=3600):
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
        stop_reason = None
        while True:
            now = time.monotonic()
            if (cancel_check() or now - started > timeout) and not cancelling:
                stop_reason = 'timeout' if now - started > timeout else 'user_cancelled'
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
            try:
                answer = on_event(event)
            except (ReviewCancelled, TimeoutError) as error:
                if event['event'] != 'permission_request': raise
                cancelling, stop_at = True, time.monotonic() + 12
                stop_reason = 'user_cancelled' if isinstance(error, ReviewCancelled) else 'input_timeout'
                child.stdin.write(b'{"command":"cancel"}\n')
                child.stdin.flush()
                continue
            if event['event'] == 'permission_request' and isinstance(answer, str):
                child.stdin.write(canonical({'command': 'answer_permission', 'request_id': event['request_id'], 'option_id': answer}) + b'\n')
                child.stdin.flush()
            if event['event'] == 'dispatched':
                submitted = True
            if event['event'] == 'error':
                raise StoreError('DISPATCH_UNKNOWN' if submitted or payload.get('command') == 'run' else 'WORKBUDDY_NOT_CONNECTED',
                                 event.get('error', 'Native execution failed'))
            if event['event'] in ('turn_ended', 'cancelled', 'connected') or (payload.get('command') == 'inspect' and event['event'] == 'state'):
                return {**event, **({'stop_reason': stop_reason, 'timeout_seconds': timeout} if stop_reason else {})}
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
        self.native_routing = runner is native_run

    @staticmethod
    def _public(row):
        result = ReviewJobs._public(row)
        if result.get('backend') == 'workbuddy-native': result['backend'] = 'workbuddy'
        details = json.loads(row['result_json']) if row['result_json'] else {}
        return {**result, **{key: details.get(key, result.get(key)) for key in
                            ('session_id', 'phase', 'review_job_id', 'review_error', 'summary', 'model',
                             'mode', 'source_review_job_id', 'repair_job_id', 'repair_error', 'plan_id', 'plan_job_id', 'plan_version')}}

    def start_execution(self, task_id, request_id, plan_job_id=None, expected_plan_id=None, model_choice=None, review_model_choice=None):
        context = self.tasks.context(task_id)
        _text(request_id, 'request_id', 128)
        validate_model_choice(model_choice)
        validate_model_choice(review_model_choice)
        if request_id.startswith('repair-'):
            raise StoreError('INVALID_ARGUMENT', 'repair- request IDs are reserved for reviewed repairs')
        with self.store._connection() as db:
            previous = db.execute('SELECT * FROM execution_jobs WHERE task_id=? AND request_id=?',
                                  (task_id, request_id)).fetchone()
            exists = db.execute('SELECT 1 FROM execution_jobs WHERE task_id=? LIMIT 1', (task_id,)).fetchone()
        if previous:
            saved = json.loads(previous['result_json'] or '{}')
            if ((plan_job_id and saved.get('plan_job_id') != plan_job_id) or
                    (expected_plan_id and saved.get('plan_id') != expected_plan_id) or
                    (model_choice is not None and (saved.get('requested_model') != model_choice.get('model') or saved.get('requested_effort') != model_choice.get('effort'))) or
                    (review_model_choice is not None and saved.get('review_model_choice') != review_model_choice)):
                raise StoreError('IDEMPOTENCY_CONFLICT', '这个执行请求已绑定另一份计划')
            return self.status(previous['id'])
        if exists:
            raise StoreError('EXECUTION_EXISTS', 'This task already has an execution receipt; inspect it rather than dispatch again')
        if context['task']['status'] != 'ready':
            raise StoreError('TASK_NOT_READY', 'Task is already claimed or submitted')
        plan_id = context['latest_plan_job_id']
        if not plan_id:
            raise StoreError('PLAN_REQUIRED', 'Generate a plan before dispatching WorkBuddy')
        with self.store._connection() as db:
            saved = db.execute("SELECT id FROM plan_jobs WHERE task_id=? AND state='succeeded' ORDER BY created_at DESC,id DESC LIMIT 1", (task_id,)).fetchone()
        if not saved:
            raise StoreError('PLAN_REQUIRED', '尚无可采用的计划，请先生成或修订方案')
        plan = self.plans.read_plan(saved['id'])
        if ((plan_job_id and plan['job_id'] != plan_job_id) or
                (expected_plan_id and plan['plan_id'] != expected_plan_id)):
            raise StoreError('PLAN_SELECTION_CHANGED', '计划已经更新；请查看当前版本后再执行')
        if plan['freshness'] != 'current':
            raise StoreError('PLAN_STALE', 'Code changed after planning; update the plan first')
        agent = self.selected_agent(task_id) if self.native_routing else 'workbuddy'
        choice = model_selection(agent) if model_choice is None else model_choice
        reviewer = self.reviews.selected_agent(task_id) if self.native_routing else 'codex'
        review_choice = model_selection(reviewer) if review_model_choice is None else review_model_choice
        requested_model = choice.get('model') or (os.environ.get('ARL_WORKBUDDY_MODEL') if agent == 'workbuddy' else None)
        if self.runner is native_run and self.selected_agent(task_id) == 'workbuddy':
            connection = workbuddy_connection(self.root)
            if not connection.get('connected'):
                raise StoreError('WORKBUDDY_NOT_CONNECTED', connection.get('error', 'WorkBuddy is not connected'))
            validate_choice(connection.get('models', []), {'model': requested_model})
        if not self.executable:
            self.executable = str(node_executable())
        return self.start_review(task_id, context['workspace'], context['base_commit'], request_id,
                                 input_data={'requested_model': requested_model, 'requested_effort':choice.get('effort'), 'review_model_choice': review_choice, 'plan_job_id': plan['job_id'], 'plan_id': plan['plan_id'],
                                             'plan_version': plan.get('version', 1), 'latest_plan_job_id': plan_id,
                                             'adopted_plan': {'job_id': plan['job_id'], 'plan_id': plan['plan_id'],
                                                              'version': plan.get('version', 1), 'plan': plan['plan']}})

    def start_repair(self, source_review_job_id, model_choice=None):
        validate_model_choice(model_choice)
        if not isinstance(source_review_job_id, str) or not re.fullmatch('[a-f0-9]{32}', source_review_job_id):
            raise StoreError('INVALID_ARGUMENT', 'Expected a source review job ID')
        request_id = 'repair-' + source_review_job_id
        with self.store._connection() as db:
            previous = db.execute('SELECT * FROM execution_jobs WHERE request_id=?', (request_id,)).fetchone()
            source = db.execute('SELECT task_id FROM review_jobs WHERE id=?', (source_review_job_id,)).fetchone()
        if previous:
            saved = json.loads(previous['result_json'] or '{}')
            if model_choice is not None and (saved.get('requested_model') != model_choice['model'] or saved.get('requested_effort') != model_choice.get('effort')):
                raise StoreError('IDEMPOTENCY_CONFLICT', '该返修已绑定其他模型，请查看已有记录')
            return self.status(previous['id'])
        if not source:
            raise StoreError('REVIEW_NOT_FOUND', 'Source review does not exist')
        context = self.tasks.context(source['task_id'])
        # Validate before connecting, then repeat under the reservation transaction.
        with self.store._connection() as db:
            repair_context(db, source['task_id'], source_review_job_id, context['workspace'])
        if self.runner is native_run and self.selected_agent(source['task_id']) == 'workbuddy':
            connection = workbuddy_connection(self.root)
            if not connection.get('connected'):
                raise StoreError('WORKBUDDY_NOT_CONNECTED', connection.get('error', 'WorkBuddy is not connected'))
            if model_choice:
                validate_choice(connection.get('models', []), model_choice)
        return self.start_review(source['task_id'], context['workspace'], context['base_commit'], request_id,
                                 input_data={'model_choice': model_choice} if model_choice else None)

    def _prepare_start(self, db, task, repo, request_id):
        count = db.execute('SELECT count(*) FROM execution_jobs WHERE task_id=?', (task['task_id'],)).fetchone()[0]
        row = self.store._task(db, task['task_id'])
        if not request_id.startswith('repair-'):
            if count:
                raise StoreError('EXECUTION_EXISTS', 'Initial execution already has a durable receipt')
            active = db.execute("SELECT 1 FROM attempts WHERE task_id=? AND state='active' AND expires_at>?",
                                (task['task_id'], self.store.clock())).fetchone()
            if row['state'] != 'ready' or active:
                raise StoreError('TASK_NOT_READY', 'Task is already claimed or submitted')
            selection = task.get('_request', {})
            latest = db.execute('SELECT id FROM plan_jobs WHERE task_id=? ORDER BY created_at DESC LIMIT 1',
                                (task['task_id'],)).fetchone()
            if selection and (not latest or latest['id'] != selection['latest_plan_job_id']):
                raise StoreError('PLAN_SELECTION_CHANGED', '计划已经更新；请重新查看后执行')
            return {'mode': 'implementation', **selection}
        prior = db.execute("SELECT 1 FROM execution_jobs WHERE task_id=? AND request_id LIKE 'repair-%'",
                           (task['task_id'],)).fetchone()
        if prior:
            raise StoreError('REPAIR_BUDGET_EXHAUSTED', 'This task already used its one repair')
        if row['state'] != 'submitted':
            raise StoreError('TASK_NOT_SUBMITTED', 'A repair requires the previous submitted result')
        inputs = repair_context(db, task['task_id'], request_id[7:], repo)
        db.execute("UPDATE tasks SET state='ready',version=version+1,updated_at=? WHERE id=?",
                   (_timestamp(self.store.clock()), task['task_id']))
        initial = db.execute("SELECT result_json FROM execution_jobs WHERE task_id=? AND request_id NOT LIKE 'repair-%' ORDER BY created_at LIMIT 1", (task['task_id'],)).fetchone()
        selection = json.loads(initial['result_json'] or '{}') if initial else {}
        override = task.get('_request', {}).get('model_choice')
        return {'mode': 'repair', 'source_review_job_id': request_id[7:], 'repair_input': inputs,
                'requested_model': override['model'] if override else selection.get('requested_model'),
                'requested_effort': override.get('effort') if override else selection.get('requested_effort'),
                'review_model_choice': selection.get('review_model_choice')}

    def _continue_after_review(self, job_id, details):
        # Aider's bounded reflection rule: one repair only; never reset on refresh/restart.
        try:
            while not self._closing:
                state = self.reviews.status(details['review_job_id'])
                if state['status'] in ('succeeded', 'failed', 'cancelled', 'interrupted'):
                    break
                time.sleep(.25)
            if self._closing:
                return
            if state['status'] != 'succeeded':
                details['phase'] = 'review_stopped'
            else:
                review = self.reviews.read_review(details['review_job_id'])
                if review['verdict'] == 'approved':
                    details['phase'] = 'completed'
                elif details['mode'] == 'repair':
                    details['phase'] = 'needs_attention'
                else:
                    repair = self.start_repair(details['review_job_id'])
                    details.update(phase='repairing', repair_job_id=repair['job_id'])
        except Exception as error:
            details.update(phase='handoff_stopped', repair_error=getattr(error, 'code', 'REPAIR_HANDOFF_FAILED'))
        self._save_details(job_id, details)

    def _save_details(self, job_id, details):
        with self.store._connection(write=True) as db:
            db.execute('UPDATE execution_jobs SET result_json=?,updated_at=? WHERE id=?',
                       (json.dumps(details, ensure_ascii=False), time.time(), job_id))

    def _managed_turn(self, job_id, task, repo, directory, executable, agent, plan, owner, details):
        from .codex_review import run_inline_json
        current = self.store.get_task(task['task_id'])
        claim = self.store.claim_task(task['task_id'], owner, current['version'], 900)
        schema = {'type': 'object', 'properties': {'summary': {'type': 'string'}},
                  'required': ['summary'], 'additionalProperties': False}
        prompt = ('Implement this task in the current isolated workspace. Read project rules and use your own '
                  'Skills/tools. Run relevant checks and report exact outcomes and remaining limitations. '
                  'Do not commit, publish, send messages, call Rondo task-control tools, or edit other projects. '
                  'If this is a repair, limit changes to allowed_files and address the fixed findings. '
                  'Return JSON with summary <=4000 characters.\n' + canonical({
                      'task': {k: task[k] for k in ('title', 'instructions', 'acceptance')},
                      'plan': plan['plan'], 'mode': details['mode']}).decode())
        with self.store._connection(write=True) as db:
            db.execute("UPDATE execution_jobs SET state='running' WHERE id=?", (job_id,))
        details['phase'] = 'running'
        self._save_details(job_id, details)
        try:
            result = run_inline_json(prompt, schema, repo, directory/'runtime', executable,
                                     timeout=900, cancel_check=lambda: self._cancelled(job_id), agent=agent,
                                     model_choice={key:value for key,value in {'model':details.get('requested_model'),'effort':details.get('requested_effort')}.items() if value},
                                     instructions='You are the implementation agent. The user authorizes coding and relevant local checks in this task workspace. Follow project conventions; report observed evidence.',
                                     session_name='Rondo · 执行 · '+task['title'])
            details.update({k:v for k,v in result.items() if k in ('model','thread_id','session_id','persistent','environment','agent_session_id')})
            if result.get('thread_id'):
                details['session_id'] = result['thread_id']
            if result.get('process_tree_closed') is not True:
                raise StoreError('CLEANUP_UNVERIFIED', 'Agent进程退出未确认，请检查本次记录')
            if result['status'] == 'cancelled':
                return {'event':'cancelled'}
            if result['status'] != 'completed':
                raise StoreError('AGENT_EXECUTION_FAILED', result.get('error','Agent执行失败'))
            summary = result.get('data', {}).get('summary')
            if not isinstance(summary, str) or not 0 < len(summary.strip()) <= 4000:
                raise StoreError('INVALID_REPORT', 'Agent返回的执行报告无效，原始记录已保留')
            self.store.submit_result(task['task_id'], claim['attempt_id'], claim['claim_token'], claim['version'], summary, job_id)
            return {'event':'turn_ended'}
        finally:
            # This owned runner is stopped before returning; do not strand its claim.
            with self.store._connection(write=True) as db:
                db.execute("UPDATE attempts SET state='expired' WHERE id=? AND state='active'", (claim['attempt_id'],))

    def _work(self, job_id, task, repo, base_ref, directory, executable, lock):
        with self.store._connection() as db:
            details = json.loads(self._row(db, job_id)['result_json'] or '{}')
        details.update(session_id=str(uuid4()), phase='preparing', review_job_id=None,
                       wake_id='wake-run-' + str(uuid4()))
        try:
            context = self.tasks.context(task['task_id'])
            repairing = details.get('mode') == 'repair'
            if repairing:
                inputs = details['repair_input']
                if current_tree(repo) != inputs['source_tree']:
                    raise StoreError('REPAIR_SOURCE_STALE', 'Code changed after repair reservation; no prompt sent')
                plan = {'plan_id': inputs['review_id'], 'plan': inputs}
            else:
                plan = self.plans.read_plan(details.get('plan_job_id') or context['latest_plan_job_id'])
                if details.get('plan_id') and plan['plan_id'] != details['plan_id']:
                    raise StoreError('PLAN_SELECTION_CHANGED', '采用的计划已变化；未发送执行请求')
                if plan['freshness'] != 'current':
                    raise StoreError('PLAN_STALE', 'Plan changed before dispatch')
            details.update(plan_id=plan['plan_id'], input_tree=current_tree(repo))
            self._save_details(job_id, details)  # Save identity BEFORE any native request.
            agent = self.selected_agent(task['task_id']) if self.native_routing else 'workbuddy'
            owner = ('rondo-workbuddy-' if agent == 'workbuddy' else 'rondo-agent-') + job_id
            details['agent'] = agent
            repair_instruction = (
                '这是唯一一轮返修。下面 plan 是固定的审查问题，不是新的需求。先检查触发条件并尽量复现，'
                '只修复 allowed_files 内列出的文件，保留原验收要求，不删改测试以掩盖失败。'
                '需要扩大范围或无法复现时停止并如实提交说明。逐项报告修复与运行的检查。\n'
            ) if repairing else ''
            prompt = (
                '你是 Rondo 的 WorkBuddy 执行者。使用你当前的模型、Skills 和工具完成下面的开发任务。\n'
                + repair_instruction +
                '先通过 agent-review-loop MCP 的 get_task_context 读取任务，并核对返回的 workspace 与以下路径完全一致。'
                '若工具不可用或目录不一致，停止并说明原因。\n'
                f"task_id={task['task_id']}\nworkspace={repo}\n"
                f"使用 claim_task 领取，owner 必须是 {owner}；expected_version 使用刚读取的版本；lease_seconds=3600。\n"
                '只在指定工作区修改代码，先读项目约定，再按计划实现并运行相关检查。长任务及时 renew_claim。'
                '完成后必须通过 submit_result 提交真实修改和检查摘要，使用领取返回的 attempt_id、claim_token、version；'
                f'request_id 使用 {job_id}。不要自行调用规划或审查工具，Rondo 会自动接续审查。'
                '不要承诺未执行的检查，不要修改其他目录，不要提交Git或发送外部消息。\n'
                + canonical({'title': task['title'], 'instructions': task['instructions'],
                             'acceptance': task['acceptance'], 'plan': plan['plan']}).decode('utf-8')
            )
            if agent != 'workbuddy' and self.native_routing:
                result = self._managed_turn(job_id, task, repo, directory, executable, agent, plan, owner, details)
            else:
                payload = {'command': 'run', 'session_id': details['session_id'], 'wake_id': details['wake_id'],
                           'workspace': str(repo), 'title': ('返修 · ' if repairing else '') + task['title'], 'prompt': prompt}
                model = details.get('requested_model')
                if model:
                    payload['model'] = model
                (directory / 'input.json').write_bytes(canonical(payload) + b'\n')

                progress = {'environment': 'workbuddy', 'persistent': True, 'session_id': details['session_id'], 'events': []}
                activated = False
                def activate():
                    nonlocal activated
                    if activated or os.name != 'nt' or self.runner is not native_run: return
                    activated = True
                    # Open after a real event: opening the empty shell before the prompt
                    # was persisted raced WorkBuddy's history projection.
                    try: os.startfile('workbuddy://chat/' + details['session_id'])
                    except OSError: details['activation_notice'] = 'Open the dedicated session in WorkBuddy to inspect its progress'
                def event(value):
                    if value['event'] == 'permission_request':
                        details['phase'] = 'waiting_input'
                        self._save_details(job_id, details)
                        params = value['params']
                        params = {**params, 'reason': public_text(params.get('reason') or ''),
                                  'command': public_text(params.get('command') or '', 8000)}
                        return interactive_request(directory / 'runtime', progress,
                            {'method': 'acp/permission', 'params': params}, lambda: self._cancelled(job_id))
                    if value['event'] == 'permission_answered':
                        details['phase'] = 'running'
                        self._save_details(job_id, details)
                        return
                    if value['event'] == 'progress':
                        if project_update(progress, value.get('update', {})):
                            try:
                                write_state(directory / 'runtime', progress)
                                with (directory / 'runtime' / 'progress.jsonl').open('ab') as log:
                                    log.write(canonical({'event': 'progress', 'update': {**value['update'], 'text': public_text(value['update'].get('text') or '', 8000)}}) + b'\n')
                            except (OSError, sqlite3.Error) as error:
                                details['projection_error'] = str(error)[:500]
                            # Background execution is not owned by WorkBuddy's visible
                            # conversation view; opening it mid-turn can show stale cancellation.
                        return
                    phase = value['event']
                    if phase == 'state':
                        phase = 'waiting_input' if value.get('state') == 'waiting_input' else 'running'
                    details['phase'] = phase
                    if value['event'] == 'dispatched' and value.get('model'):
                        details['model'] = value['model']
                    self._save_details(job_id, details)
                    if value['event'] == 'state' and value.get('state') == 'waiting_input' and not value.get('in_product_permission'): activate()
                    if value['event'] == 'dispatched':
                        with self.store._connection(write=True) as db:
                            db.execute("UPDATE execution_jobs SET state='running' WHERE id=? AND state='preparing'", (job_id,))

                result = self.runner(payload, directory / 'runtime', executable,
                                     cancel_check=lambda: self._cancelled(job_id), on_event=event)
            if result.get('event') == 'cancelled':
                details['phase'] = 'cancelled'
                details['stop_reason'] = result.get('stop_reason', 'user_cancelled')
                details['summary'] = (
                    f"执行达到 {result.get('timeout_seconds', 3600) // 60} 分钟上限，已停止。"
                    if details['stop_reason'] == 'timeout' else
                    '等待权限答复超时，已停止。' if details['stop_reason'] == 'input_timeout' else '执行已取消。'
                ) + '工作区改动和原生会话记录保留；尚未提交执行结果，也未完成审查。'
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
            output_tree = current_tree(repo)
            if repairing:
                if output_tree == details['input_tree']:
                    raise StoreError('REPAIR_NO_PROGRESS', 'Repair submitted without code changes; no review quota consumed')
                names = _git(repo, 'diff', '--name-only', '-z', details['input_tree'], output_tree, '--').split(b'\0')
                outside = unauthorized_changed_files([name.decode('utf-8') for name in names if name], inputs['allowed_files'])
                if outside:
                    raise StoreError('REPAIR_SCOPE_EXCEEDED', 'Repair changed files outside findings: ' + ', '.join(outside)[:1000])
            details.update(phase='submitted', summary=report['summary'], output_tree=output_tree)
            self._finish(job_id, 'succeeded', details)
            try:
                review_choice = details.get('review_model_choice')
                review = self.reviews.start_review(task['task_id'], str(repo), base_ref, 'execution-' + job_id,
                                                   input_data={'model_choice': review_choice} if review_choice else None)
                details['review_job_id'] = review['job_id']
            except Exception as error:
                details['review_error'] = getattr(error, 'code', 'AUTO_REVIEW_FAILED')
            self._save_details(job_id, details)
            if details.get('review_job_id'):
                self._continue_after_review(job_id, details)
        except Exception as error:
            code = getattr(error, 'code', 'EXECUTION_FAILED')
            details.update(phase='dispatch_unknown' if code in ('DISPATCH_UNKNOWN', 'EXECUTION_STOP_UNKNOWN') else 'failed',
                           summary=str(error)[:1400])
            self._finish(job_id, 'failed', details, code)
        finally:
            lock.close()
            with self._guard:
                self._workers.pop(job_id, None)
