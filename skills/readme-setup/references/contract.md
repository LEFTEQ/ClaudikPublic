# The authoring contract

## The split

- README.md OWNS the narrative: a "Why it exists" section any outsider can read,
  then the practical reference.
- CLAUDE.md never duplicates it: compact identity + explicit pointer to README
  §"Why it exists" + only what agents need beyond it (compass, repo map,
  commands). Its laws live in the memory system as `rule` rows, rendered
  in by memo (§CLAUDE.md shape 5).
- Product and spec detail — how a subsystem behaves, its contracts, its
  runbooks — lives in `docs/reference/<area>.md`: living, one per
  subsystem, kept apart from the historical `docs/specs/` and decision logs.
- Budgets: CLAUDE.md within the T1 budget, 1,500 tokens including the memo
  stub (memorylint `T001`, memory-gate `T1_BUDGET` — a migrated file that
  regrows fails the PR); README.md within 6,000 tokens (~24 KB; memory-gate
  warns `README_CEILING`). Over budget means detail belongs in a reference
  doc, never that the budget is wrong.
- Neither file restates what the tree already says. A stack, dependency or
  directory list appears only where it changes a decision.
- The anti-pattern this contract exists to stop: a feature PR describing its
  behaviour four times (a spec log, a CLAUDE.md "operating rule" paragraph,
  a README section, a skill). A feature PR updates its area's reference doc
  and adds rows; it never paraphrases itself into CLAUDE.md, README and a
  skill as well. (devbox, 2026-09: CLAUDE.md 16 → 101 KB, README 39 → 181
  KB, with no reviewer asking for it.)

## README.md shape

1. Identity line: what it is in one breath, for a stranger.
2. **Why it exists**: the problem (what stays broken without this project),
   then per-persona value bullets — what that user stops doing and starts
   getting; mark the CURRENT primary focus; state honest maturity. When
   personas diverge sharply, "Why it exists" is the signpost: one bullet per
   persona, deeper material lives in per-persona docs it links to.
3. The buyer/decider, when the project is sold.
4. Deployment targets and what each makes non-negotiable (self-hosted/air-gap
   ⇒ outbound stays env-gated; SaaS ⇒ what is metered; regulated buyers ⇒
   the security posture named concretely: auth model, tenancy isolation,
   encryption at rest, retention, audit).
5. What it complements and deliberately never replaces.
6. The pieces: a short table of what each is and where it lives — only where
   the repo holds more than one deployable or client.
7. Quick start (install, run, first use): true it up; everything deeper
   (deploy, operate, each subsystem's behaviour) is a link to its
   `docs/reference/<area>.md`, never a section restating it.

## CLAUDE.md shape

1. One-paragraph identity + the pointer: "the full intention story is
   README.md §Why it exists; read it before scoping product work" + a 3–4 line
   short version (current focus, design driver, complement-not-replace).
2. **Decision compass**: agent tiebreakers, each an actionable constraint —
   where heavy lifting lives, who must be able to author what, what every data
   path must survive, integrate-vs-replace, whatever else decides scope here.
3. Repo map: the pieces and where each lives; name deleted/moved surfaces an
   agent would otherwise go looking for.
4. Build / run / test: the exact commands.
5. Laws, traps and runbooks go through the memory system, never into this
   file's prose. Each law becomes a one-sentence `rule` row keeping its
   not/never/only/except word for word — losing one is still the failure
   mode: `memo add rule/<topic> "…" --island project/<repo> --link
   'paths:<glob>'` when it governs code (`memo render --rules` writes
   `.claude/rules/memo-<topic>.md`, loaded only when the glob matches),
   `rule/<topic>!` (pinned) only when every session needs it. Name the
   project island: under a bound `MEMO_RUN` a bare `memo add` writes the run,
   which reaches the project only at `memo promote`. Its detail — the runbook, the incident that paid for
   it — moves to the subsystem's `docs/reference/<area>.md` (or the row's
   `--note`).
6. The memo stub: `memo render --claude-stub` writes the island's resident
   rules and the docs route between `<!-- memo:stub -->` markers; never
   hand-edit it (memorylint `T002`). A repo without an island gets
   `memo new project` first.

## Converge, don't discard

Existing README/CLAUDE.md/AGENTS.md are inputs. Classify every line before
writing:

- **Route**: laws, negations, named traps, anything a past incident paid
  for. Each becomes a `rule` row (CLAUDE.md shape 5) whose sentence keeps
  the not/never/only/except word for word; its runbook and history move to
  the area's reference doc. Exact commands stay in CLAUDE.md §4 or the
  README quick start.
- **Merge**: narrative that overlaps the new intention story; fold the sharper
  phrasing in, cut the duplicate.
- **Relocate**: narrative living in CLAUDE.md moves to README; product and
  behaviour detail living in either file moves to `docs/reference/<area>.md`.
- **Drop**: derivable from the tree or manifests, restates default model
  behavior, or describes a surface that no longer exists — and say so in the
  summary.

A well-kept pair gets targeted edits, not a rewrite. Orientation basics
(what runs where, how pieces connect) stay when the project has several
deployables, generated surfaces, or a non-obvious build; a single-service
project gets none.

## Truth rules

- Verify every claim against the tree; fix stale facts found en route in the
  same change.
- Never an absolute negative about data practices ("no outbound calls") —
  scope the claim and name the opt-in.
- Counts and classifications agree across both files and any public copy.
- Historical documents (decision logs, changelogs) keep their original text;
  only living documents get renamed terms.
- The owner's own words for the problem and the personas outrank a smoother
  paraphrase.
