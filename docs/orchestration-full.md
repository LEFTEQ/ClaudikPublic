# Subagents, Workflows & Verification

## Subagents

- **Subagents inherit the session model.** Never pin a cheaper model (Sonnet, Haiku) — omit the `model` parameter unless the user explicitly asks, and never put a `model:` frontmatter key in `~/.claude/commands/**` or agent files. Cheaper models produce shallower work and cause rework. **Sole exception (Lukáš, 2026-09-14): the e2e fallback writer is `model: opus`** — only when the Codex sidekick is unavailable (next bullet); keep it persistent (one per lane, re-tasked via SendMessage with the "go now, run continuously" re-brief) and say the fallback fired. App-code fixers still inherit the session model.
- **Manual and verification work runs on the Codex sidekick, not a Claude subagent**: the native `codex` subagent (`codex-high` for "codex high" or "codex xhigh"), routed by the `codex-sidekick` skill — never the Codex CLI (`switcheroo codex run`, `cx`, `codex exec`). Routed: user tests (vitrinka usertest), ad-hoc UI verification of web + Expo apps, computer use, app exploration, bulk read-only static mapping (e.g. e2e discovery, a Workflow's understand phase), code review and adversarial verification of a diff, and e2e/other test writing, reworking and running — inside a Workflow too, as `agentType: 'codex'`. Never routed: app source edits, design, small in-task code lookups — the sidekick never edits app source and never commits; the Claude session stays orchestrator, app-code author and committer. One persistent agent per lane, continued with `SendMessage` — never a fresh one per feature. Subagents share the session's one browser, so live browser lanes take turns. No `codex` agent listed, or one ending `No Codex account …`, is the only path back to a Claude writer: the Opus fallback above.
- **Delegate to fresh agents, never forks.** Spawn a named type (`codex`, `claude`, `general-purpose`, a Workflow `agent()`), never `subagent_type: "fork"`: a fork copies this whole conversation into every agent. The brief is self-contained — goal, absolute worktree path, scope, done-when, return shape — and anything long (a handoff, plan or prior findings) goes in a file the brief names, never pasted. Ask for a compact return (status, findings, files), not a narrative.
- **Verify worktree base commit before parallel dispatch.** `git worktree add` forks from current `HEAD`, which may be stale or differ across worktrees spawned in sequence. Run `git worktree list` and confirm every worktree forks from the same expected commit; when in doubt, commit pending state to a known base first. See `~/.claude/docs/git-safety-full.md`.
- **A single `git log`/`ls` read can RACE an agent's in-flight commits.** "Clean tree / no commits" is not evidence the agent stalled. Get the agent's own report (or re-check after a beat) before standing one down — a duplicate respawn on the same paths nearly collided during the Onyx build.
- **One writer per workspace.** Parallelize only INDEPENDENT plans, each on its own `git worktree` + disjoint branch; concurrent commits to one checkout race `.git/index.lock`. Disjoint-path branches merge clean with `--no-ff`. Lanes that do share a checkout share its processes and its dev app too: a lane stops only PIDs it started (a `pkill -f` pattern killed another lane's Playwright run), and a lane that measures runs against its own frozen build — a detached worktree at a fixed commit with its own devbox workspace — never the shared dev app other lanes redeploy mid-measurement.
- **Fresh `Agent` spawns execute from the spawn prompt; `SendMessage` re-tasks are flaky** — a re-tasked background agent often does one turn then idles. Re-brief with "go now, run continuously; your next message is the green gate or a real blocker", and don't answer idle pings individually.
- **On 529 throttling**, drop the Claude agents to batches of 2, or one-agent-per-plan sequential (`codex` agents bill Codex and don't count). The main loop's own tool calls don't contend on the subagent inference budget — do small critical edits yourself while agents are throttled.
- **Freeze the shared interface contract before authoring plans**, then run one consistency-review pass over them: it catches cross-plan contradictions on paper. Ask briefs to surface structural blockers as Option A/B/C rather than thrashing, and record toolchain constraints that execution surfaces as contract amendments.
- **Memory doctrine lives in `~/.claude/skills/memory/SKILL.md`** — read it before saving or reorganizing memory. Capture inline at the moment (feedback after corrections, project/reference for non-derivable discoveries); gate every save with "re-derivable in <30 s?" → don't save. `/memory:learn`, `/memory:dream`, `living-docs`, `context-manager`, and `.claude/aix.md` registries are all RETIRED.

## Workflow / Ultracode — Batch, Don't Atomize

These OVERRIDE the Workflow tool's built-in quality patterns (per-finding adversarial verify, N-lens panels, one-agent-per-item).

- Each agent gets a meaningful batch — a subsystem, a file group, 5–15 findings — worked sequentially in one session. One-item-per-agent is forbidden: it wastes ~40k tokens per agent on redundant repo orientation.
- Hard caps: ≤ 20 agents per phase, < 50 per run. More items → partition into ≤ 20 batches grouped by file/subsystem. Exceed only on explicit user request for exhaustive coverage or an explicit token budget — and `log()` the planned count first.
- Verify in bulk, single-vote: one agent per batch of findings returning per-finding verdicts. Never N refuters per finding.
- Prefer phases inside one agent over agent-per-stage when stages share context (build → test → fix). Fan out only for genuinely disjoint work.
- **Never SendMessage an agent that a running Workflow owns.** The reply resumes a second concurrent copy of that agent, which then collides with the original in its worktree. Act from main instead.

## Fan-Out Over an External API — Rate Limits Are a Design Input

When a command fetches from an external API (GitHub, GitLab, Jira, Linear, Slack) and then fans out to subagents that need more of the same API, design for the limit up front — never ship the naive version and patch later.

- One consolidated GraphQL query instead of N REST calls with `--paginate`. For GitHub, one query pulls PR metadata + reviews + inline comments + thread-resolved status + diff hunks for ~200–300 of a 5000/hour budget.
- Mirror before fan-out: `git fetch origin pull/<N>/head:refs/pr/<N>` and have subagents read locally — git uses a different quota path than `gh api`.
- Cap concurrency: the secondary "abuse detection" limit trips on burstiness, not volume. ≤6 agents under 20 tasks, 4 for 20–40, 3 above that with each serializing its slice.
- Preflight `rateLimit.remaining` from the first response (warn under 500) and cache the normalized fetch on disk so a re-run is free.

## Agents & Long-Lived Sessions — Teardown Discipline

Measured 2026-08-26: 64 swarm tmux sockets accumulated in a week, 18 still live, the
oldest 7 days — every parked teammate re-bills its FULL accumulated context (often
300–800k tokens) each time anything wakes it (usage-limit auto-retry, goal check-ins,
monitors). Finished-but-alive agents are the single largest hidden usage sink.

- **Agent teams are on** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in
  `~/.claude/settings.json`, `teammateMode: "tmux"`; re-enabled 2026-10-08 after
  being off from 2026-09-26). Every *named* Agent spawn becomes a tmux teammate, and
  that is how the swarms above built up — so the teardown below is mandatory. When
  you don't need a teammate, leave the Agent spawn unnamed (a plain subagent) or
  use a Workflow. To switch teams off for one session, pass
  `claude --settings '{"env":{"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"0"}}'`.
- **An agent ends when its goal ends.** A persistent named subagent (the Opus fallback e2e writer)
  is stopped when its loop ends; parking one "in case" is forbidden — transcripts
  persist and any agent can be respawned cheaper than one wake of a parked 500k
  context. A session that spawned teammates owes the teardown: `shutdown_request`
  to every teammate, then `tmux -L claude-swarm-<pid> kill-server`. Enforced for
  leftovers: `claude-guards swarm-teardown` runs on SessionEnd (the leader's swarm)
  and on SessionStart with `--dead-only` (dead ones).
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
