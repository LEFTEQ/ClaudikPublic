---
name: prc
description: "Manual only: use when explicitly invoked as `/prc`. Ensures an open PR exists for the current branch (creating it if needed, idempotent), prints its URL, then hands off to prm — which works the watch/resolve loop INLINE in this session by default (`--bg` delegates rounds to ephemeral subagents) until merged. Pre-merge audit only with `--audit`."
---

# prc — open the PR, then babysit it to merge

Action-taking and autonomous: ensure a PR exists for the current branch, then run the
full `prm` loop on it — one command for *open + watch until merged*. Rounds run
INLINE in this session by default (warm cache — cheapest); `--bg` delegates them to
fresh ephemeral agents (`_shared/round.md`) when this session must stay free.

Composes:
- `~/.claude/skills/git/_shared/ensure-pr.md` — idempotent create-or-find.
- `~/.claude/skills/git/_shared/pr-body.md` — the PR description contract. Read it
  before opening or adopting any PR — the description is what a human sees first.
- `~/.claude/skills/git/_shared/bin/before-review.ts` — the pre-review quiesce hook.
- `~/.claude/skills/git/prm/SKILL.md` — the watch/resolve orchestration (and, with
  `--auto`, the `_shared/auto-audit.md` gate it forwards to).

## Usage

```
/prc [--base <branch>] [--title <text>] [--body <text>] [--draft] [--auto] [--audit] [--bg] [--once] [--every <dur>] [--no-conversation] [--fable]
```

| Arg | Effect |
|---|---|
| `--base <branch>` | Open against a non-default base. |
| `--title` / `--body` | Author the PR explicitly. Omitting both never means a commit-log body — `pr-body.md` applies regardless. |
| `--draft` | Open as draft (explicit only; global default is ready-for-review). |
| `--auto` | Open-to-merged with no further prompt once precheck gates pass. Add `--audit` for the pre-merge regression audit — otherwise none runs, so never pass `--auto` alone on a change you haven't looked at. Solo-owner carve-out applies (our PR blocked only by an unsatisfiable owner-approval ruleset → `--admin` is the normal completion). `--draft --auto`: take `--draft`, forward `--auto`, say the merge waits on `gh pr ready`. |
| `--audit` / `--bg` / `--once` / `--every <dur>` / `--no-conversation` / `--fable` | Pass-through to prm (`--audit`: opt-in pre-merge audit; `--bg`: delegated rounds; `--fable`: delegated rounds on the session model — ⚠️ 2× cost on a Fable session). |

Current-branch / single-PR only — no `all` / `<N>` / URL selectors; use `/prm` for
those.

## Flow

1. Parse args; keep the pass-through flags for prm.
2. **Quiesce:** `node ~/.claude/skills/git/_shared/bin/before-review.ts --repo <ABS repo path>`
   (LITERAL absolute path); run `resolvedBeforeReviewCmd` if non-null BEFORE creating
   the PR; null → skip silently.
3. Run `_shared/ensure-pr.md` (with `--base`/`--title`/`--body`/`--draft`): creates the
   PR, or returns the existing one, or STOPs on the default branch. Its step 0 authors
   the body per `pr-body.md`; its step 2 rewrites a substandard adopted body — neither
   is skippable. Print the URL per `_shared/output.md`.
4. **Vitrinka board** — only if one ALREADY exists for this repo/PR or branch
   (`list_boards`; tool availability is not the gate): adopt per prm's board section
   and print its server-returned URL beside the PR URL. None → skip silently, never
   create one.
5. Hand off to `~/.claude/skills/git/prm/SKILL.md` with the pass-through flags. prm
   runs the initial round inline (or spawns it under `--bg`), arms the Monitor, and
   owns the termini. Bots often comment on the PR conversation
   within seconds of opening, so the first round can carry non-thread findings before
   any review exists; those close with a quoting PR comment, never `resolve-thread`.
   On merge, prm's terminus runs `/merge` step 5's self-occupant triage (prc is often
   invoked from inside the branch's worktree).
