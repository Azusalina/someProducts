# Mediator — Description

## Development

```sh
npm run dev
npm test
```

## Discovery and descriptions

- Reads current host listeners with `ss -H -lntup`; it does not sweep all 65,535 ports. TCP and UDP on the same port have separate rows. IPv4 and IPv6 listeners for the same protocol/port share a row.
- Shows loopback, wildcard, and network-interface listeners. Network-only bindings are labelled and never probed or offered as local links.
- Reads same-user process/project metadata where permitted, and probes local TCP listeners with bounded HTTP/HTTPS requests. HTML services supply their page title; JSON endpoints are labelled as APIs. Known database/desktop protocols are not probed. Probes never follow redirects, send credentials, or execute scripts.
- Name sources are shown in Service details. A conventional port name is an inference, not proof of a service's identity. Processes owned by other users may be unavailable. Unknown tasks remain labelled unknown; the app cannot infer arbitrary application intent.
- Refreshes the list every 10 seconds while visible. Protocol probes are cached for up to 15 seconds. No authentication, token, or full command-line arguments are displayed.
- HTTPS services with self-signed certificates are detected but their certificate status is shown in details; normal browser certificate checks still apply when opening them.

## Visual theme

The interface uses a fixed black base with gold and red accents, independent of the operating system's light/dark preference. Gold identifies ports, service names, and ordinary actions; red identifies termination actions, unavailable web connections, and errors. The directory keeps a subtle translucent surface and fine borders.

The page begins with search, refresh, and All/Web/Other filters, followed immediately by the services. Branding, slogans, large headings, address cards, local indicators, icons, decorative geometry, background patterns, and duplicate summary cards have been removed. Service names, port/protocol labels, process details, connection states, and operation feedback remain because they support decisions. Keyboard focus is outlined in gold.

The interface is implemented in `public/index.html`, `public/style.css`, and `public/app.js`, without external fonts or images. Mobile layouts stack the toolbar and actions. The browser tab retains a short document title for identification, without a visible page heading or favicon. Former favicon endpoints return an empty response.

## Termination

`lib/termination.mjs` uses a two-step operation. A same-origin JSON POST to `/api/terminate/preview` validates the port and protocol, reads current listeners, queries `fuser`, checks process ownership, and identifies shared ports. It returns a single-use confirmation token valid for 60 seconds. The page displays the processes and shared listeners before the user confirms.

POST `/api/terminate` consumes that token, checks the owning PIDs and their `/proc` start times again, and invokes `/usr/bin/fuser` with the fixed arguments `-k -TERM -n tcp PORT` or `-k -TERM -n udp PORT`. No shell command, arbitrary signal, filename, or unvalidated port is accepted from the browser. The API requires the exact same Origin and a custom action header; cross-site requests are rejected. Requests have a bounded JSON body.

`lib/processes.mjs` reads process identity and ownership. Mediator's process, its listening ports, and processes belonging to other users are protected. The page disables unavailable actions and hides its own Terminate button. Actual ownership is checked again at execution, including processes discovered by `fuser` beyond the displayed listener metadata.

SIGTERM allows orderly shutdown; it does not force-kill an unresponsive service or disable its supervisor. The response reports if the port is still occupied after signaling. A process can own several TCP/UDP listeners, so termination affects all of them. There is a small system-level race between the final ownership check and the port-based `fuser` invocation; the confirmation identity check rejects a port replacement already visible before execution.

After execution, the page requests a fresh listener scan instead of reusing the short snapshot cache. A canceled dialog sends no signal. Backend confirmation entries are bounded and expire; an expired, changed, or consumed confirmation must be reviewed again.

## Initial theme validation — 2026-10-06

- All five existing `npm test` checks passed.
- The installed page was verified at both `http://localhost/` and `http://127.0.0.1/`.
- Chromium checks confirmed the black base under both light and dark system preferences, active glass blur, search and keyboard shortcuts, Web/Other filters, visible service links, expanded details, and refresh preserving expansion. No JavaScript errors occurred.
- Layouts at 320, 390, 620, 768, and 1024 pixels had no horizontal overflow. Desktop and 320-pixel screenshots were visually inspected.
- Static assets are read on request, so the theme is available by refreshing the installed page.

The original installation validation remains in [docs/VALIDATION.md](docs/VALIDATION.md).

## Interface history

The first gold/red theme used a constructivist hero, bold uppercase headline, diagonal beams, a triangular red plane, a circular gold outline, and a glass address card. The subsequent content-first revision removed those decorative elements while retaining the black palette and subtle panel translucency.

## Content-first interface and termination validation — 2026-10-06

- All nine automated tests passed. New tests run actual `fuser` SIGTERM operations against disposable TCP/UDP child processes, verify shared listeners, reject mismatched user ownership, reject reused confirmations and changed port owners, and cover cross-site/missing-origin requests, methods, content type, input validation, and oversized bodies.
- Chromium exercised the installed `http://localhost/` page through preview, Cancel, a second preview, confirmation, actual SIGTERM, process exit, and the refreshed port list. The shared-port confirmation listed the test process's other TCP and UDP listeners.
- Browser checks also passed for search and its shortcut, filters, details surviving refresh, copying a port, opening a service, the protected Mediator row, and `http://127.0.0.1/`. No JavaScript errors occurred.
- Search is at the top of the page; branding, slogans, hero elements, icons, visible page headings, and local badges are absent. Layouts at 320, 390, 620, 768, and 1024 pixels have no horizontal overflow. Desktop, 320-pixel, and confirmation screenshots were visually inspected.
- Live Mediator was restarted to load the new endpoints and stayed active as the normal user. Termination tests affected only disposable fixtures; existing user services were not terminated.
