---
name: readme-setup
description: "Interactive intention-first setup of a project's README.md + CLAUDE.md: explore, interview for intent, converge with what exists, ship."
disable-model-invocation: true
---

# readme-setup — README.md + CLAUDE.md that say what the project is FOR

Author or converge the project's README.md and CLAUDE.md so a fresh agent (or a
stranger) knows what the project is, who it serves, what problem it removes,
where it deploys and how mature each part is — well enough to make aligned
architecture and scope decisions. Tech-stack summaries are NOT the deliverable
(contract §The split). `$ARGUMENTS` may pin a repo path or narrow scope
("README only", "CLAUDE.md only").

`references/contract.md` is the authoring contract: file split, section shapes,
converge-and-merge rules, truth rules. Read it before step 3.

## 1. Explore before asking

Read in ONE batch: existing README / CLAUDE.md / AGENTS.md, `.claude/memory/`,
`docs/`, marketing or store copy (`apps/web`, landing pages), docs sites,
top-level layout, recent release notes / CHANGELOG, open PR titles. Build the
intention picture and list every claim you could NOT infer: personas and which
is the CURRENT focus, the problem in the owner's words, per-module maturity,
deployment targets and what each makes non-negotiable, monetization, security
stance, buyer/decider, what the project deliberately does not replace.

Inventory the existing docs line by line under the contract's **Converge,
don't discard** rules (keep verbatim / merge / relocate / drop). Carry the
inventory into step 2: the drop list is a question, not a decision.

## 2. Interview the gaps (AskUserQuestion, batched)

Ask ONLY what exploration could not fill; every question proposes the inferred
answer as the default option to confirm. Invite raw material: pasted chat/SMS
excerpts, pitch text, notes in any language — they are primary sources, keep
the owner's phrasing where it is sharper than yours. Minimum set when unknown:

- who each surface serves, which persona is the current focus, honest maturity
  per module ("the earliest module" beats silence);
- the problem story: what stays broken without this project, and what each
  persona stops doing / starts getting;
- the buyer/decider when the project is sold;
- deployment targets and the constraints each imposes;
- what it complements and never replaces;
- for a well-kept existing pair: confirm the drop list and which sections get
  targeted edits vs a rewrite.

Ambiguous or big scope → /qna.

## 3. Author under the contract

Write both files. Merge surviving content into the contract's shapes: targeted
edits when most of a file stays, a rewrite only when most of it changes. Verify
every claim against the tree while writing; fix stale facts found en route in
the same change.

## 4. Verify and ship

Fork-subagent review of the result: factual claims vs the tree; content lost
from the previous versions (negations, exact commands, laws, runbooks);
intention fidelity vs the interview and pasted material; consistency between
the two files and any public copy (marketing site, store listing). Fix its
findings inline. Do not stop for approval between review and shipping; the
interview was the approval. Ship through the repo's own change flow (worktree
+ PR where that is the law). Summary lists: what changed per file, every
deliberately dropped line, stale facts corrected, follow-ups found but out of
scope.
