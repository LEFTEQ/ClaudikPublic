# Git Commands, PR Defaults & Project Config

## Pull Request Defaults

**PRs open ready-for-review.** Never create drafts unless the user explicitly asks for a draft/WIP/stacked placeholder. This overrides generic GitHub workflows that default to drafts. **An opened PR is never parked:** whatever opened it (`/prc`, raw `gh pr create`, a skill flow), hand it to `/prm` to watch — unless the user explicitly takes it over.

## Git Commands — all bare-named, no namespace

Commands live at the top level of `commands/` and are invoked by bare name; engines live under `skills/git/<name>/SKILL.md` (commands are thin stubs that Read them by absolute path). There is no `/git:*` namespace, and `/to-latest` and `/pull` are absorbed into `/sync`.

| Command | Does |
|---|---|
| `/commit` | commit ONE coherent change-set; leaves unrelated work alone |
| `/commit-all` | sweep the ENTIRE tree into Conventional Commits; skips + reports secrets/artifacts |
| `/push-all` | `/commit-all`, then push. Never force, never from a non-infra default branch |
| `/prc` | ensure an open PR exists (create-or-find), hand to `/prm`. `--auto` forwards |
| `/prm` | watch a PR; fix + failing-test + push-back per comment until merged. `--auto` merges once ready, behind the audit gate |
| `/merge` | drive the PR to mergeable, merge, tear down worktree + branch, pull the main clone |
| `/actions` | watch CI; on failure diagnose → fix → push → re-watch until green |
| `/sync` | bring the checkout up to date, mode chosen by branch identity; then deps → backup+migrate → regen → verify → restart |
| `/tidy` | audit branches + worktrees, delete everything provably merged (local, remote, dirs, Docker stacks) |

Both `prc` and `prm` auto-create the PR when the branch has none (refusing only on the default branch) via `_shared/ensure-pr.md`.

**`--auto`** replaces the human diff-read with `_shared/auto-audit.md`: one read-only subagent audits the whole PR diff against its base immediately before merging (keyed to head sha) for swallowed errors, contract changes with un-updated consumers, weakened guards, irreversible migrations, uncovered high-blast-radius paths. PASS merges; BLOCK posts CHANGES_REQUESTED (via `github-io.ts review`, which cannot approve by construction) and keeps watching — this is what makes autonomous authors like eve peacemaker revise. 3 consecutive BLOCKs hand off to a human. `--auto` never implies `--admin`, never self-approves, never merges past a pending human or required-bot review. Shared engine: `skills/git/_shared/` (deterministic TS layer + loop/verdict/output contracts). Skills emit full clickable GitHub URLs.

**Tests.** The deterministic layer has a spec: `bun test tests/` inside `~/.claude/skills/git/_shared` (135 tests over `bin/*.ts`). Run it after touching anything in `bin/` — those scripts run unattended inside `/prm --auto`. Details: `skills/git/_shared/tests.md`.

## Project Config System

Projects may have `.claude/config` (committed defaults) and `.claude/config.local` (gitignored overrides). Skills read these for project values (branch names, sibling paths, GitHub repo) instead of hardcoding. Format: `KEY=value`, `#` comments, local overrides project.

Related: `~/.claude/docs/git-safety-full.md`.
