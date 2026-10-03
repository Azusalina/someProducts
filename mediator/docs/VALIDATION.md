# Validation — 2026-10-03

Installed and verified on the current Linux host.

- `npm test`: all five tests passed. Coverage includes IPv4/IPv6 listener grouping, distinct TCP/UDP rows, plain-text title extraction, HTTP discovery without following redirects, and rejection of foreign hosts, cross-site requests, writes, and file traversal.
- `systemd-analyze verify`: installed socket/service configuration passed validation.
- `mediator.socket`: enabled and listening on 127.0.0.1:80 and [::1]:80. `mediator.service`: running as account `a`, using sockets inherited from systemd.
- HTTP checks passed for `http://localhost/`, `http://127.0.0.1/`, and `http://[::1]/`.
- Chromium browser checks passed for both port-free hostnames, live HTTP and UDP listener discovery, listener removal, opening a service in a new tab, expandable details, manual refresh, search, keyboard shortcuts, and Web/Other filters. No JavaScript errors occurred.
- No horizontal overflow at 320px, 390px, or 768px. Light and dark screenshots were captured and desktop/320px renders were visually inspected.
- The temporary development server on port 8787 was stopped; the installed port 80 service remains active.

Startup enablement was inspected; the machine was not rebooted as part of verification. Unknown process owners and tasks are shown explicitly rather than invented. Counts vary as local services start and stop; screenshots include temporary discovery fixtures used during browser testing.
