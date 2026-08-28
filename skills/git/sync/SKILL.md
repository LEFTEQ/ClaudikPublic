---
name: sync
description: "Manual only: use when explicitly invoked as `/sync`. Brings the current checkout up to date — on the default branch it commits, pulls ff-only and pushes; on any other branch it aligns with origin/<branch>, commits, pushes, merges origin/<default> with triaged conflict resolution, then gets the local env consistent (deps, backup→migrate, regen, verify, restart)."
---

# sync — bring this checkout up to date, whichever branch it's on

The user opted in via the slash command. One command, two modes, decided by **branch
identity**. Per-project behavior comes from `<repo>/.claude/.claude.git.config`, which
`/sync` **populates itself on first run** so later runs need no discovery.

Composes `~/.claude/skills/git/_shared/output.md`. Absorbs the retired `/to-latest` and
`/pull` — decisions: `~/.claude/docs/specs/2026-07-29-sync-unification-decisions.md`.

This is a **local dev-sync** command: it never targets prod, never force-pushes, never
deletes branches.

## Usage

`/sync [--dry-run] [--continue]`

- `--dry-run` — resolve the plan, print mode + every action it *would* take, touch nothing.
- `--continue` — resume after you hand-resolved gated conflicts (finishes the merge if
  still in progress, then runs the shared tail).

There is no `--no-migrate` / `--no-restart`: leave `DB_MIGRATE_CMD` / `RESTART_CMD` unset
in config to disable those steps.

## 0. Anchor and resolve

**Capture the absolute repo root ONCE** (`git rev-parse --show-toplevel`) and pass it
literally as `--repo <ABS>` to every helper, and `git -C <ABS>` to every git call. Never
let a helper infer the repo from ambient cwd — the harness shell's cwd survives between
calls, and a wrong-repo `git status` is a silent, valid, wrong answer that this command
would then commit or merge against.

```
node ~/.claude/skills/git/_shared/bin/sync-context.ts --repo <ABS>
```

→ `{mode, currentBranch, upstream, isWorktree, defaultBranch, mergeStrategy, packageManager,
installCmd, lockfiles, generatedPaths, generatedFromConfig, regenCmd, verifyCmd, migrateCmd,
backupCmd, migrationsPaths, restartCmd, hasComposeFile, localDbUrlVar, dbHost, localDbOk,
runAfterSync, configFound, configPath, missingKeys, configComplete}`

**Fast path:** `configComplete: true` → everything is already written down. Execute the
plan; ask nothing, explore nothing.

**First run (`configComplete: false`):** `missingKeys` lists what's unresolved. Resolve them
once — inspect `package.json` scripts, the codegen config (`orval.config.*`, `openapi-*`,
`codegen.yml`), and where its output lands — then ask the user in ONE `AskUserQuestion`
batch to confirm `REGEN_CMD` / `VERIFY_CMD` / `GENERATED_PATHS` (recommend what you found;
they can decline any of them). Then freeze:

```
node ~/.claude/skills/git/_shared/bin/sync-context.ts --repo <ABS> --freeze
```

`--freeze` appends only keys the file doesn't already set, so it never overwrites a
hand-written value and re-running it is a no-op. If the user declined a key, write the
confirmed ones by hand instead and leave the rest for next time. **Never freeze a secret** —
only command strings and paths.

## 1. Guards

- Detached HEAD (`currentBranch == "HEAD"`) → STOP: "detached HEAD — check out a branch first."
- Mid-merge/rebase already in progress and no `--continue` → STOP and point at `--continue`.
- `--continue` with no merge in progress and a clean tree → skip to the shared tail (§5).

`/sync` never stops for a dirty tree — handling dirt is its job.

## 2. Commit what's here (both modes)

Sweep the **entire** working tree per `/commit-all` semantics (read
`~/.claude/skills/git/commit-all/SKILL.md`): classify every dirty path with
`node ~/.claude/skills/git/_shared/bin/classify-paths.ts --repo <ABS>`, then commit real
changes as coherent path-scoped Conventional Commits. Secrets are never committed and are
named loudly; artifacts/scratch are left in place and listed.

