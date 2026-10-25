"""One-command synthetic review/repair demonstration. No models or user repositories."""

import json
import os
from pathlib import Path
import subprocess
from uuid import uuid4

from agent_review_loop.reviews import review_status, save_review
from agent_review_loop.snapshots import create_review_package, prepare_workspace, verify_package
from agent_review_loop.store import TaskStore


def main():
    root = Path(__file__).resolve().parents[1] / '.agent-review-loop/review-demos' / uuid4().hex
    source = root / '合成 repository'
    source.mkdir(parents=True)
    hooks = root / 'empty-hooks'
    hooks.mkdir()

    def git(*args):
        return subprocess.check_output(['git', '-c', f'core.hooksPath={hooks}', *args], cwd=source,
                                       stderr=subprocess.PIPE,
                                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)

    def event(name, **values):
        print(json.dumps({'event': name, **values}, ensure_ascii=False))

    git('init', '-q')
    git('config', 'user.name', 'Offline Fixture')
    git('config', 'user.email', 'fixture@example.invalid')
    git('config', 'core.autocrlf', 'false')
    (source / 'calculator.py').write_bytes(b'def add(a, b):\n    return a + b\n')
    git('add', '.')
    git('commit', '-qm', 'synthetic baseline')
    store = TaskStore(root / 'tasks.sqlite3')
    created = store.create_task('合成加法任务', '保证 add 返回两数之和', '保持原仓库内容；审查定位对应快照')
    task = store.get_task(created['task_id'])
    workspace = prepare_workspace(source, root / 'run')
    working = Path(workspace['workspace'])
    event('workspace_created', base=workspace['base_commit'], model_calls=0)

    # Intentional synthetic defect. The review below is hardcoded, not AI-generated.
    (working / 'calculator.py').write_bytes(b'def add(a, b):\n    return a - b\n')
    (working / '说明.txt').write_text('模拟执行者产生的新文件\n', encoding='utf-8')
    package_dir = root / 'review-1'
    package = create_review_package(working, workspace['base_commit'], task, package_dir)
    event('package_created', snapshot_id=package['snapshot_id'], checks=package['checks']['status'],
          new_file_included='说明.txt' in package['files']['after'])
    review = {
        'snapshot_id': package['snapshot_id'], 'verdict': 'changes_requested',
        'summary': '硬编码的合成意见，仅验收交接协议，不代表 AI 已完成审查',
        'findings': [{'id': 'F1', 'path': 'calculator.py', 'side': 'after', 'line': 2, 'priority': 1,
                      'trigger': '调用 add(2, 3)', 'impact': '表达式变成减法，违背任务要求',
                      'evidence': '固定实验样例的静态检查；未在此审查包执行测试', 'evidence_kind': 'static'}],
    }
    receipt = save_review(package_dir, review)
    status = review_status(package_dir, receipt['review_id'], working)
    assert status['freshness'] == 'current' and not status['review_approved']
    event('synthetic_review_saved', freshness=status['freshness'], findings=len(review['findings']))

    # Simulated selection and repair are part of this fixture, not real user approval/Agent work.
    (working / 'calculator.py').write_bytes(b'def add(a, b):\n    return a + b\n')
    previous = review_status(package_dir, receipt['review_id'], working)
    assert previous['freshness'] == 'stale'
    assert (package_dir / 'after/calculator.py').read_bytes().endswith(b'return a - b\n')
    event('synthetic_repair', previous_review=previous['freshness'], fixed_copy_preserved=True)

    repaired_dir = root / 'review-2'
    repaired = create_review_package(working, workspace['base_commit'], task, repaired_dir)
    approved = {'snapshot_id': repaired['snapshot_id'], 'verdict': 'approved',
                'summary': '合成批准数据，不代表真实模型审查或项目检查通过', 'findings': []}
    new_receipt = save_review(repaired_dir, approved)
    assert review_status(repaired_dir, new_receipt['review_id'], working)['review_approved']
    assert not review_status(repaired_dir, new_receipt['review_id'])['review_approved']
    (working / 'new-change.txt').write_bytes(b'new work invalidates the old review\n')
    final = review_status(repaired_dir, new_receipt['review_id'], working)
    assert not final['review_approved'] and final['freshness'] == 'stale'
    assert verify_package(repaired_dir)['snapshot_id'] == repaired['snapshot_id']
    assert (source / 'calculator.py').read_bytes().endswith(b'return a + b\n')
    event('completed', new_snapshot=repaired['snapshot_id'], approved_then_stale=True,
          original_repository_unchanged=True, real_agents_verified=False, model_calls=0, evidence=str(root))


if __name__ == '__main__':
    main()
