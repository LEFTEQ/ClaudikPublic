---
name: godaddy
disable-model-invocation: true
description: "Manage GoDaddy domains and DNS via the REST API with onyx-injected credentials."
---

# GoDaddy API Navigator

Manage the user's GoDaddy domains and DNS via `https://api.godaddy.com`. Credentials live in the onyx vault — never ask the user for keys, never echo them, never put them in argv or files.

## Credentials & call pattern

Onyx project **GoDaddy → Production API** group. The injectable credential is the combined `key:secret`:

```
ref: onyx://Production%20API/GODADDY_SSO_KEY/Combined%20key:secret%20for%20Authorization%20sso-key%20header
```

Bound to host `api.godaddy.com` and commands `curl`, `/bin/sh -c`, `/usr/bin/curl`. (`GODADDY_API_KEY` / `GODADDY_API_SECRET` hold the halves, reference only.)

**Onyx suppresses ALL stdout when a secret is injected**, so every call writes its response to a file, then you Read it:

1. `mcp__onyx__run_command` (load via ToolSearch if deferred):
   - `argv`: `["/bin/sh", "-c", "curl -s -w '%{http_code}' -X <METHOD> -H \"Authorization: sso-key $GODADDY_SSO_KEY\" -H 'Content-Type: application/json' [-d '<json>'] 'https://api.godaddy.com/<path>' -o <scratchpad>/godaddy-out.json"]`
   - `env_refs`: `{"GODADDY_SSO_KEY": "<ref above>"}`
2. Read `<scratchpad>/godaddy-out.json` (empty file + 2xx = success on writes).

Gotchas: binaries need absolute paths (`/bin/sh`, not `sh`). Request bodies with secrets are forbidden — but GoDaddy bodies never contain the key, only the header does. `mcp__onyx__http_call` with `auth_scheme: "sso-key"` also works but returns only the status code (body redacted) — fine for quick "does this 200?" probes.

## Endpoint cheatsheet (v1)

| Task | Method + path |
|---|---|
| List domains | `GET /v1/domains` (add `?limit=100`; filter `status=ACTIVE` client-side) |
| Domain detail | `GET /v1/domains/{domain}` |
| All DNS records | `GET /v1/domains/{domain}/records` |
| Records by type/name | `GET /v1/domains/{domain}/records/{type}/{name}` |
| **Add** records (append) | `PATCH /v1/domains/{domain}/records` — body `[{"type","name","data","ttl",("priority")}]` |
| **Replace** records for type+name | `PUT /v1/domains/{domain}/records/{type}/{name}` — body is array of record objects WITHOUT type/name |
| Replace ENTIRE zone | `PUT /v1/domains/{domain}/records` — dangerous, see safety |
| Delete records for type+name | `DELETE /v1/domains/{domain}/records/{type}/{name}` |
| Update nameservers | `PUT /v1/domains/{domain}` — body `{"nameServers": [...]}` |
| Availability check | `GET /v1/domains/available?domain=x.com` |
| TLD list / suggestions | `GET /v1/domains/tlds`, `GET /v1/domains/suggest?query=...` |

Record shape: `{"type": "A", "name": "api", "data": "203.0.113.20", "ttl": 600}`; MX adds `"priority"`; apex is `name: "@"`. Min TTL 600. Rate limit ~60 req/min.

## Safety rules

- **Always `GET` the current records first** and show the user a before/after diff for any mutation beyond a simple additive `PATCH`.
- **`PUT` replaces, `PATCH` appends.** `PUT .../records/{type}/{name}` wipes every record of that type+name and installs your array; full-zone `PUT /records` wipes the whole zone. Never full-zone `PUT` without explicit user confirmation, and save the `GET` snapshot to the scratchpad first as a restore point.
- There is no undo in the API — the snapshot file IS the backup.
- Purchases, renewals, transfers, contact changes (`POST /v1/domains/purchase`, etc.) cost real money / trigger registrar processes — always confirm with the user first.
- Known infra IPs when adding records: prod VPS `203.0.113.20`, devops VPS `203.0.113.50`.

## Output

Report results in plain language (records as a small table), full domain names spelled out. For mutations: state what changed, show the verifying `GET` afterwards.
