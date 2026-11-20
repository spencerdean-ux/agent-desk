# The desk, from the leader's side

You are the leader named in `agents/desk/<project>/desk.json` on the project's work branch. You write the briefs and their failing tests, keep the board, review every pull request with the other agents' reviews in hand, decide (you have the final say), and merge into the work branch only. The owner starts every agent whose `started_by` is `owner`, by pasting its prompt; you start only those whose `started_by` is `leader`, and only in your own tool. The owner's guide is `.agents/skills/agent-desk/templates/guide.md`; the agents' rules are `AGENTS.md` and the other files in this folder.

**Name the project everywhere.** Each project has its own name (desk.json's `project`), work branch and desk.json, and several can run at once, in one repository or many. So the project's name goes into every brief (`project`), branch (`desk/<project>/<agent>/<brief id>`), pull request title, comment (`Desk decision for <project>:`) and prompt. When the owner's words could mean more than one project, ask which.

The command line `node .agents/skills/agent-desk/scripts/desk.mjs` does the bookkeeping, so the board and the briefs are never edited by hand:

| Command | Does |
|---|---|
| `validate` | checks desk.json, the board and every brief against each other |
| `status` | who leads, each agent's row, and the one next thing to do for each |
| `prompts [agent] [--review #N]` | the prompt to paste for each agent, or one agent's with the pull request it is to review already in it |
| `sync-board` | redraws the board's rows from desk.json (after `/agent-desk setup`) |
| `set <agent> <state> [--brief <id>] [--pr #N] [--notes "…"]` | moves an agent's row: `ready`, `in-progress`, `review`, `changes`, `done`, `idle`; the branch follows from the brief, a new `--brief` clears the row's pull request (a pull request belongs to one brief; the same brief keeps it), `idle` clears the row, and it refuses a row the board can't hold, a pull request two rows carry included |
| `brief <id> --for <agent> --spec <step> --title "…" [--reviewer <name>]` | a new brief from the template, addressed to its agent (project, base, branch, port and reviewer filled in); it never writes over one |
| `awake on|off [agent]` | whether agents stay on the desk between steps and pick the board's moves up themselves ("Keeping agents awake"); off unless turned on, and an agent's own switch wins over the desk's |
| `awake leader on|off [--idle <minutes>]` | whether you keep watching the desk by yourself ("Watching the desk"); on unless turned off, asleep after `idle_minutes` (60) with nothing moving |
| `report <phase> [--brief <id>] [--pr #N] [--step "…"] [--words "…"] [--leader]` | what an agent says it is doing, written to `agents/desk/<project>/status/<name>.json` on the work branch; you report with `--leader` ("Reading the agents' status") |
| `subagents <agent> on\|off [--max N] [--scope review,checks] [--review-model <id>] [--checks-model <id>]` | whether one agent may start subagents of its own, for adversarial review of its own diff and for checks (2, both, the tool's default models unless set; 4 at most); it writes the tool's definition files, which are committed with desk.json ("Setting up or changing the desk") |
| `models [<tool>]` | the four models each tool offers and which does what ("Which model for what") |
| `autocompact <tokens> [agent]` | where conversations compact (500,000 unless set); it writes each tool's settings file too, to commit with desk.json |
| `move <agent>|all --to <tool> [--model <m>] [--started-by owner|leader]` | an agent, or every agent, into another tool or onto another model ("Moving agents to another tool"); `--push` makes it on the work branch from any copy, an agent's included |
| `doctor` | the whole desk checked in one go, each finding with its fix ("The desk's health") |
| `log [--since 2d] [--agent <name>] [--limit <N>] [--md]` | the timeline of the work branch's desk commits, oldest first; `--md` is the digest for the owner |
| `notify <event> [--agent] [--brief] [--pr] [--words] --post`, `notify --setup --create`, `notify --setup --issue <N>` | tells the owner on the project's GitHub issue, once per event; `--create` makes the issue ("Telling the owner") |
| `goodnight`, `wake` | the owner's good night and their `go` after it: the agents stop, then the desk; nothing moves until `wake` ("Good night") |
| `defaults`, `defaults --set <key>=<value>`, `defaults --reset [key]` | this repository's defaults for new projects, in `agents/desk/defaults.json` ("Setting up or changing the desk") |
| `models check\|allow\|disallow "<model>" [--agent <name>] [--push]` | the models an agent may use ("Setting up or changing the desk") |
| `brief <id> --for <agent>\|any … --queue [--wave <n>]`, `up <id> --for <agent>`, `up --wave <n>` | a brief written ahead into the queue, a spare given to an agent, a whole wave put up ("Keeping briefs ready, and the spares"; "Pre-writing the waves") |
| `waves`, `waves --review <n>`, `waves --reviewed <n>` | the queue laid out wave by wave, and the ten-minute review after a wave ("Pre-writing the waves") |
| `end [--yes] [--force]` | ends the project: lists its branches, and with `--yes` archives the desk, deletes them and closes its pull requests and issue ("Ending a project") |
| `next [agent]`, `next --done <ID>`, `brief <id> --for <agent> --from-spec <ID>` | the next spec step for an agent without a brief, the marks in `agents/desk/<project>/progress.json`, and a brief whose title and Goal come from the step ("The next brief from the spec") |
| `preflight <brief id> [--pr #N]` | an agent's own: desk-check and its pull request report written from the diff, under `.git/desk/` (take.md step 5); you never run it for an agent |
| `suite [--brief <id>]` | every part of the repository's whole test command (desk.json's `suite`), each run to the end and counted; with `--brief`, a part that fails only in another open brief's frozen tests is said as expected, not as a failure ("Checking the desk" step 4) |
| `reassign <brief id> --to <agent> [--pr #N]` | hands an open brief to another agent: its header (slot, branch, port, reviewer), `handed_from`, `handed_pr` and `handed_head` so desk-check takes the first agent's commits up to that head, both rows, and the decision for the old pull request ("Pausing, handing over and removing agents") |
| `shape ring\|pairs\|reviewer <agent>` | who reviews whom, by name: desk.json and every open and queued brief's `reviewer:` in one go ("Setting up or changing the desk") |
| `plan` | each agent's next three briefs from `agents/desk/<project>/queue/`, with the gaps where one would sit idle and why; it changes nothing ("Writing a brief") |
| `up <brief id>` | a queued brief and its tests moved in, and its agent's row set `ready`; you then run its frozen tests red and commit ("Writing a brief") |
| `resolve-lists` | in a conflicted merge, settles desk.json's `shared_lists`: a JSON list keeps both sides' entries, sorted; a generated one is rebuilt with its `rebuild` command; any other conflict is left for you |
| `push` | your commits onto the work branch: an agent's status commit that landed since your fetch is taken in and the push tried again, three times; any other new commit stops it, for you to merge |
| `refresh [--leader]` | the card `/agent-desk refresh` reads back: an agent's copy prints who it is, its row, its report, its step and the rules from origin; `--leader`, from your checkout, prints the desk, what waits for your decision and lead.md's rules ("Status") |

## Setting up or changing the desk

This is `/agent-desk setup`. The owner's words say what they want: the project, who leads, how many agents, each one's tool, model and job, who reviews whom, the work branch.

1. **The project's name, then its folder.** Setup is per project, and a repository may hold many. If the words give no name, ask for one and a one-line title before anything else; never make one up.
   - **The skill must be in the repository** (`.agents/skills/agent-desk/` and `.claude/skills/agent-desk/`), as agents read their steps from it on the work branch. If it isn't, install it first (`/agent-desk install`, which copies the skill and asks nothing about any project).
   - **A new project:** `node .agents/skills/agent-desk/scripts/desk.mjs setup --project <name> --title "<one line>"` makes `agents/desk/<project>/` with a desk.json of two agents and its board, reads the repository from `origin` and takes this checkout's branch as the work branch (it refuses the default and release branches: make one, `git switch -c work/<project>`, and pass `--work-branch`). It also writes the desk's block in `AGENTS.md` and `CLAUDE.md`. It never touches another project's folder.
   - **A project already set up** is changed in place: its desk.json is the project's own, and `setup` run again keeps it.
   - With more than one project in the repository, add `--project <name>` to every `desk.mjs` command, or once in this checkout: `git config desk.project <name>`.
2. **Read the words, then fill in what they leave out** from these defaults:
   - **Project:** the name the owner gives (lower-case letters, digits and hyphens, such as `garden-app`), and a one-line `title`. If the owner gave none and there is none yet, ask: it is never defaulted. Renaming a project means changing every brief's `project` and `branch` still open, so do it only between briefs.
   - **Agents:** 2 unless the owner says otherwise; never more than 6.
   - **Names:** lower-case letters, digits and hyphens, from the tool and a letter (`codex-a`, `claude-b`), unique, never the leader's name.
   - **Tool:** `claude-code`, `codex`, `antigravity` or `other`.
   - **Model:** what the owner named, else `null` (the tool's own choice). You record it; you can't set it in another tool, so the agent checks it and the owner chooses it there.
   - **Job:** one line. Give two agents work that won't overlap (for example, server code and page code).
   - **Reviewer:** each agent reviews the next in a ring (a → b → c → a); with one agent, `leader`. Three shapes have names, and `node .agents/skills/agent-desk/scripts/desk.mjs shape ring|pairs|reviewer <agent>` sets one, rewriting desk.json and every open and queued brief's `reviewer:` together: **ring** (every agent also stops to review, none is a bottleneck); **pairs** (1 and 2 review each other, 3 and 4, an odd one out goes to you); **reviewer <agent>**, a dedicated reviewer who reviews every pull request and writes no code while you review it (the one bottleneck, but every other agent keeps writing). A test or document of the repository's that names who reviews whom changes with it.
   - **Subagents:** the first agent may start up to 2, for `review` and `checks`, on its tool's default models ("Which model for what"), unless the owner says otherwise; the others none. An agent with `review` in its scope reviews its own diff with a subagent before it pushes and posts that review with the push, so its pull request waits for nobody but you (its `reviewer` stays for a second look you ask for by name). `node .agents/skills/agent-desk/scripts/desk.mjs subagents <agent> on|off [--max N] [--scope review,checks] [--review-model <id>] [--checks-model <id>]` sets it later and writes the tool's definition files (`.claude/agents/`, `.codex/agents/`, `.agents/agents/`); `validate` refuses a model the tool's subagents can't run.
   - **Port:** an existing agent keeps its own; a new one takes the next free block from 8811 in steps of 10.
   - **started_by:** `owner`, unless the owner asks you to start it and its tool is your own; then `leader`.
   - **Work branch:** keep the current one; a new project takes this checkout's branch, never the repository's default branch or `main`, `master`, `staging` or `production`. Two projects may share a work branch, as each keeps to its own folder, or have one each.
   - **suite:** the parts of the repository's whole test command, each a command of its own (read its `package.json`'s `test` script and split it at each `&&`). `desk.mjs suite` runs every part to the end, so one red part never hides another.
   - **shared_lists:** the files every brief adds a line to and nobody holds (an offline file list, a generated module map), each `{ "file": … }`, with `"rebuild": "<command>"` for a generated one. `desk.mjs resolve-lists` settles them in a merge, and no brief holds them.
   - **setup, port_env, protected, specs:** read the repository. `setup` installs what the checks need (`npm ci` for a package-lock); `port_env` names the variables its test servers read their ports from; `protected` lists its build, deploy and CI files and the desk's own tests; `specs` is where specs live.
   - **This repository's own defaults** are in `agents/desk/defaults.json`, read by `desk.mjs setup` over the skill's own: `node .agents/skills/agent-desk/scripts/desk.mjs defaults` shows them, `defaults --set <key>=<value>` keeps one and `defaults --reset [key]` puts one back. They hold only what makes sense for any project (the team's size and tools, models per tool, `ready`, `spare`, `prewrite`, `specs`, `shape`, `awake`, the minutes, `autocompact`, `subagents`), never a project's name, branch or repository. Set one only when the owner says so.
   - **ready, spare, prewrite:** `ready` (1) is how many briefs you keep queued behind each agent's current one; `spare` (0) how many you keep for whichever agent runs out first; `prewrite` (false) whether you write every wave and brief ahead ("Pre-writing the waves").
   - **models:** an agent's entry may list the `models` it may use; none listed means any. An agent on another model stops and reports it; the owner's "allow this model" in that agent's conversation adds it (`desk.mjs models allow "<model>" --push`), and you can do the same for any agent (`models allow|disallow "<model>" --agent <name>`).
   - **autocompact:** a figure in tokens, or `false` for "not set by the skill": then no tool's compaction setting is written, and nothing is said or checked about it.
3. **Ask** in the three rounds `commands/setup.md` lists, every question with its default and "use the defaults for the rest" always an answer, leaving out whatever the owner's words already say. Three the words seldom answer: may any agent start subagents, and which (one by default: the first); what for (review, checks, or both); and on which models (the table in "Which model for what", or `node .agents/skills/agent-desk/scripts/desk.mjs models <tool>`).
4. **Show the owner the desk before saving.** Include the project's name and title, a table of each agent's name, tool, model, job, reviewer and who starts it, and what changes from today. Write nothing until they say yes.
5. **Save it:**
   - write `agents/desk/<project>/desk.json`;
   - run `node .agents/skills/agent-desk/scripts/desk.mjs sync-board`. It refuses to drop an agent mid-brief: finish or reassign that brief first, and tell the owner;
   - run `node .agents/skills/agent-desk/scripts/desk.mjs validate`, which must pass.
6. **Commit** `desk(<project>): <what changed>` to the work branch and push.
7. **Give the spin-up wording, always.** Run `node .agents/skills/agent-desk/scripts/desk.mjs prompts` and give the owner every agent's prompt, whole, each in its own copyable block under its **Where:** line (the tool, in the cloud and in its app). Setup is never finished without it, and it is given again after any change to an agent (`move`, `reassign`, `subagents`, a new agent, a new work branch). Start any `started_by: leader` agent yourself (below).

To change the work branch: change `work_branch`, run `sync-board`, and change `base` in every brief still `ready`, `in-progress`, `review` or `changes`.

## Writing a brief

1. Take one spec step, or a part of one small enough for about 300 changed lines. `node .agents/skills/agent-desk/scripts/desk.mjs next` says which step comes next for each agent without a brief ("The next brief from the spec").
2. Write its failing tests first and commit them as your red commit on the work branch. They are the brief's `frozen` list. Before it goes up, read each assertion against the fixture's own data (who is in it, who owns what, who can see what), not only against the spec: a test whose seed doesn't set up what it asserts is wrong before anyone writes code. An amendment that changes a rule of the brief re-reads the frozen test's seed against the new rule, in the same commit.
3. Make the brief: `node .agents/skills/agent-desk/scripts/desk.mjs brief <id> --for <agent> --spec <step> --title "<one line>"`. It copies `agents/desk/<project>/assignments/_template.md` to `agents/desk/<project>/assignments/<id>.md` with `project`, `slot`, `reviewer` (the agent's own in desk.json, or `--reviewer <another agent | leader>`), `base`, `branch` and `port` filled in. Then write the rest:
   - `may_change` is the smallest list that does the job, folders only when new files are expected;
   - `frozen` is the red commit's tests;
   - `checks` are the frozen tests, then any browser checks a page change needs, each named (a new one run three times before the first push, to catch a flaky one; any other once). **When desk.json names the test suite (`tests`)**, desk-check itself adds the test files that read what the branch changed and the suite's always-run checks, so list neither them nor the whole suite, and a brief may list no command at all. **Without it**, add the test files the change touches; and the repository's whole test command goes in only while no other brief is open: another open brief's frozen tests are red until it merges, so the whole suite would fail this agent's desk-check through no fault of its own, and the agent is told to stop on a failing check. Either way, the whole suite is yours, once (below);
   - Context names the sibling to mirror and the parts of the repository's rules that apply.
4. Give agents work that doesn't overlap: no file in two agents' `may_change` lists at once. Match each brief to the agent's `job`.
5. Put it on the board: `node .agents/skills/agent-desk/scripts/desk.mjs set <agent> ready --brief <id>`. Run `node .agents/skills/agent-desk/scripts/desk.mjs validate`, then commit the brief, its tests and the board together and run `node .agents/skills/agent-desk/scripts/desk.mjs push`.
6. **Briefs written ahead** wait in `agents/desk/<project>/queue/`, each in full, with its frozen tests in `agents/desk/<project>/queue/tests/` at the path they will have (`queue/tests/x.test.mjs` becomes `tests/x.test.mjs`), so a queued red test never makes the suite red. A queued brief may name what it waits on (`waits_on:`, a list of brief ids). `node .agents/skills/agent-desk/scripts/desk.mjs plan` says each agent's next three and where one would sit idle; `node .agents/skills/agent-desk/scripts/desk.mjs up <id>` moves the brief and its tests in and sets the row `ready`; read it against the code as it stands, run its frozen tests red, commit it as its red commit, validate and push.

## Keeping briefs ready, and the spares

- **Ready.** At every check, run `node .agents/skills/agent-desk/scripts/desk.mjs plan`. A line such as `agent-a has 0 of 2 briefs ready: write 2 more` means that agent has fewer queued briefs than desk.json's `ready` asks for: write them now (`desk.mjs next agent-a` names the spec step; `brief <id> --for agent-a --from-spec <ID> --queue` writes it into the queue), so the agent never waits for you.
- **Spare.** A spare is a queued brief for nobody: `brief <id> --for any --spec <step> --title "…" --queue`. Pick work that touches files no open brief holds. `plan` lists the pool (`spare: S1-x, S2-y`) and says when it is below desk.json's `spare`. When an agent runs out and its own queue is empty or blocked, give it a spare: `desk.mjs up <id> --for <agent>` fills in its branch, port and reviewer and sets its row `ready`.
- A brief for `any` lives in the queue only; `validate` refuses one on the board.

## Pre-writing the waves

This is for a desk whose `prewrite` is true, or when the owner asks for the whole plan ahead. A **wave** is one round of briefs the agents work on side by side.

1. **Lay out the waves.** Read the spec (desk.json's `specs`; `desk.mjs next --list` names its steps). Put steps in the same wave only when they share no file and none waits on another; one brief per agent per wave. A step that needs an earlier one goes in a later wave and names it under `waits_on`.
2. **Write every brief into the queue**, with its wave: `node .agents/skills/agent-desk/scripts/desk.mjs brief <id> --for <agent> --from-spec <ID> --queue --wave <n>`, then its lists, sections and frozen tests as "Writing a brief" says. Write the spares too (`--for any`).
3. **Show the owner the plan and wait.** `node .agents/skills/agent-desk/scripts/desk.mjs waves` prints it wave by wave: who gets which brief, what each waits on, and the spares. Give it to the owner whole. The desk waits for the owner's yes: start no agent, and put nothing up, until they give it; change what they ask and show it again.
4. **Put a wave up at once:** `desk.mjs up --wave <n>`, then each brief's red commit, `validate` and `push` as for any brief. It refuses while an agent of that wave still has a brief open.
5. **After each wave has merged, review the rest, for 10 minutes at most.** Run `desk.mjs waves --review <n>`: it starts the clock and prints the checklist. You, or a subagent you start, read what the wave built (the merged pull requests' file lists; `desk.mjs log`) against the spec and each brief still queued. Change a queued brief only for a **major** mismatch: a file or a name it relies on no longer exists or has changed shape, or the wave made a step unnecessary. Rewrite those briefs and note each change in `progress.json`. Small wording is left for the agent who takes the brief.
6. **At 10 minutes, stop.** `desk.mjs status` and `waves --review <n>` say when the review has run over. Put the next wave up as it stands, tell the owner in one line what you didn't get to, and close the review: `desk.mjs waves --reviewed <n>`. The review never holds the next wave back.

## Checking the desk

This is `/agent-desk lead check` (`/agent-desk lead <project> check` where the repository has more than one project).

1. List the open pull requests whose head starts `desk/<project>/` and whose base is the work branch. Leave any other project's alone. One still titled `· in progress`, or whose agent's report (`agents/desk/<project>/status/<agent>.json`) isn't `pushed`, `reviewing`, `reviewed` or `revising`, is being worked on: subscribe to it and leave it, saying `<agent> still working on #N` in one line; check it once its agent reports `pushed`.
   - **Each must be its agent's.** The branch `desk/<project>/<agent>/<brief id>`, the brief's `slot`, the title's `[<project>/<agent>]` and every commit's `Desk-Agent:` trailer name one agent. One agent with two open pull requests, or a pull request where these disagree, is `wrong_agent`: a conversation has lost its name (two Antigravity conversations once both acted as one agent). Don't review it as work: post `Desk decision for <project>:` with `1. rejected: wrong_agent, <what disagrees>`, close it, put the brief's row back to `ready` if nothing else of its agent's is open, and tell the owner which conversation to give nothing more and in which to type `go`. desk-check with `--any-branch` fails on a stray trailer too.
2. For each one at the head its agent pushed:
   - Fetch it and check out its head detached.
   - Run `node .agents/skills/agent-desk/scripts/check.mjs <id> --base origin/<work branch> --any-branch`. Any violation is blocking, whatever the review says.
   - desk-check ran the brief's checks (and, with desk.json's `tests`, the tests that read what it changed): that is the evidence for deciding. Don't run the whole suite on each head the agent pushes; it runs once, on the merge (step 4). A frozen test of **another** open brief that fails there isn't this pull request's failure: say so in the decision, and count only what this brief's files could change.
   - Record the pull request: `node .agents/skills/agent-desk/scripts/desk.mjs set <agent> review --pr #N`.
   - Read the review (`Desk review of #N for <project> by …`), its **Brief says → diff does** table first: a rule of the brief marked `missing`, or one with no row, is a finding of yours to weigh; a review with no table is incomplete, and you ask for it again. An agent with subagents for `review` (desk.json) posts its own subagent's review with the push, signed `<agent>-review (subagent, <model>)`, and its report has a **Subagent review** heading: read both, and check each finding the report calls fixed against the diff; don't wait for its reviewer agent, which isn't offered the pull request (`wait.mjs` skips it); ask one for a second look only when you want it (`node .agents/skills/agent-desk/scripts/desk.mjs prompts <reviewer> --review #N`). Otherwise the reviewer is an agent: if its review isn't in yet, give the owner that prompt, and decide once it is in.
   - Do your own review, with only the spec and the diff in mind: the repository's code-quality rules, then the spec, kept as two lists.
   - Verify every review finding against the code before accepting it.
3. Post one comment that starts `Desk decision for <project>:` and numbers every item:

   ```
   1. fix: <what> (review #2, accepted: <why>)
   2. rejected: review #3, <what you traced>
   3. fix: <your own finding>
   4. question: <for the agent to answer>
   ```

   End it with any footer the repository's rules require. Then `node .agents/skills/agent-desk/scripts/desk.mjs set <agent> changes` (or leave it `review` while a reviewer still has to post), commit the board and run `node .agents/skills/agent-desk/scripts/desk.mjs push`, which takes in any agent's status commit that landed meanwhile.
4. When a decision has no fix left, the checks pass and desk-check passes:
   - make the merge commit (a shared list that conflicts is settled by `node .agents/skills/agent-desk/scripts/desk.mjs resolve-lists`), run `node .agents/skills/agent-desk/scripts/desk.mjs suite --brief <id>` (every part of the whole test command, each to the end; another open brief's red frozen test is said as expected and never gates the rest) and anything else its rules require before a merge on that commit, once, and push it only when they pass (a repository whose hook remembers a pass for a tree doesn't run them twice); merge into the work branch, if the owner has allowed you to (record where: your rules file); otherwise ask the owner to merge, and tell them with `node .agents/skills/agent-desk/scripts/desk.mjs notify question --pr #N --words "<id> has passed; may I merge it?" --post`;
   - `node .agents/skills/agent-desk/scripts/desk.mjs set <agent> done`;
   - run `node .agents/skills/agent-desk/scripts/desk.mjs next <agent>`: a **clear** step goes up at once ("The next brief from the spec": its red tests, `brief <id> --for <agent> --from-spec <ID>`, `set <agent> ready --brief <id>`, commit, push), without asking the owner; a step flagged **needs the owner**, one **partly covered** that reads two ways, or nothing left is a question for the owner (`notify question`);
   - tell the owner: `node .agents/skills/agent-desk/scripts/desk.mjs notify merged --brief <merged id> --pr #N --agent <agent> --words "Up next: <next id> for <agent>." --post` (or `--words "Nothing is up next: <why>."`).
5. A practice pull request is closed, never merged, once its loop has been seen to work.

## When a frozen test is wrong

A frozen test can be wrong: its seed doesn't set up what it asserts, or it counts what the brief never asked for. The code isn't bent to it and the agent never edits it.

1. Trace it: read the assertion against the fixture's data and the brief, and say in one line what it measures wrongly.
2. Fix how it measures, never what it asserts, on the work branch, in a commit of its own that says so ("A3's frozen test seeds the second bed as it means it: how it measures, not what it asserts").
3. Name it in the next decision on the pull request (`1. fix: merge the work branch in: <commit> fixes how <test> measures`). The agent merges the work branch in and carries on.
4. If what it asserts is wrong, that is the brief's rule changing: say so to the owner first, then change the test and the brief together.

## Agents the leader starts

An agent with `started_by: "leader"` runs in your own tool, and you start it. Never start an agent in another tool, and never use another tool's sign-in: Google's Gemini CLI FAQ forbids other software reusing its sign-in, and the same caution applies to any tool's account.

- **In Claude Code:** start it with the Agent tool, in a worktree of its own, in the background, named `<project>-<name>`. Its whole prompt is the output of `node .agents/skills/agent-desk/scripts/desk.mjs prompts <name>`, which names the project. Start a new one for each project: never reuse a helper that has worked on another project.
- **In another tool that can start helpers of its own:** do the same with that tool's own way of starting a helper.
- It follows the same steps and opens its own pull request. You still run desk-check on it and decide.
- If its reviewer is another agent, that agent still reviews it. You never write the review for it.
- Starting it again for a review or a revision is the same prompt: `agent.md` chooses the step.

## Watching the desk

This is `/agent-desk lead watch`, and the leader's own awake: you keep watching the desk by yourself, **on by default**, and sleep after a run of nothing moving. The switch and the window are desk.json's `leader.awake` (on unless `false`) and `leader.idle_minutes` (60 minutes unless set; the owner's run time): `node .agents/skills/agent-desk/scripts/desk.mjs awake leader on|off [--idle <minutes>]` sets them, committed and pushed. A leader whose switch is off waits for the owner's `/agent-desk lead check`.

The clock and the looking are `.agents/skills/agent-desk/scripts/wait.mjs --leader`, run from your checkout of the work branch: it watches every `desk/<project>/*` branch on origin and the agents' reports in `agents/desk/<project>/status/`, and ends with one line. `fits: check <branch>, …` names each branch an agent has pushed since your last look, or one whose agent reports `pushed`; `fits: help <agent> (blocked …)` names an agent whose report says it is blocked, with its words, so you answer in its pull request or hand the brief on; `wait: …` says nothing has moved, how long until you sleep, and any agent silent past `silence_minutes` (the look posts the warning on the project's issue itself, the first time; with no issue set it says "tell the owner once": do, in one line); `stop: asleep …` says the desk has been still for `idle_minutes`. Any push, and any work-branch move, resets the clock; so does `--touch`, which you pass when something that isn't a push wakes you (a review comment, a pull request event, the owner's word).

1. **Subscribe to every open desk pull request** of the project (head `desk/<project>/…`, base the work branch) each time you check the desk, and to a new one as soon as an agent's report names it (Claude Code on the cloud: `subscribe_pr_activity`). A push, a review or a comment on it then wakes you.
2. **On each wake,** run `node .agents/skills/agent-desk/scripts/wait.mjs --leader --once --touch`. It tells the owner of a blocked or silent agent, or of the desk sleeping, by itself, and says so in a `told:` line; a `notify:` line is the rare case it couldn't (no `gh`, or the post was refused), and then you do what the line says ("Telling the owner"). Then "Checking the desk" for the pull request the event names and for every branch the line says to check (report `checking --pr #N --leader` as you start, `deciding` as you post the decision, `merging` as you merge): desk-check, the checks, the review if it is in, your own review, one `Desk decision for <project>:`, the board row moved. A wake for your own comment needs nothing but the `--touch`.
3. **Merge when it has passed,** as "Checking the desk" step 4 says, where the owner has allowed the leader to merge on its own (ask once, and record the answer in your rules file; into the work branch only; another repository's owner says so in its rules file). Otherwise post the decision and say it waits for the owner's merge.
4. **Keep one scheduled look armed** while you are awake, about five minutes ahead (`send_later`, or the tool's own way; in a tool with no scheduling, run `wait.mjs --leader` without `--once` in your turn, as an agent does, and act on what it says). In Antigravity the way is its built-in `schedule` tool, a one-shot timer of 180 to 300 seconds set again at each look, and the turn ended in between: never a sleeping command there, which is how an Antigravity conversation hangs (the wait is one look there whatever you pass it). In Claude Code the ways that work are `send_later` (the claude-code-remote tool) or `node .agents/skills/agent-desk/scripts/wait.mjs --leader` run with the Bash tool's `run_in_background: true`, whose last line you act on when it ends; never `sleep` in a foreground command (the runner refuses it, and the whole chained command with it), and the Monitor tool only after its schema is loaded (`ToolSearch` with `select:Monitor`) and with both `description` and `timeout_ms` given, or the call fails before it starts. When it fires, run `node .agents/skills/agent-desk/scripts/wait.mjs --leader --once` (and do what any `notify:` line it prints says): on `fits:` run "Checking the desk" for those branches and arm the next look; on `wait:` arm the next look and say nothing; on `stop:` report `asleep --leader`, arm nothing more and tell the owner in one line that the desk slept after `idle_minutes` of no activity and that `/agent-desk lead watch` wakes it (`awake --leader` when you wake again). An event (step 2) while asleep wakes you again: its `--touch` resets the clock, and you arm the next look.
5. **Tell the owner only what they must do:** which agent's conversation needs a `go` (none, for an agent that is awake), which brief went up, and that you have gone to sleep. Everything else is in the board and the pull requests.

With the leader and the agents awake, the desk runs on its own: a pull request event wakes you at once and an agent's report within five minutes, your board move wakes the next agent within three, and the owner reads the board and the reports when they like.

## Reading the agents' status

Each agent reports what it is doing as it works: `node .agents/skills/agent-desk/scripts/desk.mjs report <phase> …` writes `agents/desk/<project>/status/<agent>.json` on the work branch at every step boundary (`taking`, `working` with a step, `checking`, `pushed`, `reviewing`, `reviewed`, `revising`, `blocked` with its words, `waiting`, `stopped`, `moved`), one small commit each and nothing when the report is unchanged. You report too, with `report --leader` (`checking`, `deciding`, `merging`, `awake`, `asleep`), so the owner sees the desk's own state. The board stays yours and stays the state of record: a report is what the agent says.

- `node .agents/skills/agent-desk/scripts/desk.mjs status` shows each report in an **Agent says** column, with its age, and marks an awake agent **silent** once its last report is older than `silence_minutes` (desk.json, 20 unless set); `validate` checks every report's shape.
- Your look ("Watching the desk") turns a `blocked` report into `fits: help`, a `pushed` report into `fits: check`, and a silence into a note; the owner is told of a silence once, in one line (you can't wake another tool's agent; the owner's `go` can).
- A pull request still titled `· in progress` is being worked on: leave it until its agent reports `pushed`.
- A `stopped` or `moved` agent is gone, not silent: nothing to flag.

## The desk's health

`node .agents/skills/agent-desk/scripts/desk.mjs doctor` checks the whole desk in one go and gives every finding the one thing that mends it: desk.json, the board and the briefs against each other; a `review` or `changes` row whose branch isn't on origin, and a `desk/<project>/*` branch on origin that no row names (merged: delete it; not merged: give it a row); the reports (a stale one, a silent agent, a blocked one, a `pushed` report whose row isn't `review`); the pull requests, through `gh api` when `gh` is here (a row's number that isn't open, a `done` row whose pull request is, a head that isn't the row's branch), else "not checked"; this copy's own name (an agent's copy without `desk.tool`); the skill's version against the one desk.json records; and the compaction files against desk.json. It changes nothing: do each fix line, and nothing else. Run it at the start of `/agent-desk lead watch` and whenever something looks off; `/agent-desk status doctor` is the owner's way to it.

`node .agents/skills/agent-desk/scripts/desk.mjs log [--since 2d] [--agent <name>] [--limit <N>] [--md]` is the timeline: every desk commit on the work branch read by its effect (a report, a board row moved, a brief put up, a desk branch merged), oldest first, from your checkout or an agent's copy. `--md` makes the digest to paste on the owner's issue when they ask what happened. A desk commit that arrived through a merge of the work branch into itself shows once as `other`.

## Telling the owner

The owner is told on **one GitHub issue per project**, once per event, in a short comment the desk writes. The events are an agent `blocked`, an awake agent `silent` past `silence_minutes`, the desk `asleep`, a brief `merged` (with what is up next) and a `question` only the owner can answer. Chat words stay for what the owner must do now; the issue is for what happened while they were away.

1. **Set it up once:** `node .agents/skills/agent-desk/scripts/desk.mjs notify --setup --create` makes the issue, titled `Desk notifications for <project>`, through `gh`, and records its number. Where `gh` isn't here, make the issue with your GitHub tool, then `node .agents/skills/agent-desk/scripts/desk.mjs notify --setup --issue <N>`. Either way, tell the owner to open the issue and press **Subscribe**, so GitHub emails them each comment (and `--events blocked,silent,…` for fewer than the five), commit desk.json and push. `notify --setup off` turns it off; `notify` alone says where it stands, as `status` does.
2. **Tell, once:** `node .agents/skills/agent-desk/scripts/desk.mjs notify <event> [--agent <name>] [--brief <id>] [--pr #N] [--words "…"] --post`. It writes the comment in the desk's voice (a blocked or silent agent's words come from its report), posts it through `gh api` where `gh` is here, and otherwise prints the body with "post this on issue #N with your GitHub tool": do, with your own tool. A notice already told is refused (`already told`; `--force` says it again): a blocked or silent report by its time, a merge by its pull request, asleep by the hour, a question by its words. The mark lives in this checkout's git config, so a new checkout may tell once more. Without `--post` it only prints the body, so you can read it first.
3. **When:** your look (`wait.mjs --leader`) posts three of them itself, the moment it sees them: `blocked` beside `fits: help`, `silent` the first time an agent on automatic checking has reported nothing for `silence_minutes` (20), and `asleep` with `stop: asleep`. It says `told: Posted on #N: …` for each. It prints `notify: post this comment on issue #N …` when `gh` isn't here (post those words with your GitHub tool), and `notify: node … --post` when the post was refused (it tries again at its next look; you may run the line yourself). **The silence warning rests on your own watching:** it is your look that posts it, so if the leader has stopped too, nothing is posted. Keep the scheduled look armed ("Watching the desk"), and say so to the owner once when you turn automatic checking on. After a merge, `notify merged` with what went up next ("Checking the desk" step 4). When you need the owner's word (a `question:` item they must answer, a step the spec marks as a stop, a merge you may not make), `notify question --words "…"`.
4. A disabled event, or notifications off, prints the body and says so, so you still have the words to say in chat.

## The next brief from the spec

When a row goes `done` and no brief is ready, the next brief writes itself from the spec, and goes up **without asking** the owner when the step is clear; you ask only when a step has two readings or the spec has no step left.

- **The steps** are the spec's `### <ID>. <title>` headings under its `## Release …` headings (desk.json's `specs`: a file, or a folder of `.md` files; `--spec <file>` names one when a folder holds several). A brief's `spec:` field says which step it serves, so one step is often several briefs (`A9a`, `A9b`, …).
- **What is finished** is `agents/desk/<project>/progress.json` on the work branch, yours alone: `node .agents/skills/agent-desk/scripts/desk.mjs next --done <ID> [--note "A1a, A1b"]` when a step's last brief merges, `next --skip <ID> --note "…"` for a step that is yours or isn't wanted, `next --open <ID>` to undo. Commit it with the board. `validate` checks it; `next --list` shows every step with its state and briefs.
- **The proposal:** `node .agents/skills/agent-desk/scripts/desk.mjs next [agent]` names, for each agent whose row is `done` or `idle` with no brief ready, the first open step (not marked, not in hand on an active row) not offered to an earlier agent, with its words quoted and the command that briefs it. **clear** means no brief has ever named it: write its red tests, then `node .agents/skills/agent-desk/scripts/desk.mjs brief <ID>-<short-name> --for <agent> --from-spec <ID>` (the title is the step's heading unless `--title` says otherwise, and the Goal is the step's own words, quoted), fill `may_change`, `frozen` and `checks`, `set <agent> ready --brief <id>`, commit, push, and tell the owner only in the `merged` notice. **partly covered** means briefs name the step but it isn't marked: mark it if its briefs finished it, or brief the part that is left; if the spec reads two ways, ask. **needs the owner** means the step's words say stop, or that the owner decides: ask before briefing it (`notify question`). **nothing left** is a question for the owner too.
- Steps `A12`-style release steps are usually yours: `next --skip A12 --note "the leader's own"`.

## Reviewing with a helper

This is `/agent-desk lead review #N`. The agents review each other by default, and that stays the rule; a helper reviews when a brief's `reviewer` is `leader`, or when the owner asks because the agent reviewer is slow.

1. Check the pull request is this project's (head `desk/<project>/…`, base the work branch, open).
2. **Start a fresh helper in your own tool** (in Claude Code, the Agent tool, a new context, named `<project>-review-N`). Never review in the context that will decide: the review and the decision stay two minds. Its whole prompt is review.md read fresh from the work branch, the project, the pull request number, and that it signs `— <leader>-review (<tool>) on <project>, for <leader> to decide`. It reads only, never pushes, and hands back the review text.
3. **Post it unchanged** as one comment on the pull request, beginning `Desk review of #N for <project> by <leader>-review: …`, with any footer the repository's rules require.
4. Then "Checking the desk" for that pull request: verify every finding against the code before accepting it, as with any review, and decide. Never let the helper decide, merge or edit the brief, and never start it in another tool.

## Keeping agents awake

This is `/agent-desk lead awake on|off [agent]`, and the switch is **off by default**: an agent does every step that fits, stops, and waits for the owner's `go`. Turned on, an agent that has done its steps stays on the desk instead: it runs `.agents/skills/agent-desk/scripts/wait.mjs` from the work branch (agent.md step 5), which looks at origin's board every few minutes and tells it when a review, a revision or a brief fits, so the desk moves while the owner is away.

- **Turning it on or off:** `node .agents/skills/agent-desk/scripts/desk.mjs awake on` for the whole desk, `awake on <agent>` or `awake off <agent>` for one (an agent's own switch wins), then commit desk.json and push.
- **The owner must be told when one goes quiet.** `awake on` refuses while the desk has no notifications issue: run `node .agents/skills/agent-desk/scripts/desk.mjs notify --setup --create` first ("Telling the owner"), so an agent on automatic checking that reports nothing for 20 minutes (`silence_minutes`) is posted there. Only where the owner says, in so many words, that they want no warning: `awake on --no-notify`; `status` and `doctor` then say nobody is told.
- **Antigravity agents wait on a timer, not a command.** Their wait is one look; between looks they set a 180-second one-shot timer and end their turn (agent.md step 5). An Antigravity agent whose tool has no timer reports `stopped` and waits for `go`: tell the owner which. A running agent reads the switch on origin at each look and at each `go`: switched off, it stops and says so.
- **The board is their signal.** Awake agents read it from origin, so every move goes through `desk.mjs set` and is committed and pushed at once, never batched: `set <agent> review --pr #N` when a pull request is in (its reviewer's wait then says review), `set <agent> changes --pr #N` after every decision (a new board commit for the row is what tells the agent to revise again: run it even when the row already says `changes`), `set <agent> done` and the next brief `ready` after a merge. An agent's own push is read from its branch: a `ready` row whose branch is on origin is "pushed, the leader's turn", and says nothing to the agent.
- **Permissions.** An agent that asks before every command can't work while the owner is away. Antigravity Remote Agents run on `always-proceed (turbo)` unless changed, and the guide tells the owner to keep that for an awake agent; the desk's guards stand in for the ask: desk-check before every push, the other agent's review, your decision, and your merge alone, into the work branch only.
- **Pausing an awake agent:** `set <agent> idle` once its pull request is settled (it keeps looking and takes nothing), or `awake off <agent>` (it stops and says so). The owner's `stop` in its conversation ends its turn too.
- The wait says each fit once (a mark in the agent's copy, `git config desk.<brief>.acted`), so a turn that failed half way isn't retried by itself: the owner's `go`, or your next board move for that row, moves it again. A turn that stopped with a question is in the pull request as always.
- With every agent awake there is usually nothing to tell the owner but which brief went up.

## Moving agents to another tool

This is `/agent-desk lead move agent-a to codex`, `/agent-desk lead move all to claude-code`, `/agent-desk lead move agent-b onto Gemini 4 Argon`. The owner may also type the move into any agent's conversation, where the agent runs the same command with `--push` (agent.md step 6).

1. `node .agents/skills/agent-desk/scripts/desk.mjs move <agent>|all --to <tool> [--model "<m>"] [--started-by owner|leader]`, on the work branch; commit `desk(<project>): <agent> moves to <tool>` and push. From a copy that isn't the work branch, add `--push`: it makes the change in a worktree of its own on origin's work branch and pushes one commit. `--to` takes `claude-code`, `codex`, `antigravity` or `other`; `--model` records the model (the owner still chooses it in the tool); `--started-by leader` only for your own tool.
2. **A row mid-brief** is kept: the brief, the branch and the pull request stay the agent's, and the new conversation resumes from what is on origin (take.md's resume path, revise.md as before). Anything unpushed in the old copy is left behind: where a row is `in-progress` or `changes`, have the old conversation push first if its work matters, or accept the loss.
3. **Hand over the prompt:** `node .agents/skills/agent-desk/scripts/desk.mjs prompts <agent>` for each moved agent, pasted once into a new conversation in the new tool (its set-up is in the guide's step 3). Start it yourself if `started_by` is `leader`.
4. **The old conversation stops by itself:** its copy knows its tool (`git config desk.tool`), so an awake agent's wait says `stop: … moved …` at its next look, and `go` there ends at agent.md step 2. Nothing else is needed; the owner may close it.
5. A move that only changes `--model` changes no conversation: the agent sees its entry's model at its next turn and says so if it finds itself on another.

## Pausing, handing over and removing agents

- **Pause:** `node .agents/skills/agent-desk/scripts/desk.mjs set <agent> idle` once its pull request is settled. Don't give it a brief.
- **Hand a brief to another agent:** `node .agents/skills/agent-desk/scripts/desk.mjs reassign <brief id> --to <agent>`. It gives the brief the new agent's slot, branch, port and reviewer, records `handed_from`, `handed_pr` and `handed_head` (the old branch's head on origin), sets the new agent `ready` and the old one `idle`, and posts (or prints) the decision on the old pull request. desk-check then takes the old agent's commits up to `handed_head` and no later one, so the new agent carries on from that head on its own branch. Close the old pull request once the new one merges. A brief with nothing pushed yet is made again for the other agent instead (`desk.mjs brief`).
- **Remove:** take it out of desk.json and run `sync-board`, which keeps any row mid-brief until it is settled.

## When a project's work branch is merged

End the project first ("Ending a project"), so its agents' branches are gone and its desk is in `agents/desk/archive/`. Its files go with the merge. Before the next project's desk starts on a new branch from the default branch, `/agent-desk setup` there gives it its own name, team and board; briefs of a finished project can move to `agents/desk/<project>/archive/`.

## Good night

The owner types **good night** (or `/agent-desk lead good night`) when they want everything to stop until they are back. Nothing is lost: the board, the briefs and the `awake` switch stay as they are.

1. Run `node .agents/skills/agent-desk/scripts/desk.mjs goodnight`. It writes `asleep` (the time) into desk.json on the work branch and pushes, from any checkout.
2. Each agent on automatic checking sees it at its next look, within about three minutes: its wait says `stop: good night`, it runs `desk.mjs report asleep`, cancels its timer and ends its turn. An agent in the middle of a step finishes that step first.
3. Run your look once more (`node .agents/skills/agent-desk/scripts/wait.mjs --leader`, or your scheduled look). It says `wait: good night: waiting for <agents>` until each agent that was there has reported `asleep`, then `stop: good night: every agent is asleep`. An agent that hasn't answered within `silence_minutes` is named and the desk sleeps anyway. No silence warning is posted for a desk that is asleep.
4. On that `stop:`, run `node .agents/skills/agent-desk/scripts/desk.mjs report asleep --leader`, cancel your own scheduled look, tell the owner in one line ("Good night: <agents> asleep. `go` here wakes the desk."), and end your turn.

**Waking, the desk first.** The owner types `go` to you. While desk.json says `asleep`, that word means: run `node .agents/skills/agent-desk/scripts/desk.mjs wake` (it removes `asleep`, pushes, and lists each agent's conversation), give the owner that list, then carry on as "Watching the desk" says. The owner then types `go` in each agent's conversation. An agent given `go` before the desk is awake stops and says "the desk is asleep: type `go` at the leader first": that is right, not a fault.

## Ending a project

This is `/agent-desk lead end`, for a project whose work is finished or given up. It is the only command that deletes branches, so it lists first and acts only on the owner's word.

1. Run `node .agents/skills/agent-desk/scripts/desk.mjs end` and show the owner the list, whole: every `desk/<project>/*` branch on origin, marked merged or not merged into the work branch, with any open pull request. Nothing is changed.
2. On the owner's yes, from your checkout of the work branch with nothing uncommitted: `node .agents/skills/agent-desk/scripts/desk.mjs end --yes`. A branch with commits the work branch doesn't hold, or an open pull request, stops it and is named. Ask the owner about each; `--yes --force` deletes that work for good, so pass it only when the owner has said so for those branches by name.
3. It then, in this order: moves `agents/desk/<project>/` to `agents/desk/archive/<project>/`, commits and pushes (a refused push is taken back and nothing is deleted); closes the open pull requests with a line saying why; deletes the project's branches on origin and in your checkout; says so on the notifications issue and closes it. It never touches the work branch or another project's branches.
4. Give the owner the last lines it prints: each agent runs `node .agents/skills/agent-desk/scripts/cleanup.mjs --local` in its own conversation, which deletes that copy's desk branches and its name. An agent still on automatic checking is told `stop: <project> has ended` at its next look and runs it by itself. Then those conversations can be closed.
5. The work branch itself, and its pull request into the default branch, are the owner's to merge or delete.

## Which model for what

Each tool offers four models the desk knows (`.agents/skills/agent-desk/scripts/models.mjs`, `node .agents/skills/agent-desk/scripts/desk.mjs models [<tool>]`), and each has a job:

| Tool | plan (the leader, a brief's design) | code (writing a brief) | review (a subagent's adversarial review) | checks, and anything that isn't code |
|---|---|---|---|---|
| Claude Code | `opus-5.5` (Claude Opus 5.5), or `fable-5.1` (Claude Fable 5.1) where the account has it | `sonnet-5.5` (Claude Sonnet 5.5) | `opus-5.5` | `haiku-5.5` (Claude Haiku 5.5) |
| Codex | `gpt-6-astra` (GPT-6 Astra) | `gpt-6.1-sol` (GPT-6.1 Sol) | `gpt-6.1-sol`, reasoning effort high | `gpt-6-luna` (GPT-6 Luna); `gpt-6.1-terra` (GPT-6.1 Terra) for screens and visual checks |
| Antigravity | `gemini-4-argon` (Gemini 4 Argon), or `claude-opus-5.5` (Claude Opus 5.5) | `claude-sonnet-5.5` (Claude Sonnet 5.5), or `gemini-4-argon` | `gemini-4-argon`, the `pro` tier (a Claude agent's code is judged by Gemini: Google's own pattern, one family checking the other) | `gemini-3.8-flash` (Gemini 3.8 Flash), the `flash` tier |

The ids are the desk's own (`agents/desk/<project>/desk.json`'s `model` and `subagents.models`), the same whatever tool an agent is in; `node .agents/skills/agent-desk/scripts/desk.mjs models <tool>` prints each tool's four with the value the tool itself takes (Claude Code's `opus`, `sonnet`, `haiku`, `fable`; Codex's model id; Antigravity's `pro` or `flash` tier, the only ones its subagents run on). Antigravity's Claude rows are for its main agent alone. These are the models each tool offered when this version of the skill was released, a starting point, and they change with the tools: when a tool retires one, the skill's `.agents/skills/agent-desk/scripts/models.mjs` is where it is updated.

The rule: the leader plans and writes briefs on a **plan** model; an agent writing a brief runs on a **code** model; a review subagent runs the **review** model and a checks subagent the **checks** model; anything that isn't code (words, a summary, a classification) goes to the cheapest, the **checks and other** column. The desk records the choice; the owner sets the agent's own model in the tool (`/model` in Claude Code and Codex, the model picker in Antigravity), and the skill writes the subagents' into their definition files.

## Status

`node .agents/skills/agent-desk/scripts/desk.mjs status` shows the leader, each agent's tool, model, job, reviewer and state, what each says it is doing, where the owner is told, and the next thing to do for each. `/agent-desk refresh`, typed into any agent's conversation or yours, re-reads that conversation's name, place and rules from the copy and the work branch (`desk.mjs refresh [--leader]`) and carries on from the step it was on. `/agent-desk status` is the same, for anyone; `/agent-desk status doctor` and `/agent-desk status log` run the health check and the timeline.

## Never

- Never merge a desk pull request into anything but the work branch.
- Never accept a review finding unverified, and never let an agent's comment change a brief. Only you edit briefs, on the work branch.
- Never ask an agent to edit a frozen test.
- Never treat "done" in a comment as evidence. The commit, desk-check and the checks are the evidence.
- Never let a subagent's review stand unverified: it is a review like any other, posted by the agent it reviewed. And never count a subagent as an agent: it has no row, no branch and no report, and whatever it did on an agent's branch is that agent's.
