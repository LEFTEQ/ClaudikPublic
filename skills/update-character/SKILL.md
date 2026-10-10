---
name: update-character
description: "Use when the user states a standing preference or corrects how sessions should work — 'from now on', 'always/never do X', 'I prefer', 'make this a rule', 'put this in CLAUDE.md' — and it needs a durable home. Not one-off task corrections or behavior-free facts (memo-ledger)."
codex-ignore: true
---

Turn a preference — `$ARGUMENTS`, or the correction the user just gave — into a durable standing rule. An optional leading scope word pins the home: `user` → `~/.claude/CLAUDE.md` and personal surfaces; `project` → the current repo's `CLAUDE.md` / `.claude/`. Without it, scope follows the preference's reach.

## 1. Generalize

State the rule as the CLASS of behavior wanted — goal + constraint in few words, no step-by-step choreography, no restating default model behavior (the distill skill's doctrine).

## 2. Route — the CLAUDE.md gate first

- Fresh session would make a wrong move in its first few actions without this line → CLAUDE.md at the pinned/derived scope.
- Behavior of one workflow or skill family → that skill, through the update-skill skill (canonical source, refine in place, propagate to siblings).
- File-triggered rule → a `rules/` file (`~/.claude/rules/` or the repo's `.claude/rules/`) WITH `paths:` frontmatter. Verify in the current Claude Code docs how a rule without `paths:` loads before relying on it (expected: every session, like CLAUDE.md).
- Must be harness-enforced (an "every time X" the model cannot guarantee) → a hook, via the update-config skill when available.
- Otherwise → the memo ledger (memo-ledger skill), its row type from the scope: `memo add feedback/<topic> "<one sentence>"` for a personal rule, `memo add project/<topic> "…"` for a rule of the current repo (it lands in the team home); never a hand-written memory file.

Supersede any existing memory or line already covering it — never duplicate.

## 3. Integrate — never append

Rewrite the target section so the rule reads as if always there; fold into an existing bullet when one covers the area. CLAUDE.md edits keep the file's structure and register.

## 4. Confirm, write, commit

Show home + exact diff + what it supersedes. AskUserQuestion: approve / tweak / different home. Never write unconfirmed. On approve, a memo destination is one `memo add` (with `--supersedes <row>` when it replaces one) — never an edit of LEDGER.md, MEMORY.md or usage.jsonl and never a commit of them by hand. Every other destination: edit the canonical file (a symlink's target; a the tools repo-installed copy's `skills/<item_id>/` source) in a worktree of its repo unless that repo's own worktree policy says otherwise — never an installed copy; commit path-scoped.
