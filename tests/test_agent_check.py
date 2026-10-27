import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from agent_review_loop.agents import ROOT, check_agent

@unittest.skipUnless(shutil.which('node') and (ROOT/'desktop/node_modules/acpx').is_dir(), 'Install desktop dependencies')
class AgentCheckTests(unittest.TestCase):
    def test_acp_handshake_never_creates_session_or_prompt(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            log = root/'protocol.jsonl'
            config = root/'agents.json'
            config.write_text(json.dumps({'agents': {'probe-fixture': [shutil.which('node'), str(ROOT/'tests/fixtures/acp-probe.mjs'), str(log)]}}), encoding='utf-8')
            with patch.dict(os.environ, {'RONDO_AGENTS_CONFIG': str(config)}):
                result = check_agent('acp:probe-fixture')
            self.assertTrue(result['ok'], result)
            self.assertEqual(result['auth'], 'not_checked')
            messages = [json.loads(line) for line in log.read_text().splitlines()]
            self.assertEqual([m['method'] for m in messages], ['initialize'])
            self.assertFalse(any(messages[0]['params']['clientCapabilities'].get('fs', {}).values()))
            self.assertFalse(messages[0]['params']['clientCapabilities'].get('terminal'))

    def test_wrong_protocol_is_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            config = Path(folder)/'agents.json'
            config.write_text(json.dumps({'agents': {'not-acp': [shutil.which('node'), '-e', 'process.exit(0)']}}))
            with patch.dict(os.environ, {'RONDO_AGENTS_CONFIG': str(config)}): result = check_agent('acp:not-acp')
            self.assertFalse(result['ok'], result)
            self.assertEqual(result['auth'], 'not_checked')

    def test_codex_only_initializes_transport(self):
        with patch('agent_review_loop.agents.require_agent', return_value={'id': 'codex'}), patch('agent_review_loop.codex_rpc.CodexRpc') as rpc:
            result = check_agent('codex')
            self.assertTrue(result['ok'])
            rpc.return_value.__enter__.return_value.initialize.assert_called_once_with()
            rpc.return_value.__enter__.return_value.request.assert_not_called()
