---
disable-model-invocation: true
name: recommend
description: "User asks what you'd recommend / what the options are — stop working and hand back a decision brief: real options with costs, one named recommendation, one next step."
---

The user is deciding, not delegating. Stop implementing.

Build the brief from THIS session's context — what was tried, what failed, what
constraints surfaced. Don't re-investigate from scratch. If a missing fact would
change the answer, name it in one line and proceed under a stated assumption.

1. **The decision** — one or two sentences on what actually has to be chosen.
   Not a recap of the session.
2. **2–4 options** — each with: what it concretely means (files, commands,
   scope), what it costs, and what it forecloses. Include the smallest / do-
   nothing option when it's real. No strawmen: every option listed is one you'd
   defend if picked.
3. **Recommendation** — one option, named, with the reason it beats the runner-up
   in a sentence. If the choice hinges on something only the user knows, say what
   that is and give the recommendation for each branch.
4. **Next step** — the single first action if they take it.

Rules:
- Rank by what matters here — blast radius, reversibility, effort, how it fails —
  not a generic rubric.
- Prose and short lists. No comparison table unless >3 options on >3 axes.
- Two real options beat three padded ones.
- Nothing gets implemented until they pick. Exception: one cheap reversible
  diagnostic that would settle which option is right — run it, then present.

`$ARGUMENTS` narrows the scope (a specific issue, file, or constraint to weigh).
Empty = the most recent unresolved issue in the session.
