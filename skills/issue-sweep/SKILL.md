---
name: issue-sweep
description: "Use when a repository's open GitHub issues should be worked down or re-verified - 'issue sweep', 'work the open issues', 'triage the backlog', 'go through all GitHub issues', 'which issues are still valid', 'fix the open bugs' - or when resuming a sweep run."
codex-ignore: true
---

# issue-sweep

Every open issue of the given repos gets a verified verdict.
- **Live bugs** are fixed test-first: RED, fix, GREEN, an independent verify. That lands one PR per issue, or per group of issues one fix cannot separate.
- **Stale issues** get an evidence comment and are closed on the human's OK.
- **Non-bugs** are reported, never built.

You orchestrate and ask the human. The `issues` applet holds all state and does every write: read state from `issues status --json`, never from memory. Codex lanes triage, review, and write and run tests. Claude fixers write app code.

## Laws

- No code before the gate. Every call that implementing would force (product, UX, schema, money, legal) is asked at the gate, never picked by an agent.
- Never hand-edit files under the run directory.
- Never `SendMessage` an agent a running workflow owns. Never push to a PR while Eve reviews it; `/prm` owns that.
- Agent prose never quotes personal data from issue threads. Never bypass the outgoing gate (`PII_OUTGOING`, `SECRET_OUTGOING`).

## Run

```text
issues init [--repo owner/name[=/abs/checkout]]... --json   # once; default: this repo
issues status --json                                         # loop: do data.next
```

| `data.next` | Do |
|---|---|
| `slice --phase <p>` | run it, then make the `Workflow` call its `next` names, with its data as args verbatim; read only the workflow's summary |
| `gate` | the Gate below |
| `comment` | `--apply` only after the human approves its dry-run batch at the gate |
| `sync` | drive each open PR with `/prm`, one per repo at a time (its repo's MERGE_POLICY decides merge), then `sync` |
| `lane wait` | a workflow died mid-lane: wait it out, then re-slice |
| `report --push` | run it; print `data.report.url` as a masked link labelled by the report title (`[Issue sweep <run>](<url>)`) |
| anything else | run it |

Also push the report after the triage slices, after the gate and after each fix workflow.

To finish:
1. Run `issues cleanup --apply --json`.
2. Commit each lane's Codex exports dir (`issues status` lists them), path-scoped, on `~/Exports` main.
3. Hand back the report URL, the PRs (merged or open), the closed issues, and anything escalated or blocked.

If Codex is unavailable, the workflow wrappers do the lane briefs themselves; tell the user once that the fallback fired.

## Gate

From `issues gate --json`, put everything in one message:
- **Stale.** A table: issue, verdict, confidence, one-line reason, skeptic ruling.
- **PR groups.** One row per group: its issues, and the edge that joined them (`why`).
- **Questions.** Merge the ones that are really one decision across issues. Restate each plainly with its issue links; never ask through an id alone.
- **Report-only.** Non-bugs, not-code and insufficient-evidence issues: shown, not asked.

Then, in order:
1. Ask with `AskUserQuestion` batches: approve the groups or name issues to split into their own PR, and the questions.
2. `issues decide --defaults [--skip k,...] [--split k,...] [--answer <id>=<text> ...] --json`. One answer may cover several question ids. A live bug with an unanswered question stays undecided until it is answered or `--skip`ped.
3. `issues comment --json` (dry-run): show its plan as the close batch, one row per issue: issue, verdict, action, body path.
4. Ask once: close them all (recommended), or name the ones to keep open (evidence comment only). For keeps, run `issues decide --keep k,... --json` and show the dry-run again.
5. `issues comment --apply --json`.

**Escalated groups.** Put both positions from the group rounds in `issues show <key>` to the human fairly. Never break the tie yourself.

Diagnostics and the run directory: `references/cli.md`. Verdicts and statuses: `references/verdicts.md`.
