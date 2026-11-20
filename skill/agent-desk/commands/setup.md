# setup: one project's desk

Setup is per project. A repository may hold many, each on its own; nothing here assumes there is only one. The owner's words after `setup` may already answer some of what follows: take those as given and ask only the rest.

You must be the leader, or about to become it. If the words name another tool as the leader, say that setup is run in that tool, and stop.

## Before the questions

1. **Is the skill in this repository?** Agents in the cloud read their steps from `.agents/skills/agent-desk/` on the work branch. If it isn't there, follow `commands/install.md` (into this repository) first, then come back.
2. **Is this project set up already?** `agents/desk/<project>/desk.json` on the work branch, or in this checkout. If so, you are changing it: read it, ask only about what the owner wants changed, and go to "Show, save, start". A desk at `agents/desk/desk.json` is from before projects had folders: `node .agents/skills/agent-desk/scripts/desk.mjs migrate` moves it.
3. **Read the defaults:** `node .agents/skills/agent-desk/scripts/desk.mjs defaults` prints every setting, its value and whether it is the skill's own or this repository's (`agents/desk/defaults.json`). The defaults you show in the questions are those, not the ones written below, wherever they differ.

## The questions, in three rounds

Ask each round as one message: with your tool's question form where it has one, else as a numbered list the owner can answer in a line each. Show every question's default. **The owner may answer "use the defaults for the rest" at any point**: on it, stop asking and take every default not yet answered. Never make up a project's name.

**Round 1: the project and the team**

1. What is this project called? Lower-case letters, digits and hyphens, such as `garden-app`; and a one-line title. (No default: always asked.)
2. How many agents? (default: 2) From 1 to 6.
3. How many of each type: **Claude** (Claude Code), **ChatGPT** (Codex), **Gemini** (Antigravity)? (default: none named; then each agent's tool is asked) The counts must add up to the number of agents.
4. Which models each agent may use? (default: any) Show the tool's models with `node .agents/skills/agent-desk/scripts/desk.mjs models <tool>` and let the owner pick one or more, or type any name. An agent that finds itself on a model not on its list stops and says so.

**Round 2: the work**

5. How many briefs should be kept ready for each agent, behind the one it is working on? (default: 1)
6. How many spare briefs should be kept for whichever agent runs out first? (default: 0)
7. Should the desk pre-write every wave and brief from the spec before the agents start? (default: no) If yes, you write them all, show the owner the plan wave by wave, and wait for a yes; after each wave you check the rest against what was built, for 10 minutes at most ("Pre-writing the waves" in `protocol/lead.md`).
8. Where is the spec? (default: `docs/`)
9. What is each agent's job, in a line? (default: the first has the server side and its tests, the second the pages people see and theirs) Jobs must not overlap.
10. Who reviews whom? (default: a ring, each agent reviews the next) Or pairs, or one named agent reviews everyone.

**Round 3: how it runs**

11. Automatic checking: should agents keep checking the desk by themselves between steps? (default: no) A yes needs the notifications issue, where a silent agent is reported: `node .agents/skills/agent-desk/scripts/desk.mjs notify --setup --create` makes it.
12. After how many minutes without a report is an agent on automatic checking called silent, and the owner warned? (default: 20)
13. How long does the leader keep watching with nothing moving? (default: 60) In minutes.
14. Compaction: where should each agent's conversation compact? (default: 500,000) In tokens. Another figure from 100,000 to 1,000,000, or **not set by the skill**, which leaves every tool's own setting alone.
15. May the first agent start subagents of its own, up to 2, to review its own diff and run checks? (default: yes)
16. Who starts each agent? (default: the owner, by pasting its wording) You may start one yourself only in your own tool.
17. The work branch? (default: the branch this checkout is on) Never the default branch or a release branch; `work/<project>` is offered when this checkout is on one.

**Read from the repository, not asked:** the parts of its test command (`suite`), the files every brief adds a line to (`shared_lists`), what its checks need installed (`setup`), the variables its test servers read their ports from (`port_env`), its guarded build and deploy files (`protected`), and each agent's ports. Show them in the summary; the owner may change any.

## Show, save, start

18. **Show the owner the desk before saving:** the project's name and title, the repository and work branch, a table of each agent's name, tool, models, job, reviewer and who starts it, every setting from the three rounds, and what was read from the repository. Mark each answer that differs from its default. Write nothing until they say yes.
19. **Save it.** For a new project, one command carries the answers:

    ```bash
    node .agents/skills/agent-desk/scripts/desk.mjs setup --project <name> --title "<one line>" \
      --leader <your name on the desk> --leader-tool <claude-code|codex|antigravity|other> \
      --claude <n> --codex <n> --antigravity <n> --models "<agent or tool>=<model>|<model>;<agent>=<model>" \
      --ready <n> --spare <n> [--prewrite] --specs <path> --shape <ring|pairs> \
      [--awake] --silence <minutes> --idle <minutes> --autocompact <tokens|off> [--subagents off] \
      [--work-branch <branch>] [--repo <owner/name>]
    ```

    Leave out any option whose answer is the default. `--agents <n>` alone, with no count per tool, makes that many agents whose tools you then set by hand. Then edit `agents/desk/<project>/desk.json` for what the command doesn't take (each agent's job, a dedicated reviewer, `started_by`), and run

    ```bash
    node .agents/skills/agent-desk/scripts/desk.mjs sync-board --project <project>
    node .agents/skills/agent-desk/scripts/desk.mjs validate --project <project>
    ```

    Validate must pass. Commit `desk(<project>): <what changed>` and push to the work branch.
20. **Ask about a new default, once.** Setup prints the answers that differ from the defaults. Ask the owner: "These differ from the defaults: … Should any become the new default for future projects in this repository?" For each yes, `node .agents/skills/agent-desk/scripts/desk.mjs defaults --set <key>=<value>` (for example `defaults --set autocompact=300000`, or `autocompact=off`), then commit `agents/desk/defaults.json`. A no changes nothing. Never set a default the owner didn't name.
21. **If pre-writing was asked for,** do it now, before any agent is started: `protocol/lead.md`, "Pre-writing the waves".
22. **Give the spin-up wording, always.** Run `node .agents/skills/agent-desk/scripts/desk.mjs prompts --project <project>` and give the owner every agent's prompt, whole, each in its own copyable block, under a **Where:** line saying where it is pasted for that agent's tool, in the cloud and in the app. Never leave this step out, never shorten a prompt, and do it again after any change to an agent. Start any `started_by: "leader"` agent yourself, in your own tool only.

A model can only be recorded, not set: tell the owner to choose it in that agent's tool. If the owner asks for more than 6 agents, or for you to start an agent in a tool that isn't yours, say why not and offer the nearest thing allowed.
