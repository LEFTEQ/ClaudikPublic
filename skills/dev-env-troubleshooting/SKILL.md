---
name: dev-env-troubleshooting
description: "Use when a Mac dev-environment command fails confusingly — EPERM, unreadable cwd, a host only this Mac can't reach, localhost 404 where 127.0.0.1 works, hung xcodebuild, `fork failed` spawning agents, a CLI missing a passed flag, zsh mangling a variable, a benign ask refused — or before hand-rolling a wait loop."
---

# Dev environment gotchas

Failures that look like one thing and are another. Each entry leads with the symptom.

## Never signal a process on your own

Several entries below end at a stale process. Diagnosing it is yours; stopping it
is not. Report the candidate (PID, start time, command line, why you think it is
orphaned) and stop there. Send a signal only when the human explicitly asks for
that kill, and only after proving, immediately before the signal, that the PID is
still the process you diagnosed:

```sh
ps -o pid=,lstart=,args= -p <pid>   # same start time + same command line as your listing
```

PIDs are recycled; `kill -0` succeeding proves nothing. Kill one named PID, never a
pattern (`pkill -f …` also hits every other live session's matching process). When
the tools repo's `macwatch` is installed, `macwatch stop` performs this re-verification for
the processes it flags.

## Agent spawn fails `fork failed: Device not configured` — pty exhaustion, not tmux breakage

**Symptom:** spawning a subagent errors with
`Failed to send command to pane %N: respawn pane failed: fork failed: Device not configured`,
repeatedly, while background Bash tasks (no pty) keep working — and often the FIRST
agent spawned fine. Typical during a wide parallel agent fan-out.

**Cause:** each Claude Code session runs its own `tmux -L claude-swarm-<pid>` server for
agent panes; every pane costs a pty. macOS caps ptys at `kern.tty.ptmx_max` (commonly
**511**), and `forkpty` past the cap returns **ENXIO "Device not configured"** — tmux
wraps it as `fork failed`. Parallel agent storms across many live sessions hit the cap
transiently; it self-recovers as panes/processes exit, which is why retries eventually
succeed and why the count can look healthy by the time you measure.

**Diagnose:**

```sh
ls /dev/ttys* 2>/dev/null | wc -l; sysctl kern.tty.ptmx_max   # usage vs cap
ls /private/tmp/tmux-$(id -u)/            # swarm sockets accumulate here
# swarm servers whose owner pid is gone (candidates only — see the first section):
for s in /private/tmp/tmux-$(id -u)/claude-swarm-*; do n=${s##*-}; \
  tmux -S "$s" list-sessions >/dev/null 2>&1 && ! ps -p "$n" >/dev/null && \
  echo "$s server pid $(tmux -S "$s" display -p '#{pid}')"; done
```

⚠️ `tmux list-panes -a` (default socket) showing 0 proves nothing — the swarm servers
live on their own `-L` sockets.

**Fix:** during an active storm, pause the fan-out and retry after a minute — usually
enough. Beyond that, hand the human the options rather than acting:

- An orphaned swarm server (owner pid gone) can go with `tmux -S <sock> kill-server`
  — only on their explicit request, after re-checking that the owner pid is still
  gone and the server pid's start time is unchanged.
- Stale multi-day sessions are theirs to close; rank them by transcript mtime, never
  by `ps` age.
- Raising the cap is their call too: `sudo sysctl kern.tty.ptmx_max=999` (runtime only;
  persistence needs a LaunchDaemon — `/etc/sysctl.conf` is not reliably read on
  modern macOS).

## EPERM everywhere at once — the terminal app lost Full Disk Access, not your session

**Symptom:** every session on the machine starts failing *simultaneously* with
`ls: <home>/Documents/…: Operation not permitted` and
`fatal: Unable to read current working directory: Operation not permitted`.
Observed with Warp; any terminal that holds a Full Disk Access grant can follow the
same chain.

**Observed chain:** `lsd` is flooded with `pid NNNN registering self` →
`Failed to register: -10811` from the machine's short-lived tool processes (measured
at ~83 new processes/sec, PID space wrapping every ~20 min). That churn fires
`NotifyToken::RegisterDispatch(com.apple.LaunchServices.database)`, invalidating
`tccd`'s cached bundle nodes. `tccd` then can't resolve which bundle is
*responsible* for the terminal's children (`_LSBundleCreateNode … returned -43`), so
the terminal's Full Disk Access grant doesn't apply and **every descendant is
denied at the same instant**.

⚠️ **Two things this is NOT** — both tested and rejected:

- **Not `dangerouslyDisableSandbox`.** A day with 420 uses had zero EPERM; a day
  with none had a full cascade.
- **Not the terminal's staged auto-update.** With the staging dir emptied and
  locked, a fresh cascade hit 6 minutes later across 5 sessions.

