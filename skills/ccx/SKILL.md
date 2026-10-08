---
name: ccx
description: "Use when manual or verification work should go to the Codex sidekick, the native `codex` / `codex-high` subagent, instead of this session: user test / usertest, verify it in the UI, browser or simulator, computer use, explore the app, map routes or journeys, write, rework or run e2e or other tests. Also use when the user says 'ccx', 'codex high', 'codex xhigh' or 'sidekick', or asks to hand work to Codex."
codex-ignore: true
---

# ccx: hand the manual work to the `codex` subagent

This session orchestrates and writes app code. Driving, looking, mapping and test
writing go to the native `codex` subagent (Codex on gpt-6.1-sol), which carries the
sidekick contract: test files only, no git, one result Claude reads. Never dispatch
through the Codex CLI (`switcheroo codex run`, `cx`, `codex exec`).

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
- Inside a Workflow: `agentType: 'codex'`. With `isolation: 'worktree'` it runs in a
  fresh `.claude/worktrees/` copy of the session repo branched from local HEAD, never
  a worktree you prepared; name a prepared one in the brief instead.
- `usertest`: the agent runs the vitrinka `usertest` skill itself. `e2e-write` and an
  `e2e-run` that drives journeys: don't hand the agent the lead. Run the `e2e` skill
  here: it leads natively and dispatches its discovery agents and lane writers as
  `codex` agents. A plain suite run (`e2e-run` on specs, a grep or the suite) is one
  `codex` agent with that brief's second half.

- Spawn it with the Agent tool: `subagent_type: "codex"` (`"codex-high"` for "codex
  high" or "codex xhigh"), the brief from the templates below, in the background.
  Keep one agent per lane and continue it with `SendMessage`. Never spawn a fresh
  agent for each step: the agent keeps the selectors, seeds and conventions it has
  already found. A new lane gets a new agent.
- Its final message opens with `STATUS: done|blocked|failed`. After that come the
  summary, findings, files written, tests and the blocker. Act on it as the status
  table says.
- Don't edit app source while a `verify`, `usertest` or `e2e-run` lane is driving
  that worktree, because its verdicts become nondeterministic. Edit between turns,
  then continue it. `e2e-write` and `rework` are static (no app, no browser), so
  they may run alongside your edits: the tests follow the code.
- Never put secret values in a brief. Name the seed account or the onyx ref.

## Route

| Work | Goes to |
|---|---|
| user test / usertest, "QA this like a user" | sidekick, `usertest` brief |
| verify a change in the running web app or Expo app (browser, simulator) | sidekick, `verify` |
| computer use: native or desktop apps | sidekick, `computer-use` |
| explore the app, map routes, journeys or testID gaps, e2e discovery, other bulk read-only mapping | sidekick, `explore` |
| write e2e journeys and specs | the `e2e` skill, led here; its discovery agents and writers are `codex` agents |
| write unit or integration tests, rework broken specs | sidekick, `e2e-write` / `rework` |
| run e2e or other suites | sidekick, `e2e-run` |
| app source edits, fixes for findings, design, a one-grep code lookup mid-task | Claude, here (never routed) |
| judging pixels: a vitrinka board or journey review, visual verify of board takes or shots, anything that must read `get_card_image` or a PNG | Claude, here or a Claude agent (never routed) |

Codex receives tool-result images as `[image omitted]`, so a pixel-judging lane
there can only stop blocked. A vitrinka review can also run as
`/vitrinka:review … eve`: Eve judges server-side and the local pass re-verifies
against code, which needs no images.

Effort is `medium`. Use `codex-high` only when the user says "codex high" or "codex
xhigh".

## Status

| Status | Claude does |
|---|---|
| `done` | Fix the findings that need app source here, then do the commit duties. |
| `blocked` | The blocker gives the reason, evidence, fix hint and files. Fix it here (app source, seed, env), commit, then `SendMessage` "Fixed: <what> (<sha>). Continue." A human-only gate (sign-in, 2FA, payment): `/codrive` or ask the user, then continue it. |
| `failed` | Read the error. Continue once with a corrected brief. If it fails a second time, report it to the user with the error. A failed lane is not a reason to fall back. |
| ends `Codex account <name> could not take this turn (429)` | That account is rate-limited for now, not a failed brief: the turn never ran. Continue or respawn the lane natively once the limit clears, with fewer lanes running. A lone lane can hit it too. Never switch to the CLI or the fallback for it. |
| ends `No Codex account …` | Fall back. |

**Fallback** (no `codex` agent listed, or no Codex account left). Use one
`general-purpose` Agent with `model: "opus"` per lane. Give it the same brief plus
the contract essentials: test files only, no git, the same result shape. Keep the
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

## Brief templates

The brief carries only the job. Every brief states: **Goal** · **Scope**
(routes, files, `base..HEAD`, task id) · **App access** (URL or device, login, seed
roles) · **Done when** · the mode lines below.

- **usertest**: "Use the vitrinka `usertest` skill, lane 2: `vitrinka qa usertest
  start [--task <id>] [--app web] [--platform …] [--device …]`, then `case` /
  `board capture` / `verdict` per journey, then `finish --bugs intake`. (Lane 1
  instead when the target is a suite: `vitrinka qa run -- <test command>`.) Build
  the role matrix from the app's seeds first, and treat edge cases as the job. Fix
  nothing: a code bug is a `fail` case with its note plus a finding, and a bug that
  blocks the remaining cases means status blocked. Put the hand-back block `finish`
  printed into `summary`, links verbatim."
- **verify**: "Change: <what, files, sha>. In <URL at a 1440×810 viewport | Expo on
  <device> via the dev client>, check: 1. … 2. …. Dual-verify every mutation: the UI
  changed AND the backend accepted it (network 2xx, log or state endpoint). Make one
  finding per expectation that fails, with screenshot evidence."
- **computer-use**: "App: <name or window>. Do: <steps>. Expect: <outcomes>. Work
  in the background and never take the human's foreground. Any sign-in, 2FA,
  payment or consent gate means status blocked."
- **explore**: "Static and read-only: no browser, no device. Map <scope>: routes,
  actions with their testID or role, intents, 5–15-step journeys per persona,
  testID gaps, and conflicts (code vs copy, DTO or DB). Map the feature clusters one
  after another."
- **e2e-write** (no run): "Write or update <tests> for <scope> statically from
  source. No app, no browser or device, and never execute the runner. Lint and
  typecheck only."
- **rework** (no run): "<specs> broke because <app change, sha>. Update them to the
  new behavior (selectors, flows, fixtures). Never weaken an assertion to make it
  pass; behavior you believe is a bug is a finding. Lint and typecheck only."
- **e2e-run**: "Run <specs | --grep @e2e-<slug> | the suite> with the repo's runner, where the repo runs tests (Devbox when it has `devbox.yaml`), workers capped.
  Classify each failure. A spec bug: fix the spec and rerun it once. An app bug:
  record a finding with evidence and don't fix it. Report the counts in `tests`."

**When suites run.** While code is still changing, test lanes stay static. Do one
full `e2e-run` at the end of the work, or right after a risky change.

## Commit duties (Claude, when the lane ends)

The sidekick never commits.

1. **Check the diff.** The files and tests it reports written must be test files
   only, and `git status --short` in the worktree must show no app-source change you
   didn't make. Anything else breaches the contract: review it as a stranger's
   change, keep or revert that path, and tell the user.
2. **Commit the test files, path-scoped.** Follow the `push-all` §2 conventions:
   `git -C <wt> add -- <files>`, then commit, e.g. `test(e2e): <lane>`.
3. **Report.** Fix or file what the findings say, then report the result.
