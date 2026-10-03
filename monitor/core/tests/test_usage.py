import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).parents[1] / 'backend'))
import usage
import reset_news


class UsageTests(unittest.TestCase):
    def test_remaining_and_exact_reset(self):
        result = usage.quota('5h', 13, 2000, 1000, now=1100)
        self.assertEqual(result['remaining_percent'], 87)
        self.assertEqual(result['resets_at'], 2000)

    def test_expired_does_not_invent_full_quota(self):
        result = usage.quota('5h', 13, 1000, 900, now=1100)
        self.assertIsNone(result['remaining_percent'])
        self.assertTrue(result['expired'])

    def test_stale_unknown_and_invalid_numbers(self):
        self.assertIsNone(usage.quota('7d', 13, 2000, 500, now=1100)['remaining_percent'])
        for value in (None, 'NaN', float('inf'), -5, 101, True):
            self.assertIsNone(usage.quota('5h', value, 2000, 1000, now=1100)['remaining_percent'])

    def test_codex_multiple_buckets_and_resets_no_sensitive_ids(self):
        result = usage.parse_codex({'accountId': 'PRIVATE', 'rateLimitsByLimitId': {
            'codex': {'primary': {'usedPercent': 25, 'windowDurationMins': 300, 'resetsAt': 2000},
                      'secondary': {'usedPercent': 60, 'windowDurationMins': 10080, 'resetsAt': 9000}},
            'other': {'primary': {'usedPercent': 10, 'windowDurationMins': 60, 'resetsAt': 2000}}},
            'rateLimitResetCredits': {'availableCount': 2, 'credits': [{'id': 'SECRET_RESET_ID', 'status': 'available', 'expiresAt': 5000}]}},1000, now=1100)
        self.assertEqual([r['remaining_percent'] for r in result['windows']], [75, 40, 90])
        self.assertEqual(result['available_resets'], 2)
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertNotIn('SECRET_RESET_ID', json.dumps(result))

    def test_claude_absent_fields_not_context_quota(self):
        result = usage.parse_claude({'context_window': {'remaining_percentage': 90}, 'cost': {'total_cost_usd': 2}},1000,now=1100)
        self.assertEqual(result['windows'], [])
        result = usage.parse_claude({'rate_limits': {'five_hour': {'used_percentage': 100, 'resets_at': 2000}}},1000,now=1100)
        self.assertEqual(result['windows'][0]['remaining_percent'], 0)

    def test_claude_receiver_redacts_and_writes_private_file(self):
        with tempfile.TemporaryDirectory() as temp:
            env = {**os.environ, 'XDG_STATE_HOME': temp}
            payload = {'rate_limits': {'five_hour': {'used_percentage': 35, 'resets_at': 9999999999}},
                       'transcript_path': 'PRIVATE_TRANSCRIPT', 'prompt': 'PRIVATE_TEXT', 'api_key': 'PRIVATE_KEY'}
            process = subprocess.run([sys.executable, str(Path(__file__).parents[1]/'backend/claude_statusline.py')], input=json.dumps(payload),text=True,capture_output=True,env=env,check=True)
            path = Path(temp)/'monitor-dashboard/claude-usage.json'
            saved = path.read_text()
            self.assertNotIn('PRIVATE', saved)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertIn('65% left', process.stdout)

    def test_connect_preserves_settings_and_refuses_existing_statusline(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            config = root/'claude';config.mkdir()
            script = root/'data/monitor-dashboard/claude_statusline.py';script.parent.mkdir(parents=True);script.write_text('')
            settings = config/'settings.json';settings.write_text(json.dumps({'theme':'dark','enabledPlugins':{'keep':True}}))
            env = {**os.environ,'CLAUDE_CONFIG_DIR':str(config),'XDG_DATA_HOME':str(root/'data')}
            command = [sys.executable,str(Path(__file__).parents[1]/'scripts/connect-claude.py')]
            subprocess.run(command,env=env,capture_output=True,check=True)
            value = json.loads(settings.read_text())
            self.assertEqual(value['theme'],'dark')
            self.assertEqual(value['enabledPlugins'],{'keep':True})
            subprocess.run(command+['--disconnect'],env=env,capture_output=True,check=True)
            self.assertNotIn('statusLine',json.loads(settings.read_text()))
            settings.write_text(json.dumps({'statusLine':{'type':'command','command':'existing'}}))
            self.assertNotEqual(subprocess.run(command,env=env,capture_output=True).returncode,0)
            self.assertEqual(json.loads(settings.read_text())['statusLine']['command'],'existing')


class NewsTests(unittest.TestCase):
    def test_does_not_invent_timezone_for_tomorrow(self):
        reset, hint = reset_news.reset_timing("I'll reset usage tomorrow", 1000)
        self.assertIsNone(reset)
        self.assertIn('timezone',hint)

    def test_relative_hour_is_explicit_estimate(self):
        reset, hint = reset_news.reset_timing('Usage resets in the next hour', 1000)
        self.assertEqual(reset,4600)
        self.assertIn('estimate',hint)

    def test_public_relay_is_not_confirmed(self):
        published = 1700000000
        post_id = ((published * 1000 - 1288834974657) << 22)
        rss = f'''<rss><channel><item><title>Reset report</title><link>https://community.openai.com/t/test/1</link><description><![CDATA[<a href="https://x.com/thsottiaux/status/{post_id}">Tibo</a><p>Usage limits reset tomorrow.</p>]]></description><pubDate>Wed, 22 Nov 2023 12:00:00 GMT</pubDate></item></channel></rss>'''
        events = reset_news.parse_rss(rss.encode(),now=published+100)
        self.assertEqual(len(events),1)
        self.assertEqual(events[0]['published_at'],published)
        self.assertIn('unconfirmed',events[0]['confidence'])
        self.assertIsNone(events[0]['expected_at'])

    def test_direct_x_uses_current_fields_and_keeps_source(self):
        replies = [json.dumps({'data': {'id': '1'}}).encode(),
                   json.dumps({'data': [{'id': '123', 'text': 'Usage limits reset in the next hour', 'created_at': '2026-10-03T00:00:00Z'}]}).encode(),
                   json.dumps({'data': {'id': '2'}}).encode(), json.dumps({'data': []}).encode()]
        with patch.object(reset_news, 'fetch', side_effect=replies) as fetch:
            events = reset_news.read_x_news('TEST_TOKEN')
        self.assertEqual(len(events), 1)
        self.assertIn('Developer post', events[0]['confidence'])
        self.assertIn('post.fields=created_at', fetch.call_args_list[1].args[0])
        self.assertNotIn('TEST_TOKEN', json.dumps(events))

    def test_unattributed_reset_rumor_is_ignored(self):
        raw = b'<rss><channel><item><title>Reset</title><description>Maybe usage will reset tomorrow.</description></item></channel></rss>'
        self.assertEqual(reset_news.parse_rss(raw),[])


if __name__ == '__main__': unittest.main()
