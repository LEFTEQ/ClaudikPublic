# The feature ledger — field contract

A feature is one vitrinka epic. Epics carry the project's `feature` field preset. `list {kind: "field", project}` shows the definitions (`preset: "feature"`, `appliesTo: "epic"`). Values live on the task's `fields` and are validated against their kind on every write. Write them with `update {kind: "task", id, fields: {…}}`. That is a partial merge by key: only the keys you pass change, and `null` deletes a key. Without the MCP, use `vitrinka task field get <id> [key]` and `vitrinka task field set <id> <key> <value|json>`.

## Fields

| Key | Kind | Meaning |
|---|---|---|
| `outcome` | longtext | What is true for users once the feature is done. It is the yardstick every gate serves. |
| `non_goals` | longtext | What the feature deliberately leaves out. Scope disputes are settled here. |
| `gates` | checklist | What must hold before the feature closes, e.g. a merged PR, a passing run or a shipped release. |
| `decisions` | checklist | Calls only the task owner can make. An item with `done: false` is a decision still owed. |
| `ledger_state` | select | Where the feature stands (see below). The default is `scheduled`. |
| `waiting_on` | text | The named prerequisite while `ledger_state` is `waiting`. |
| `next_action` | text | The single next step. After a closure check it is the first open gate. |

A checklist value is `[{name, done, evidence?}]`. `evidence` is the URL or task id that proves the item: a merged PR, a done child task, an archived handoff, a board or a run. Never tick an item without evidence, and report a gate that has none as open.

A checklist is ONE field value, so a write replaces the whole array. Read it, change the items, then send every item back.

## `ledger_state`

| Value | Meaning |
|---|---|
| `scheduled` | Planned, and no session is working on it. |
| `active` | A session is working on it. |
| `waiting` | Blocked on the prerequisite named in `waiting_on`. |
| `superseded` | Another feature epic has replaced it. |
| `closed` | Every gate is done and has evidence. |

## Who writes the ledger

The ledger is written at the moment work happens, never by a later sweep:

- **Handing work off** attaches the handoff as a `file` ref (`meta: {kind: "handoff", slug, status}`; there is no separate handoff ref kind). It sets `ledger_state` to `waiting` (and fills `waiting_on`) when a prerequisite is unmet, otherwise to `scheduled`. It also sets `next_action`.
- **Resuming a handoff** sets `ledger_state: active` when the handoff is claimed. When the work finishes, `next_action` comes from the hand-back, or `ledger_state` becomes `closed` if every gate is done.
- **Merging a PR** whose task sits under the epic ticks the matching gate, with the PR URL as evidence. When every gate is done, it sets `ledger_state: closed`. Otherwise it comments what remains and escalates only the gaps that need a decision.
- **`portfolio close`** runs the same closure check on demand.

## Escalation

Only four things reach the task owner: product intent, irreversible choices, blockers and conflicting evidence. Routine progress never does. An unanswered `decisions` item blocks `closed`, and the hand-back names it.
