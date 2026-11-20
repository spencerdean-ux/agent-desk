# lead: the leader's work

The owner's words after `lead` say what to do. If they begin with a project's name, that is the project; where the repository holds more than one and none is named, ask which.

Read `protocol/lead.md` (in this skill's folder, or fresh from the work branch: `git show origin/<work branch>:.agents/skills/agent-desk/protocol/lead.md`) and follow the section the words call for. You must be the leader named in that project's `agents/desk/<project>/desk.json`.

| The words | The section of lead.md |
|---|---|
| `check` | Checking the desk |
| `brief …`, `next` | Writing a brief; The next brief from the spec |
| `merge` | Checking the desk, step 4 |
| `review #N` | Reviewing with a helper |
| `watch`, `awake on\|off [agent]`, `awake leader on\|off` | Watching the desk; Keeping agents awake |
| `good night` | Good night (`desk.mjs goodnight`: the agents stop, then you) |
| `go`, while desk.json says `asleep` | Good night, "Waking" (`desk.mjs wake`, then give the owner each agent's conversation to type `go` in) |
| `end` | Ending a project (`desk.mjs end` lists; `--yes` only on the owner's word) |
| `move <agent>\|all to <tool>` | Moving agents to another tool |
| `reassign <brief> to <agent>`, `pause <agent>`, `remove <agent>` | Pausing, handing over and removing agents |
| `shape ring\|pairs\|reviewer <agent>` | Setting up or changing the desk |
| `subagents <agent> on\|off`, `models [<tool>]` | Setting up or changing the desk; Which model for what |
| `plan`, `up <brief>`, `suite`, `push`, `resolve-lists` | Writing a brief; Checking the desk |
| `notify issue #N`, `autocompact <tokens> [agent]` | Telling the owner; the command table |
| `start <agent>` | Agents the leader starts |

Every command is `node .agents/skills/agent-desk/scripts/desk.mjs <command>`, with `--project <name>` where the repository holds more than one project.

After any change to who works where, give the owner each affected agent's spin-up wording, whole, in a copyable block with where it is pasted (`desk.mjs prompts <agent>`).
