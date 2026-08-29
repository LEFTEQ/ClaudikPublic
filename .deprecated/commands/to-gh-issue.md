---
name: to-gh-issue
description: "Manual only: use when explicitly invoked as `/to-gh-issue`. Turn this session's leftover items — follow-ups, deferred work, \"yours, not code\" tasks — into structured, correctly labeled GitHub issues in the repo each one belongs to."
disable-model-invocation: true
---

# `/to-gh-issue` — Session Leftovers → GitHub Issues

The session produced work that outlives it: things only the user can do, follow-ups
for "whenever", problems noticed in passing. Park them as issues so they survive.

**Scope:** `$ARGUMENTS` if given — a phrase, topic, or item pinpoints what to file, and
everything else is ignored. Empty → sweep the whole session for open items yourself.
Nothing open → say so in one line and stop. Never invent items to fill the list.

## 1. Harvest

Sweep the session for anything unfinished. Candidates:

- Explicit user-action items ("verify prod emails send", "delete the WORKOS_* env vars")
- Deferred follow-ups ("whenever you want them", "worth a dedicated pass")
- Problems found and consciously not fixed (flaky tests, known-wrong behavior)
- Decisions parked pending information

Skip what's already done, already an issue, or already a `/todo`. One item = one issue;
never bundle unrelated work, never split one action into ceremony steps.

## 2. Classify

Each item gets exactly one label:

- **`bug`** — something is wrong now: broken, flaky, incorrect, insecure.
- **`feature`** — something new to build or activate.
- **`note`** — everything else: manual chores, verifications, comms, cleanups, decisions
  to revisit. This is the default when it isn't clearly one of the other two.

Create the label in the target repo if missing (`gh label create`). Add repo-native
labels that already exist and clearly fit (e.g. `security`, `ci`) — never invent new ones.

## 3. Route

Each item goes to the repo it concerns, not the repo you're standing in — a session
often spans several. Infer from the item's subject (paths, CLI names, services); default
to the current repo (`gh repo view --json nameWithOwner`) when it's genuinely about here.
Ambiguous ones get one `AskUserQuestion` batch, with your inference as the first option.

## 4. Structure

Title: imperative, specific, no session shorthand — a title readable in six months cold.

Body:

**Context** — why this exists, in plain language, assuming zero session memory. Name the
thing (what a "workos-export" is), the causal chain, and the current state.
**What to do** — concrete steps: literal commands, exact files, the specific place to click.
Never "back it up somewhere" without a somewhere.
**Done when** — the observable condition that closes this.
**Risk / rollback** — only when the action is destructive or irreversible. State the undo.
**Provenance** — date, repo/branch, and links to the PRs or commits it came out of.

🔒 Never paste secret values, tokens, or internal hostnames into an issue. Reference the
onyx handle or the env-var name instead.

## 5. Confirm, then file

Show the full set as a compact table — title · label · repo — plus each body in full.
Gate on one `AskUserQuestion`: **File all** / **Pick a subset** (multiSelect the ones to
file) / **Edit first** (they say what to change). Nothing is created before that answer.

Then `gh issue create` each one and report the clickable URLs, grouped by repo.
