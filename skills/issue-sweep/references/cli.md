# issues CLI

Every verb takes `--json`. `--run <id|dir>` defaults to the newest run covering this repo.

```text
init [--repo owner/name[=/abs/checkout]]... [--name N] [--no-fetch]
runs | status | harvest | gate | groups | sync
tasks [--apply]
slice --phase triage|fix [--lanes N] [--size N] [--groups N]
lane run --lane L --kind triage|skeptic|red|verify [--fix] [--round N]
lane wait --lane L [--max 110]
lane ingest --lane L
decide [--defaults] [--close|--keep|--fix|--report|--skip|--split k,...] [--answer <owner/name#n/qK>=<text>]... [--answer <owner/name#n>=<gate note: a scope call the fixer and verifier read>]...
comment [--apply]
worktrees [--group G]... [--apply]
fix brief --group G
fix record --group G --state fixed|pushback|blocked --note FILE
pr --group G [--apply]
report [--push]
cleanup [--apply]
show <owner/name#n>
```

## Diagnostics that change what you do

- `HARVEST_INCOMPLETE`: re-run `harvest`. Never triage a partial repo.
- `GATE_OPEN`: finish the triage slices, then the gate.
- `OUTPUT_INVALID` twice on one lane: `show` the lane's issues and re-slice. A third attempt goes to the human.
- `CODEX_BLOCKED`: the turn left no valid output (a defect in the code is a result, never a blocker). By lane kind:
  - triage, skeptic, red: fix the environment only (seed, env, access), then re-run the lane. Never commit into the base or a group worktree: RED proves against a frozen base. A RED that needs app code to run means the issue is not reproducible as is.
  - verify: never fix it yourself. Fix an environment blocker, then re-run the lane. A defect of the fix goes to the next fix round: re-run the lane, and the verifier records it as a `blocker` finding with `accept: false`.
- `PII_OUTGOING`: reword the agent prose the body was rendered from. `SECRET_OUTGOING`: remove the value. Neither is ever bypassed.
- `VITRINKA_OUTDATED`: `vitrinka update`, then re-run `tasks`.
- `STATE_CONFLICT` / `LANE_BUSY`: `status` and follow `data.next`.

## Run directory

`~/.local/state/toolbox/issues/<run>/`, private and never in git:
- `run.json`, `ledger.json`, `snapshot/`.
- `lanes/<id>/`: brief, out, stdout and stderr per turn.
- `workflows/*.workflow.js`.
- `bodies/`.
- `report/`.
