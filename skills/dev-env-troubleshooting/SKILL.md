---
name: dev-env-troubleshooting
description: "Use when a dev-environment command fails confusingly: EPERM on writes, unreadable cwd, a host unreachable from this Mac only, 127.0.0.1 works but localhost 404s, a wait loop that never exits, a CLI claiming a flag you passed is missing, or zsh mangling a variable. Read before hand-rolling any wait loop."
---

# Dev environment gotchas

Failures that look like one thing and are another. Each entry leads with the symptom.

## Agent spawn fails `fork failed: Device not configured` — pty exhaustion, not tmux breakage

**Symptom:** spawning a subagent errors with
`Failed to send command to pane %N: respawn pane failed: fork failed: Device not configured`,
repeatedly, while background Bash tasks (no pty) keep working — and often the FIRST
agent spawned fine. Observed 2026-08-25 during a `/prm all` fan-out.

**Cause:** each Claude session runs its own `tmux -L claude-swarm-<pid>` server for
agent panes; every pane costs a pty. macOS caps ptys at `kern.tty.ptmx_max` (**511**
here), and `forkpty` past the cap returns **ENXIO "Device not configured"** — tmux
wraps it as `fork failed`. Parallel agent storms across many live sessions hit the cap
transiently; it self-recovers as panes/processes exit, which is why retries eventually
succeed and why the count can look healthy by the time you measure.

**Diagnose:**

```sh
ls /dev/ttys* 2>/dev/null | wc -l; sysctl kern.tty.ptmx_max   # usage vs cap
ls /private/tmp/tmux-$(id -u)/            # swarm sockets accumulate here
# orphaned swarm servers (owner claude pid gone but server alive):
for s in /private/tmp/tmux-$(id -u)/claude-swarm-*; do n=${s##*-}; \
  tmux -S "$s" list-sessions >/dev/null 2>&1 && ! ps -p "$n" >/dev/null && echo "$s"; done
```

⚠️ `tmux list-panes -a` (default socket) showing 0 proves nothing — the swarm servers
live on their own `-L` sockets.

**Fix, in order:** kill orphaned swarm servers (`tmux -S <sock> kill-server` — safe
when the owner pid is gone); close stale multi-day Claude sessions (rank by transcript
mtime per the session-sprawl audit memory, never ps age); raise the cap for storms:
`sudo sysctl kern.tty.ptmx_max=999` (runtime only; persistence needs a LaunchDaemon —
`/etc/sysctl.conf` is not reliably read on modern macOS). During an active storm,
pausing the fan-out and retrying after a minute is usually enough.

## EPERM everywhere at once — it's Warp losing Full Disk Access, not your session

**Symptom:** every session on the machine starts failing *simultaneously* with
`ls: /Users/…/Documents/Work: Operation not permitted` and
`fatal: Unable to read current working directory: Operation not permitted`.

**Confirmed chain (2026-08-08, two observed cascades):** `lsd` is flooded with
`pid NNNN registering self` → `Failed to register: -10811` from the machine's
short-lived tool processes (measured **~83 new processes/sec**, PID space
wrapping every ~20 min). That churn fires
`NotifyToken::RegisterDispatch(com.apple.LaunchServices.database)`, invalidating
`tccd`'s cached bundle nodes. `tccd` then can't resolve which bundle is
*responsible* for Warp's children (`_LSBundleCreateNode … returned -43`), so
Warp's Full Disk Access grant doesn't apply and **every Warp descendant is
denied at the same instant**.

⚠️ **Two things this is NOT** — both tested and rejected on 2026-08-08:

- **Not `dangerouslyDisableSandbox`.** 2026-07-15 used it **420** times with
  zero EPERM; 2026-07-31 had **0** uses and a full cascade.
- **Not Warp's staged auto-update.** The staging dir was emptied and locked at
  20:19; a fresh cascade hit 6 minutes later at 20:25–20:27 across 5 sessions.

**Open question — instantaneous process-spawn rate.** Sessions-per-day and
Bash-calls-per-day do *not* predict cascade days, but those are poor proxies:
one `bun run typecheck` spawns hundreds of processes that never appear in a
transcript. Concurrent spawn *rate* remains the leading suspect and is not yet
ruled out. Do not repeat the claim that load is disproven.
Supporting data 2026-08-11: TWO cascade waves in one afternoon (~13:30 and
~14:07 UTC), both while three parallel implementer agents ran full build/test
suites (xcodebuild + go test + bun) — the highest-spawn-rate day on record.

**Confirm in three commands:**

