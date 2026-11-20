# setup: one project's desk

The owner's words after `setup` say what they want: the project's name, who leads, how many agents, each one's tool, model and job, who reviews whom, the work branch. Setup is per project. A repository may hold many, each on its own; nothing here assumes there is only one.

You must be the leader, or about to become it. If the words name another tool as the leader, say that setup is run in that tool, and stop.

1. **The project's name comes first.** If the words don't give one, ask for it, and for a one-line title: "What is this project called? (lower-case letters, digits and hyphens, such as `garden-app`)". Never make one up, and never reuse another project's.
2. **Is the skill in this repository?** Agents in the cloud read their steps from `.agents/skills/agent-desk/` on the work branch. If it isn't there, follow `commands/install.md` (into this repository) first, then come back.
3. **Is this project set up already?** `agents/desk/<project>/desk.json` on the work branch, or in this checkout. If so, you are changing it: read it, and go to step 5. A desk at `agents/desk/desk.json` is from before projects had folders: `node .agents/skills/agent-desk/scripts/desk.mjs migrate` moves it.
4. **A new project.** Read `protocol/lead.md`, "Setting up or changing the desk", for the defaults. Then:
   - the work branch is this checkout's own, unless that is the default or a release branch; then make one (`git switch -c work/<project>`) or ask the owner which;
   - run `node .agents/skills/agent-desk/scripts/desk.mjs setup --project <name> --title "<one line>" --leader <your name on the desk> --leader-tool <claude-code|codex|antigravity|other>` (add `--work-branch <branch>`, and `--repo <owner/name>` if there is no GitHub origin). The leader is you: give your own name (lower-case, such as `claude` or `codex-lead`) and the tool you run in. It reads the repository and the branch itself, writes `agents/desk/<project>/desk.json` with two agents and the board, and the desk's block in `AGENTS.md` and `CLAUDE.md`.
5. **Fill in the team** from the owner's words and lead.md's defaults: 2 agents unless told, never more than 6; each agent's name, tool (`claude-code`, `codex`, `antigravity`, `other`), model, job, reviewer and `started_by`; a shape by name if asked (`ring`, `pairs`, a dedicated `reviewer`); subagents for one agent if asked; `suite` and `shared_lists` read from the repository. Ask at most three questions, and only about what can't be defaulted.
6. **Show the owner the desk before saving:** the project's name and title, the repository and work branch, a table of each agent's name, tool, model, job, reviewer and who starts it, and what changes from today. Write nothing more until they say yes.
7. **Save it:** edit `agents/desk/<project>/desk.json`, then

   ```bash
   node .agents/skills/agent-desk/scripts/desk.mjs sync-board --project <project>
   node .agents/skills/agent-desk/scripts/desk.mjs validate --project <project>
   ```

   Validate must pass. Commit `desk(<project>): <what changed>` and push to the work branch.
8. **Give the spin-up wording, always.** Run `node .agents/skills/agent-desk/scripts/desk.mjs prompts --project <project>` and give the owner every agent's prompt, whole, each in its own copyable block, under a **Where:** line saying where it is pasted for that agent's tool, in the cloud and in the app. Never leave this step out, never shorten a prompt, and do it again after any change to an agent. Start any `started_by: "leader"` agent yourself, in your own tool only.
9. Offer, in one line, to be told on a GitHub issue (`desk.mjs notify --setup --create` makes it; `notify --setup --issue <N>` uses one that exists). It is needed before automatic checking can be turned on (`awake on`), because that issue is where a silent agent is reported.

A model can only be recorded, not set: tell the owner to choose it in that agent's tool. If the owner asks for more than 6 agents, or for you to start an agent in a tool that isn't yours, say why not and offer the nearest thing allowed.
