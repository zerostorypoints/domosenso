#!/usr/bin/env python3
"""Tell IndexNow which domosenso.org pages changed, once the live site serves the merge commit.

  uv run tools/website_changes.py --base <ref> --format urls | uv run tools/indexnow.py --sha <sha>

Waits for https://domosenso.org/build.json to report <sha>, then submits the URLs read from stdin
(or --urls-file). `no website changes` and an empty input both mean nothing to submit.
Back-to-back merges can make an earlier job time out: its URLs are then not submitted, and the
maintainer's post-merge sitemap resubmission (website-audit skill) covers them.
The key is public by design: IndexNow checks it against website/public/<key>.txt.
"""
import argparse
import json
from pathlib import Path
import re
import sys
import time
import urllib.request
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
HOST = 'domosenso.org'
BUILD_URL = f'https://{HOST}/build.json'
ENDPOINT = 'https://api.indexnow.org/indexnow'
NO_CHANGES = 'no website changes'
# Cloudflare answers the default Python-urllib agent with 403 Forbidden.
USER_AGENT = 'domosenso-indexnow (+https://github.com/zerostorypoints/domosenso)'


def http_get(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode()


def http_post(url, payload):
    request = urllib.request.Request(url, data=json.dumps(payload).encode(), method='POST',
                                     headers={'Content-Type': 'application/json; charset=utf-8', 'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status
    except HTTPError as error:
        return error.code


def wait_for_commit(sha, url=BUILD_URL, timeout=900, interval=30, fetch=http_get, sleep=time.sleep):
    """Poll `url` until it reports `sha`; raise TimeoutError after `timeout` seconds."""
    waited, last_error = 0, None
    while True:
        try:
            if json.loads(fetch(url)).get('commit') == sha:
                return
        except (OSError, ValueError, AttributeError) as error:
            last_error = error  # not deployed yet, or briefly unreachable: keep polling
        if waited >= timeout:
            detail = f' (last error: {last_error})' if last_error else ''
            raise TimeoutError(f'{url} did not report {sha} within {timeout}s{detail}')
        if not waited:
            print(f'waiting for {sha}', flush=True)
        sleep(interval)
        waited += interval


def submit(urls, key, fetch=http_post):
    """POST the URLs to IndexNow and return the HTTP status; an empty list sends nothing (returns 0)."""
    if not urls:
        return 0
    return fetch(ENDPOINT, {'host': HOST, 'key': key, 'keyLocation': f'https://{HOST}/{key}.txt', 'urlList': urls})


def read_key(public=ROOT / 'website/public'):
    keys = [p.stem for p in public.glob('*.txt') if re.fullmatch(r'[0-9a-f]{32}', p.stem)]
    if len(keys) != 1:
        raise RuntimeError(f'expected one IndexNow key file in {public}, found {len(keys)}')
    return keys[0]


def parse_urls(text):
    return [line.strip() for line in text.splitlines() if line.strip() and line.strip() != NO_CHANGES]


def main(argv=None, stdin=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--sha', required=True, help='commit the live site must serve before submitting')
    parser.add_argument('--urls-file', default='-', help='file with one URL per line (default: stdin)')
    args = parser.parse_args(argv)
    if stdin is None:
        stdin = sys.stdin.read() if args.urls_file == '-' else Path(args.urls_file).read_text()
    urls = parse_urls(stdin)
    if not urls:
        print('no urls')
        return 0
    try:
        wait_for_commit(args.sha)
        status = submit(urls, read_key())
    except (TimeoutError, RuntimeError, OSError) as error:
        print(f'FAIL {error}', file=sys.stderr)
        return 1
    print(f'submitted {len(urls)} urls ({status})')
    return 0 if status in (200, 202) else 1


if __name__ == '__main__':
    sys.exit(main())
