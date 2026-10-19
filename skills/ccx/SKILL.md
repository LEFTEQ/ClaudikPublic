---
name: ccx
description: "Use when manual or verification work should go to the Codex sidekick, the native `codex` / `codex-high` subagent, instead of this session: user test / usertest, verify it in the UI, browser or simulator, computer use, explore the app, map routes or journeys, write, rework or run e2e or other tests, sweep one mechanical transformation across many source files (i18n `t()` extraction, renames, codemods). Also use when the user says 'ccx', 'codex high', 'codex xhigh' or 'sidekick', or asks to hand work to Codex."
codex-ignore: true
---

# ccx: hand the manual work to the `codex` subagent

This session orchestrates and authors every app change that takes judgment. Driving,
looking, mapping, test writing and mechanical source sweeps go to the native `codex`
subagent (Codex on gpt-6.1-sol), which carries the sidekick contract: test files only
unless the brief is a sweep, no git, one result Claude reads. Never dispatch through
the Codex CLI (`switcheroo codex run`, `cx`, `codex exec`).

**The user's explicit ask outranks the route.** When the user asks for Codex to do a
piece of work, it goes to Codex whatever this skill would route it to (UI, logic,
fixes included): quote their words in the brief, which lifts any contract rule the
ask conflicts with. Only their own words count, never Claude's inference.

**If you are the sidekick (a `codex` subagent), this skill is not for you.** Do the
brief yourself.

## The door: the `codex` subagent

A `cc` session with a Codex account registered carries two native subagents:
`codex` (medium) and `codex-high` (for "codex high" and "codex xhigh"). Only their
model turns bill a Codex account, and those fail over between accounts, except on a
burst rate limit, which ends the agent instead (see Status). Otherwise
they are ordinary subagents, with a row in the subagent view, background runs and
`SendMessage`. They exist when the Agent tool lists them. Rules: claude-switcheroo's
`docs/specs/2026-10-02-codex-subagent-decisions.md`.

- No `codex` agent listed means the session was not launched through `cc` with a
  Codex account, or predates the agents. Tell the user once that this session has no
  native sidekick (relaunch it through `cc`), then use the fallback below.
- The agent works in the worktree its brief names, spelled absolute; never rely on
  the shell's cwd.
- Inside a Workflow: `agentType: 'codex'` with the rendered schema as `schema`;
  the script cannot run a shell, so render its lanes first with `--batch` (The
  brief, below) and point each agent at its brief file. With `isolation: 'worktree'` it runs in a
  fresh `.claude/worktrees/` copy of the session repo branched from local HEAD, never
  a worktree you prepared; name a prepared one in the brief instead. The schema
  requires a non-empty `checked` list (each file or item the lane examined, with its
  verdict); the script treats a result with no findings and no
  checked entries as a failed lane, logs it and re-runs that lane as a Claude agent.
  The sidekick can answer an empty structured result without having reviewed anything.
- `usertest`: the agent runs the vitrinka `usertest` skill itself. `e2e-write` and an
  `e2e-run` that drives journeys: don't hand the agent the lead. Run the `e2e` skill
  here: it leads natively and dispatches its discovery agents and lane writers as
  `codex` agents. A plain suite run (`e2e-run` on specs, a grep or the suite) is one
  `codex` agent with a rendered `e2e-run` brief.

