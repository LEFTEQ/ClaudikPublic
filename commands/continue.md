---
description: Resume a /handoff — load the named handoff and drive its workflow to done
argument-hint: <handoff-name>
---

Resolve $ARGUMENTS against `~/.claude/handoffs/*/<name>` (`.md` file or directory). Empty → list the current project's handoffs newest-first and ask; a name matching several projects → the current repo's wins.

Read the whole handoff (directory → `handoff.md` first, then its context files), then:

1. **Gate on prerequisites.** Verify every gate live with its stated check before phase 1. A red gate stops the run — report what's missing.
2. **Drive the phases** in order, each to its `Done when` check. Workflow form → `Workflow({scriptPath: …/workflow.mjs})`; its auto/ask merge semantics are baked into the script.
3. **The plan is a hypothesis.** Verify its claims against current repo state before acting; push back when you know a better way.
4. **Consume.** When the work completes, delete the handoff file/directory — single-use scaffolding — and say so in the hand-back.
