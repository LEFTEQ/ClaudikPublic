---
name: memory
description: "Canonical memory doctrine + maintenance. Invoked as /memory [save|prune|audit|migrate]. Defines the two memory homes, file format, tier gates, caps, and index discipline."
---

# Memory

One lean, Obsidian-native convention shared by Claude Code and Codex. No inbox, vector database, consolidation agent, or parallel vendor-specific store. Capture happens in-session; contract notes and deterministic tooling keep the graph small and trustworthy.

## The two homes

| Home | Path | Holds (`type`) | Visibility |
|---|---|---|---|
| **Personal** | `~/.claude/projects/<slug>/memory/` | `user`, `feedback` | Private; auto-loaded index |
| **Team** | `<repo>/.claude/memory/` | `project`, `reference` | Committed to the repo |

- `<slug>` = project's absolute path with `/` → `-`, prefixed `-` (e.g. `-Users-you-Documents-Work-FixIt`).
- **Routing question:** *"Would a teammate benefit from this fact?"* Yes → team home. No (how I work with this user, or who the user is) → personal home.
- Each home has its own `MEMORY.md` index. The personal `MEMORY.md` is the only auto-loaded surface, so its **first section points at the team index**: `Team memory: <repo>/.claude/memory/MEMORY.md — open it when the task touches project code.` Cross-links between homes are plain relative-to-repo paths.
- A project without a repo (or scratch work) uses the personal home for everything.

## File format (both homes, identical)

One file = one durable topic contract, not one incident. Prefer updating a themed survivor once two notes overlap; consolidation is mandatory at three or more related notes. Kebab-case filename `<type>-<slug>.md`:

```markdown
---
name: <short-kebab-slug>
description: <trigger-phrased one-liner — see Recall below>
type: user | feedback | project | reference
status: provisional | active | superseded
expires: YYYY-MM-DD          # required iff provisional
tags: [optional, obsidian, tags]
aliases: [optional-old-name]
last-verified: YYYY-MM-DD
last-used: YYYY-MM-DD        # bumped when the note actually changes behavior mid-task
---

**Wrong move:** <the exact action a fresh session would take without this note>
**Rule:** <the general behavior that prevents it>

<supporting detail only as evidence for the rule. Link related memories with [[name]].>
```

`name`, `description`, `type`, `status` are required top-level Obsidian properties. Nested `metadata:` and session IDs are forbidden. `superseded` is transitional only and must name the replacement; normal pruning absorbs the useful content and deletes the old note. Legacy snake_case files keep their names until a semantic consolidation touches them.

## The ladder — where knowledge actually lives

Before writing any memory, walk down; memory is the LAST resort, not the default:

1. **Rule of engagement** — how to always behave ("never stash", "PRs ready-for-review") → CLAUDE.md or a `paths:`-scoped rule. That's an instruction/briefing, not a memory; a correction that generalizes into a standing rule graduates there and never gets a lesson file.
2. **Operational choreography** — how to do X right *here* (setup sequences, gotcha chains, fix-it recipes) → a **script/tool**, never prose. Abstract the complexity into code (repo scripts, or the tools repo when cross-project) written AI-first: validate inputs; on misuse, return instructions the agent can self-repair from in a mini-loop; where deterministic, autofix and return a one-line "autofixed <what>" so the agent isn't confused by unexpected state. Memory keeps at most ONE pointer line to the tool. (Reference: FixIt's worktree tooling — a toolset that sets the worktree up right beats paragraphs describing the gotchas.)
3. Only what remains — a fact, not a behavior or a procedure — may become a memory, if it passes the paid-for gate.

## Capture — the paid-for gate

A memory must be **paid for**: either **(a)** the user's correction or confirmed preference, quotable verbatim → `feedback`/`user` (personal home), or **(b)** a trap that cost real debugging AND cannot be re-derived in <30 s from one Read, `git log`, `--help`, or a single failing test → `project`/`reference` (team home). Milestone state git can't show (open follow-ups, external blockers) → `project`, always provisional.

