import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlsplit

from agent_review_loop.workbuddy import WorkBuddyError, _NoRedirect, assistant_online, authorization_url, exchange_callback


class WorkBuddyTests(unittest.TestCase):
    def test_api_redirect_never_forwards_credentials(self):
        with self.assertRaises(WorkBuddyError):
            _NoRedirect().redirect_request(None, None, 302, 'redirect', {}, 'https://other.invalid')

    def test_authorization_escapes_exact_callback_and_has_random_state(self):
        redirect = 'http://127.0.0.1:8765/callback?app=learn'
        first = authorization_url('app_fixture', redirect)
        second = authorization_url('app_fixture', redirect)
        query = parse_qs(urlsplit(first['url']).query)
        self.assertEqual(query['redirect_uri'], [redirect])
        self.assertNotEqual(first['state'], second['state'])
        self.assertIn('user.localassistant.readable', query['scope'][0])
        with self.assertRaises(WorkBuddyError):
            authorization_url('fixture', 'http://untrusted.example/callback')

    @patch('agent_review_loop.workbuddy._request')
    def test_state_and_callback_are_checked_before_exchange(self, request):
        base = 'https://example.invalid/callback'
        for callback in (base + '?code=one&state=wrong', base + '?code=one&state=ok&state=ok',
                         'https://other.invalid/callback?code=one&state=ok'):
            with self.subTest(callback=callback), self.assertRaises(WorkBuddyError):
                exchange_callback('app', 'secret', base, 'ok', callback)
        request.assert_not_called()

    @patch('agent_review_loop.workbuddy._request', return_value={'access_token': 'synthetic-token', 'token_type': 'Bearer'})
    def test_exchange_preserves_exact_redirect(self, request):
        redirect = 'https://example.invalid/callback?project=one'
        callback = redirect + '&' + urlencode({'code': 'synthetic-code', 'state': 'nonce'})
        result = exchange_callback('app', 'secret', redirect, 'nonce', callback)
        self.assertEqual(result['access_token'], 'synthetic-token')
        self.assertEqual(request.call_args.kwargs['form']['redirect_uri'], redirect)

    @patch('agent_review_loop.workbuddy._request')
    def test_online_is_not_execution_success(self, request):
        request.return_value = {'code': 0, 'data': {'online': True}}
        self.assertEqual(assistant_online('token'), {'online': True, 'execution_verified': False})
        for result in ({'code': 0, 'data': {'online': 'true'}}, {'code': 403}, {'code': False}, {'code': 0, 'data': []}):
            request.return_value = result
            with self.assertRaises(WorkBuddyError):
                assistant_online('token')


if __name__ == '__main__':
    unittest.main()
