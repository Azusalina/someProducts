"""Read reset announcements. Community relays remain explicitly unconfirmed."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import threading
import time
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

PUBLIC_FEEDS = [
    'https://community.openai.com/c/codex.rss',
    'https://community.openai.com/t/codex-rate-limits-reset-incoming/1381065.rss',
    'https://community.openai.com/t/codex-rate-limits-reset-for-all-paid-plans-on-august-9-and-again-on-monday/1389643.rss',
    'https://community.openai.com/t/20-million-codex-users-a-free-banked-reset-for-everyone/1391683.rss',
    'https://community.openai.com/t/codex-is-down-confirmed-by-openai/1400811.rss',
]
RESET_PATTERN = re.compile(r'\breset(?:s|ting)?\b', re.I)
QUOTA_PATTERN = re.compile(r'\busage\b|\blimits?\b|\bquota\b|\bbanked\b', re.I)
DEVELOPER_LINK = re.compile(r'^https://(?:x|twitter)\.com/(thsottiaux|bcherny)/status/\d+', re.I)


def fetch(url, headers=None):
    request = Request(url, headers={'User-Agent': 'MonitorDashboard/1.1', **(headers or {})})
    with urlopen(request, timeout=7) as response:
        raw = response.read(1_000_001)
    if len(raw) > 1_000_000:
        raise ValueError('Feed too large')
    return raw


class TextLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.links = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            for key, value in attrs:
                if key == 'href' and value:
                    self.links.append(value)


def reset_timing(text, published):
    # Avoid treating a relative date or a promise as an account-specific reset.
    match = re.search(r'\b(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2}))\b', text)
    if match:
        try:
            return datetime.fromisoformat(match[1].replace('Z', '+00:00')).timestamp(), 'Reported time'
        except ValueError:
            pass
    if re.search(r'\bnext (?:hour|60 minutes)\b', text, re.I):
        return published + 3600, 'Within an hour of post · estimate'
    if re.search(r'\btomorrow\b', text, re.I):
        return None, 'Tomorrow · author timezone not stated'
    if re.search(r'\bthis evening\b', text, re.I):
        return None, 'This evening · author timezone not stated'
    return None, 'Reset timing not specified'


def parse_rss(raw, now=None):
    now = time.time() if now is None else now
    events = []
    tree = ET.fromstring(raw)
    for item in tree.findall('.//item'):
        parser = TextLinks()
        parser.feed(item.findtext('description') or '')
        text = ' '.join(parser.parts)
        title = item.findtext('title') or ''
        developer = next((link for link in parser.links if DEVELOPER_LINK.match(link)), None)
        if not developer or not RESET_PATTERN.search(text) or not QUOTA_PATTERN.search(text):
            continue
        try:
            # A Twitter/X Snowflake ID anchors the original post date, not the later relay.
            post_id = int(re.search(r'/status/(\d+)', developer)[1])
            published = ((post_id >> 22) + 1288834974657) / 1000
            if published > now + 300:
                continue
        except (ValueError, TypeError):
            continue
        source = item.findtext('link') or ''
        if urlsplit(source).hostname != 'community.openai.com':
            continue
        reset_at, hint = reset_timing(text, published)
        author = re.search(r'\.com/([^/]+)/', developer)[1]
        events.append({'headline': title[:140], 'developer': '@' + author,
                       'published_at': published, 'expected_at': reset_at,
                       'timing': hint, 'confidence': 'Community relay · unconfirmed',
                       'source_url': source, 'post_url': developer,
                       'state': 'Older report' if published < now - 7 * 86400 else 'Reported'})
    return events


def read_public_news():
    events = []
    successes = 0
    def one(url):
        try:
            return parse_rss(fetch(url))
        except (OSError, ValueError, ET.ParseError):
            return None
    with ThreadPoolExecutor(max_workers=3) as pool:
        for rows in pool.map(one, PUBLIC_FEEDS):
            if rows is not None:
                successes += 1
                events.extend(rows)
    if not successes:
        raise RuntimeError('Public feeds unavailable')
    unique = {}
    for event in events:
        unique.setdefault(event['post_url'], event)
    return sorted(unique.values(), key=lambda e: e['published_at'], reverse=True)[:6]


def read_x_news(token):
    """Optional official X API. Requires the user's own API entitlement/token."""
    headers = {'Authorization': 'Bearer ' + token}
    events = []
    for author in ('thsottiaux', 'bcherny'):
        user = json.loads(fetch('https://api.x.com/2/users/by/username/' + author, headers))
        user_id = user['data']['id']
        query = urlencode({'max_results': 20, 'post.fields': 'created_at', 'exclude': 'retweets,replies'})
        response = json.loads(fetch(f'https://api.x.com/2/users/{user_id}/tweets?{query}', headers))
        for tweet in response.get('data', []):
            text = tweet.get('text') or ''
            if not RESET_PATTERN.search(text) or not QUOTA_PATTERN.search(text):
                continue
            published = datetime.fromisoformat(tweet['created_at'].replace('Z', '+00:00')).timestamp()
            reset_at, hint = reset_timing(text, published)
            events.append({'headline': ('Claude' if author == 'bcherny' else 'Codex') + ' usage reset announcement',
                           'developer': '@' + author, 'published_at': published, 'expected_at': reset_at,
                           'timing': hint, 'confidence': 'Developer post · account eligibility unknown',
                           'source_url': f'https://x.com/{author}/status/{tweet["id"]}',
                           'post_url': f'https://x.com/{author}/status/{tweet["id"]}', 'state': 'Announced'})
    return events


class NewsCollector:
    def __init__(self):
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.snapshot = {'events': [], 'checked_at': None, 'message': 'Checking public reset reports…', 'mode': 'Public community relays'}
        self.thread = threading.Thread(target=self.collect, daemon=True, name='reset-news')

    def collect(self):
        while not self.stop.is_set():
            try:
                events = read_public_news()
                token_file = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home() / '.config'))) / 'monitor-dashboard/x-token'
                mode = 'Public community relays · direct X needs API access'
                if token_file.is_file():
                    try:
                        token = token_file.read_text().strip()
                        if token and len(token) <= 4096:
                            events = read_x_news(token) + events
                            mode = 'X API + public relays'
                    except (OSError, ValueError, KeyError):
                        mode = 'Public relays · X API unavailable'
                unique = {}
                for event in events:
                    old = unique.get(event['post_url'])
                    if old is None or event['confidence'].startswith('Developer'):
                        unique[event['post_url']] = event
                events = sorted(unique.values(), key=lambda e: e['published_at'], reverse=True)[:6]
                with self.lock:
                    self.snapshot = {'events': events, 'checked_at': time.time(), 'mode': mode,
                                     'message': '' if events else 'No matching reset announcement in watched feeds'}
            except (OSError, RuntimeError, ValueError, TypeError):
                with self.lock:
                    self.snapshot = {**self.snapshot, 'message': 'News unavailable · showing last reports'}
            self.stop.wait(300)

    def get(self):
        with self.lock:
            result = json.loads(json.dumps(self.snapshot))
        result['stale'] = bool(result['checked_at'] and time.time() - result['checked_at'] > 900)
        return result
