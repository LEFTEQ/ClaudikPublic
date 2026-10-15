---
name: memo
description: "Look up or record durable preferences, project rules and lessons through the memo ledger. Use for explicit memory requests or a remembered decision."
---

# memo

`LEDGER.md` is the append-only truth of a memory home; `MEMORY.md` is
rendered from it by usage; `usage.jsonl` is the evidence. memo owns all
three. A session never edits them: it appends a row, cites a row, or looks a
row up. A row is `- #<id> <type>/<topic>[!] <sentence> [-> <link> ...] ^m<id>`
(team: `#t<id>` / `^t<id>`) and carries no date: its creation is the `add`
event `memo add` writes to `usage.jsonl`.

## Islands (when `memo flags` shows memo.islands=true)

Memory is lazily recalled, never loaded whole: the session start shows one
line per island, the Now block and pins. Reach the rest deterministically:

```text
memo recall "<need>" --json            # before rebuilding anything: ranked titles + refs, never bodies
memo read <ref> --json                 # before relying on a row: answers current | stale | closedBy | successor
memo add <kind>/<topic>[!] "<one sentence>." [--island <name>] [--link …] [--supersedes|--retires <ref>] --json
                                       # kinds: fact rule trap decision done block handoff alias watch secret
memo retire #<prefix>-<hex>... --why "<where the lesson lives now>." --json
                                       # one journaled reason row per target, in its own island and kind/topic; never mix with numeric legacy refs
memo watch add <topic> "<sentence>." --trigger "<target> <condition>"|at:|after:|digest:|ai:|probe: --json
memo watch done <ref> [--verdict proven|disproven --evidence "<what showed it>"] --json   # settle a claim
memo secret add <topic> "<purpose>." --door <d> --capture|--generate <kind>|--ref onyx://…   # a handle, never a value
```

- Cite a row as `#<prefix>-<8 hex>` only when it changed what you did; the
  Stop harvest credits it. A hook's injection is never a use; `read` is.
- With MEMO_RUN bound (`memo new run` prints it; a subagent brief carries
  it) your rows go to the run; the keep step (`memo promote <run> --plan`,
  then `--apply`) decides what becomes project memory. Never write an
  agent-only observation as a human task: bind a run instead.
- A personal row (`me`, `mac/*`, `agent/*`) never leaves personal scope;
  `memo egress` refuses it until it is re-authored as a project row.
- Never edit `JOURNAL.jsonl`, `LEDGER.md`, `island.yaml` or a memo stub by
  hand: `memo add` / `memo island set` / `memo render`; a hand edit is
  `LEDGER_DIVERGED` until `memo repair`. Contract: `docs/memory-islands.md`.
- Before building a helper, `memo blocks find "<need>" --json`: annotations
  first, then the facts index of what exists, un-annotated or not.

### Dream (only when asked: "dream", "consolidate memory")

1. `memo dream plan [--island <name>]… --json` opens a job per island at its
   merged generation and runs the mechanical pass.
2. Near-duplicate lane on the Codex sidekick (`ccx`): it reads the job's
   `neardup.in.json` and writes `neardup.json` = `{"clusters": [[id, …], …]}`,
   2–8 ids that say the same thing, no id twice. Its prose is never evidence.
3. Writer lane, this session: read `rows.json`, `mechanical.json` and the
   clusters, then write `ops.json` = `{"ops": [{op, target?, sources, kind?,
   topic?, sentence?, links?, reason?}]}` with `op` one of add, supersede,
   retire, redescribe, retopic. One superseding row per cluster, sources
   inside one cluster, never a pinned target, at most 20 content rows; three
   traps saying one thing become a rule. Without it the dream is mechanical
   only (`DREAM_SKIPPED`). A job with `proposals.json` (whole documents
   vitrinka refused once the legacy memory was absorbed): absorb what each
   adds as an `add` with `"proposal": <id>`, or close one rows already say
   with `{"op": "take", "proposal": <id>, "reason", "sources"}`; never paste a
   body.
4. `memo dream apply <job> --json`: a project dream becomes a
   `memory-dream/<gen>` branch in a throwaway worktree; open it with `--pr`
   or `/prm` there. A human merges every dream PR. A personal dream is a
   proposal for `memo dream review`. Undo is `memo dream revert <gen>`.
5. AI-judged watches: `memo watch judge --json`, decide each from evidence
   you read, then `memo watch judge --apply <verdicts.json>` with
   `[{id, gen, ripe, confidence, why, outcome?}]`. At 0.7+ an `outcome`
   (proven | disproven) settles a claim watch and `ripe` ripens one.

## Protocol (v3 homes)

```text
memo add <type>/<topic>[!] "<one sentence>." [--link '[[notes/<slug>]]'] [--supersedes N] [--retires N] --json
                                      # capture: user|feedback -> personal home, project|reference -> team home
                                      # team rows are written from a worktree and land via PR; a main checkout refuses MAIN_CHECKOUT
                                      # a fact that changed -> --supersedes N; a fact that is simply gone -> --retires N
memo retire <ref>... --why "<where it lives now>." --json
                                      # a lesson that moved into our own skill, applet or instructions: one retires row per ref, no replacement fact
#NN / #tNN                            # act: when a row changes what you do, write its id in your reply or tool input;
                                      # bare #NN is a personal row, #tNN a team row; the Stop hook harvests both
memo show <ref> --json                # look up: the row plus its linked notes (45, #45, t12, #t12, fixit-team#12, [[LEDGER#^t12]])
memo find <words>... [--all] --json   # search the ledger, superseded rows marked
memo render --check --json            # local drift check: exit 2 when MEMORY.md on disk drifted from the ledger
memo ensure --json                    # SessionStart: render MEMORY.md only when missing or stale; in a TEAM home MEMORY.md and usage.jsonl are gitignored (only LEDGER.md + notes/ are shared), CI runs memorylint check there; a team MEMORY.md git still tracks is left as committed and SURFACE_TRACKED names its fix (run it in a worktree, never a main checkout)
memo renumber [--base <ref>] --json   # merging the base into a branch that also added team rows: LEDGER.md conflicts;
                                      # this settles it (base ids win, the branch's rows and the citations it wrote move);
                                      # --dry-run previews from any state; memorylint L009 flags an id that names two rows
memo migrate <home> > rows.md         # converting a v2 home: edit the template, then memo import rows.md --home <home>
```

Every verb emits `{v, ok, verb, data, diagnostics, next}` under `--json`.
**The envelope's `next` field IS the protocol** - run what it says, verbatim,
on success and failure alike; diagnostics carry a closed code and an exact
fix. A failure without an actionable diagnostic and `next` is a CLI bug: fix
it in `henderson-tech/toolbox` (`internal/memo`, `docs/memo.md`), never
investigate around it.

## Hard laws

1. One row, one fact, one sentence, plain hyphens, ending in a period. The
   narrative behind it goes to `notes/<slug>.md` and the row links it.
2. Never edit `LEDGER.md`, `MEMORY.md` or `usage.jsonl` by hand (Edit, Write,
   heredoc, `sed -i`): the PreToolUse hook refuses and names the verb. A
   wrong row is superseded, never corrected in place, and a `LEDGER.md`
   merge conflict is settled by `memo renumber`, never by picking a side.
3. A detail note is written only when the narrative is real (a runbook, a
   reproduction, a decision trail); otherwise the row is the whole memory.
4. Cite `#NN` (personal) or `#tNN` (team) only for a row that actually changed
   what you did; the score is the evidence the hot surface is built on.
5. The personal home's history is memo's local git; never add a remote,
   never push it.
