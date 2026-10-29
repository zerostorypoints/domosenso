#!/usr/bin/env python3
"""Delete a branch's Cloudflare Pages preview deployments (run when its pull request closes)."""
import argparse
import json
import os
import sys
import urllib.request
from urllib.error import HTTPError

API = 'https://api.cloudflare.com/client/v4'
PER_PAGE = 25


def urlopen_json(method, url, token):
    request = urllib.request.Request(url, method=method, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except HTTPError as error:
        try:
            return json.load(error)  # Cloudflare explains failures in the body
        except ValueError:
            raise RuntimeError(f'Cloudflare API {method} failed: HTTP {error.code}') from error


def call(http, method, url, token):
    body = http(method, url, token)
    if not body.get('success'):
        messages = '; '.join(e.get('message', str(e)) if isinstance(e, dict) else str(e)
                              for e in body.get('errors', [])) or 'unknown error'
        raise RuntimeError(f'Cloudflare API error: {messages}')
    return body


def delete_branch_previews(branch, account, project, token, http=urlopen_json):
    if branch == 'main':
        raise ValueError('refusing to delete previews of main')
    base = f'{API}/accounts/{account}/pages/projects/{project}/deployments'
    found, page = [], 1
    while True:  # list everything first: deleting while paging would shift the pages
        body = call(http, 'GET', f'{base}?env=preview&page={page}&per_page={PER_PAGE}', token)
        found += [d['id'] for d in body['result']
                  if d.get('environment') == 'preview'
                  and d.get('deployment_trigger', {}).get('metadata', {}).get('branch') == branch]
        if page >= body.get('result_info', {}).get('total_pages', 1):
            break
        page += 1
    for id in found:
        call(http, 'DELETE', f'{base}/{id}?force=true', token)
    return found


def main(argv=None, http=urlopen_json):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--branch', required=True)
    parser.add_argument('--project', default='domosenso-framework')
    args = parser.parse_args(argv)
    account, token = os.environ.get('CLOUDFLARE_ACCOUNT_ID', ''), os.environ.get('CLOUDFLARE_API_TOKEN', '')
    for name, value in (('CLOUDFLARE_ACCOUNT_ID', account), ('CLOUDFLARE_API_TOKEN', token)):
        if not value:
            print(f'missing or empty environment variable {name}', file=sys.stderr)
            return 1
    try:
        deleted = delete_branch_previews(args.branch, account, args.project, token, http)
    except (RuntimeError, ValueError, OSError) as error:
        print(error, file=sys.stderr)
        return 1
    for id in deleted:
        print(f'deleted {id}')
    if not deleted:
        print('no previews')
    return 0


if __name__ == '__main__':
    sys.exit(main())
