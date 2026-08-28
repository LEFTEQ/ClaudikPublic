# ensure-pr — make sure a PR exists for THIS checkout

Shared contract used by `prc` and `prm`. Idempotent: guarantees an open PR exists for
the current branch and returns its URL + number. **Current-branch selector only** — an
explicit `<N>` / URL / `latest by` selector with no PR stays a hard error.

Inputs (optional): `--base <branch>` (default: the repo's default branch) ·
`--draft` (explicit only) · `--title <text>` / `--body <text>` (either alone is fine).

**Always author the body yourself** per `~/.claude/skills/git/_shared/pr-body.md` —
`--fill` restates the commit log and is a fallback for a single self-explanatory commit
only. **Never type a multi-line body inline on the command line** (zsh mangles it):
write it to a scratchpad file and pass `--body "$(cat <file>)"` (double-quoted), or
`gh pr edit <N> --body-file <file>`.

Steps:

0. **Write the body** per `pr-body.md` — run its action-item lens over
   `git diff <base>...HEAD` first, so migrations, env vars, flags and deployed-client
   breaks surface before the PR exists.
1. Resolve the current-branch PR via `node ~/.claude/skills/git/_shared/bin/resolve-fetch.ts`.
2. **PR already exists** → return its URL + number (never error or recreate). Check its
   body against `pr-body.md`: a commit-log dump or missing `Before merging` /
   `After merging` → rewrite (`gh pr edit <N> --body-file <file>`) and say so. A body a
   human hand-wrote is theirs — append the missing action sections, keep their prose.
3. `resolve-fetch.ts` returns `{ "noPr": true, … }`:
   - `onDefaultBranch === true` → **STOP**: never open a PR from the default branch;
     tell the user to create/switch to a feature branch.
   - otherwise: `git push -u origin HEAD`, then
     `node ~/.claude/skills/git/_shared/bin/github-io.ts create-pr --head <branch> --base <base>`
     with `--title <text>` and `--body "$(cat <file>)"` (caller's values win when
     supplied) and `--draft` when passed. `--fill` stays in argv as a backstop, but
     reaching it means step 0 was skipped — a bug, not an outcome. "No commits between
     <base> and <branch>" → **STOP** and say so. Print the URL per `output.md`; return
     URL + number.