```sh
# 1. Warp's FDA row — a last_modified inside the incident window means it flipped
sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" \
  "select service,client,client_type,auth_value,datetime(last_modified,'unixepoch','localtime') \
   from access where client like '%arp%';"
# client_type 0 = bundleID (should be auth 2/allow); 1 = path (these are the stale DENY rows)

# 2. tccd failing to resolve bundle nodes — appears ONLY during the cascade
/usr/bin/log show --start '<HH:MM>' --predicate 'process == "tccd"' --style compact \
  | rg 'returned -43'

# 3. a staged update sitting unapplied is the standing risk
ls -lO ~/Library/Application\ Support/dev.warp.Warp-Stable/autoupdate/
```

⚠️ `log` is shadowed in this user's zsh — always call `/usr/bin/log`.

**Fix:** it self-recovers in ~5 min once identity re-resolves. Durably: keep the
staging dir empty and locked (see below), and delete stale path-keyed rows via
System Settings → Privacy & Security → Full Disk Access (Warp should appear
**once**, as `/Applications/Warp.app`).

## `uchg` on Warp's autoupdate dir — reports "Operation not permitted" BY DESIGN

`~/Library/Application Support/dev.warp.Warp-Stable/autoupdate` is deliberately
locked (`chflags uchg`, set 2026-08-08) to stop Warp staging updates — Warp
ships no supported way to disable them (upstream #4526 closed *not planned*).

ℹ️ It was locked to test a theory that has since been **falsified** (a cascade
recurred 6 min after locking). It survives only as a deliberate version pin on
v0.2026.07.29 — it does **not** prevent the EPERM cascade.

🚨 **Do not "fix" the resulting errors.** Any `mkdir`/`touch`/`rm` under that
path fails with **`Operation not permitted`** — the exact string as the TCC
cascade above, and as a plain read-only file. It is working correctly.

- Distinguish: `ls -lOd <path>` shows the `uchg` flag. TCC denial shows no flag.
- The dir must stay **empty**. Locking it with a staged bundle inside freezes
  ~617 MB permanently and cements the exact state that triggers the cascade.
- `reclaiming-disk-space` must skip it — it is not reclaimable and not a leak.
- Intentional update: `chflags nouchg <dir>` → relaunch Warp → re-lock the
  emptied dir. No `sudo` needed (`uchg` is the *user* immutable flag).

## EPERM on a single write — don't reach for `dangerouslyDisableSandbox`

🚨 **`dangerouslyDisableSandbox` grants LESS OS access, not more.** The flag
removes the harness's controlled wrapper and runs a raw shell that lacks the
macOS TCC grant the sandboxed harness holds for `~/Documents`. It cannot succeed
on a protected file.

ℹ️ Earlier revisions of this skill claimed the override *caused* the
machine-wide cascade. The 49-day correlation above disproves that. It is still
the wrong tool — it just isn't the culprit.

**Once the cascade has hit, STOP the session immediately — do not keep
retrying**, and do not escalate to the sandbox override. Surface the
diagnosis, then end the turn. Access typically returns within ~5 minutes once
TCC re-resolves Warp's identity; if not, the user restarts the session or
re-enables Full Disk Access in System Settings → Privacy & Security.

**Diagnosis that should stop you first:** the EPERM is almost always
*transient* — the sandbox/TCC layer at write-time, or another process
momentarily holding the file — NOT a permanent file lock.

- `com.apple.provenance` is **NOT** a signal. Verified across ~1600 repo
  `.gitignore`s: it's on nearly every file, including ones that save fine daily.
- A genuinely read-only file shows `r--` in `ls -l` (e.g. SwiftPM
  `.build/checkouts/*` deps, which SPM `chmod`s read-only on purpose) or a
  `uchg`/`schg` flag in `ls -lO`.
- If `ls` shows `rw-` but the write still fails, it's the TCC/sandbox layer, not
  the file.

**Right moves instead:** retry the Edit via Read-then-Edit (the tool requires a
prior Read-*tool* read, not a `tail`); investigate the file's xattr/flags;
append the rule to `.git/info/exclude` (local-only) if `.gitignore` itself is
locked; or hand the user the exact command. Never escalate to the sandbox
override on a hunch.

## Persistent shell — a `cd` leaks into the next tool call

The harness Bash shell is **persistent**, and a drifted cwd makes read-only git
commands answer **wrongly without erroring**.

Wrap every directory change in a subshell — `(cd <abs>/apps/web && bunx tsc …)` —
so it cannot leak. An absolute-`cd` prefix only protects the command you
remember to write it on, while the leak poisons the NEXT one.

⚠️ The silent-failure mode is the dangerous part: **git pathspecs resolve
relative to cwd, and `git diff` does NOT warn when a pathspec matches nothing** —
it prints nothing and exits 0. So `git diff A..B -- packages/shared/x.tsx` run
from a drifted `apps/web` returns EMPTY, which reads exactly like "that file is
unchanged" (this nearly ended a merge-conflict investigation on FixIt
`work/tz-correctness`, 2026-07-29).

