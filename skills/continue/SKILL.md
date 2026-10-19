---
name: continue
disable-model-invocation: true
description: Resume a /handoff — load the named handoff and drive its workflow to done
argument-hint: <handoff-name>
---

A vitrinka task URL or id as `<name>` → `/vitrinka-pm:pickup <id|url>` (pickup + claim; its RUN row binds the run); the file form below stays for chores and repos without vitrinka.

With `memo` on PATH, a name first goes to `memo run locate <name> --json`: a hit is a handoff migrated into a run island — `cd` to its `worktree`, `export` its `binding` (MEMO_RUN) before any memory write, and read the run's handoff row and `notes/handoff.md` as the brief; `UNAVAILABLE` names the branch to check out first (its `fix`); `ISLAND_NOT_FOUND` → the file form.

Resolve $ARGUMENTS against `~/.claude/handoffs/*/<name>` (`.md` file or directory; `archive/` is out of scope). Empty → list the current project's live handoffs newest-first and ask; a name matching several projects → the current repo's wins.

Read the whole handoff (directory → `handoff.md` first, then its context files), then:

1. **Claim it.** Append this session's id (`printenv CLAUDE_CODE_SESSION_ID`) to `sessions` and set `status: in-progress`. A `feature` epic gets `update_task {fields: {ledger_state: active}}`.
2. **Gate on prerequisites.** Verify every gate live with its stated check before phase 1. A red gate stops the run — report what's missing.
3. **Drive the phases** in order, each to its `Done when` check. Workflow form → `Workflow({scriptPath: …/workflow.mjs})`; its auto/ask merge semantics are baked into the script.
4. **The plan is a hypothesis.** Verify its claims against current repo state before acting; push back when you know a better way.
5. **Archive.** When the work completes set `status: done` (`abandoned` when the user calls it off) and move the file/directory to `<project-slug>/archive/`; an archived twin of the same slug gets the newer one suffixed `-YYYYMMDD`. Never delete a handoff — say where it went in the hand-back. A `feature` epic gets `next_action` from the hand-back, or `ledger_state: closed` when every gate is done.

An intent handoff (`form: intent`) replaces steps 2–4: its Intent, Done when and Constraints bind; its Inspiration does not. Map the terrain yourself (code, docs, prior art, the References), then run `/vitrinka:brainstorming` on the intent (`/qna` in a repo without vitrinka) with your own options beside the handoff's — an inspiration option survives only by beating the alternatives, and the board says why. Build what the user settles, to its Done when.