**Open question — instantaneous process-spawn rate.** Sessions-per-day and
Bash-calls-per-day do *not* predict cascade days, but those are poor proxies:
one `bun run typecheck` spawns hundreds of processes that never appear in a
transcript. Concurrent spawn *rate* remains the leading suspect and is not
ruled out — two cascade waves in one afternoon both landed while three parallel
agents ran full build/test suites (xcodebuild + go test + bun). Do not claim that
load is disproven.

**Confirm in two commands:**

```sh
# 1. the terminal's FDA row — a last_modified inside the incident window means it flipped
sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" \
  "select service,client,client_type,auth_value,datetime(last_modified,'unixepoch','localtime') \
   from access where client like '%<terminal-name>%';"
# client_type 0 = bundleID (should be auth 2/allow); 1 = path (these are the stale DENY rows)

# 2. tccd failing to resolve bundle nodes — appears ONLY during the cascade
/usr/bin/log show --start '<HH:MM>' --predicate 'process == "tccd"' --style compact \
  | rg 'returned -43'
```

⚠️ `log` may be shadowed by a shell function or alias — call the binary by its
absolute path (`/usr/bin/log`).

**Fix:** it self-recovers in ~5 min once identity re-resolves. Durably: delete stale
path-keyed rows via System Settings → Privacy & Security → Full Disk Access (the
terminal should appear **once**, as its `/Applications/<App>.app` bundle).

## EPERM on a single write — don't reach for `dangerouslyDisableSandbox`

🚨 **`dangerouslyDisableSandbox` grants LESS OS access, not more.** In Claude Code
the flag removes the harness's controlled wrapper and runs a raw shell that lacks the
macOS TCC grant the sandboxed harness holds for `~/Documents`. It cannot succeed
on a protected file. It is not what causes the machine-wide cascade above either —
it is simply the wrong tool.

**Once the cascade has hit, STOP the session immediately — do not keep
retrying**, and do not escalate to the sandbox override. Surface the
diagnosis, then end the turn. Access typically returns within ~5 minutes once
TCC re-resolves the terminal's identity; if not, the user restarts the session or
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

The agent's Bash shell is **persistent**, and a drifted cwd makes read-only git
commands answer **wrongly without erroring**.

Wrap every directory change in a subshell — `(cd <abs>/apps/web && bunx tsc …)` —
so it cannot leak. An absolute-`cd` prefix only protects the command you
remember to write it on, while the leak poisons the NEXT one.

⚠️ The silent-failure mode is the dangerous part: **git pathspecs resolve
relative to cwd, and `git diff` does NOT warn when a pathspec matches nothing** —
it prints nothing and exits 0. So `git diff A..B -- packages/shared/x.tsx` run
from a drifted `apps/web` returns EMPTY, which reads exactly like "that file is
unchanged" — enough to end a merge-conflict investigation on a false premise.

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
`failed to push some refs`.

**Always brace the variable when a `:` follows it:** `"${COMMIT}:refs/heads/x"`.
Same class as the `:t`, `:h`, `:e` modifiers.

## zsh does NOT word-split `$VAR` — packed flags arrive as ONE argument

⚠️ The tool may be called **Bash**, but on macOS the agent's shell is often **zsh**
(check `$0`, `ZSH_VERSION`; `BASH_VERSION` unset). zsh leaves `SH_WORD_SPLIT` **off**,
so the bash reflex of stashing flags in a variable silently breaks:

```zsh
O="--owner acme --repo x --pr 7"
printf 'ARG:[%s]\n' $O      # bash: 6 args   zsh: ARG:[--owner acme --repo x --pr 7]
```

**Symptom:** a CLI reports a flag missing that you can plainly see in the command
— `missing required field: owner` when `--owner` is right there. The parser saw
one giant token whose "name" was `owner acme --repo x --pr 7`.

**Fixes, best first:**
1. **Array** — `FLAGS=(--owner acme --repo x); cmd "${FLAGS[@]}"` (portable, safe
   with spaces in values)
2. Write the flags out literally per call
3. `${=O}` — forces splitting for one expansion (zsh-only, no quoting safety)

Same family: `for f in $FILES` iterates **once** over the whole string, and
`$(cmd)` unquoted stays a single word. Command substitution capturing a
newline-separated list needs `${(f)"$(cmd)"}` or a `while read` loop.

zsh also ties lowercase `path`, `fpath`, `cdpath` and `manpath` to their uppercase
variables: `while read -r size path` rewrites `$PATH`, and every later command in the
loop is `command not found`. Name it `wt`/`p`, or run the loop from a bash script file.

💡 `toolbox gitkit github-io` detects a whitespace-bearing flag name and names this
cause outright instead of blaming a missing field.

## `xcodebuild` hangs at `CreateBuildDescription` — a stale WDA build, not your code

**Symptom:** `xcodebuild` produces a few lines, reaches
`GatherProvisioningInputs` → `CreateBuildDescription` → an
`ExecuteExternalTool … clang -v -E -dM` / `swiftc --version` line, and then
never writes another byte. No compiler processes appear. Re-running stalls at the
identical line.

**The tell that it is NOT your project:** run those probe commands yourself —

