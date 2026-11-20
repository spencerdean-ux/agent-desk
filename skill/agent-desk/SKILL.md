---
name: agent-desk
description: Runs an agent desk in any GitHub repository, where one leader directs up to six AI agents (two by default) in Claude Code, Codex or Antigravity through pull requests, on any number of projects. Use when the owner types /agent-desk (or $agent-desk in Codex) followed by install, setup, lead, agent, status or refresh, when a prompt begins "You are desk agent", or when the owner asks about the desk, how to set one up, how to start its agents or what to do next on it.
---

# The agent desk

One leader writes briefs, each with failing tests; agents take them on branches of their own, open pull requests and review each other; the leader decides and merges into the project's work branch. Everything is in GitHub, so it works in each tool's cloud and in its app alike.

This skill is the whole desk: these instructions, the steps (`protocol/`), the scripts (`scripts/`, Node 18 or later, nothing to install) and the templates. It belongs to no repository, branch or project. Every path below is relative to this skill's own folder, wherever a tool has loaded it from.

## What to do with the owner's words

The **first word** after `/agent-desk` (`$agent-desk` in Codex) says which part to follow. Read that one file, in this skill's folder, and follow it. The words after it are the owner's instructions for that part.

| First word | Read | It does |
|---|---|---|
| `install` | `commands/install.md` | makes this skill available: in a repository, on the owner's computer, or as a zip. It names no project and sets up no desk |
| `setup` | `commands/setup.md` | sets up or changes one project's desk: asks the project's name, who leads, the agents, their tools, models, jobs and reviewers, and ends with the wording that starts each agent |
| `lead` | `commands/lead.md` | the leader's work: a brief, checking the desk, a decision, a merge, moving or pausing an agent |
| `agent` | `commands/agent.md` | starts this conversation's desk work as one agent: `agent <name> <project>` |
| `status` | `commands/status.md` | where a desk stands, its problems, the next thing for each agent, and each agent's wording again |
| `refresh` | `commands/refresh.md` | puts an agent, or the leader, back on track from what the repository says |
| none, or a question | this file | answer from the map below |

A prompt that begins "Project: …" and "You are desk agent <name>" is `agent`, with its name and project. If the owner's words could mean more than one project, ask which: never guess a project.

## Install is one thing, setup another

- **Install** only makes the skill loaded and available. It copies this folder; it asks nothing about any project.
- **Setup** is per project, and there may be hundreds: each has a name the owner gives, a folder of its own, a work branch and a team. Nothing is shared between two projects but this skill.

A tool in the cloud keeps nothing between sessions, so it reads the skill from the repository it works on: `.agents/skills/agent-desk/` (Codex, Antigravity) and `.claude/skills/agent-desk/` (Claude Code). A tool's app on a computer also reads the owner's own folders. `install` covers both.

## Where things are, in a repository

| What | Where |
|---|---|
| This skill | `.agents/skills/agent-desk/` and `.claude/skills/agent-desk/`, the same files |
| One project's desk | `agents/desk/<project>/`: `desk.json` (the project's name, title, repository, work branch, leader, agents), `board.md` (who has which brief), `assignments/` (the briefs), `queue/` (briefs written ahead, their tests in `queue/tests/`), `status/` (what each agent says it is doing), `progress.json` |
| The desk's rules for agents | the desk's block in `AGENTS.md` (Codex, Antigravity) and `CLAUDE.md` (Claude Code) |
| An agent's branch | `desk/<project>/<agent>/<brief id>`, into the project's work branch |
| The steps | `protocol/`: `agent.md` (where every agent starts), `take.md`, `review.md`, `revise.md`, `subagent.md`, and `lead.md` for the leader |
| The owner's guide | `templates/guide.md`: set-up for each tool, in the cloud and in its app, every day's commands, troubleshooting |

Two projects in one repository sit side by side under `agents/desk/`. Where there is more than one, every script takes `--project <name>`; a copy that works on one project keeps its name in `git config desk.project`.

## The scripts

Run them with Node from the repository's root. In a repository the skill is installed in:

```bash
node .agents/skills/agent-desk/scripts/desk.mjs <command> [--project <name>]
```

`desk.mjs` with no command lists them all. The ones asked for most: `setup --project <name>`, `validate`, `status`, `prompts [agent]`, `set <agent> <state>`, `brief <id> --for <agent>`, `sync-board`, `doctor`, `log`, `suite`, `plan`, `push`, `reassign`, `shape`, `move`, `subagents`, `models`, `refresh`, `goodnight` and `wake` (the owner's good night, and their `go` after it), `end` (a finished project: its branches deleted, its desk archived), `migrate` (a desk from before each project had its own folder). `check.mjs <brief id>` is desk-check, which holds a branch to its brief. `wait.mjs` is an awake agent's or leader's look at the desk. `cleanup.mjs --local` clears an agent's own copy once its project has ended. `install.mjs` copies this skill.

## The spin-up wording

Every agent is started by a prompt pasted once into a conversation of its own, in its own tool. The prompt is self-sufficient: it names the repository, the project and the work branch and says where the steps are, so it works whether or not that tool has loaded this skill. After the first paste, `go` in that conversation moves the agent.

**Always give the wording.** Setup, status, and every change to who works where (`move`, `reassign`, `subagents`, a new agent) end with each affected agent's prompt, whole, in a copyable block of its own, under a line saying where it is pasted, for that tool's cloud and its app. `desk.mjs prompts [agent]` prints them at any time. Never summarise a prompt, and never tell the owner to go and find it.

## Who does what

- **The leader** is named in the project's desk.json (`leader`). It writes briefs and their failing tests, keeps the board, reviews, decides, and merges into the work branch only. It starts an agent itself only in its own tool (`started_by: "leader"`); the owner starts the others by pasting their wording.
- **Agents:** two unless the owner says otherwise, six at most, each with a tool, a model (recorded, chosen by the owner in that tool), a job, a reviewer and a block of ports.
- **Reviewers:** a ring by default; `pairs`, or one dedicated `reviewer`, by name (`desk.mjs shape`).
- **Subagents:** one agent may be allowed up to two of its own, for adversarial review of its own diff and for checks only; they never write, commit, push or post (`protocol/subagent.md`).
- **Which model for what:** `desk.mjs models [<tool>]` lists each tool's four and which plans, codes, reviews and checks.

## Rules that hold everywhere

- Name the project in every brief, branch, pull request, comment and prompt.
- Agents never work into the default or a release branch, never merge, never edit a frozen test, the desk's files or the rules files, and never bypass a git hook.
- The leader never drives another tool's agent or uses its sign-in.
- Give the owner instructions as numbered steps, each with **Where:** it is done and what is typed in a copyable block.
- Never ask the owner to paste a secret into a conversation.
