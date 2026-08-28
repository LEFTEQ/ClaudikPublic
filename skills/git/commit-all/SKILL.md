---
name: commit-all
description: "Manual only: use when explicitly invoked as `/commit-all`. Bundles the ENTIRE working tree into local Conventional Commits."
---

# git:commit:all — Auto-bundle the WHOLE working tree into Conventional Commits

The user already opted in by invoking the slash command. Do the work without re-asking. This sweeps **everything** — for a focused, single-change-set commit, that's `/commit`.

## When to bind

ONLY when the user just invoked `/commit-all`. Without that explicit slash command, the global CLAUDE.md commit policy ("NEVER commit changes unless the user explicitly asks") applies — defer to it.

## Procedure

1. **Scan** — `git status --short` + `git diff` + `git diff --staged`. The target is the ENTIRE working tree — staged, unstaged, AND untracked — regardless of which session produced the change (this command intentionally sweeps up other sessions' work too). If the tree is clean, say so and stop.
2. **Classify & exclude (clever skip — never bail the whole run)** — run
   `node ~/.claude/skills/git/_shared/bin/classify-paths.ts --repo <ABS repo path>` → JSON `{ commit[], secrets[], artifacts[] }`. Pass `--repo` as a LITERAL absolute path (never `$(git rev-parse --show-toplevel)` — that re-inherits the drifted cwd); otherwise the classifier reads whatever repo the persistent shell is parked in.
   - **Never stage** `secrets[]` — env files (`.env`, `.env.*`; but `.env.example` / `.sample` / `.template` ARE committed), `*.key/.pem/.p12/.pfx`, `id_rsa*`, `credentials*`, `secrets.*`, `.npmrc`/`.netrc`/`.pypirc`, `*.token`, service-account JSON.
   - **Never stage** `artifacts[]` — `node_modules/`, `allure-results/`, `allure-report/`, `playwright-report/`, `test-results/`, `coverage/`, `.nyc_output/`, `__pycache__/`, `.next/`, `.turbo/`, `.DS_Store`, `*.log`.
   - Commit ONLY `commit[]`. Do NOT stop — skipping is the whole point; everything else still gets committed.
   - This matches secret-shaped FILES, not secrets pasted inside an otherwise-normal source file. The no-`--no-verify` rule below keeps any gitleaks / secret-scan pre-commit hook in force as the real backstop for embedded secrets.
3. **Bundle** — group the `commit[]` paths by topic. Heuristics in priority order:
   - Same feature directory / module → one bundle
   - Tests travel with the code they test → fold into that bundle
   - Lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `Cargo.lock`) + its manifest → fold into the bundle that owns the dep change
   - Pure docs (`README.md`, anything under `docs/`) → own `docs:` bundle
   - Config / tooling (eslint, tsconfig, prettier, husky, CI yaml) → own `chore(config):` bundle
   - Generated / vendored output (`dist/`, `build/`, `*.generated.*`) → own `chore:` bundle and flag in output
4. **Draft Conventional Commits messages** — `type(scope): subject`.
   - Types: `feat` · `fix` · `chore` · `docs` · `refactor` · `test` · `perf` · `style`
   - Scope = leading directory or feature name (`skills/X` → `scope: X`)
   - Subject in imperative mood, ≤72 chars, no trailing period
   - Body optional; include only when the WHY isn't obvious from the subject
5. **Commit serially** — for each bundle: `git add <explicit-paths>` then commit via HEREDOC. Never `-A` or `.`. Never `--amend`. Never `--no-verify`. If a pre-commit hook fails, fix the underlying issue and create a NEW commit.
6. **Verify & report** — after the last commit, `git status --short` should show ONLY the skipped paths (`secrets[]` + `artifacts[]`); everything in `commit[]` is committed. Print a clear "Skipped (not committed)" block, grouped:
   - 🔒 secrets — one `<path>` per line
   - 🗑 artifacts — one `<path>` per line

   …so the user can `.gitignore` them or hand-commit any they actually want. If `commit[]` was empty (only secrets/artifacts changed), say "nothing but skipped paths — committed nothing."

## Hard rules

- **Never** `git add -A` / `git add .` — explicit paths only.
- **Never** `--no-verify` (hooks exist for a reason).
- **Never** `--amend` — always new commits.
- **Never** push, force-push, or open a PR — local commits only.
- **Never** commit secret-shaped files (env/keys/credentials) or build/test artifacts — `classify-paths.ts` skips them; report loudly, don't bail the whole run.
- **Never** silently omit a skipped path — every skipped file appears in the report so the user can act on it.
- **Never** skip a real source file just because its name contains `token`/`secret`/`key` — only high-confidence secret-shaped files are skipped; `tokenizer.ts` etc. get committed.

## Quick reference — bundle → type/scope

| Bundle signal | Type | Scope example |
|---|---|---|
| New feature inside `skills/foo/` | `feat` | `foo` |
| Bug fix in existing module | `fix` | module name |
| README / docs/ only | `docs` | section name, or omit scope |
| `package.json` + lockfile change | `chore` | `deps` |
| eslint / tsconfig / CI yaml | `chore` | `config` |
| Test added for unchanged source | `test` | module under test |
| Pure rename / restructure, no behavior change | `refactor` | module name |

## Commit message shape

```bash
git commit -m "$(cat <<'EOF'
feat(commit-all): bundle working-tree changes into Conventional Commits

Splits staged, unstaged, and untracked files into per-feature bundles
and commits them serially without prompting.
EOF
)"
```

## Common mistakes

| Mistake | Fix |
|---|---|
| `git add -A` "just this once" | Always list explicit paths from the bundle |
| One mega-commit for "everything" | Split by feature/module — that's the whole point |
| `feat:` for a bug fix | Match the actual change shape (`fix:`, `refactor:`, etc.) |
| Committing `.env` / a `*.key` because it showed up in `git status` | `classify-paths.ts` skips it automatically — it lands in the report, not a commit |
| Skipping `tokenizer.ts` because the name contains "token" | Only secret-shaped FILES are skipped; real source is committed |
| STOPping the whole run because one secret appeared | Skip that one path, commit everything else, report the skip |
| Body restates the subject | Delete the body — subject is enough |
| Pre-commit hook failed, retry with `--no-verify` | Fix the underlying issue and create a new commit |
| Amending the previous commit to "fold in" a fix | Always create a NEW commit |

## Red flags — STOP

- Working tree contains `.env*`, keys, or artifacts → they're auto-skipped + reported (NOT a reason to stop the whole run)
- Pre-commit hook fails → fix root cause, don't bypass
- About to amend / push / force-push → don't, that's a separate user decision
- User said "commit my changes" without the slash command → don't auto-bind
- A change doesn't fit any obvious bundle → report it and let the user decide rather than dump it into `chore:`
