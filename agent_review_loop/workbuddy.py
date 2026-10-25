"""Official WorkBuddy OAuth and read-only readiness. No private desktop credentials."""

import hmac
import json
import secrets
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


BASE = 'https://www.workbuddy.cn/openapi/v2'
SCOPES = 'user.localassistant.readable user.localassistant.invokable'


class WorkBuddyError(Exception):
    pass


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise WorkBuddyError('API redirect refused; credentials were not forwarded')


def authorization_url(client_id, redirect_uri):
    uri = urlsplit(redirect_uri)
    if (not isinstance(client_id, str) or not client_id.strip() or len(client_id) > 256
            or uri.username or uri.password or uri.fragment or not uri.netloc
            or not (uri.scheme == 'https' or (uri.scheme == 'http' and uri.hostname in ('localhost', '127.0.0.1', '::1')))):
        raise WorkBuddyError('Use a valid app ID and the exact registered HTTPS or loopback callback')
    state = secrets.token_urlsafe(32)
    return {'state': state, 'url': BASE + '/authorize?' + urlencode({
        'response_type': 'code', 'client_id': client_id, 'redirect_uri': redirect_uri,
        'scope': SCOPES, 'state': state,
    })}


def _request(path, *, token=None, form=None):
    headers = {'Accept': 'application/json'}
    if token is not None:
        if not isinstance(token, str) or not token or '\r' in token or '\n' in token:
            raise WorkBuddyError('A valid access token is required')
        headers['Authorization'] = 'Bearer ' + token
    data = None
    if form is not None:
        data = urlencode(form).encode('utf-8')
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    request = Request(BASE + path, data=data, headers=headers)
    try:
        with build_opener(_NoRedirect()).open(request, timeout=15) as response:
            raw = response.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise WorkBuddyError('Response exceeded 1 MiB')
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise WorkBuddyError('Response is not an object')
        return result
    except HTTPError as error:
        # Do not include OAuth request bodies or response text in diagnostic logs.
        raise WorkBuddyError(f'WorkBuddy HTTP {error.code}; inspect authorization/scopes') from None
    except (URLError, OSError, ValueError) as error:
        raise WorkBuddyError(f'WorkBuddy request failed ({type(error).__name__})') from None


def exchange_callback(client_id, client_secret, redirect_uri, expected_state, callback_url):
    expected, actual = urlsplit(redirect_uri), urlsplit(callback_url)
    query = parse_qs(actual.query, keep_blank_values=True)
    if (not expected_state or not isinstance(expected_state, str)
            or (expected.scheme, expected.netloc, expected.path) != (actual.scheme, actual.netloc, actual.path)
            or query.get('state') != [expected_state]
            or not hmac.compare_digest(query['state'][0], expected_state)
            or len(query.get('code', [])) != 1 or not query['code'][0]
            or 'error' in query or not client_secret):
        raise WorkBuddyError('OAuth callback, state or authorization code is invalid')
    for key, values in parse_qs(expected.query, keep_blank_values=True).items():
        if query.get(key) != values:
            raise WorkBuddyError('Registered callback query does not match')
    result = _request('/token', form={'grant_type': 'authorization_code', 'code': query['code'][0],
                                    'client_id': client_id, 'client_secret': client_secret, 'redirect_uri': redirect_uri})
    if (not isinstance(result.get('access_token'), str) or not result['access_token']
            or result.get('token_type', '').lower() != 'bearer'):
        raise WorkBuddyError('OAuth token response is invalid')
    return result  # Caller owns in-memory credentials; never print or persist this object as a report.


def assistant_online(access_token):
    result = _request('/localassistant', token=access_token)
    if type(result.get('code')) is not int or result['code'] != 0:
        raise WorkBuddyError('WorkBuddy rejected the local-assistant status request')
    data = result.get('data')
    online = data.get('online') if isinstance(data, dict) else None
    if type(online) is not bool:
        raise WorkBuddyError('Local-assistant status has no boolean online field')
    return {'online': online, 'execution_verified': False}