The body template (Wrong move/Rule) is how a note is *written*, not why it *exists* — a derivable fact phrased as "Wrong move: rebuilding X — it already exists" is still trash. **Banned classes, in any format:** existence-of-feature notes ("the engine already ships X" — discoverable by reading the engine), shipped-state and PR-changelog narratives (git-derivable), vendor-documented behavior, code patterns visible in one file, in-progress task state.

**Update-over-create.** Check the target home's `MEMORY.md` for an existing contract on the topic; extend/correct it rather than adding a sibling. Delete memories proven wrong, obsolete, or fully derivable.

## Lifecycle — born provisional, forgotten when unused

- **Born provisional.** A lesson from a single incident starts `status: provisional` with `expires: <today + 60d>`. A direct user instruction ("remember this", an explicit correction) or a second independent occurrence is born / promoted `active`.
- **Promotion.** When a provisional note actually prevents the wrong move again (or the trap re-fires), set `status: active`, drop `expires`, bump `last-verified`.
- **Usage index.** When a note actually changes what you do mid-task, bump `last-used: YYYY-MM-DD` in its frontmatter — cheap, best-effort, any session. Reading is not using; acting on it is.
- **Forgetting is healthy.** The weekly distill evicts notes with no `last-used` bump for ~90 days (creation/verification date counts as the start). A note that was never relevant across hundreds of turns is context tax, not knowledge — deleting it is the system working. Applies to every type: a `feedback` rule that never mattered, or that graduated to CLAUDE.md, loses its file too.
- **Expiry.** An expired provisional is deletable on sight by any session — no re-litigation. `memorylint check` flags them.

## Recall is a claim

A recalled memory is a hypothesis about the present, not a fact: before acting on one that names a path, symbol, flag, or open-PR state, re-verify against current code/git. Stale-but-confident memories misdirect worse than no memory.

## Tiers — which surface

| Tier | Question | Destination |
|---|---|---|
| **T1** | Wrong move in the first 5 s without it? | `CLAUDE.md` (rules/etiquette) — rare, deliberate |
| **T1-scoped** | Wrong move only when *editing a particular area*? | a `paths:`-scoped rule (`.claude/rules/*.md` or `~/.claude/rules/`) — costs nothing until Claude reads a matching file |
| **T2** | Useful once the task touches the topic? | memory file + one index line |
| **T3** | Re-derivable in <30 s? | not saved |

In doubt between T1 and T2 → pick T2; T1 surfaces load every session and must earn their seat.

## Recall — how memories get found

Recall runs entirely off `MEMORY.md` descriptions:

- **Write descriptions as triggers, not summaries.** "Before pushing back 'data doesn't exist', check discriminated rows" beats "notes about the reviews table". Start with the situation that should surface the memory.
- Index line format: `- [Title](file.md) — <trigger hook>`.
- Keep both indexes grouped: `## Rules & preferences` (feedback/user, stable) above `## Active work` (project status, volatile) above `## Reference` (lookup material).

## Caps + prune-on-write

| Surface | Cap |
|---|---|
| personal home | ≤ ~15 notes |
| team home | ≤ ~30 notes |
| each `MEMORY.md` | ≤ ~100 lines |
| one memory file | ≤ ~150 lines |
| repo `CLAUDE.md` | ≤ ~300 lines / ~4k tok |

Note ceilings are the load-bearing cap: models follow ~150–200 instructions before compliance degrades, so every surviving note competes with the actual rules. Hitting a ceiling forces consolidation or eviction — never a cap raise.

**Prune-on-write:** every time you add an index line, scan the index for lines to retire — `project` status memories whose work merged >30 days ago (verify via `git log`/PR state before deleting), superseded facts, dead-path pointers. Retire = delete file + line, or fold a one-liner into a themed survivor. Feedback/user memories don't age out; they retire only when proven wrong.

**Supersession beats the calendar.** When a new memory covers the same surface as an older one, the *writer of the new memory* retires or absorbs the old one in the same edit — never leave both. If unsure, add `superseded-by: [[new-name]]` to the old file so the next prune deletes it. MEMORY.md hard load limit is **200 lines / 25KB — content past that is silently dropped**; the ≤100-line cap keeps margin. Anthropic's trim rubric: keep traps/contracts/rationale that differ from defaults; cut anything derivable from git or code (what shipped, which PR, what a subsystem is).

## Subcommands (`/memory <arg>`)