⚠️ **This deliberately overrides the `git-safety` "commit only your own change-set" law**
(user's explicit call, decision #4 in the log). In a worktree the whole tree is your work,
so this is free. In the **primary clone on a feature branch** it can sweep a parallel
session's WIP into your commit — so **list every path you swept in the report**, grouped by
commit. The bundling must always be visible, never silent.

Nothing dirty → say so and move on.

## 3. MAIN MODE (`mode == "main"`)

1. `git -C <ABS> fetch --prune origin`
2. `git -C <ABS> pull --ff-only` — record `BEFORE` first.
   - Not fast-forwardable → local `main` has diverged from `origin/main`. **STOP** and
     report the fork point + ahead/behind. Do not merge or rebase the default branch
     without being asked.
3. Local commits ahead of an upstream → `git -C <ABS> push`. Never `--force`. If the
   default branch is protected and the push is rejected, report it — that's information,
   not a failure to work around.
4. → shared tail (§5).

## 4. BRANCH MODE (`mode == "branch"`)

1. **Align with your own branch first.** `git -C <ABS> fetch --prune origin`.
   - No `upstream` → nothing to align; skip to step 2.
   - `origin/<branch>` ahead and fast-forwardable → `git -C <ABS> merge --ff-only @{u}`.
   - Diverged → `git -C <ABS> merge @{u}`, conflicts through the **same triage** (§4.1).
     Never rebase: those commits are already pushed and possibly a colleague's.
2. **Commit** — §2.
3. **Push** `git -C <ABS> push` (set upstream with `-u` if it has none). Your work is on the
   remote *before* the merge can complicate it.
4. **Merge the default branch:** record `BEFORE=$(git -C <ABS> rev-parse HEAD)`, then
   `git -C <ABS> merge origin/<defaultBranch>` (or rebase if `mergeStrategy == "rebase"` —
   but only when the config explicitly says so).
5. **Push again** once the merge is complete and verified.
6. → shared tail (§5).

### 4.1 Conflict triage

For every conflicted file, classify into exactly one bucket. Use `generatedPaths` from the
plan (`isGeneratedPath` semantics: a pattern with no glob is a path prefix; `**` crosses
directory separators).

**REGENERATE** — path matches `generatedPaths`, or is a lockfile.
Generated output is *never* hand-merged; the merged sources are the truth.
- Lockfile → `git -C <ABS> checkout --theirs -- <lock>` then let `installCmd` in the tail
  rewrite it.
- Otherwise → `git -C <ABS> checkout --theirs -- <path>`, `git add` it purely to unblock the
  merge, and record it for regen. After the merge completes, run `regenCmd`, then
  `git add` the regenerated output.
- `regenCmd == null` → **do not guess**. Leave those files conflicted, tell the user which
  codegen command is missing, and offer to record it as `REGEN_CMD`.

**AUTO** — hunks are disjoint, mechanical, or purely additive: both sides appended to
different regions, import/export blocks, added enum members or switch cases, formatting.
Resolve **by intent**, preserving the meaning of both sides. **Never** blanket
`--ours`/`--theirs` on hand-written code.

**GATE** — both sides rewrote the same logical unit: the same function body, the same
condition, the same constant, or changes that are individually fine but semantically
incompatible. Also GATE anything you are not sure about — uncertainty is a gate, not an
auto.

### 4.2 The gate

Finish every REGENERATE and AUTO file first, so the user is only asked about what genuinely
needs them. Then:

1. **One summary table** of all hard conflicts — `path:line` | what collided | why it's hard.
2. **Then `AskUserQuestion`, one question per conflict, batched 4 per call.** Options:
   - *Apply my resolution (Recommended)* — describe the merge in the description; put the
     actual `<<<<<<<`/`=======`/`>>>>>>>` hunks plus your proposed replacement in `preview`.
   - *Keep mine* (HEAD) / *Keep theirs* (incoming) — state what each one loses.
   - *I'll do it myself*.
3. **"I'll do it myself" → stop cleanly, mid-merge.** Leave AUTO files staged, generated
   files regenerated and staged, and only the gated files carrying conflict markers. Report
   the exact state and the resume path: resolve → `git add` → `git commit` → `/sync --continue`.
   Do **not** `git merge --abort` — that would discard work the user already approved.

## 5. Shared tail (both modes)

Let `RANGE = BEFORE..HEAD` (the commits this sync brought in).

1. **Deps** — `git -C <ABS> diff --name-only RANGE` touched any `lockfiles` entry and
   `installCmd` is set → run it.
2. **Migrations (backup-first, LOCAL-only)** — only if `RANGE` touched a `migrationsPaths` entry:
   - `migrateCmd == null` → NOTIFY "migrations arrived but no migrate command configured
     (set `DB_MIGRATE_CMD`)" and skip.
   - 🚨 **Local-DB guard (non-negotiable):** `localDbOk !== true` → **STOP the migration
     step**. `false` means `dbHost` looks remote/prod — NEVER migrate it. `null` means the
     DB URL couldn't be confirmed local — STOP to be safe.
   - 🚨 **Backup first (hard-required, per global CLAUDE.md):** `backupCmd == null` → **STOP
     the migration step**: "refusing to migrate without a backup command — set
     `DB_BACKUP_CMD`." Otherwise run `backupCmd`, confirm it succeeded, THEN `migrateCmd`.
3. **Regen** — `regenCmd` is set and either a REGENERATE conflict occurred or `RANGE`
   touched a generated source (OpenAPI spec, schema, codegen config) → run it and commit
   the result if it changed anything.
4. **Verify — only when this sync did something risky.** Run `verifyCmd` if any AUTO
   resolution happened, any regen ran, or deps were reinstalled. A clean fast-forward with
   no conflicts skips it. **Never continue past a failing verification** — STOP, show the
   failure, and leave the tree as-is so it can be inspected.
5. **Restart servers:**
   - `restartCmd` set → run it.
   - else `hasComposeFile` and services up (`docker compose ps --status running -q`
     non-empty) → `docker compose restart`.
   - bare dev servers (`next dev`, `nest start --watch`, `vite`, Metro) → **REPORT** them and
     how to restart; never kill the user's foreground process.
6. **`runAfterSync`** — if set, run it.

## 6. Report (`output.md`)

Mode + branch, and in order: paths swept per commit (§2's visibility requirement), the
alignment result, the merged commit range with full clickable URLs, conflicts by bucket
(regenerated / auto-resolved / gated + how each gate was answered), then deps / migrate /
regen / verify / restart each marked done or skipped **with the reason**. If config keys
were frozen, say which.

## Hard rules / safety

- **Never** blanket `--ours`/`--theirs` on hand-written code — resolve by intent, or gate.
- **Never** continue past a merge that fails verification — STOP and show it.
- **Never** `git merge --abort` on the user's behalf when they chose to resolve manually.
- **Never** rebase a branch that has an upstream — those commits are already published.
- 🚨 **DB: backup BEFORE migrate (mandatory). NEVER migrate unless `localDbOk === true`.**
  The guard is deterministic (`sync-context.ts` reads the DB-URL host); `false`/`null` → STOP.
- **Never** `git stash`, `git checkout .`, `git restore .`, or `git checkout <branch>` — all
  banned by `git-safety`. `/sync` changes what's *committed*, never what's *checked out*.
- Local only — never targets prod, never force-pushes, never deletes branches.
- Every git mutation names its repo: `git -C <ABS>`.

## `.claude/.claude.git.config` (per-project, `KEY=value`)

`/sync --freeze` writes the auto-detected ones itself; a hand-written value always wins.

```
DEFAULT_BRANCH=main                       # else auto from origin/HEAD
MERGE_STRATEGY=merge                       # merge | rebase (never auto-set)
INSTALL_CMD=pnpm install                   # else auto from lockfile
GENERATED_PATHS=packages/api-client/src/generated,**/*.gen.ts
REGEN_CMD=pnpm api:generate                # codegen; also resolves generated conflicts
VERIFY_CMD=pnpm typecheck                  # run after risky syncs
DB_BACKUP_CMD=pnpm db:backup               # REQUIRED before migrate
DB_MIGRATE_CMD=pnpm db:migrate             # else auto from package.json scripts
MIGRATIONS_PATHS=apps/api/migrations,prisma/migrations
RESTART_CMD=docker compose restart api     # else auto (compose) / report
LOCAL_DB_URL_VAR=DATABASE_URL              # checked for localhost before migrate
RUN_AFTER_SYNC=pnpm gen:types              # optional final step
```

`GENERATED_PATHS` unset → conservative built-in globs (`**/generated/**`,
`**/__generated__/**`, `**/*.gen.*`, `**/*.generated.*`, `**/openapi*.{json,yaml,yml}`,
`**/schema.graphql`, `**/graphql.schema.json`, `**/prisma/client/**`).
