# `.deprecated` — the retirement shelf

Mirrors the `~/.claude` layout (`agents/`, `skills/`, `commands/`, …) for things that
are retired but not deleted. The leading dot keeps the whole tree **out of the harness's
load path**: Claude Code only scans `agents/`, `skills/`, `commands/`, `hooks/`, `rules/`
at the root, so nothing here costs a token, registers a slash command, or shows up in the
per-session skills listing.

It stays in git (and in the ClaudikPublic mirror) so the history and the prose survive —
a retired skill is still the best starting point when the need comes back.

## Rules

- **Move, never copy.** `git mv <thing> .deprecated/<thing>` — one live copy only.
- **Un-deprecating is the same move backwards.** Re-read it before trusting it; a shelved
  skill has been drifting against the rest of the estate for as long as it sat here.
- **Mirror deny/allow rules travel with the path.** When you move something, update its
  entry in `mirror/manifest.json` to the `.deprecated/` path.
- **Fix the referrers in the same commit.** `git grep` the name across `CLAUDE.md`,
  `docs/`, `skills/`, `commands/`, `settings.json` before moving.

## Shelved

| What | Retired | Why |
|---|---|---|
| `agents/` (expo-developer, legal-advisor, penetration-tester, prompt-engineer, security-auditor, senior-security) | 2026-08-29 | Personal subagent definitions superseded by skills + the built-in agent types; `senior-security` also lives on as `skills/senior-security`. |
| `skills/ui-lint` + `commands`-side entry | 2026-08-29 | 0 invocations since 2026-07-05 and already `"off"` in `skillOverrides` — dead in two places. Override line removed. |
| `skills/plane-control` | 2026-08-29 | 0 invocations since 2026-07-03. The `plane` MCP server is still configured, so the capability is live without the skill. |
| `skills/my/hetzner` + `commands/hetzner.md` | 2026-08-29 | 0 invocations since 2026-05-15. `skills/infra-ops` repointed at the shelf path; day-to-day work is plain `hcloud`. |
| `commands/api-test-suite.md` | 2026-08-29 | 0 invocations since 2026-07-25, no referrers. |
| `commands/to-gh-issue.md` | 2026-08-29 | 0 invocations since 2026-08-14, no referrers. |
| `commands/finder.md` + `commands/finder/open.md` | 2026-08-29 | 0 invocations since 2026-08-14, no referrers. |

## Deleted rather than shelved

- `skills/google-search-console` (2026-08-29) — a symlink to `~/.agents/skills/google-search-console`,
  already `"off"`, 0 invocations. Only the dangling pointer was removed; the skill itself still
  lives in `~/.agents` and is not managed by this repo. A relative symlink cannot survive the
  move into `.deprecated/`, so there was nothing to shelve.

