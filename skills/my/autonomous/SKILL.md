---
name: autonomous
description: "Explicit autonomy mandate — bound only by `$autonomous`, `/autonomous`, or `bind autonomous mandate`."
---

# my:autonomous — Explicit autonomy mandate

The user already said yes. Stop fishing for re-confirmation.

While bound, execute the current plan or task end-to-end, in order, without check-ins. Stop only for the exit conditions below. Everything else — including things that feel non-trivial — handle, document inline, keep moving.

## When to bind

ONLY when:
- The user just invoked `/autonomous` (with or without trailing args), OR
- The user pasted the literal phrase `bind autonomous mandate`.

DO NOT auto-bind because the user said "autonomously" in a sentence, a phased plan exists, the conversation feels long, or it feels efficient.

Without explicit invocation, the global CLAUDE.md "Executing actions with care" posture applies. This skill overrides it; it does not replace it.

## The stop line

### JUST DO IT — no asking

- Restart local dev servers (Node, NestJS, Vite, Next, Expo, etc.)
- Regenerate codegen outputs (Orval, Prisma, GraphQL codegen, OpenAPI types)
- Run local migrations, seed resets, dev-DB drops on the local Docker stack
- Install or remove dependencies in the local working tree
- Run tests, lint, typecheck, formatters
- Create local branches; delete merged local branches; create local worktrees
- Commit locally — one commit per phase, always
- Read or write any file inside the current repo
- Dispatch subagents; invoke other skills
- Pick the obvious interpretation of a near-ambiguous spec and note it in the final summary

### ASK FIRST — the only exits

- Any write against a production database (prod DELETE/UPDATE, prod migration, prod schema change)
- Any operation on a production VPS or shared infra (nginx restart on prod-vps, container recreation on prod, `docker volume rm` on any postgres/database volume, `docker compose down -v` anywhere)
- `git push --force` to `main` or `master` — even on a fork
- Sending external messages (creating/commenting on PRs, posting to Slack, sending email, opening GitHub issues that `@`-mention people)
- Spec ambiguity that genuinely affects correctness — two valid interpretations exist AND the choice is irreversible
- The same test has failed on ≥2 honest attempts (not flaky retries — actual failures after different fixes)

On hitting an exit mid-execution: finish what you can, commit it locally, then ask **only about the specific exit condition** — no bundled fishing.

## Phase flow

Read the plan once. Mirror its phases into TodoWrite. Per phase:

1. Mark `in_progress`
2. Implement
3. Run the phase's verifications (whatever the plan specifies)
4. Commit locally with a phase-scoped message
5. Mark `completed`
6. **Start the next phase immediately**

No "Phase N complete, ready for N+1?" messages. TodoWrite updates ARE the progress signal.

## The DONE contract

When the final phase commits, closing message is **≤6 lines, hard cap**:

```
<one line: what shipped, plural form>
- Phase 1: <one-line delta> — <commit short SHA>
- Phase 2: <one-line delta> — <commit short SHA>
- Phase 3: <one-line delta> — <commit short SHA>
<one line: verification result, e.g. "All tests green. Lint + typecheck pass.">
<optional one line: ASK-FIRST item skipped + why>

Autonomy mandate released.
```

No narrative, no "I'd suggest next…", no recap of decisions already in the plan.

## Rationalization table

| Excuse | Reality |
|---|---|
| "Phase 2 is bigger than expected — confirm scope?" | Plan defines scope. Execute it. |
| "I made a non-trivial decision — verify?" | Document inline, continue. Stop only if irreversible AND correctness-affecting. |
| "Tests look flaky — retry forever?" | Retry once silently. Still failing after 2 honest attempts → ASK. |
| "Restarting the dev server might disrupt you" | Local downtime is fine. Restart. |
| "Commit between phases?" | Always. No question. |
| "Report Phase 1 done before Phase 2?" | No. TodoWrite is the report. Continue. |
| "Let me check which variant you want for X" | Pick the option matching existing repo patterns. Note it in the final summary. |
| "This is the user's main checkout — worktree?" | Global CLAUDE.md mandates worktrees for branch switches. Apply silently — don't ask. |
| "What if you prefer a different commit-message style?" | Read recent commits, match the style. No question. |
| "You said you'll be away — confirm before risky local steps?" | Local steps are not risky. Proceed. |

## Red flags — STOP and re-read this skill

Sending any of these mid-execution violates the mandate:

- "ready to continue?"
- "shall I proceed?"
- "let me know if"
- "before I move on"
- "would you like me to"
- "I'll wait for your confirmation"
- "reply 'go' and I'll"
- "I'll check in again before"

Delete the message. Continue execution.

## Integration

An **autonomy contract overlay**, not an execution engine. Composes on top of:

- `superpowers:executing-plans` — parallel-session plan execution
- `superpowers:subagent-driven-development` — same-session subagent-per-task execution
- `acme-dx:implement-plan` — Acme-specific orchestration

When using one of those, this skill removes their human-in-loop checkpoints. Reviews and tests still run — they just don't pause for the user. The plan's own verification gates still apply.

## End-of-mandate signal

Mandate ends when:
- The plan's last phase commits successfully (auto-release on DONE), OR
- An ASK-FIRST exit is hit (paused until the user answers), OR
- The user says `release mandate`.

After the DONE summary, write exactly one line: `Autonomy mandate released.` Nothing after.
