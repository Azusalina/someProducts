# Mediator

Your local service directory. Visit **http://localhost** or **http://127.0.0.1**, without a port number, to see listening TCP and UDP ports, what they are doing, and buttons to open detected web services.

## Install on this Linux machine

Requires Node.js 22+, Python 3, systemd, and `ss` from iproute2. No npm dependencies.

```sh
cd /home/a/Documents/someProducts/mediator
python3 scripts/install.py
```

Approve the desktop administrator authentication dialog. The installer creates `/etc/systemd/system/mediator.socket` and `mediator.service`, enables the socket at boot, and binds **only 127.0.0.1:80 and [::1]:80**. Visiting the page starts the app as your normal account. It uses systemd's inherited sockets, so Node does not run as root and requires no global capability changes. Port 80 must be free; existing services are never replaced.

If desktop authentication is unavailable, run `sudo python3 scripts/install.py --user "$USER"` from your terminal.

```sh
systemctl status mediator.socket mediator.service
journalctl -u mediator.service -n 30
```

Use `http://` explicitly if your browser forces HTTPS: this local directory serves HTTP on port 80.

## Development

```sh
npm run dev
npm test
```

Development listens at http://localhost:8787 and http://127.0.0.1:8787. It cannot provide a URL without a port until the socket is installed.

## Discovery and descriptions

- Reads current host listeners with `ss -H -lntup`; it does not sweep all 65,535 ports. TCP and UDP on the same port have separate rows. IPv4 and IPv6 listeners for the same protocol/port share a row.
- Shows loopback, wildcard, and network-interface listeners. Network-only bindings are labelled and never probed or offered as local links.
- Reads same-user process/project metadata where permitted, and probes local TCP listeners with bounded HTTP/HTTPS requests. HTML services supply their page title; JSON endpoints are labelled as APIs. Known database/desktop protocols are not probed. Probes never follow redirects, send credentials, or execute scripts.
- Name sources are shown in Service details. A conventional port name is an inference, not proof of a service's identity. Processes owned by other users may be unavailable. Unknown tasks remain labelled unknown; the app cannot infer arbitrary application intent.
- Refreshes the list every 10 seconds while visible. Protocol probes are cached for up to 15 seconds. No authentication, token, or full command-line arguments are displayed.
- HTTPS services with self-signed certificates are detected but their certificate status is shown in details; normal browser certificate checks still apply when opening them.

For exact task names, edit `services.json` (changes apply on a following scan):

```json
{
  "services": {
    "tcp:3000": {
      "name": "My development app",
      "description": "Frontend development server"
    },
    "5432": {
      "name": "Project database",
      "description": "PostgreSQL for local development"
    }
  }
}
```

Protocol-specific entries take precedence over bare port entries. Overrides describe a task; only protocol detection enables its Open button.

## Remove automatic startup

```sh
python3 scripts/install.py --uninstall
```

This removes only the units managed by this installer and preserves the project files.
