# pr-body — the PR description contract

Shared by `prc`, `prm` and `ensure-pr`. Every PR these skills open **or watch** carries
a body written to this contract.

Write for a reader with **zero context** — the repo owner months later, deciding *"is
this still worth merging, and what does merging it cost me?"*. They need: what problem
this solves → what it does → what they must do around the merge. Never a file-by-file
inventory (the Files tab is one).

## Anti-patterns

| ✗ Don't | ✓ Do |
|---|---|
| Open with a bullet per changed file | Open with the problem in plain prose |
| `--fill` / a pasted commit log | A written *why*, then a written *what* |
| Internal shorthand as load-bearing text (`Implements D2/D3`) | Say the thing; cite the spec/board as a link |
| Describe the code (`adds enhanceSnippet()`) | Describe the behaviour the user gets |
| Silence on migrations / env vars / flags | An explicit section, `None.` when empty |

Jargon test: a sentence that needs the diff open to parse is implementation detail —
move it below the fold or cut it.

## Required shape

```markdown
<One or two sentences: what this PR is for, in plain language.>

## Why

The problem, bug, or goal — what is wrong today, what stays broken if this never
merges. Link the issue/spec/board here.

## What changes

Behaviour, from the outside in — grouped by user-visible surface, not by file. Two to
six bullets. Call out changed existing behaviour vs new behaviour.

## Before merging

Anything that must happen FIRST, or `None.`

## After merging

Anything the merge does not do by itself, or `Nothing required.`

## Verification

How this was actually proven — tests, hands-on QA. Be honest about what was NOT covered.
```

`## Before merging` and `## After merging` are **never omitted** — an explicit `None.`
tells the reader the question was asked. An optional `<details>` block with
implementation notes may follow, never precede, these sections.

## The action-item lens

Sweep the diff before writing the two action sections (same irreversibles lens as
`auto-audit.md` §4, asking *"what must a human DO about it?"*):

| Category | Look for | Lands in |
|---|---|---|
| **Env vars / secrets** | New/renamed keys, changed defaults, new required credential | Before |
| **DB migrations** | Migration files, DDL, index builds | After — plus backup reminder when destructive |
| **Client data** | Backfills, repair scripts, re-indexing, cache invalidation | After, with the exact command |
| **Feature flags** | A flag this PR reads or flips | Before (create) / After (flip) |
| **Config & infra** | compose, nginx, Dockerfile, CI, cron | Whichever applies; name the file |
| **Deployed clients** | API/shape change a mobile app or other service consumes | Before — the consumer ships first |
| **Package publish** | Version bump needing `npm publish` / a tag | After |
| **Merge order** | A PR that must land first, a stacked branch | Before, linked |
| **Manual verification** | Something only a human on prod can confirm | After |

**Deploy-on-merge repos** (merge to default = ship — vitrinka via Deployik, for one):
anything the code needs to boot — env vars above all — is a **Before merging** item,
never After. Say so: `⚠️ merging deploys — VITRINKA_SMTP_CA must be set in production first.`

## Keeping it true (`prm`)

The body describes the PR **as it will merge**. Rewrite (`gh pr edit <N> --body-file <f>`)
when a round uncovers/retires a post-merge step, moves the scope, or stales
`Verification`. Routine churn needs no edit. Human-edited prose stays theirs — only the
action sections may be appended to. A stale `After merging` is worse than none.

## Worked example

The vitrinka install-snippet PR (#252), rewritten from a file-by-file log:

```markdown
Anyone connecting an agent to vitrinka had to hand-edit the install command —
copy it, then find and replace the workspace, the base URL and a token they had
to mint somewhere else first. This makes those values editable in the snippet
itself, and mints the token for you.

## Why

The `/connect` page shipped copy-paste commands with placeholder text in them.
Every new agent hookup meant copy → paste → hunt for `<your-token>` → open
Settings in another tab → mint a token → paste it back. It is the first thing a
new user does and it was the worst-feeling minute of the product.

Spec: `docs/specs/2026-08-12-install-snippet-decisions.md` · board `b/456`

## What changes

- **Install commands are editable in place.** Click an underlined value, type,
  Tab to the next one, Esc restores the placeholder. Copy gives you the resolved
  command, not the template.
- **`/connect` fills in what it knows** — scope, base URL and token on the MCP
  tab; `--base` and the operator name on the CLI tab.
- **Settings → Tokens can mint and fill in one step.** The filled snippet is the
  one-time reveal — the same rule as the existing mint form.
- **Works with JavaScript off**, where the values render as plain selectable text.

## Before merging

None. No new env vars, no config, no migration.

## After merging

Nothing required. Ships with the normal deploy; no flag to flip.

## Verification

Hands-on against a local dev server: edited vars on `/connect` (Tab cycling, Esc
restore, resolved copy text), and minted a real `vks_…` token from Settings that
landed both in the command and in the tokens table. `go test ./internal/site
./internal/web` green.

Not covered: no e2e test drives the editing interaction — the guard is
`TestConnectHasEditableSnippetVars`, which only asserts the server-rendered markup.
```
