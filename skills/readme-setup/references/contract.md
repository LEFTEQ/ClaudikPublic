# The authoring contract

## The split

- README.md OWNS the narrative: a "Why it exists" section any outsider can read,
  then the practical reference.
- CLAUDE.md never duplicates it: compact identity + explicit pointer to README
  §"Why it exists" + only what agents need beyond it (compass, repo map, laws).
- Neither file restates what the tree already says. A stack, dependency or
  directory list appears only where it changes a decision.

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
7. Practical reference (run, install, use, deploy, develop): keep what exists,
   true it up, reorder under the numbered sections above.

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
5. ALL existing operational laws, runbooks and traps preserved VERBATIM —
   losing a not/never/only is the failure mode. Group them under headings
   that name the wrong first move they prevent.
6. Memory pointer, when the repo keeps `.claude/memory/`.

## Converge, don't discard

Existing README/CLAUDE.md/AGENTS.md are inputs. Classify every line before
writing:

- **Keep verbatim**: laws, negations, exact commands, runbooks, named traps,
  anything a past incident paid for. Move to the right section; never reword
  a not/never/only/except.
- **Merge**: narrative that overlaps the new intention story; fold the sharper
  phrasing in, cut the duplicate.
- **Relocate**: narrative living in CLAUDE.md moves to README; agent-only
  operational detail living in README moves to CLAUDE.md.
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
