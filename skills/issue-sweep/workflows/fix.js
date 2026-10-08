export const meta = {
  name: 'issue-sweep-fix',
  description: 'Fix one slice of an issue sweep: a failing test first, then fix and independent verify rounds per PR group, then the PR',
  whenToUse: 'Phase 2 of the issue-sweep skill, after the gate. args = the data of "issues slice --phase fix --json"; run the copy "issues init" seeded into the run directory.',
  phases: [
    { title: 'RED', detail: 'Codex writes and runs the failing test in the group worktree' },
    { title: 'Fix', detail: 'a Claude fixer authors and commits the fix' },
    { title: 'Verify', detail: 'the same Codex thread re-runs RED and the gates, reviews, and the PR opens on acceptance' },
  ],
}

// args: {run, self, maxRounds, maxAgents, groups: [{group, repo, title, worktree, lane, issues, stage: red|fix|verify, round}], remaining}
// Groups run concurrently; within a group every stage is sequential, so no
// source edit ever happens while its Codex lane drives the worktree. The
// ledger is the result; this script returns only per-group outcomes.
if (!args || !args.run || !args.self || !Array.isArray(args.groups) || args.groups.length === 0) {
  throw new Error('args: pass the data of `issues slice --phase fix --json`')
}
const MAX_ROUNDS = args.maxRounds || 3
const MAX_AGENTS = args.maxAgents || 10
let spent = 0
const afford = n => spent + n <= MAX_AGENTS
log(`${args.groups.length} group(s), agent budget ${MAX_AGENTS}`)

const STR = { type: 'string' }
const STRS = { type: 'array', items: STR }
const STATE = { type: 'string', enum: ['done', 'empty', 'invalid', 'blocked', 'failed', 'unavailable', 'running'] }
const RED_RESULT = {
  type: 'object',
  properties: { lane: STR, state: STATE, reproduced: STRS, notReproduced: STRS, errors: STRS, note: STR },
  required: ['lane', 'state', 'reproduced', 'notReproduced', 'errors'],
}
const VERIFY_RESULT = {
  type: 'object',
  properties: {
    lane: STR,
    state: STATE,
    accepted: { type: 'boolean' },
    round: { type: 'integer' },
    errors: STRS,
    pr: { type: 'object', properties: { number: { type: 'integer' }, url: STR }, required: ['number', 'url'] },
    note: STR,
  },
  required: ['lane', 'state', 'accepted', 'errors'],
}
const FIX_RESULT = {
  type: 'object',
  properties: { state: { type: 'string', enum: ['fixed', 'pushback', 'blocked'] }, note: STR },
  required: ['state', 'note'],
}

const waitLoop = (lane, kind, extra) => `1. ${args.self} lane run --run "$RUN" --lane ${lane} --kind ${kind}${extra} --json
2. Repeat \`${args.self} lane wait --run "$RUN" --lane ${lane} --max 110 --json\` (each call blocks up to 110 s) until data.state is not "running". A lane takes many minutes (test suites run inside it); never sleep, tail or read its files yourself.
3. On the final data.state:
   - "invalid": once, ${args.self} lane run --run "$RUN" --lane ${lane} --kind ${kind}${extra} --fix --json, then step 2 again. A second "invalid" is final.
   - "unavailable" (no Codex account): do the lane yourself. Read data.brief and follow it exactly (it says which files you may write; never app source, never git writes), write the JSON it asks for to data.out, then ${args.self} lane ingest --run "$RUN" --lane ${lane} --json and use its data.
   - "blocked" or "failed": final; put the diagnostic detail and fix in note.`

const driveRed = g => `You drive the RED lane of one PR group of an issue sweep. You never edit files or judge results yourself: the Codex lane writes and runs the failing tests, the \`${args.self}\` applet validates and records them.
RUN=${args.run}
${waitLoop(g.lane, 'red', '')}
4. Return lane "${g.lane}", the final data.state and data's reproduced, notReproduced and errors arrays (empty when absent), plus note.`

