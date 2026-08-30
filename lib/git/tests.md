# Running the deterministic layer's tests

`lib/git/bin/*.ts` is the deterministic layer the git skills (prm, push-all, sync)
execute — PR selector parsing, review-thread triage, merge preconditions, worktree
resolution, path classification, DB-url safety. The suite in `lib/git/tests/` is its
spec: the behaviours that aren't obvious from reading the code (which findings get
filtered, which threads count as self, when the teardown hook must emit nothing).

```bash
(cd ~/.claude/lib/git && bun test tests/)      # all of them
(cd ~/.claude/lib/git && bun test tests/merge-precheck.test.ts)
```

## When to run it

- **After editing anything in `bin/`** — always, before the change reaches a real PR.
  These scripts run unattended inside `/prm --auto`; a regression here silently
  mis-triages review comments or hands the teardown hook the wrong directory.
- **When a skill's behaviour surprises you** — reach for the test that covers it
  before adding logging. `resolve-fetch.test.ts` documents the triage rules,
  `merge-precheck.test.ts` the gating ones.
- **Adding a rule to `bin/`** — add the case first. Every guard in there exists
  because something went wrong live; the test is what stops it coming back.

| File | Covers |
|---|---|
| `resolve-fetch` | PR selector forms, bot filtering, self/resolved thread rules |
| `merge-precheck` | required bot reviewers, login canonicalisation, worktree-teardown guard |
| `pr-events` · `github-io` | timeline shaping, flag parsing, API I/O edges |
| `sync-context` | local-vs-remote DB url detection |
| `classify-paths` · `tdd-classify` | commit bundling and TDD classification |
| `worktree` · `repo-root` · `list-prs` | path and listing helpers |

Fixtures use `acme/app`-style placeholders, never a real repo.
