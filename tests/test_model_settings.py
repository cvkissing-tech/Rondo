import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from agent_review_loop.agents import ROOT
from agent_review_loop.acp import run_acp_json
from agent_review_loop.model_settings import list_agent_models, model_selection


@unittest.skipUnless(shutil.which('node') and (ROOT/'desktop/node_modules/acpx').exists(), 'Install desktop dependencies')
class ModelSettingsTests(unittest.TestCase):
    def test_real_acpx_model_discovery_selection_and_unavailable_model_without_prompt(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); config=root/'agents.json'; trace=root/'trace.jsonl'
            command=[shutil.which('node'),str(ROOT/'tests/fixtures/acp-agent.mjs')]
            config.write_text(json.dumps({'agents':{'model-fixture':[*command,'--models-fixture','--trace-file',str(trace)],'fixed-fixture':command},
                                         'native_models':{'acp:model-fixture':{'model':'fixture-large'}}}))
            schema={'type':'object','properties':{'snapshot_id':{'enum':['fixture']},'verdict':{},'summary':{},'findings':{}}}
            with patch.dict(os.environ, {'RONDO_AGENTS_CONFIG':str(config)}):
                self.assertEqual(model_selection('acp:model-fixture')['model'],'fixture-large')
                models=list_agent_models('acp:model-fixture')
                self.assertEqual([m['id'] for m in models['models']],['fixture-small','fixture-large'])
                self.assertNotIn('session/prompt',trace.read_text())
                fixed=list_agent_models('acp:fixed-fixture')
                self.assertEqual(fixed['models'],[])
                self.assertIn('未通过 ACP',fixed['unsupported_reason'])
                result=run_acp_json('Offline model fixture',schema,root,root/'run',shutil.which('node'),agent='acp:model-fixture',timeout=20)
                self.assertEqual(result['status'],'completed',result)
                self.assertEqual(result['model'],'fixture-large')
                calls=[json.loads(line) for line in trace.read_text().splitlines()]
                methods=[row['method'] for row in calls]
                self.assertLess(methods.index('session/set_model'),methods.index('session/prompt'))
                self.assertEqual(next(r['model'] for r in calls if r['method']=='session/set_model'),'fixture-large')
                failed=run_acp_json('No prompt expected',schema,root,root/'invalid',shutil.which('node'),agent='acp:model-fixture',timeout=20,model_choice={'model':'missing'})
                self.assertEqual(failed['status'],'failed')
                self.assertEqual(failed['turns_started'],0)
                self.assertEqual(sum(json.loads(line)['method']=='session/prompt' for line in trace.read_text().splitlines()),1)