### save `[text]`
Capture now. With text: treat it as the fact. Without: scan the conversation for uncaptured corrections/discoveries. Apply the derivability gate, route by the table above, write file + index line, run prune-on-write. Show a one-line summary per write — no confirmation prompt.

### prune
Full sweep of both homes for the current project: delete expired provisionals mechanically (no confirmation), verify each index line's file exists, spot-check file claims naming paths/symbols (Glob/Grep), flag stale `project` files (merged + >30 days), find near-duplicates across homes, check caps. Present one deletion/merge plan for the judgment half, apply on confirm. Team-home deletions are git-visible — safe to apply, user reviews in the diff. **A weekly scheduled distill runs prune over recently-active homes** (cron, established 2026-08-27) — expiry and consolidation must not depend on anyone remembering to ask.

**Deterministic enforcement:** `memorylint` — global Go CLI at `~/.local/bin/memorylint`, shared by Claude Code and Codex hooks; canonical source in toolbox (`~/Work/Projects/acme-org/toolbox/internal/memorylint`, graduated from FixIt). `memorylint check <dir...>` enforces caps, routing schema, lifecycle (provisional ⇒ `expires`; expired ⇒ flagged deletable), index reachability, links, and secret/IP/email hygiene. `fix --dry-run`, `new`, `reindex`, `graph --similar`, `hook` cover migration and authoring. Only narrow fixture values belong in `.memory-lint-allow`. `prune`/`audit` own the judgment half: staleness, supersession, derivability, semantic consolidation.

### audit
Read-only prune: report drift, staleness, cap violations, dead paths. No writes. Also checks the global `~/.claude/CLAUDE.md` rozcestník: line count vs cap, T2-shaped sections that belong in `~/.claude/rules/` (see below), broken CLAUDE.md → rules/ links, dangling `[[wikilinks]]` between rules files.

Reference runs: vitrinka, 2026-08-14 — 170 files → 25-line personal index; FixIt, 2026-08-22 — 481 atomic files → 30 contract notes across both homes. Migration order: backup → audit → **security sweep (mandatory before any team-home commit: token values, share links, IPs/mesh addresses, third-party emails, credential-store paths)** → cluster-merge → relocate → rebuild indexes → repo instructions.

### migrate
For a project still on a legacy layout (split-brain dirs, inbox remnants, "moved" stubs): move `project`/`reference` files to the team home, `feedback`/`user` files to the personal home, rebuild both indexes per this doctrine, leave a redirect stub only where an old path is still referenced. Preview the move list before executing.

## What replaced the old pipeline

`/memory:learn`, `/memory:dream`, the `lessons.json` inbox, and the `living-docs` + `context-manager` agents are **retired**. Capture is inline (`save` or the native reflex), consolidation is `prune`, no sole-writer agent — any session writes memory directly under these rules. **Affordance registries (`.claude/aix.md`) are retired too** (2026-08-01) — the `ai-experience` skill, `/aix`, and `aix-harvester` agent are deleted. A hand-maintained "symbol — path — purpose" index duplicates what Glob/Grep/Explore rebuild in seconds and can't-go-stale, while costing 20.3k tokens every session. Never create or grow one.

Existing `aix.md` files are legacy, mined down by hand. When you touch one: **derivable** (symbol exists at path) → delete, trust search; **non-derivable** (use X not Y, this flag breaks Z, this line lost a commit) → a `paths:`-scoped rule if tied to an area, else a memory file.

## `~/.claude/rules/` — the global rozcestník's detail files

The global `~/.claude/CLAUDE.md` is a lean rozcestník (T1 only) linking into `~/.claude/rules/*.md` — full working principles, safety runbooks, infra facts/workflow, gotchas, project map, tooling conventions. These are **docs, not memories**: no frontmatter, no MEMORY.md index; recall runs off the trigger-phrased links in CLAUDE.md, and `[[name]]` between rules files resolves to a sibling in the same dir. T2 content that is *globally* useful reference (not a session-captured lesson) may go there instead of a memory file; session-captured lessons still follow the two-homes routing above. `audit` covers this surface (decision log: `~/.claude/docs/specs/2026-07-17-claude-md-rozcestnik-decisions.md`).