const driveVerify = (g, round) => `You drive verify round ${round} of one PR group of an issue sweep. You never edit files or judge results yourself: the Codex lane re-runs the tests and gates and reviews the diff, the \`${args.self}\` applet decides acceptance fail-closed.
RUN=${args.run}
${waitLoop(g.lane, 'verify', ` --round ${round}`)}
4. If data.accepted is true: ${args.self} pr --run "$RUN" --group ${g.group} --apply --json opens the PR (vitrinka tasks, push, PR). Put its data.pr {number, url} in pr. If it fails, keep accepted true, leave pr out and put the diagnostic in note: the orchestrator retries it.
5. Return lane "${g.lane}", the final data.state, accepted (false unless data.accepted is true), round ${round}, errors, pr when opened, and note.`

const fixPrompt = (g, round) => `You author fix round ${round} for one PR group of an issue sweep: ${g.title} (${g.issues.join(', ')}).
RUN=${args.run}
1. ${args.self} fix brief --run "$RUN" --group ${g.group} --json: data.brief is an absolute path. Read it and do exactly what it says, working only inside data.worktree (cd into it in a subshell for every command). It carries the issues, the failing tests you must make pass without editing them, any verify findings to answer, and the commit rules.
2. Finish with ${args.self} fix record --run "$RUN" --group ${g.group} --state fixed|pushback|blocked --note <a file you wrote outside the worktree with your summary> --json. On an error diagnostic, fix its cause and record again.
3. Return state (fixed, pushback or blocked) and note (one paragraph: what changed, or the evidence of your push-back, or the blocker).`

const outcomes = await pipeline(
  args.groups,
  async g => {
    if (g.stage !== 'red') return { g, red: null }
    if (!afford(1)) return { g, stop: 'budget' }
    spent++
    const red = await agent(driveRed(g), { label: `red:${g.group}`, phase: 'RED', schema: RED_RESULT })
    return { g, red }
  },
  async s => {
    const g = s.g
    if (s.stop) return { group: g.group, state: s.stop }
    if (s.red) {
      if (s.red.state !== 'done') return { group: g.group, state: s.red.state, note: s.red.note }
      if (s.red.reproduced.length === 0) return { group: g.group, state: 'dropped', note: `nothing reproduced: ${s.red.notReproduced.join(', ')}` }
      if (s.red.notReproduced.length) log(`${g.group}: ${s.red.notReproduced.join(', ')} did not reproduce and leave the group`)
    }
    let round = g.stage === 'red' ? 1 : g.round
    let needFix = g.stage !== 'verify'
    while (round <= MAX_ROUNDS) {
      if (!afford(needFix ? 2 : 1)) return { group: g.group, state: 'budget', round }
      if (needFix) {
        spent++
        const fix = await agent(fixPrompt(g, round), { label: `fix:${g.group}#${round}`, phase: 'Fix', schema: FIX_RESULT })
        if (!fix) return { group: g.group, state: 'failed', round, note: 'fixer returned nothing' }
        if (fix.state === 'blocked') return { group: g.group, state: 'blocked', round, note: fix.note }
      }
      spent++
      const ver = await agent(driveVerify(g, round), { label: `verify:${g.group}#${round}`, phase: 'Verify', schema: VERIFY_RESULT })
      if (!ver || ver.state !== 'done') return { group: g.group, state: ver ? ver.state : 'failed', round, note: ver && ver.note }
      if (ver.accepted) return { group: g.group, state: ver.pr ? 'pr-open' : 'verified', round, pr: ver.pr, note: ver.note }
      round++
      needFix = true
    }
    return { group: g.group, state: 'escalated', round: MAX_ROUNDS }
  },
)

const done = outcomes.filter(Boolean)
if (done.length < args.groups.length) log(`coverage gap: ${args.groups.length - done.length} group(s) returned nothing`)
for (const o of done) {
  if (o.state === 'budget') log(`${o.group}: agent budget reached; the next fix slice resumes it`)
  if (o.state === 'escalated') log(`${o.group}: fixer and verifier still disagree after ${MAX_ROUNDS} rounds: bring it to the human`)
}
return { groups: done, agents: spent, next: `${args.self} status --run "${args.run}" --json` }
