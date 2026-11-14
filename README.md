# agent-desk

An agent skill that runs a **desk** of AI coding agents in any GitHub repository. One leader writes briefs, each with failing tests. Up to six agents (two by default) take them on branches of their own, open pull requests and review each other. The leader decides and merges.

Each agent works in its own tool: **Claude Code**, **Codex** or **Antigravity**, in the cloud or in the app. Everything they share is in GitHub, so they need nothing else in common.

The skill is plain files in the open Agent Skills format, plus a few Node scripts. It needs Node 18 or later and has nothing to install. It belongs to no repository, branch or project: the folder `skill/agent-desk/` is the whole of it.

## Install the skill

Installing only makes the skill available to a tool. It sets up nothing and asks nothing about any project.

### Into a repository (needed for any agent in the cloud)

A tool in the cloud keeps nothing between sessions, so it reads skills from the repository it works on.

**Where: a terminal, in a clone of this repository**

```bash
node skill/agent-desk/scripts/install.mjs --target /path/to/your/repository
```

It writes `.agents/skills/agent-desk/` (Codex, Antigravity) and `.claude/skills/agent-desk/` (Claude Code), the same files. Commit and push them on a branch of your repository.

No clone? Download `agent-desk.zip` from this repository's releases and unzip it into both folders:

```bash
unzip agent-desk.zip -d .agents/skills/ && unzip agent-desk.zip -d .claude/skills/
```

### On your own computer (the apps)

```bash
node skill/agent-desk/scripts/install.mjs --for-me
```

It copies the skill into `~/.claude/skills/`, `~/.agents/skills/` and `~/.gemini/config/skills/`, so every project on that computer has it.

### As one file

```bash
node skill/agent-desk/scripts/install.mjs --pack --out agent-desk.zip
```

## Set up a project

Setup is per project, and a repository may hold any number, each on its own.

**Where: the leader's tool, in a session on your repository**

```
/agent-desk setup
```

In Codex, type `$agent-desk setup`. The leader asks the project's name, shows you the desk, and after your yes saves it in `agents/desk/<project>/`. It then gives you the wording that starts each agent: paste each into a conversation of its own, in that agent's tool, once. After that, `go` in that conversation moves the agent.

You can say more up front:

```
/agent-desk setup Project garden-app. Two agents: one in Codex for the server code, one in Antigravity for the pages. Each reviews the other.
```

## The commands

| Type | It does |
|---|---|
| `/agent-desk install` | makes the skill available: in a repository, on your computer, or as a zip |
| `/agent-desk setup` | sets up or changes one project's desk, and gives each agent's starting wording |
| `/agent-desk lead …` | the leader's work: `check`, `brief …`, `merge`, `plan`, `move`, `reassign`, `shape` |
| `/agent-desk agent <name> <project>` | starts a conversation's work as one agent |
| `/agent-desk status` | where a desk stands, and the next thing to do for each agent |
| `/agent-desk refresh` | puts an agent, or the leader, back on track |

The owner's guide is `skill/agent-desk/templates/guide.md`: set-up for each tool, every day's commands, and troubleshooting.

## What is where

| Path | What |
|---|---|
| `skill/agent-desk/` | the skill: `SKILL.md`, `commands/`, `protocol/` (the steps), `scripts/`, `templates/`, `VERSION` |
| `tests/` | the skill's tests |

A repository that uses the skill gains `agents/desk/<project>/` for each project (its settings, board and briefs), and the desk's rules in `AGENTS.md` and `CLAUDE.md`.

## Develop

```bash
npm test
```

The tests need Node 18 or later and git. They make repositories of their own in a temporary folder and reach no network.

## Licence

MIT. See `LICENSE`.
