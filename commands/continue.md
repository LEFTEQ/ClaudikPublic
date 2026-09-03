---
description: Resume a /handoff — load the named handoff and drive its workflow to done
argument-hint: <handoff-name>
---

Resolve $ARGUMENTS against `~/.claude/handoffs/*/<name>` (`.md` file or directory; `archive/` is out of scope). Empty → list the current project's live handoffs newest-first and ask; a name matching several projects → the current repo's wins.

Read the whole handoff (directory → `handoff.md` first, then its context files), then:

1. **Claim it.** Append this session's id (`printenv CLAUDE_CODE_SESSION_ID`) to `sessions` and set `status: in-progress`.
2. **Gate on prerequisites.** Verify every gate live with its stated check before phase 1. A red gate stops the run — report what's missing.
3. **Drive the phases** in order, each to its `Done when` check. Workflow form → `Workflow({scriptPath: …/workflow.mjs})`; its auto/ask merge semantics are baked into the script.
4. **The plan is a hypothesis.** Verify its claims against current repo state before acting; push back when you know a better way.
5. **Archive.** When the work completes set `status: done` (`abandoned` when Lukáš calls it off) and move the file/directory to `<project-slug>/archive/`; an archived twin of the same slug gets the newer one suffixed `-YYYYMMDD`. Never delete a handoff — say where it went in the hand-back.
