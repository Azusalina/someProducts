# Coding subscription usage and reset news

Monitor 1.1 adds three composable modules: **CODEX**, **CLAUDE CODE**, and **RESET NEWS**. They follow the same transparent layout and can be split into separate widget instances.

For an existing desktop widget, click **Customize** and enable **CODEX**, **CLAUDE**, and **RESETS**. Saved module choices remain yours. If the new choices are absent because Plasma has cached the previous QML, remove that widget and add Monitor again through Edit Mode. Save/copy any note before removing its widget instance. The installer updates the registered widget and restarts the telemetry service without restarting Plasma.

## Codex

The bridge calls the documented `account/rateLimits/read` method through the installed Codex CLI app server once per minute. It delegates authentication to Codex. It neither extracts credentials nor starts an inference turn.

The card shows remaining percentage, exact account reset timestamp in your local timezone, a countdown, available banked-reset count and the earliest reported expiry. Multiple quota buckets are preserved when the service returns them. A remaining percentage is a portion of an allowance, not a fixed number of tokens or messages. API-key billing is separate from this subscription module.

The card does not apply any banked reset. If you wish to use one, do so in Codex's own Usage interface; the next successful read updates Monitor. There is no redemption action in this widget.

Primary documentation: [Codex account rate limits](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt).

## Claude Code

The integration uses Claude Code's officially documented status-line JSON. Its `rate_limits.five_hour` and `rate_limits.seven_day` fields supply percentages and reset timestamps. Context-window capacity and session cost are deliberately excluded from subscription allowances.

On this machine, the status-line connection is installed and has supplied both quota windows. The connection adds a small terminal line such as `Claude · 5h 65% left · 7d 40% left` and preserves unrelated Claude settings. A private backup of the pre-integration settings is at `~/.claude/settings.pre-monitor-statusline.json`.

To connect a fresh installation:

```bash
./scripts/install.sh
python scripts/connect-claude.py
```

Claude reloads the setting. Its subscription data normally appears after the first response in a supported subscription-authenticated session. The 30-second status refresh receives Claude's last reported data; it does not perform an extra model call or poll the account independently. Usage on other devices can remain unreflected until Claude receives a newer account response. An absent field stays unknown.

Only allowance percentages, reset timestamps and a receipt time are saved to `~/.local/state/monitor-dashboard/claude-usage.json` (XDG overrides supported), with mode 0600. Prompts, transcripts, API keys and account identifiers are not saved or sent to the widget. This file is local to the computer.

If an existing custom status line is found, the connection helper refuses to replace it. Integrate the receiver into that existing script by sending its stdin JSON to the installed `~/.local/share/monitor-dashboard/claude_statusline.py`, while preserving the existing script's output. This machine had no pre-existing custom status line.

Disconnect without disturbing other settings:

```bash
python scripts/connect-claude.py --disconnect
```

Primary documentation: [Claude Code status-line fields and rate limits](https://code.claude.com/docs/en/statusline).

## Reset news and Tibo

Tibo's account is [@thsottiaux](https://x.com/thsottiaux). The module refreshes every five minutes and watches OpenAI's public Codex community RSS plus several reset-related threads. It accepts reports only when they contain a link to a watched developer's post and mention usage/limit resets. Source buttons link to the relay; **Open Tibo** opens his profile.

Direct anonymous fetching of X is blocked in this environment. Consequently the working default is **Public community relays**, explicitly marked **unconfirmed**. It can miss posts that nobody relays, posts outside the watched feeds, and older replies omitted from RSS. These are reports by community members, not direct confirmation by OpenAI or by the developer. The fetched list presently includes a September 26 report linking Tibo's post about a reset following an outage; its age is displayed, and it is not treated as a future reset.

No dated future reset was established by the fetched reports during development. The widget keeps account countdowns separate from announcement timing. An explicit ISO timestamp is labeled **Reported time**. A phrase such as “next hour” can provide an estimate anchored to the original linked post's timestamp; it remains labeled an estimate. “Tomorrow” or “this evening” stays uncertain when the author's timezone is unstated. Historical reports are labeled **Earlier report**. A promotional reset announcement does not prove eligibility or that your allowance has changed.

Original post timestamps are decoded from X Snowflake IDs, so an old post re-shared today does not become a new announcement. Primary reference: [X IDs](https://docs.x.com/fundamentals/x-ids). Example relay checked: [September 26 Codex reset report](https://community.openai.com/t/codex-is-down-confirmed-by-openai/1400811/37).

### Optional direct X API access

A direct adapter is implemented for Tibo and Claude developer [@bcherny](https://x.com/bcherny). It uses the official user-lookup and authored-post endpoints and requires your own X developer API entitlement and bearer token. It has been schema-checked against current X documentation and tested with fixtures, but no token is configured and live direct X access has not been tested here.

If you already have suitable access, place the bearer token in `~/.config/monitor-dashboard/x-token`, create the directory with mode 0700, and give the token file mode 0600. Do not put it into a widget field or the repository. The next news refresh picks it up. The token is used only with `api.x.com`, stays in the service, and is never returned through telemetry. API failures fall back to community reports and are indicated in the card. X API access and costs depend on your account; Monitor does not provision or purchase access.

Primary API references: [User lookup](https://docs.x.com/x-api/users/get-user-by-username), [Authored posts](https://docs.x.com/x-api/users/get-posts).

## Stale data

A quota observation older than five minutes shows **Stale**. A passed reset timestamp shows **Awaiting refresh**, never an assumed full allowance. News becomes stale after fifteen minutes without a successful fetch. Network errors preserve the last observation with its timestamp and an unavailable/stale indication.

Test and visual evidence: `backend-tests.log`, `qml-tests.log`, and `preview-usage.png`. No Git commands were executed.
