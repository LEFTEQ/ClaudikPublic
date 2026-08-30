---
disable-model-invocation: true
name: distill
description: "Rewrite an instruction file (skill, command, doc, rule, CLAUDE.md section) token-lean under the house doctrine — reviewer subagent passes to convergence, before/after metrics, confirmed write."
---

Distill `$ARGUMENTS` — a path, skill name, or command name — into its leanest faithful form. Empty → ask what to distill. Resolve bare names against `~/.claude/skills/` and `~/.claude/commands/`; plugin/marketplace clones are read-only — propose a diff, never write there.

## Doctrine

Write for a very smart model. Per line: would it act differently without this line? No → delete.

- Goal + constraints, not steps. Steps only where order genuinely matters or the operation is fragile (then exact commands, low freedom); high freedom everywhere else.
- Never explain why an instruction exists, narrate hypotheticals ("if X, that would Y"), or restate default behavior — verification, self-correction, brevity, scope discipline, think-first are already the model's defaults and the harness's instructions.
- Never instruct the model to echo or explain its reasoning in output.
- Compression is token-measured, clarity-first: cut filler, hedging, duplicate statements of one rule. A symbol replaces words only when genuinely fewer tokens and unambiguous ("/" usually qualifies; "→" and invented abbreviations usually don't). Never drop a not/never/only/except. Never add words.
- Consistent terminology throughout; no time-sensitive facts; references one level deep from SKILL.md; SKILL.md body < 500 lines.

Descriptions (frontmatter) — THE rule for every surface (to-skill, to-command, update-skill point here):
- Auto-invocable → `description` is the TRIGGER, not a summary (the property name misleads): third person, ONLY when-to-invoke — the situations, intents, and concrete terms that should fire it. What the skill does belongs in the body; a name that echoes the tool/command it wraps is itself a trigger term. This is the entire standing context cost — every session pays it.
- Manual-only → `disable-model-invocation: true` (drops it from model context entirely) + a short human-facing description for /help. Never spend description tokens saying "manual only".

## Flow

1. **Baseline.** Read the target (+ its `references/` for a skill). Token estimate per section: `wc -c` ÷ 4 — only relative deltas matter. Kill list: lines that explain why, narrate hypotheticals, or restate defaults.

2. **Reviewer passes.** Dispatch a subagent (session model) with the current text, the Doctrine above, and this brief:

   > You are an uncompromising instruction editor. Weigh every word. Return the shortest text preserving complete meaning — every instruction, negation (not/never/only/except), exact command, name, and number stays. Delete why-explanations, hypothetical narration, restated default model behavior, filler, hedging, duplicates. Reword to shorter equivalents per the doctrine's compression rule. Return the full rewritten file plus a cut list stating why each cut is safe.

   Re-estimate; feed the output back for another pass. Stop when a pass saves < 5% or the reviewer flags a clarity risk — typically 1–2 rounds. Don't return to the user between rounds.

3. **Frontmatter.** Apply the description doctrine. Flag any "Manual only:" description that was silently loading every session.

4. **Confirm + write.** Show the final draft, a before/after table (tokens per section, total, % saved), and the cut list. AskUserQuestion: Approve / Tweak / keep original. Never write unconfirmed. On approve: write, commit path-scoped (`chore(skills): distill <name>`).

Batch: `$ARGUMENTS` = a directory or `all` → rank by token count, propose the worst offenders, run each through the loop, one confirmation per file.