Defenses, strongest first:
1. subshell `cd`
2. `git -C <abs-path> …`
3. root-relative pathspecs `git diff … -- ':(top)packages/shared/x'`

**Treat an empty read-only result during an audit as suspect until you have
re-confirmed the cwd — never as evidence of absence.** Every git MUTATION must
name its repo explicitly.

## zsh applies history modifiers to `$VAR:x` inside double quotes

`git push origin "$COMMIT:refs/heads/x"` silently becomes `${COMMIT:r}efs/heads/x`
(`:r` = strip-extension modifier), producing a mangled refspec and a baffling
`failed to push some refs` (bit twice on 2026-07-29 before diagnosis).

**Always brace the variable when a `:` follows it:** `"${COMMIT}:refs/heads/x"`.
Same class as the `:t`, `:h`, `:e` modifiers.

## zsh does NOT word-split `$VAR` — packed flags arrive as ONE argument

⚠️ The tool is called **Bash**, but the harness shell is **zsh** (`$0=/bin/zsh`,
`ZSH_VERSION=5.9`, `BASH_VERSION` unset). zsh leaves `SH_WORD_SPLIT` **off**, so
the bash reflex of stashing flags in a variable silently breaks:

```zsh
O="--owner acme --repo x --pr 7"
printf 'ARG:[%s]\n' $O      # bash: 6 args   zsh: ARG:[--owner acme --repo x --pr 7]
```

**Symptom:** a CLI reports a flag missing that you can plainly see in the command
— `missing required field: owner` when `--owner` is right there. The parser saw
one giant token whose "name" was `owner acme --repo x --pr 7` (2026-08-08, PR
#1066 reply round; five replies lost this way).

**Fixes, best first:**
1. **Array** — `FLAGS=(--owner acme --repo x); cmd "${FLAGS[@]}"` (portable, safe
   with spaces in values)
2. Write the flags out literally per call
3. `${=O}` — forces splitting for one expansion (zsh-only, no quoting safety)

Same family: `for f in $FILES` iterates **once** over the whole string, and
`$(cmd)` unquoted stays a single word. Command substitution capturing a
newline-separated list needs `${(f)"$(cmd)"}` or a `while read` loop.

💡 `~/.claude/skills/git/_shared/bin/github-io.ts` now detects a whitespace-bearing
flag name and names this cause outright instead of blaming a missing field.

## Prefer `127.0.0.1` over `localhost` in env URLs

`localhost` resolves to IPv6 `::1` on macOS, while many dev servers (Node,
NestJS) bind IPv4 `*` by default — same port, different process.

**Symptom:** `curl http://127.0.0.1:3000/foo` returns 200 but the web app gets
404 from `NEXT_PUBLIC_API_URL=http://localhost:3000/foo`.

**Diagnose:** `lsof -i :3000` (two processes = the smoking gun).
**Fix:** pin `NEXT_PUBLIC_API_URL` and similar to `127.0.0.1` in `.env.local`.

## Don't hand-roll poll loops — and beware `pgrep -f` self-match

Prefer the harness's native background-task completion signal (background Bash
re-invokes on exit) over `until ! pgrep -f "bun install"; do sleep 5; done`.

`pgrep -f` scans each process's FULL command line, so the loop's own shell
(which literally contains `bun install` in the pattern) always matches →
infinite sleep even after the job finished.

If you must match by name, use the bracket trick `pgrep -f '[b]un install'`, or
poll a sentinel file the job writes on exit. And match a marker the tool
ACTUALLY emits — bun prints `(no changes)` / `Saved lockfile`, not `done`.

## A local VPN can hijack the route to a VPS public IP

**Diagnose this BEFORE the server-side outage runbook.**

**Symptom:** a host (e.g. the devops VPS `203.0.113.10`) is dead from your Mac
on *all* ports **and** ICMP, yet another host in the same datacenter (prod
`203.0.113.20`) and the public internet work fine, AND the box is reachable
from elsewhere (e.g. from prod). **When ONLY your Mac can't reach it, suspect
local routing — not fail2ban / netplan / kernel.**

**Cause:** WireGuard.app / OpenVPN Connect installs a default route + `/32` host
routes onto a `utunN` interface, so traffic to the VPS public IP is pushed into
the tunnel and black-holes at the WG gateway (`10.8.0.1`). The server is healthy.

**Diagnose:**
- `route -n get <ip>` shows `interface: utunN`
- `traceroute <ip>` hop 1 = `10.8.0.x`
- `netstat -nr -f inet | grep utun` shows the hijacking `/32` routes

**Fix:** toggle the VPN off, or reach the box over the WG mesh. **a jump-host ssh alias**
in `~/.ssh/config` tunnels through the prod jump and works regardless of local VPN state.
