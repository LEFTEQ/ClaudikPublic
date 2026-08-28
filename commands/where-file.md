---
disable-model-invocation: true
name: where-file
description: User asks where a file is, or you named a file they're meant to open but gave no clickable path — print the absolute path of the file(s) that actually matter.
---

Print the absolute path of the file(s) the user is meant to open — not an
inventory of everything touched.

1. Pick the deliverables: what the session produced for the user to read, run,
   review, or share. The file your last answer pointed at comes first. Usually
   1–3 lines; often exactly one.
2. Leave out incidental work — config tweaks, lockfiles, files you only read,
   scratchpad temporaries — unless one of those IS the thing they asked about.
3. Verify each path exists before printing it. If a file you named can't be
   found, say so and offer the closest match — never print an unverified path.
4. One line per file, absolute path first:

   /abs/path/to/file.md — what it holds, in a few words

No prose around the list.

$ARGUMENTS narrows or widens the pick (a name fragment, a directory, or "all"
for every file this session touched). Empty = the deliverables only.

The standing rule this encodes: when you name a file the user is meant to look
at, give its absolute path inline the first time. If they have to ask "where is
that?", the answer was incomplete.
