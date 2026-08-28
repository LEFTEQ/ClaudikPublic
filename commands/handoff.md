---
disable-model-invocation: true
---
# Claude Command: Session Handoff

Snapshot the **current session** so a **fresh session** can pick up the work without re-discovering context. Use when you're running low on context, switching to a colleague's machine, ending the day mid-task, or just want a clean break.

General-purpose: any in-flight work — refactors, debugging, planning, multi-step features, UI-test sweeps, anything.

## Usage

```
/handoff                                  # auto-derive slug, full memory pass
/handoff <slug>                           # explicit slug (kebab-case)
/handoff --no-memory                      # skip memory writes, just the file
/handoff <slug> --no-memory               # combine
```

## Arguments

$ARGUMENTS

## What this does — two layers

**1. Persistent (memory).** Scan this conversation for material the auto-memory system should have captured but missed: user preferences expressed, corrections received, project facts learned, references to external systems. Write those to `~/.claude/projects/<project-slug>/memory/` using the format documented in the global CLAUDE.md auto-memory section, and append pointers to `MEMORY.md`. Skip with `--no-memory`.

**2. Ephemeral (handoff file).** Write a single concise file at `~/.claude/handoffs/<project-slug>/<slug>.md` that captures the in-flight session state — open tasks, files touched, decisions made, next concrete step. The fresh session reads this and resumes.

The split matters: memory is durable knowledge that stays useful across many future sessions. The handoff file is single-use scaffolding for the very next session and should be deleted after consumption.

## Output location

```
~/.claude/handoffs/<project-slug>/<slug>.md
```

**`<project-slug>`** derivation (kebab-case repo dir name):
1. If in a git repo: `basename "$(git rev-parse --show-toplevel)"` → slugify
2. Else: `basename "$(pwd)"` → slugify
3. Slugify: lowercase, non-alphanumeric → `-`, collapse repeats, trim ends

**`<slug>`** resolution:
1. Use the arg if given (kebab-case, no spaces)
2. Else derive from `git branch --show-current`: strip leading `feature/`, `feat/`, `fix/`, `bugfix/`, `chore/`, `refactor/`, `hotfix/`, `release/`, `task/` (case-insensitive); replace `/`, `_`, spaces with `-`; lowercase
3. Else if branch is `main` / `master` / `develop` / `dev` / `trunk` / detached-HEAD: `handoff-$(date +%Y%m%d-%H%M)`

Don't ask the user to confirm — print the chosen slug in the resume prompt.

## Procedure

### Step 1 — Resolve slug + project, ensure dir

```bash
project=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g')
mkdir -p ~/.claude/handoffs/"$project"
```

Slug per the chain above. If the file already exists at `~/.claude/handoffs/$project/$slug.md`, overwrite silently and prepend `(overwrote previous handoff from <date>)` to the resume-prompt output.

### Step 2 — Memory pass (skip if `--no-memory`)

Walk this conversation. Identify candidates per `~/.claude/skills/my/memory/SKILL.md` (types, homes, derivability gate):

- **Feedback** — corrections the user made ("don't do X", "do Y instead"), or non-obvious approaches the user explicitly approved. Save as `feedback-<topic>.md` (personal home) with `Why:` and `How to apply:` lines.
- **Project** — non-derivable facts about ongoing work, deadlines, why a decision was made. Save as `project-<topic>.md` (team home). Convert any relative dates to absolute.
- **Reference** — pointers to external systems mentioned (dashboards, tickets, doc URLs) → `reference-<topic>.md` (team home).
- **User** — role / context details about the user's responsibilities or knowledge (personal home).

For each: write the memory file, then append a trigger-phrased one-line pointer to that home's `MEMORY.md`. **Don't duplicate** — read existing memory files first; update an existing one rather than creating a near-duplicate.

Skip if `--no-memory` was passed (caller is doing memory work separately, e.g. via `/memory save`).

### Step 3 — Capture session state for the handoff file

