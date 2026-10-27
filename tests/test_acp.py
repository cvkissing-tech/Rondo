import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from agent_review_loop.agents import ROOT, normalize_agents
from agent_review_loop.acp import run_acp_json
from agent_review_loop.native_session import read_state
from agent_review_loop.store import StoreError

class ACPTests(unittest.TestCase):
    def test_role_validation(self):
        self.assertEqual(normalize_agents()['executor'], 'workbuddy')
        with self.assertRaises(StoreError): normalize_agents({'planner':'workbuddy','executor':'codex','reviewer':'codex'})

    @unittest.skipUnless(shutil.which('node') and (ROOT/'desktop/node_modules/acpx').exists(), 'Install desktop npm dependencies to run the real ACP transport fixture')
    def test_real_acpx_permission_write_and_json_result(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);workspace=root/'workspace';workspace.mkdir()
            config=root/'agents.json';config.write_text(json.dumps({'agents':{'rondo-fixture':[shutil.which('node'),str(ROOT/'tests/fixtures/acp-agent.mjs')]}}))
            schema={'type':'object','properties':{'summary':{'type':'string'}},'required':['summary'],'additionalProperties':False}
            output=root/'run';result=[]
            with patch.dict(os.environ,{'RONDO_AGENTS_CONFIG':str(config)}):
                thread=threading.Thread(target=lambda: result.append(run_acp_json('Run the deterministic offline fixture.',schema,workspace,output,shutil.which('node'),agent='acp:rondo-fixture',timeout=30)))
                thread.start();deadline=time.monotonic()+20
                while time.monotonic()<deadline:
                    state=read_state(output)
                    if state.get('pending') or result: break
                    time.sleep(.05)
                try:
                    self.assertFalse(result, result)
                    pending=state['pending']
                    self.assertEqual(pending['method'],'acp/permission')
                    self.assertFalse((workspace/'fixture.txt').exists())
                    (output/f"answer-{pending['id']}.json").write_text(json.dumps('allow'))
                finally: thread.join(35)
            self.assertFalse(thread.is_alive())
            self.assertEqual(result[0]['status'],'completed',result)
            self.assertTrue(result[0]['process_tree_closed'])
            self.assertEqual((workspace/'fixture.txt').read_text(),'ACP fixture output\n')
            self.assertIn('Offline ACP fixture',result[0]['data']['summary'])
