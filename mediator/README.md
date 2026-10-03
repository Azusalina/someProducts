# Mediator

## What is it?

Your local service directory. Visit **http://localhost** or **http://127.0.0.1**, without a port number, to see listening TCP and UDP ports, what they are doing, and buttons to open detected web services.

## How to use

**Install on this Linux machine**

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

Development listens at http://localhost:8787 and http://127.0.0.1:8787. It cannot provide a URL without a port until the socket is installed.

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

**Remove automatic startup**

```sh
python3 scripts/install.py --uninstall
```

This removes only the units managed by this installer and preserves the project files.

**Development preview**

Run `npm run dev` from `mediator` to start the preview on port 8787. In the directory, use the Open button for a detected web service and Service details to inspect its name sources and protocol information.

See [description.md](description.md) for background and technical details.
