# Verdicts, gates and statuses

## Verdict (triage's finding)

| Verdict | Means | Skeptic | Gate default |
|---|---|---|---|
| `live-bug` | the defect is present at the audited SHA (positive evidence) | no: RED proves it | `fix` |
| `fixed` | already fixed; commit/PR and path:line prove it | yes | `close` (completed) |
| `superseded` | replaced by another design or issue | yes | `close` (not planned) |
| `duplicate` | of `duplicateOf` | yes | `close` (not planned) |
| `not-reproducible` | no positive evidence the defect exists | yes | `close` (not planned) |
| `feature-done` | a non-bug that is already delivered | yes | `close` (completed) |
| `feature-open` | a non-bug that is still wanted | no | `report` |
| `not-code` | ops, process or an external gate | no | `report` |
| `insufficient-evidence` | triage could not conclude; never treated as fixed | no | `report` |

A skeptic that refutes a verdict replaces it. A refuted `fixed` usually becomes `live-bug`.

A live bug whose RED test does not fail at the base becomes `not-reproducible`, leaves its group and returns to the next gate.

## Gate (the human's call)

| Gate | Then |
|---|---|
| `fix` | grouped into PRs, then worktree, RED, fix and verify rounds, PR, `/prm` |
| `close` | evidence comment, then close |
| `keep` | evidence comment; the issue stays open |
| `report` | report only |
| `skip` | out of this run |

## Issue status

`harvested` → `triaged` → `decided` → `red` → `fixing` → `verified` → `pr-open` → `merged`.

Terminal or side states:
- `closed`: closed by this sweep.
- `reported`.
- `skipped`.
- `escalated`.
- `blocked`.
- `gone`: closed or moved outside the sweep.

## Group status

`planned` → `ready` (worktree) → `red` → `fixing` ⇄ `rework` → `verified` → `pr-open` → `merged`.

Other outcomes:
- `escalated` after 3 rejected rounds.
- `blocked`.
- `dropped`: nothing reproduced.

## Groups

Issues share a PR only along edges triage declared:
- `dependsOn`: one fix cannot land without the other.
- `sameFix`: one change fixes both.

The edges must be in the same repo. Labels, themes and shared files never group issues. `decide --split` overrides an edge.
