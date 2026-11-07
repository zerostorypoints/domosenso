# /// script
# requires-python = ">=3.11"
# dependencies = ["google-auth>=2.20", "requests>=2.31"]
# ///
"""Resubmit the website's sitemap to Google Search Console and Bing Webmaster (SPEC-039).

  uv run tools/submit_sitemap.py [--sitemap URL] [--site URL] [--property NAME]

Run by the Search engines workflow after a merge that changes the website. Credentials come from
the environment; an engine without one is skipped, so forks and local runs stay green:

  BING_WEBMASTER_API_KEY            Bing Webmaster Tools API key (Settings, API access)
  GOOGLE_SEARCH_CONSOLE_CREDENTIALS a service account's JSON key; the account is a user of the
                                    Search Console property

Prints `ok <engine>`, `skip <engine>: no credentials` or `FAIL <engine>: <reason>` per engine and
exits 1 when any engine failed. Never prints a credential or a URL that carries one.
"""
import argparse
import json
import os
import sys
import urllib.request
from urllib.error import HTTPError
from urllib.parse import quote

HOST = 'domosenso.org'
SITE_URL = f'https://{HOST}/'
SITEMAP_URL = f'https://{HOST}/sitemap.xml'
GSC_PROPERTY = f'sc-domain:{HOST}'
BING_API = 'https://ssl.bing.com/webmaster/api.svc/json'
GSC_API = 'https://www.googleapis.com/webmasters/v3'
GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters'
USER_AGENT = 'domosenso-sitemap (+https://github.com/zerostorypoints/domosenso)'


def http(method, url, body=None, headers=None):
    """Return (status, text) of one request; an HTTP error is a status, not an exception."""
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method,
                                     headers={'User-Agent': USER_AGENT, **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read().decode(errors='replace')
    except HTTPError as error:
        return error.code, error.read().decode(errors='replace')


def reason(status, text):
    """A short, credential-free description of a failed response."""
    try:
        detail = json.loads(text)
        detail = detail.get('Message') or detail.get('error', {}).get('message') or text
    except (ValueError, AttributeError):
        detail = text
    return f'{status} {" ".join(str(detail).split())[:200]}'.strip()


def submit_bing(key, site, sitemap, request=http):
    status, text = request('POST', f'{BING_API}/SubmitFeed?apikey={quote(key)}',
                           {'siteUrl': site, 'feedUrl': sitemap},
                           {'Content-Type': 'application/json; charset=utf-8'})
    return None if status == 200 else reason(status, text)


def google_token(info):
    """An OAuth access token for the service account in `info` (needs google-auth)."""
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account
    credentials = service_account.Credentials.from_service_account_info(info, scopes=[GSC_SCOPE])
    credentials.refresh(Request())
    return credentials.token


def submit_google(credentials_json, prop, sitemap, token=google_token, request=http):
    try:
        info = json.loads(credentials_json)
    except ValueError:
        return 'credentials are not JSON'
    try:
        access = token(info)
    except Exception as error:  # google-auth raises several types; report the kind, not the payload
        return f'token: {type(error).__name__}'
    status, text = request('PUT', f'{GSC_API}/sites/{quote(prop, safe="")}/sitemaps/{quote(sitemap, safe="")}',
                           headers={'Authorization': f'Bearer {access}'})
    return None if status in (200, 204) else reason(status, text)


def main(argv=None, env=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--sitemap', default=SITEMAP_URL)
    parser.add_argument('--site', default=SITE_URL, help='Bing Webmaster site')
    parser.add_argument('--property', default=GSC_PROPERTY, help='Search Console property')
    args = parser.parse_args(argv)
    env = os.environ if env is None else env
    engines = [
        ('google', env.get('GOOGLE_SEARCH_CONSOLE_CREDENTIALS', '').strip(),
         lambda secret: submit_google(secret, args.property, args.sitemap)),
        ('bing', env.get('BING_WEBMASTER_API_KEY', '').strip(),
         lambda secret: submit_bing(secret, args.site, args.sitemap)),
    ]
    failed = False
    for name, secret, submit in engines:
        if not secret:
            print(f'skip {name}: no credentials')
            continue
        error = submit(secret)
        if error:
            failed = True
            print(f'FAIL {name}: {error}')
        else:
            print(f'ok {name}: {args.sitemap}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
