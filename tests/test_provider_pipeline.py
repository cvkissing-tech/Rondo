import json
import os
from pathlib import Path
import shutil
import time
import unittest
from unittest.mock import patch

from agent_review_loop.agents import ROOT
from agent_review_loop.execution import ExecutionJobs
from agent_review_loop.planning import PlanJobs
from agent_review_loop.review_jobs import ReviewJobs
from agent_review_loop.store import StoreError
from tests import test_task_launch as fixture

@unittest.skipUnless(shutil.which('node') and (ROOT/'desktop/node_modules/acpx').exists(), 'Run after desktop npm ci; no model credentials required')
class ProviderPipelineTests(unittest.TestCase):
    def setUp(self):
        fixture.TaskLaunchTests.setUp(self)
        self.config=self.root/'agents.json'
        self.config.write_text(json.dumps({'agents':{'rondo-fixture':[shutil.which('node'),str(ROOT/'tests/fixtures/acp-agent.mjs')]}}))
        env=patch.dict(os.environ,{'RONDO_AGENTS_CONFIG':str(self.config)})
        env.start();self.addCleanup(env.stop)
        self.reviews=ReviewJobs(self.store,self.root/'runs')
        self.plans=PlanJobs(self.store,self.root/'runs')
        self.executions=ExecutionJobs(self.store,self.launcher,self.plans,self.reviews)
        self.addCleanup(self.reviews.close);self.addCleanup(self.plans.close);self.addCleanup(self.executions.close)

    def wait(self, manager, job_id, status):
        deadline=time.monotonic()+40
        while time.monotonic()<deadline:
            state=manager.status(job_id)
            if state['status']==status:return state
            if state['status'] in ('failed','cancelled','interrupted'):self.fail(str(state))
            time.sleep(.1)
        self.fail(str(state))

    def test_all_roles_use_selected_acp_agent_and_gate_actual_write(self):
        selected={role:'acp:rondo-fixture' for role in ('planner','executor','reviewer')}
        context=self.launcher.start(str(self.repo),'ACP fixture pipeline','Write fixture.txt','ACP fixture output','acp-fixture',agents=selected)
        self.assertEqual(context['agents'],selected)
        job=self.plans.start_review(context['task_id'],context['workspace'],context['base_commit'],'plan')
        self.wait(self.plans,job['job_id'],'succeeded')
        execution=self.executions.start_execution(context['task_id'],'execute')
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            state=self.executions.status(execution['job_id'])
            if state.get('pending'):break
            if state['status']=='failed':self.fail(str(state))
            time.sleep(.1)
        pending=state['pending']
        self.assertFalse((Path(context['workspace'])/'fixture.txt').exists())
        with self.assertRaises(StoreError):self.executions.answer(execution['job_id'],pending['id'],'unknown-option')
        self.executions.answer(execution['job_id'],pending['id'],'allow')
        self.wait(self.executions,execution['job_id'],'succeeded')
        deadline=time.monotonic()+40
        while time.monotonic()<deadline:
            state=self.executions.status(execution['job_id'])
            if state.get('review_job_id'):break
            time.sleep(.1)
        self.wait(self.reviews,state['review_job_id'],'succeeded')
        review=self.reviews.read_review(state['review_job_id'])
        self.assertEqual(review['backend'],'acp:rondo-fixture')
        self.assertEqual(review['freshness'],'current')
        self.assertEqual(self.store.get_task(context['task_id'])['status'],'submitted')
        self.assertEqual((Path(context['workspace'])/'fixture.txt').read_text(),'ACP fixture output\n')