Run these to seed your understanding:
- `git status --short` — uncommitted changes
- `git log --oneline -10` — recent commits (to identify what's already shipped vs. in-flight)
- `git diff --name-only HEAD~$(git rev-list --count HEAD ^@{upstream} 2>/dev/null || echo 0)..HEAD 2>/dev/null` — files changed on the current branch since divergence (best-effort)

For files-touched-this-session: prefer your tool-use history (Edit/Write/NotebookEdit calls in THIS conversation) over `git diff`. The session may have touched files not yet staged, and `git diff` includes earlier branch work.

Don't dump raw command output into the handoff. Synthesize.

### Step 4 — Write the handoff file

Write `~/.claude/handoffs/<project-slug>/<slug>.md` using the template below. Aim for ≤200 lines; if you're over, you're including too much. Trim ruthlessly.

### Step 5 — Print the resume prompt

Print exactly this block (no other commentary). The user will paste it into the fresh session:

```
Handoff written: ~/.claude/handoffs/<project-slug>/<slug>.md
   <N tasks open, M files touched, K decisions logged>
   <(overwrote previous handoff from <date>) — only if applicable>

In a fresh session, paste:
  Read ~/.claude/handoffs/<project-slug>/<slug>.md and continue
  from the "Next concrete step" section. Treat the plan as a
  hypothesis, not law: verify it against the current repo state,
  and push back if you know — or find out — a better way (run
  deep research when the doubt is real and fresh sources would
  settle it). After confirming you've loaded the context, ask me
  one clarifying question if anything is unclear before acting.
```

## Handoff file shape

Write exactly this skeleton, filled in. Section names matter; the fresh session scans by header.

```markdown
# Handoff: <slug>

**Created:** <YYYY-MM-DD HH:MM> (<project-slug>)
**Branch:** <branch> @ <short-sha>
**Working tree:** <clean | dirty: N files modified, M untracked>

## Intent

<2–4 sentences. What were we doing this session and why? Lead with the user-facing goal, then the immediate sub-goal we were on when the session ended. Not a changelog.>

## Where we are right now

- **Last meaningful action:** <one line — what just happened, e.g. "wrote ui-sweep-release SKILL.md, edited ui-sweep Phase 1; tests not run">
- **Branch state:** <clean / staged but uncommitted / unstaged changes / unpushed commits — with file count>
- **Stopping reason:** <natural break | low context | user said pause | blocker:<id>>

## Open tasks

(From TodoWrite if any, plus anything queued in the conversation. Use checkboxes; preserve in-progress markers.)

- [ ] <task — concrete, actionable>
- [-] <task in progress — what's done so far, what's left>
- [x] <recently completed — keep for context, don't dump everything>

## Files touched this session

(Files YOU edited / wrote in THIS conversation. NOT a `git diff` dump.)

- `path/to/file.ts` — <one line: what changed and why>
- ...

## Decisions made (with the why)

(Calls that won't be obvious from reading the resulting code. Skip the obvious.)

- **<decision>** — <one-line rationale>. <Optional: alternatives considered, in parens>
- ...

## Important context not in code

(Things the fresh session can't derive from the repo: user preferences specific to this work, open questions answered by best-guess, external dependencies mentioned, plans referenced.)

- ...

## Next concrete step

<ONE specific action the fresh session should take first. Not a list. Not a plan. The single thing.>

<Then, in a sub-bullet, the immediate follow-on so they have direction after step 1.>

**Plan confidence:** <settled | probable | tentative> — <one line: what's verified vs. assumed, and what's worth re-checking or pushing back on. Tentative + high-stakes → tell the fresh session to research the open question before building.>

## Related artifacts

- `<path>` — <plans, designs, related handoffs/sweeps the fresh session should know exist>
- ...

## Out of scope (don't pursue these)

(Anything explicitly punted, so the fresh session doesn't accidentally "fix" or "complete" it.)

- ...
```

## Hard rules

- **No secrets.** Don't include API keys, tokens, .env values, customer PII, anything from secret-managed paths. If a decision involved a secret, write `<value redacted — see <env-var or vault>>`.
- **No verbatim transcript.** The conversation is gone. Synthesize. A fresh session does not need to re-read what the user said; it needs the resulting state and next step.
- **No `git diff` dump.** Synthesize the file list. Numbers and patches go stale; intent doesn't.
- **≤200 lines target.** Bigger means you're including too much. Trim aggressively.
- **Auto-overwrite.** Existing handoff with the same slug → overwrite silently, note in resume prompt. Handoffs are ephemeral; staleness is a feature, not a bug.
- **One next step.** The "Next concrete step" section is ONE action. If you can't pick one, ask the user before writing the handoff. A list of 5 things isn't a next step, it's an unfinished plan.
- **The plan is a hypothesis, not law.** Always state plan confidence honestly — the receiving session is instructed to verify and push back, and a handoff that oversells certainty defeats that. Never mark "settled" what you didn't verify this session.

## Don't rationalize

- "I'll dump `git diff` and `git log` raw, that's faster" → no. The fresh session loses 80% of the value if you skip synthesis. The whole point is compressing context, not relocating it.
- "User didn't say `--no-memory`, but I'll skip it because there's nothing to save" → run the pass anyway; if you genuinely find nothing, write nothing. The act of looking is part of the discipline.
- "Open tasks list is empty, so the fresh session has nothing to do" → no. If there are no tasks, there's no reason to hand off. Either capture what's actually open or ask the user before writing.
- "I'll include the full conversation summary as 'Important context'" → no. Summary ≠ context. Context = facts the next session can't derive from code or docs. If it's in the diff, in CLAUDE.md, or in committed plans, omit it.
- "The slug clash with an old handoff means I should append `-2`" → no. Auto-overwrite. Old handoff is stale by definition; preserving it pollutes the directory.
- "Next concrete step is unclear, I'll write 'continue where we left off'" → no. That's not actionable. Pick something specific, even if it's just "re-read X and decide between Y and Z". If you genuinely can't pick, ask the user.
- "I'll skip the resume-prompt block to save tokens in chat" → no. The resume prompt is the user's bridge to the fresh session. Without it they have to construct it themselves. Print it.
- "Memory pass overlaps `/memory prune`, I'll skip it" → no. This command captures NEW facts from the session; `prune` consolidates existing files. They complement.

## Red flags — STOP

- Handoff file is >250 lines → you're padding. Cut.
- "Open tasks" has 0 entries AND "Files touched" has 0 entries → you're handing off an empty session. Confirm with user before writing.
- About to write `git diff` output verbatim → stop. Synthesize.
- About to include the user's name, project secrets, or paths inside `~/.ssh/` etc. → stop. Redact.
- "Next concrete step" is a paragraph → split it. The first sentence is the next step; everything else is the section after it.

## What this command is NOT

- A code review — see `/review`
- A plan — see `/autonomous`
- A persistent project doc — that goes in `CLAUDE.md` or `docs/`
- A memory maintenance pass alone — see `/memory prune`

## Quick reference

| Layer | Where | Lifetime | Format |
|---|---|---|---|
| Persistent | `~/.claude/projects/<project>/memory/*.md` + `MEMORY.md` | Forever (auto-loaded) | Per global auto-memory rules |
| Ephemeral | `~/.claude/handoffs/<project>/<slug>.md` | Single-use; delete after consumption | This template |
