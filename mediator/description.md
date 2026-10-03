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
