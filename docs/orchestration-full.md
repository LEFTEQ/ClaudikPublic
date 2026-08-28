# Subagents, Workflows & Verification

## Subagents

- **Subagents inherit the session model.** Never pin a cheaper model (Sonnet, Haiku) — omit the `model` parameter unless the user explicitly asks. Cheaper models produce shallower work and cause rework.
- **Verify worktree base commit before parallel dispatch.** `git worktree add` forks from current `HEAD`, which may be stale or differ across worktrees spawned in sequence. Run `git worktree list` and confirm every worktree forks from the same expected commit; when in doubt, commit pending state to a known base first. See `~/.claude/docs/git-safety-full.md`.
- **Memory doctrine lives in `~/.claude/skills/my/memory/SKILL.md`** — read it before saving or reorganizing memory. Capture inline at the moment (feedback after corrections, project/reference for non-derivable discoveries); gate every save with "re-derivable in <30 s?" → don't save. `/memory:learn`, `/memory:dream`, `living-docs`, `context-manager`, and `.claude/aix.md` registries are all RETIRED.

## Workflow / Ultracode — Batch, Don't Atomize

These OVERRIDE the Workflow tool's built-in quality patterns (per-finding adversarial verify, N-lens panels, one-agent-per-item).

- Each agent gets a meaningful batch — a subsystem, a file group, 5–15 findings — worked sequentially in one session. One-item-per-agent is forbidden: it wastes ~40k tokens per agent on redundant repo orientation.
- Hard caps: ≤ 4 agents per phase, ≤ 10 per run. More items → partition into ≤ 4 batches grouped by file/subsystem. Exceed only on explicit user request for exhaustive coverage or an explicit token budget — and `log()` the planned count first.
- Verify in bulk, single-vote: one agent per batch of findings returning per-finding verdicts. Never N refuters per finding.
- Prefer phases inside one agent over agent-per-stage when stages share context (build → test → fix). Fan out only for genuinely disjoint work.
- Reference failure: a verify phase once spawned 39 agents ≈ 1.8M tokens for work 2–3 batched agents would have done as well.

## Teammates & Long-Lived Sessions — Teardown Discipline

Measured 2026-08-26: 64 swarm tmux sockets accumulated in a week, 18 still live, the
oldest 7 days — every parked teammate re-bills its FULL accumulated context (often
300–800k tokens) each time anything wakes it (usage-limit auto-retry, goal check-ins,
monitors). Finished-but-alive agents are the single largest hidden usage sink.

- **A swarm ends when its goal ends.** The lead's LAST action before its final
  summary: send `shutdown_request` to every teammate, then kill its own swarm tmux
  server (`tmux -L claude-swarm-<pid> kill-server`). Parking teammates "in case" is
  forbidden — transcripts persist and any agent can be respawned cheaper than one
  wake of a parked 500k context.
- **Never leave an agent in a usage-limit retry loop** ("continuing shortly") whose
  work is already done — cancel it; when the window resets, every parked retrier
  resumes simultaneously and eats the fresh window at full accumulated context.
- **Stop your Monitors on every stop path** (`TaskStop` by recorded id) — an orphaned
  watcher re-wakes a session forever.
- **Periodic reaping:** `claude-sweep` (the tools repo) audits swarm sockets and kills
  verified-idle ones past 24h; `claude-sweep --install-launchd` schedules it daily.
- **Long-lived working sessions are expensive to wake.** Cache reads are ~0.1× but a
  500k-context session still pays ~50k-token-equivalents per tool step, forever. Prefer
  `/clear`/`/compact` at task boundaries; don't arm watchers (prm, vitrinka listen)
  from a fat session; start loops from lean sessions.

## Testing Reflexes

- After multi-file changes: run the project's test/lint/typecheck before committing.
- Duplicated business formulas across N services demand ONE cross-service consistency test sweeping a shared input matrix — per-service specs miss the drift. See the `money-locale` skill.
