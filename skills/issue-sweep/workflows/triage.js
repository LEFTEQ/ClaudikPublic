export const meta = {
  name: 'issue-sweep-triage',
  description: 'Triage one slice of an issue sweep: Codex lanes verify each issue against the frozen base, a skeptic re-checks every not-live verdict',
  whenToUse: 'Phase 1 of the issue-sweep skill. args = the data of "issues slice --phase triage --json"; run the copy "issues init" seeded into the run directory.',
  phases: [
    { title: 'Triage', detail: 'one read-only Codex lane per batch of issues' },
    { title: 'Skeptic', detail: 'one Codex lane per triage lane that found not-live verdicts' },
  ],
}

// args: {run, self, lanes: [{lane, skeptic, repo, issues, triageDone?}], remaining}
// The ledger is the result: every lane's output is validated and recorded by
// the applet. This script returns only a coverage summary.
if (!args || !args.run || !args.self || !Array.isArray(args.lanes) || args.lanes.length === 0) {
  throw new Error('args: pass the data of `issues slice --phase triage --json`')
}
if (args.lanes.length > 4) {
  log(`${args.lanes.length} triage lanes exceed the 4-per-phase cap; the slice should never produce this`)
}

const STR = { type: 'string' }
const STRS = { type: 'array', items: STR }
const LANE_RESULT = {
  type: 'object',
  properties: {
    lane: STR,
    state: { type: 'string', enum: ['done', 'empty', 'invalid', 'blocked', 'failed', 'unavailable', 'running'] },
    recorded: STRS,
    missing: STRS,
    notLive: STRS,
    errors: STRS,
    note: STR,
  },
  required: ['lane', 'state', 'recorded', 'missing', 'notLive', 'errors'],
}

const drive = (lane, kind) => `You drive ONE Codex lane of an issue sweep. You never read issue text, edit files or judge verdicts yourself: the lane does, and the \`${args.self}\` applet validates and records its output.
RUN=${args.run}
1. ${args.self} lane run --run "$RUN" --lane ${lane} --kind ${kind} --json
   data.state "empty": return state "empty".
2. Repeat \`${args.self} lane wait --run "$RUN" --lane ${lane} --max 110 --json\` (each call blocks up to 110 s) until data.state is not "running". A lane takes many minutes; never sleep, tail or read its files yourself.
3. On the final data.state:
   - "invalid": once, ${args.self} lane run --run "$RUN" --lane ${lane} --kind ${kind} --fix --json, then step 2 again. A second "invalid" is final.
   - "unavailable" (no Codex account): do the lane yourself. Read data.brief and follow it exactly (read-only: no edits, no git writes), write the JSON it asks for to data.out, then ${args.self} lane ingest --run "$RUN" --lane ${lane} --json and use its data.
   - "blocked" or "failed": final; put the diagnostic detail and fix in note.
4. Return lane "${lane}", the final data.state and data's recorded, missing, notLive and errors arrays (empty arrays when absent), plus note.`

const results = await pipeline(
  args.lanes,
  sl => sl.triageDone
    ? Promise.resolve({ lane: sl.lane, state: 'done', recorded: [], missing: [], notLive: [], errors: [], note: 'triage recorded earlier; skeptic owed' })
    : agent(drive(sl.lane, 'triage'), { label: `triage:${sl.lane}`, phase: 'Triage', schema: LANE_RESULT }),
  (tri, sl) => {
    if (!tri || tri.state !== 'done') return { sl, tri, sk: null }
    if (!sl.triageDone && tri.notLive.length === 0) return { sl, tri, sk: null }
    return agent(drive(sl.skeptic, 'skeptic'), { label: `skeptic:${sl.skeptic}`, phase: 'Skeptic', schema: LANE_RESULT })
      .then(sk => ({ sl, tri, sk }))
  },
)

const summary = []
for (const r of results) {
  if (!r) continue
  const { sl, tri, sk } = r
  const missing = tri && tri.state === 'done' && !sl.triageDone
    ? sl.issues.filter(k => !tri.recorded.includes(k))
    : []
  if (!tri || tri.state !== 'done') log(`coverage gap: ${sl.lane} ended ${tri ? tri.state : 'with no result'}; its ${sl.issues.length} issue(s) stay untriaged`)
  else if (missing.length) log(`coverage gap: ${sl.lane} did not record ${missing.join(', ')}`)
  if (sk && sk.state !== 'done' && sk.state !== 'empty') log(`skeptic gap: ${sl.skeptic} ended ${sk.state}`)
  summary.push({
    lane: sl.lane,
    triage: tri ? tri.state : 'none',
    recorded: tri ? tri.recorded.length : 0,
    missing,
    skeptic: sk ? sk.state : 'not owed',
    notes: [tri && tri.note, sk && sk.note].filter(Boolean),
  })
}
const dropped = args.lanes.length - results.filter(Boolean).length
if (dropped) log(`coverage gap: ${dropped} lane(s) returned nothing`)
return { lanes: summary, next: `${args.self} status --run "${args.run}" --json` }
