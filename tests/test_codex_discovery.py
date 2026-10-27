import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from agent_review_loop.agents import codex_executable


class CodexDiscoveryTests(unittest.TestCase):
    def test_desktop_bundle_without_codex_on_path(self):
        with tempfile.TemporaryDirectory() as folder:
            binary = Path(folder) / 'OpenAI/Codex/bin/version/codex.exe'
            binary.parent.mkdir(parents=True)
            binary.write_bytes(b'fixture, never executed')
            with patch.dict(os.environ, {'LOCALAPPDATA': folder, 'APPDATA': folder, 'ARL_CODEX_EXECUTABLE': ''}), \
                    patch('agent_review_loop.agents.shutil.which', return_value=None), \
                    patch('agent_review_loop.agents.sys.platform', 'win32'):
                self.assertEqual(Path(codex_executable()), binary.resolve())

    def test_invalid_explicit_pin_is_not_silently_replaced(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertIsNone(codex_executable(Path(folder) / 'missing.exe'))

    def test_valid_explicit_pin_wins(self):
        with tempfile.TemporaryDirectory() as folder:
            binary = Path(folder) / 'codex.exe'
            binary.write_bytes(b'fixture, never executed')
            self.assertEqual(Path(codex_executable(binary)), binary.resolve())
