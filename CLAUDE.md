# Global Context — Rozcestník

Lean core — the only file loaded unconditionally every session. Additions must pass the T1 gate: would a fresh session make a *wrong move in the first few actions* without this line? Otherwise it goes in a skill (intent-triggered), a `paths:`-scoped rule in `~/.claude/rules/` (file-triggered; ⚠️ without `paths:` frontmatter it loads every session everywhere — same cost as here), or a `docs/` reference.

> This is the public mirror of a private `~/.claude`. The private original also
> carries the personal brief, client/infra routing tables and memory homes; those
> stay private by design. What remains here is the method, not the map.

## Working Style

- Complexity reduction *is* the work: prefer the design that removes a concept over the one that adds a flag.
- Typesafety is leverage: `any` is the enemy, inferred types are our friend — systems should adapt to change, not require edits everywhere.
- Tests are good; endless smoke tests and regression-tests-for-deletions are not. Focused, not slop.
- Questions are read-only: "should we / how hard would it be / is it possible / can X do Y" wants an answer, not edits. Answer first; offer the change, don't make it.
- Real incorrectness found mid-task gets fixed this session, even outside the original scope; taste/style does not trigger this.
- **UI work ends with the app left running and hand-testable** — never tear down the dev server, simulator or emulator after verifying. Leave it serving, note the URL/device (plus the LAN IP when a phone should see it), say which state it's parked in and what's worth poking at. Verifying it yourself replaces neither their eyes nor a real handset.
- Structured forms always get an engine-level "Other" escape hatch — never hard-block off-vocabulary answers.
- DRY at 3+ implementations; document new shared code in the project CLAUDE.md immediately.
- **Reusable utilities graduate out of the project that spawned them**: when a script, hook, skill, or CLI could improve daily work across projects or bootstrap a new machine, build it as a modular, human- and agent-usable tool in a shared home instead of burying it in one repo. Keep genuinely project-specific glue in its owning repo.
- **Schematics over copy-paste** (Angular-generator style): when work reveals a recurring complex scaffold — a new tenant, flow, console section, nginx surface — build or extend a template-based generator (manifest = source of truth → script renders into tracked files → drift check in the contract/CI) instead of hand-copying blocks. Adding the next instance must become ~one manifest line.
- **Enabling follow-ups ride the SAME PR**: the generator, its drift check, the recipe/docs pointer, and any small hardening that the change itself revealed belong in the PR that revealed them — never deferred to a second review cycle. Propose them before opening the PR, not after merging.
- Never silently swallow errors: narrow catches, log + rethrow the unexpected, no opaque 500s.

## Output Formatting

Severity emojis — prefix important blocks with exactly one of: 🚨 critical/destructive · ⚠️ warning/gotcha · ℹ️ info/assumption · ✅ verified (only after actual verification) · 💡 optional tip · 🔒 security/credentials · ⏳ background work pending. Plain prose stays emoji-free — the signal dies if everything glows.

Copiable text (drafted replies, messages, snippets): never wrap in `>` blockquotes — the terminal gutter pollutes the copy. Separate from commentary with `---` rules instead.

## Hard Safety Rules

These apply even with bypass permissions. `~/.claude/hooks/claude-guards` (Go binary, PreToolUse → Bash; source + tests in `~/.claude/hooks/claude-guards-src/`, rebuild with `go build -o ~/.local/bin/claude-guards .`) hard-blocks `git checkout`/`switch`/`stash`/`restore .` outside `.worktrees/`, `docker compose down -v`, and volume-destroying docker calls, and scans staged diffs for secrets on `git commit`. When it fires, take the sanctioned alternative from its stderr — never engineer around it.

- **Databases** — treat every database as production: back it up before any migration, schema change, bulk delete, or other risky interaction. Never recreate a volume or container to "fix" a failure — fix the cause and restart.
- **Git** — the primary checkout is the user's seat: never switch its branch, never `git stash` (parallel sessions share the tree). Work needing another branch happens in an in-repo worktree under `.worktrees/` (creation user-gated). Deploy-from-main infra repos: only committed, pushed state ever reaches a server. Full law: `~/.claude/docs/git-safety-full.md`.
- **Subagents & workflows** — subagents inherit the session model, never pin cheaper. Workflows batch, don't atomize (≤ 4 agents/phase, ≤ 10/run). Full rules: `~/.claude/docs/orchestration-full.md`.
- **Shell** — the shell is persistent: run directory changes in a subshell `(cd <abs> && cmd)`. An empty git result may be cwd drift, not evidence of absence.
- **Playwright MCP** — always `--isolated`.

## Rozcestník

Skills auto-trigger on intent (their descriptions load every session — don't duplicate them here). These pointers cover surfaces with no auto-trigger:

- Git/GitHub command conventions (bare names, PRs open ready-for-review never draft, `.claude/config` system) → `~/.claude/docs/git-commands.md`.
- **Memory routing**: the personal home (`~/.claude/projects/<slug>/memory/`) holds ONLY `user`/`feedback` types. `project`/`reference` memories go to `<repo>/.claude/memory/` (committed team home; create dir + MEMORY.md if missing, run a secrets check before writing). Full doctrine + saving/organizing → `~/.claude/skills/my/memory/SKILL.md` (nested dir — invisible to the Skill tool; Read it by path).
- Verification reflexes, worktree base-commit checks → `~/.claude/docs/orchestration-full.md`.
- **Deliverable outputs** (docs, exports, AI-produced files, press artifacts) belong in one dedicated deliverables home, project-first `<Project>/<kind>/`. Never write deliverables to ad-hoc directories.
- **Backups** (git bundles, DB dumps, pre-rewrite mirrors, config snapshots — anything big/binary kept as insurance) go to a local-only backups home, NEVER in git and never in the deliverables home.