```sh
timeout 5 $(xcrun -f swiftc) --version
timeout 10 $(xcrun -f clang) -v -E -dM -isysroot "$(xcrun --show-sdk-path --sdk macosx)" -x c -c /dev/null
```

Both return instantly. The toolchain is healthy; `SWBBuildService` is wedged.
`swiftc -typecheck` on the sources also still works, which is a useful way to
keep verifying while the build is stuck.

**Cause:** an abandoned long-lived `xcodebuild` holding the shared build
service. The repeat offender is Appium's WebDriverAgent
(`xcodebuild build-for-testing test-without-building … WebDriverAgent.xcodeproj`)
left behind by a dead test run — a WDA build takes minutes, so anything hours
old is a likely orphan.

**Diagnose, oldest first** (`etime`, not PID order):

```sh
ps -eo pid,lstart,etime,args | grep "[x]codebuild"
```

**Fix:** report the orphan (PID, start time, age, command line) and let the human
decide. Stopping that one PID is what unwedges the build service — the next
`xcodebuild` runs normally and Appium rebuilds WDA on its next use — but send the
signal only on their explicit request, after re-checking the PID's start time and
command line (see the first section).

🚨 **Scope any kill to the orphan.** A blanket `pkill -f SWBBuildService` also
kills the build service of every OTHER live Xcode build on the machine —
parallel sessions' builds die as collateral.

⚠️ **Two false signals to avoid while diagnosing this:**
- `xcodebuild … | tail -N` buffers everything until exit, so the log looks empty
  and the build looks hung even when it is fine. Redirect to a file instead.
- `until ! pgrep -f "xcodebuild.*MyApp"` never exits — the loop's own command
  line contains the pattern (see the `pgrep -f` self-match entry below).

**After adding a test file, regenerate before trusting a pass.** With a
Tuist/XcodeGen project, `-only-testing:Target/NewTests` against a project
generated BEFORE the file existed prints `** TEST SUCCEEDED **` and
`Executed 0 tests`. Always read the executed count, never the banner.

## Prefer `127.0.0.1` over `localhost` in env URLs

`localhost` resolves to IPv6 `::1` on macOS, while many dev servers (Node,
NestJS) bind IPv4 `*` by default — same port, different process.

**Symptom:** `curl http://127.0.0.1:3000/foo` returns 200 but the web app gets
404 from `NEXT_PUBLIC_API_URL=http://localhost:3000/foo`.

**Diagnose:** `lsof -i :3000` (two processes = the smoking gun).
**Fix:** pin `NEXT_PUBLIC_API_URL` and similar to `127.0.0.1` in `.env.local`.

## Don't hand-roll poll loops — and beware `pgrep -f` self-match

Match the mechanism to the notification count: **one** signal ("tell me when X
finishes") → background Bash with a command that exits on the condition (Claude
Code re-invokes the session on exit); **a stream** of events (log tail, PR watcher, a
poll loop emitting per occurrence) → the native `Monitor` tool, where each
stdout line re-invokes the session. Background Bash's incremental output never
wakes the session — a multi-event watcher run that way sits unread until the
process exits.

Prefer these native signals over `until ! pgrep -f "bun install"; do sleep 5; done`.

`pgrep -f` scans each process's FULL command line, so the loop's own shell
(which literally contains `bun install` in the pattern) always matches →
infinite sleep even after the job finished.

If you must match by name, use the bracket trick `pgrep -f '[b]un install'`, or
poll a sentinel file the job writes on exit. And match a marker the tool
ACTUALLY emits — bun prints `(no changes)` / `Saved lockfile`, not `done`.

## A local VPN can hijack the route to a server's public IP

**Diagnose this BEFORE any server-side outage runbook.**

**Symptom:** a host (`<target>`) is dead from your Mac on *all* ports **and** ICMP,
yet other hosts at the same provider and the public internet work fine, AND the box
is reachable from elsewhere (another server, a phone off Wi-Fi). **When ONLY your
Mac can't reach it, suspect local routing — not fail2ban / netplan / kernel.**

**Cause:** WireGuard.app / OpenVPN Connect installs a default route + `/32` host
routes onto a `utunN` interface, so traffic to `<target>` is pushed into the
tunnel and black-holes at the tunnel gateway (`<gateway>`). The server is healthy.

**Diagnose:**
- `route -n get <target>` shows `interface: utunN`
- `traceroute <target>` hop 1 = `<gateway>`
- `netstat -nr -f inet | grep utun` shows the hijacking `/32` routes

**Fix:** toggle the VPN off, or reach the box over the VPN itself — e.g. a
`<configured-ssh-alias>` entry in `~/.ssh/config` whose `ProxyJump` goes through a
host the tunnel does route, which works regardless of local VPN state.

## A benign coding ask returns `stop_reason: "refusal"` — classifier false positive, not policy

Some models run safety classifiers; three shapes trip them on harmless work. Rephrase, don't escalate: ask "are there bugs in this program" instead of "does this compile without errors"; give a lesser-known language its docs or a one-line description before the task; keep base64 blobs out of tool output (strip or summarise them before they reach the model).