- Spawn it with the Agent tool: `subagent_type: "codex"` (`"codex-high"` for "codex
  high" or "codex xhigh"), the rendered brief (The brief, below), in the background.
  Keep one agent per lane and continue it with `SendMessage`. Never spawn a fresh
  agent for each step: the agent keeps the selectors, seeds and conventions it has
  already found. A new lane gets a new agent.
- Its final message opens with `STATUS: done|blocked|failed`, then the result the
  brief's schema shapes: summary, checked, findings, files written, tests and the
  blocker. Act on it as the status table says.
- Don't edit app source while a `verify`, `usertest` or `e2e-run` lane is driving
  that worktree, because its verdicts become nondeterministic. Edit between turns,
  then continue it. `e2e-write` (writes and reworks) is static (no app, no browser), so
  it may run alongside your edits: the tests follow the code. A `sweep` owns the
  files it scopes until it ends: Claude edits elsewhere, and no live lane drives that
  worktree meanwhile.
- Never put secret values in a brief (render refuses them). Name the seed account or
  the onyx ref.

## Route

| Work | Goes to |
|---|---|
| user test / usertest, "QA this like a user" | sidekick, `usertest` brief |
| verify a change in the running web app or Expo app (browser, simulator) | sidekick, `verify` |
| computer use: native or desktop apps | a desk job (`toolbox desk submit`, the `desk` skill): the desk worker runs the `computer-use` lane, so the native lock never lands in this session |
| explore the app, map routes, journeys or testID gaps, e2e discovery, other bulk read-only mapping | sidekick, `explore` |
| write e2e journeys and specs | the `e2e` skill, led here; its discovery agents and writers are `codex` agents |
| write unit or integration tests, rework broken specs | sidekick, `e2e-write` |
| run e2e or other suites | sidekick, `e2e-run` |
| mechanical source sweep: one spelled-out transformation over many files (i18n `t()` extraction, renames, codemods, import or API migrations) plus the type and test fixes it forces | sidekick, `sweep` |
| code review or adversarial verification of a diff | sidekick, `review` |
| UI and design work, new logic or behaviour, fixes for findings, a one-grep code lookup mid-task | Claude, here (routed only on the user's explicit ask) |
| judging pixels: a vitrinka board or journey review, visual verify of board takes or shots, anything that must read `get_card_image` or a PNG | sidekick when `vitrinka config reviewer` is `codex`; Claude here otherwise |

Codex lanes receive tool-result images through claude-switcheroo's bridge; an
older proxyd still answers `[image omitted]` (check `switcheroo proxyd status`).
A vitrinka review proves sight per run: sheet 1 of its review run prints a code
the lane must echo before sheet 2 or any filing, so a blind lane stops after one
image instead of reporting "no findings". `/vitrinka:review … eve` stays the
server-side alternative: Eve judges and the local pass re-verifies against code.

Effort is `medium`. Use `codex-high` only when the user says "codex high" or "codex
xhigh".

## Status

| Status | Claude does |
|---|---|
| `done` | Do `data.parentActions` (After the lane, below). |
| `blocked` | The blocker gives the reason, evidence, fix hint and files. Fix it here (app source, seed, env), commit, then `SendMessage` "Fixed: <what> (<sha>). Continue." A human-only gate (sign-in, 2FA, payment): `/codrive` or ask the user, then continue it. |
| `failed` | Read the error. Continue once with a corrected brief. If it fails a second time, report it to the user with the error. A failed lane is not a reason to fall back. |
| ends `Codex account <name> could not take this turn (429)` | That account is rate-limited for now, not a failed brief: the turn never ran. Continue or respawn the lane natively once the limit clears, with fewer lanes running. A lone lane can hit it too. Never switch to the CLI or the fallback for it. |
| ends `No Codex account …` | Fall back. |

A lane whose final message lacks the `STATUS:` line, or is empty or off-brief, may
have been stopped by claude-guards after three identical schema-invalid calls: the
harness reports that stop as a normal completion. Check before acting on it:
`claude-guards storms --session "$CLAUDE_CODE_SESSION_ID" --since <spawn time> --check`.
Exit 2 is a `failed` lane; its receipt names the tool and the missing parameters. An
empty input means the bridge dropped the arguments: `switcheroo proxyd status` before
continuing it, never a blind retry.

**Fallback** (no `codex` agent listed, or no Codex account left). Use one
`general-purpose` Agent with `model: "opus"` per lane. Give it the same rendered
brief: it already carries the contract and the result shape. Keep the
agent persistent through SendMessage for the lane and shut it down when the lane
ends. The `e2e` skill has its own Opus fallback, where Claude leads Phases 1-2 and
spawns one named Opus writer per lane.
Tell the user in one line:
"Codex unavailable: <lane> ran on an Opus subagent."

## Browser and device etiquette

- Every lane shares this session's playwright and chrome-devtools servers, which
  drive only the onyx browser of `$CLAUDE_CODE_SESSION_ID`. Never name another
  browser in a brief: a `<sid>-<lane>` one is unreachable, and claude-guards refuses
  the call.
- One live browser lane drives at a time; while it does, Claude and every other
  lane make no playwright, chrome-devtools or onyx browser calls. Two drivers on one
  page corrupt each other. Other lanes work statically meanwhile, or run their
  browser checks as Playwright specs where the repo runs tests (Devbox). The mobile
  (Appium) lane is always exactly one: there is one simulator.
- Screenshots go to `<ABS worktree>/.vitrinka/mcp/<name>`, spelled absolute: a
  relative name resolves in the session's launch dir, not the worktree
  (claude-guards `browser:screenshot-dir` refuses it there).
- Never stop or restart a browser a lane is using. Claude also leaves the simulator
  or the computer-use app alone while a lane is driving it.
- Spawn a driving lane (`verify`, `usertest`, `computer-use`, `e2e-run`) only after
  the runtime setup command has returned (`worktree:sim up`, a dev server's start):
  a lane that drives Appium while the simulator is still signing in breaks both.

## The brief

Render it; never hand-write one or append an ask to one:

```sh
toolbox ccx brief render --mode <mode> --goal "<…>" --scope "<routes, files, base..HEAD, task>" \
  --worktree <abs path> [--access "<URL, device or window, login, seed roles>"] \
  [--gate "<command>"] [--approved "<the user's words>"] [--ready "<command>"] --json
```

| mode | for | `--goal` carries |
|---|---|---|
| `explore` | mapping, e2e discovery, bulk read-only lookups | what to map |
| `verify` (`--access`; `--ready`) | a change in the running web or Expo app | the change (what, files, sha), then the numbered expectations |
| `usertest` (`--access`; `--gate` = a suite for lane 1; `--ready`) | user test, "QA this like a user": the lane runs the vitrinka `usertest` skill, its `finish` block comes back in `markdown` | the journeys and roles; the task id goes in `--scope` |
| `computer-use` (`--access` = the app or window; `--ready`) | native or desktop apps — rendered by `desk serve` inside the desk worker, never from a coding session | the steps, then the expected outcomes |
| `review` | code review or adversarial verification of a diff | what to judge it against |
| `e2e-write` | writing tests, reworking broken specs; static, never run | the tests; for a rework, the app change (sha) that broke them |
| `e2e-run` (`--gate` = the command, optional; `--ready`) | running specs, a grep or the suite | which specs |
| `sweep` (`--gate`) | one mechanical transformation | before → after with one worked example from this repo (`--scope`: globs and exclusions) |

`--ready "<command>"` (the driving modes) is a command that fails until the
runtime is up: the lane runs it first and stops `blocked` ("runtime not ready")
when it fails, never setting the runtime up itself. A repo's `toolbox.config.ts`
may declare it per mode (`ccx.ready`), so leave it out there.

`data.brief` is the prompt and asks the lane only for its result; `data.schema`
is a Workflow's `schema`; `data.parentActions` is yours: a driving mode's `ready`
before you spawn it, the rest once the lane returns.

**Many lanes, a Workflow's included:** render them in one call, never a bash loop,
into a directory outside the lanes' worktrees:

```sh
toolbox ccx brief render --batch lanes.json --out "$TMPDIR/ccx/<run>" --worktree <abs path> --json
```

`lanes.json` is `[{key, mode, goal, scope, worktree?, access?, gate?, approved?, ready?}]`;
each lane lands as `<key>.md` and `<key>.schema.json`, and `data` lists the lanes
(`path`, `ok`, `diagnostics`), the `schemas` per mode and the `parentActions`
groups. A refused lane leaves the others rendered (exit 2): fix its flags and
re-run. Pass `data.lanes` and `data.schemas` as the Workflow's `args` and point
each agent at its file:
`agent("Your complete brief is the file <path>. Read it first and carry it out exactly.", {agentType: 'codex', schema: args.schemas[lane.mode]})`.
An `ASK_FORBIDDEN` refusal names the route: a commit, push, PR or file is the
parent's after the lane, a rollout or app-source authoring stays here or goes to
an unnamed Claude subagent. That subagent's type follows this session's runtime: no
`subagent_type` on Claude, `subagent_type: "opus"` on Codex, where `general-purpose`
and `claude` inherit Codex; its model is read as `claude-*` from
`subagents/agent-<id>.jsonl` (`.message.model`) before its work counts, and with no
Claude type listed the work stops and is asked. The user's own words asking Codex to author source
pass as `--approved "<their words>"`, which lifts that rule alone. Contract:
the tools repo `docs/ccx.md`.

A large sweep splits into lanes over disjoint globs in one worktree; Claude runs
the whole gate once they all end.

**When suites run.** While code is still changing, test lanes stay static. Do one
full `e2e-run` at the end of the work, or right after a risky change.

## After the lane (Claude)

Read the result without the transcript: `toolbox ccx result <agentId> --out <file>
--json` (a Workflow agent: its label, `toolbox ccx result lane:routes --run <runId>
--out <file> --json`) writes the findings and the map to the file and answers only
the status, the counts and the path; `--field json|findings` writes the object or
its findings instead. A label two runs share is refused (`RESULT_AMBIGUOUS`) with
an exact command per agent: pick one, or add `--run`. Open the file only for what
a decision needs.

The sidekick never commits. Do `data.parentActions` in order: they read the
result (an empty `checked` is a failed lane), hold the diff to the lane's contract
(a path outside it is a stranger's change: review it, keep or revert it, and tell
the user), commit path-scoped (`push-all` §2 conventions), write any file the
result should become and land the work. Then fix or file what the findings say,
and report the result.
