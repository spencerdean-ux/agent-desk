# The agent desk: one leader and a few AI agents, working through GitHub

Each desk is a **project** with a name of its own (such as `garden-app`), so several can run at once without mixing. One **leader** directs up to six **agents** (two by default). Each agent works in its own tool: Claude Code, Codex or Antigravity. You start each agent by pasting its prompt; the leader writes the briefs, reviews the work and has the final say. Everything goes through GitHub branches and pull requests.

| Who | Where it runs |
|---|---|
| **The leader** (usually Claude) | the tool named in `agents/desk/<project>/desk.json` under `leader`, on this repository |
| **The agents** | each in the tool its entry in desk.json names, signed in with your own account |
| **You** | any browser, or the tools themselves |

How a piece of work moves:

1. **The leader writes a brief** for an agent, with the failing tests it must make pass, and sets the agent's row on `agents/desk/<project>/board.md` to **ready**.
2. **You paste the agent's prompt once** into a conversation in that agent's tool, and keep that conversation. It reads its steps from GitHub, does the brief on its own branch, checks it, pushes and opens a draft pull request.
3. **You type `go` in the reviewer's conversation** (its prompt, the first time). It reviews the pull request adversarially and posts one comment, then does its own work if any fits.
4. **The leader decides.** It watches the project's pull requests, so the review wakes it (or you tell it `/agent-desk lead check`). It reruns the checks, weighs the review, does its own, and posts a `Desk decision for <project>:` with each finding marked fix, rejected or question.
5. **You type `go` in the author's conversation.** It sees the decision and fixes only what it says.
6. When nothing blocking is left and the checks pass, **the leader merges** into the work branch, never `main` or a release branch, on its own where you have allowed it, and puts up the next brief.

Each agent's prompt is pasted once per conversation and starts with the project's name; after that, `go` is all it needs. The agent works out from its project's board what fits: a review first, then its own revision or brief, each once per `go`.

## The commands

In **Claude Code** and **Antigravity** type `/` and the command. In **Codex** type `$` and the command, or choose it from `/skills`. Put your instructions after it in plain words. Where the repository has more than one project, start them with the project's name.

| Command | Type it into | For example |
|---|---|---|
| `/agent-desk install` | any of the three tools | `/agent-desk install` (the skill into this repository), `/agent-desk install for me` (your own computer), `/agent-desk install as a zip`. It only makes the skill available: it asks nothing about any project |
| `/agent-desk setup` | the leader | `/agent-desk setup Project garden-app. Claude leads. Two agents: gemini-x in Antigravity for the server code, codex-x in Codex for the pages. Each reviews the other.` |
| `/agent-desk status` | the leader (or any tool) | `/agent-desk status`, `/agent-desk status prompts`, `/agent-desk status doctor` (is the desk in order?), `/agent-desk status log` (what happened while you were away) |
| `/agent-desk agent` | each agent's tool | `/agent-desk agent codex-x garden-app` (in Codex: `$agent-desk agent codex-x garden-app`) |
| `/agent-desk lead` | the leader | `/agent-desk lead check`, `/agent-desk lead garden-app brief step A3 for codex-x`, `/agent-desk lead next` (the next brief from the spec), `/agent-desk lead notify issue #12` (be told on a GitHub issue), `/agent-desk lead review #N` (a helper in the leader's own tool reviews), `/agent-desk lead subagents gemini-x on` (one agent reviews its own work with subagents), `/agent-desk lead models` (which model for what), `/agent-desk lead reassign A3 to codex-x` (hand an open brief on), `/agent-desk lead shape reviewer codex-x` (who reviews whom), `/agent-desk lead plan` (the next briefs, and who would sit idle), `/agent-desk lead watch` (the leader watches the pull requests and decides unasked), `/agent-desk lead pause gemini-x` |
| `/agent-desk refresh` | the agent's own conversation, or the leader's | `/agent-desk refresh` (in Codex: `$agent-desk refresh`): the agent re-reads who it is, what it is doing and the rules, says them back and carries on from where it was |
| `/agent-desk` | any | the desk's map: who leads, how many agents, where things are |

---

## One-time set-up

Two separate things: the **skill** is installed once in each place a tool looks for it; a **project** is set up each time you start one, and there can be any number.

### 1. Make the skill available

A tool in the cloud keeps nothing between sessions, so it reads the skill from the repository it works on. A tool's app on your computer also reads your own skills folders.

**In the repository (needed for any cloud agent). Where: any tool that already has the skill, in a session on that repository**

```
/agent-desk install
```

✅ The repository gains `.agents/skills/agent-desk/` (Codex, Antigravity) and `.claude/skills/agent-desk/` (Claude Code), the same files, committed and pushed on a branch. Nothing about any project is written.

**On your own computer (the apps). Where: a terminal, in a folder that holds the skill**

```bash
node .agents/skills/agent-desk/scripts/install.mjs --for-me
```

✅ `~/.claude/skills/agent-desk/`, `~/.agents/skills/agent-desk/` and `~/.gemini/config/skills/agent-desk/` exist, so `/agent-desk` works in every project there.

**No copy anywhere yet?** Unzip `agent-desk.zip` (`install.mjs --pack` makes it from any copy) into the repository's `.agents/skills/` and `.claude/skills/`, commit and push; or upload the zip where your tool takes a skill that way.

### 2. Set up a project

**Where: the leader's tool, in a session on the repository**

```
/agent-desk setup Project garden-app. Claude leads. Two agents: gemini-x in Antigravity for the server code, codex-x in Codex for the pages. Each reviews the other.
```

Say as much or as little as you like. **The leader asks the project's name if you leave it out**, and never makes one up. Whatever else you leave out takes a default:

- **How many agents:** 2, and never more than 6.
- **Reviewers:** a ring (a reviews b, b reviews a; with three, a → b → c → a). With one agent, the leader reviews.
- **Model:** each agent's model is only recorded, as `null` (the tool's own choice) unless you name one. You choose it in that agent's tool; the agent says so if it finds itself on another.
- **Who starts each agent:** you, unless the agent runs in the leader's own tool and you ask the leader to start it (`started_by` in desk.json).
- **Work branch:** the branch the leader's session is on, unless that is the repository's default or a release branch; then the leader makes `work/<project>` or asks.

✅ The leader shows a table of the desk and waits for your **yes**. It then saves the project in a folder of its own, `agents/desk/<project>/` (`desk.json`, the board), adds the desk's rules to `AGENTS.md` and `CLAUDE.md` (keeping anything they already say), and **gives you each agent's spin-up wording**: every prompt whole, in its own box, with where to paste it.

Another project in the same repository is the same command with another name. Each keeps to its own folder; where there is more than one, name the project in every command (`/agent-desk lead garden-app check`).

### 3. Set up each agent's tool

Do the part for each tool your desk uses. Each agent has **one conversation of its own**, for good: paste only that agent's wording into it, once, and type `go` there afterwards.

#### Antigravity Remote Agents (in a browser, Google's cloud)

**Where: a web browser → antigravity.google.com**

1. Sign in with the Google account that holds your subscription.
2. Check for **Create Project** next to **Projects** in the left sidebar. If it isn't there, Remote Agents hasn't reached your account yet.
3. **Settings:** the **Permission Preset** starts on **always-proceed (turbo)**, which runs every command without asking. Keep it there for an agent you will keep awake (Staying awake, below): one that asks can't work while you're away, and the desk's own guards (desk-check before every push, the other agent's review, the leader's decision and merge) stand in for the ask. For an agent you move yourself with `go`, **request review** (it asks before every command) or **default** (before sensitive ones) is safer. Set **Plan Review Policy** to **always ask** either way.
4. **Create Project** → **Add Resource** → **GitHub** → **Connect GitHub**, approve, choose this repository, and name the project after it.

Each agent gets its own conversation in that project, for good, and each conversation is named after its agent (`agent-a`, `agent-b`, …, whatever desk.json calls them): paste only that agent's prompt into it, and type `go` only there. The agent's copy keeps its name (`git config desk.slot`, written on its first turn), so a prompt or a `go` meant for another agent is refused rather than obeyed, and desk-check refuses a brief that isn't the copy's agent's.

#### Antigravity on a computer (the app or the command line)

Each agent needs a clone of its own, opened on its own. Three agents started on one folder share one `.git/config`, so the first writes its name there and the other two stop at their first step (they are right to); and a clone with the repository's git hooks on can push nothing of the desk's. This is **one clone per agent**, hooks off, one project per agent in the app.

1. **Where: a terminal on your computer.** Make a clone for each agent, named after it, outside any other clone:

   ```bash
   git clone https://github.com/<owner>/<repo>.git ~/<parent>/<repo>-<agent>
   ```

   (The folder you already have may serve the first agent, if no other agent has ever run in it.) Never run `npm run hooks`, or anything that sets `core.hooksPath`, in an agent's clone: the desk pushes its board commits from a temporary worktree with no `node_modules`, and a repository hook that needs them, or a review receipt, refuses every push. The desk never bypasses a hook for you.

   ✅ `git -C ~/<parent>/<repo>-<agent> config core.hooksPath` prints nothing. If it prints a path, `git -C ~/<parent>/<repo>-<agent> config --unset core.hooksPath`.

2. **Where: the Antigravity app.** For each agent: **Projects** → new project, named after the agent (`<repo> · <agent>`) → **Folders** → add that agent's clone, and no other folder.

   ✅ The project lists one folder, that agent's.

3. In that project, start a new conversation and choose **Local** (work in the folder as it is), never **Worktree**: a worktree would share the clone's git with whatever already runs there. Paste that agent's prompt, from `/agent-desk status` or `node .agents/skills/agent-desk/scripts/desk.mjs prompts <agent>`. The app loads the desk's skills from the clone's `.agents/skills/` and the rules from `AGENTS.md`; `/agent-desk agent <agent> <project>` works there too.

   ✅ The agent's first line reads "<agent> on <project>, working into <work branch>."

4. The check, once per agent: ask it `pwd && git config desk.slot`.

   ✅ The path ends in that agent's folder and the slot is that agent's name. Anything else: stop that conversation, and start again at step 1 with a clone of its own.

If your app's sidebar says "workspace" or "Agent Manager" where this says project, they are the same thing: one project (workspace) per agent, one folder in it. The command line (`agy`) runs in the clone's folder and needs steps 1 and 4 alone.

#### Codex

**In the cloud. Where: Codex on the web**

1. Connect GitHub and choose this repository as the task's environment, on the project's work branch.
2. Start a task of its own for the agent and paste its wording.

✅ The agent's first line reads "<agent> on <project>, working into <work branch>." Codex reads the skill from the repository's `.agents/skills/` and the rules from `AGENTS.md`; `$agent-desk agent <name> <project>` does the same as the wording once the skill is there.

**In the app or the command line. Where: your computer**

1. Give the agent a clone of its own (as for Antigravity on a computer, step 1), with the repository's git hooks off.
2. Open Codex in that clone and paste the agent's wording, or type `$agent-desk agent <name> <project>`.

If Codex can't push the branch or open the pull request itself, the agent says so and gives the branch name: open it with Codex's own button, then tell the leader the number.

#### Claude Code as an agent

**In the cloud. Where: claude.ai/code**

Start a new session on this repository and paste the agent's wording. It reads the skill from the repository's `.claude/skills/` and the rules from `CLAUDE.md`.

**In the app or the command line. Where: your computer**

Open Claude Code in a clone of the agent's own and paste the wording, or type `/agent-desk agent <name> <project>`.

Or set `started_by` to `leader` when the leader is in Claude Code too, and the leader starts it itself (`/agent-desk lead start <name>`).

#### If an agent has subagents

Where desk.json gives an agent subagents (below, "One agent reviews its own work"), the desk has written their definitions into the repository, and the agent's tool reads them from its clone once the work branch is pulled: nothing to set up, one check each.

- **Claude Code:** `/agents` in the agent's session lists `desk-review` and `desk-checks`. ✅ Both are there, `desk-review` on the review model (`opus` unless set).
- **Codex:** `/subagents` in the agent's session lists them (subagents are on by default in Codex). ✅ `desk-review` shows `gpt-6.1-sol` unless set, with the shell off.
- **Antigravity:** the clone's `.agents/agents/` folder holds `desk-review.md` and `desk-checks.md`. ✅ `ls .agents/agents/` in the agent's clone lists both; its subagents run on Gemini tiers (`pro`, `flash`) whatever model the agent itself is on.

If a tool lists neither, the clone is behind the work branch (`git pull`), or `.gitignore` keeps the folder out: `/agent-desk status doctor` names a definition that is missing.

### 4. Check the desk is ready

**Where: the leader**

```
/agent-desk status
```

✅ It lists the leader and each agent with its tool, model and job, any problems, and the next thing to paste.

---

## Every day

| Step | Where | Type or paste |
|---|---|---|
| 1 | each agent whose board row says **ready** | `go` in its conversation (its prompt from `/agent-desk status`, or `/agent-desk agent <name> <project>`, the first time) |
| 2 | the reviewer's conversation | `go` (the first time, its prompt with the pull request in it: `node .agents/skills/agent-desk/scripts/desk.mjs prompts <reviewer> --review #N`) |
| 3 | the leader | nothing: it watches the pull requests and decides when the review lands (`/agent-desk lead check` if it hasn't) |
| 4 | the author's conversation | `go` (it revises) |
| 5 | the leader | nothing: it checks again, merges what has passed and puts the next brief up from the spec ("The next brief writes itself"), telling you on the desk's issue if you asked to be told |

When in doubt, ask the leader `/agent-desk status`: it says the one next thing for each agent, what each agent says it is doing, and where. Once a conversation holds an agent's prompt, `go` is all it ever needs for that project. With the agents awake (next), steps 1, 2 and 4 need nothing from you either.

## What each agent is doing

Each agent reports as it works, so you needn't guess from the board: taking a brief, working (with the step it is on), checking, pushed, reviewing, revising, blocked (with what it ran out of), waiting, stopped. The report is one small file per agent on the work branch, written by the desk's own command at every step boundary, and the leader reports too (checking, deciding, merging, awake, asleep).

**Where: the leader**

```
/agent-desk status
```

✅ The table's **Agent says** column shows each report with its age ("working A5c (4: the launch job) · 3 min ago"), and the leader's own line. An awake agent that has reported nothing for **20 minutes** is shown as **silent**, with its last report, and the leader tells you once; `silence_minutes` in desk.json changes the window. A **blocked** agent is helped by the leader at its next look (within five minutes); a **pushed** report is checked the same way, so a finished brief no longer waits for the leader to notice the branch. The draft pull request opens at the agent's first commit, titled "· in progress", so the leader is watching it from the start.

## Is the desk in order?

One command checks the whole desk and says what to do about each thing it finds: a row whose branch was never pushed, a branch no row names, an agent silent or blocked, a pull request closed while its row still says review, an agent's copy that forgot its tool, a kit that needs reinstalling.

**Where: the leader**

```
/agent-desk status doctor
```

✅ "The desk for garden-app is in order: nothing to fix", or a numbered list, each with a `fix:` line the leader can run. It changes nothing by itself. Pull requests are checked through GitHub's command line (`gh`) where the tool has it, and otherwise the line says "pull requests not checked".

## What happened while you were away

**Where: the leader**

```
/agent-desk status log
```

✅ A timeline of the desk, oldest first: who took what and when, each report, every board move, every brief put up, every merge, read from the work branch's own history. `/agent-desk status log since 2d` goes back two days; `/agent-desk status log for gemini-x` keeps one agent's; `/agent-desk status log --md` gives a digest to paste or keep.

## Being told

The desk can tell you, on one GitHub issue per project, when something needs you or finishes: an agent **blocked** (with what it ran out of), an awake agent **silent** for 20 minutes, the desk **asleep**, a brief **merged** (with what went up next), and a **question** only you can answer. Each is one short comment, told once, so GitHub's own email and phone notifications bring it to you; nothing posts twice. It is off until you set it up.

**Where: the leader**

```
/agent-desk lead notify issue #12
```

(Or let the leader make the issue for you: `/agent-desk lead notify set up an issue`. It is titled "Desk notifications for garden-app".) ✅ The leader records it in desk.json (`notify.issue`) and pushes; `/agent-desk status` says "Notifications: issue #12 (blocked, silent, asleep, merged, question)". To be told of fewer things: `/agent-desk lead notify issue #12 for blocked and silent`. To stop: `/agent-desk lead notify off`.

The leader posts through `gh` where its tool has it, and otherwise with its own GitHub connection; either way the words are the desk's. Subscribe to the issue in GitHub, or watch it, so the notifications reach you where you want them.

**The silence warning.** When an agent on automatic checking (Staying awake, below) has reported nothing for **20 minutes**, the leader's own look posts one comment on that issue: "**gemini-x has been silent for 23 minutes** … If its conversation has stopped, type `go` there." It is posted once for each silence, by the desk's script, not left for the leader to remember. Two things to know: it needs the issue, so automatic checking can't be turned on until one is set; and it is the leader's look that posts it, so if the leader's own conversation has stopped, nothing is posted. The number of minutes is `silence_minutes` in the project's desk.json.

## Staying awake

Agents can work while you're away. The switch is **off by default**: an agent does what fits and then waits for your `go`. Turn it on and an agent that has finished its steps stays in its conversation, running the desk's `.agents/skills/agent-desk/scripts/wait.mjs`, which looks at the board on GitHub every few minutes and starts the next review, revision or brief by itself. Nothing runs anywhere but in that agent's own conversation, in its own tool, under your own sign-in.

**Where: the leader**

```
/agent-desk lead awake on
```

For one agent only: `/agent-desk lead awake on gemini-x`, and `/agent-desk lead awake off gemini-x` to put one back to `go`. The leader saves it in `agents/desk/<project>/desk.json` and pushes.

**Where: each agent's conversation** (Antigravity, Codex or Claude Code)

Paste the agent's prompt once (`/agent-desk status prompts` has it, and it says the agent is awake). From then on it keeps going on its own. An agent already running learns the switch at its next `go`.

What it needs, and what to expect:

- **Permissions:** the agent must be allowed to run commands without asking. On Antigravity Remote Agents that is the default preset, always-proceed (turbo); leave it there for awake agents (set-up step 3).
- **What it says:** an awake agent reports `waiting` once when it settles, and `stopped` if it ends its turn, so `/agent-desk status` tells a waiting agent from one that has gone.
- **You are told if one goes quiet:** the leader asks for the notifications issue before it turns this on (Being told, above), and posts there when an agent has been silent for 20 minutes.
- **In Antigravity an agent waits on a timer.** Between looks it sets a three-minute timer with Antigravity's own `schedule` tool and ends its turn, so you will see a short turn every few minutes rather than one that never ends. It never waits inside a running command: that is what made an Antigravity agent hang after about an hour. If Antigravity gives the agent no timer, it says so once, reports `stopped`, and waits for your `go`.
- **How long it lasts:** in Claude Code and Codex the agent's tool decides how long one turn may run. If a conversation has stopped and reported, type `go` and it carries on.
- **Stopping one:** type `stop` in its conversation, or `/agent-desk lead awake off <agent>` (it stops at its next look and says so). `/agent-desk lead pause <agent>` keeps it awake but gives it nothing.
- **What you still do:** nothing day to day. The leader puts briefs up, decides and merges; you approve releases beyond the work branch as before, and check in with `/agent-desk status` when you like.

**The leader stays awake too,** and this is on from the start: it keeps looking at the desk by itself (a pull request event wakes it at once, an agent's report or push within five minutes), decides and merges, and goes to sleep after an hour with no activity on the desk, so a finished desk doesn't keep a session running. You set the run time:

**Where: the leader**

```
/agent-desk lead awake leader on --idle 120
```

That keeps it awake until two hours have passed with nothing moving; `/agent-desk lead awake leader off` makes it wait for your `/agent-desk lead check` instead. Asleep, it tells you so in one line, and `/agent-desk lead watch` (or any desk command) wakes it. `/agent-desk status` says whether the leader is awake and its window.

## What setup asks, and your own defaults

`/agent-desk setup` asks its questions in three short rounds, each with its default shown. Answer what you care about and say **"use the defaults for the rest"** at any point.

| Round | It asks | Default |
|---|---|---|
| 1. The project and the team | the project's name and a one-line title; how many agents; how many are Claude, ChatGPT (Codex) and Gemini (Antigravity); which models each may use | 2 agents; any model |
| 2. The work | briefs kept ready for each agent; spare briefs for anyone; whether to pre-write every wave and brief; where the spec is; each agent's job; who reviews whom | 1 ready; 0 spare; no; `docs/`; a ring |
| 3. How it runs | automatic checking; minutes of silence before you are warned; how long the leader watches; compaction; subagents; who starts each agent; the work branch | off; 20; 60; 500,000 tokens; the first agent; you; this branch |

It then shows you the whole desk and writes nothing until you say yes.

**Your own defaults.** When an answer differs from the default, the leader asks once whether it should become the default for future projects in this repository. Say yes and it is kept in `agents/desk/defaults.json`, which the next setup starts from. For example, to have every new project compact at 300,000 tokens, or to have the skill leave compaction alone:

**Where: the leader**

```
/agent-desk lead defaults autocompact 300000
```

```
/agent-desk lead defaults autocompact off
```

`/agent-desk lead defaults` shows them all and says which are yours. They are kept per repository, because the cloud tools start on a fresh machine each time and would never see a file on your computer. A project already set up doesn't change when a default does.

**Models an agent may use.** If you list models for an agent, it checks before it works. On another model it does nothing, says which model it is on and which are allowed, and stops. You then either switch the model in that tool and type `go`, or, in that same conversation, type:

```
allow this model
```

✅ The agent adds that model to its own list and carries on.

**Briefs kept ready, and spares.** "Ready" is how many briefs the leader keeps written behind the one each agent is working on, so an agent never waits for the leader. "Spare" briefs belong to nobody: whichever agent runs out first is given the next one.

**Pre-writing the waves.** If you say yes, the leader writes every brief for the whole spec before anyone starts, grouped into waves (a wave is one round the agents work side by side), and shows you the plan. No agent starts until you say yes to it. After each wave it spends at most 10 minutes checking the remaining briefs against what was actually built, changes only those that need a major change, and tells you in one line if it ran out of time.

## Good night

To stop everything until you are back, without losing anything:

**Where: the leader**

```
good night
```

✅ The leader marks the desk asleep on GitHub. Each agent on automatic checking sees it within about three minutes, reports `asleep` and stops; then the leader reports `asleep` and stops too, and tells you in one line. No silence warning is sent while the desk is asleep.

**To wake it, the leader first, then each agent:**

1. **Where: the leader.** Type:

   ```
   go
   ```

   ✅ It says the desk is awake again and lists each agent's conversation.
2. **Where: each agent's conversation.** Type:

   ```
   go
   ```

   ✅ Each carries on, back on automatic checking if it was before.

If you type `go` to an agent first, it answers "the desk is asleep: type `go` at the leader first" and does nothing. That is how it is meant to work.

## Ending a project

When a project is finished, this clears away every branch the agents opened.

1. **Where: the leader.** Type:

   ```
   /agent-desk lead end
   ```

   ✅ It lists every agent branch of the project on GitHub, each marked **merged** or **not merged**, with any open pull request. Nothing is changed yet.
2. Read the list. A branch marked **not merged** holds work that is not in your work branch.
3. **Where: the leader.** If the list is right, type:

   ```
   yes, end it
   ```

   ✅ The leader archives the project's desk (to `agents/desk/archive/<project>/`), closes the open pull requests, deletes the agents' branches and closes the notifications issue. If any branch is not merged it stops and asks you about each by name before deleting it. Your work branch is never deleted.
4. **Where: each agent's conversation.** Type:

   ```
   the project has ended: run the clean-up
   ```

   ✅ The agent removes its own copy's desk branches and its name (`cleanup.mjs --local`). An agent still on automatic checking does this by itself. Then close the conversation.

## Several projects at once

Give each project its own name. The leader gives each its own work branch, `desk.json` and board, and every branch (`desk/<project>/<agent>/<brief id>`), pull request, comment and prompt carries the name. Two rules keep them apart:

- **Start a new conversation for each project** in each agent's tool. An agent stops if its conversation has already worked on another project, or if its prompt's project isn't the one on its work branch.
- **Name the project after the command** whenever the repository has more than one: `/agent-desk lead garden-app check`, `/agent-desk status garden-app`, `/agent-desk agent codex-x garden-app`.

## Changing the team later

**Where: the leader**

```
/agent-desk setup add a third agent, claude-x, in Claude Code, for tests, started by the leader
```

```
/agent-desk setup gemini-x uses Gemini 4 Argon
```

```
/agent-desk setup remove codex-x
```

The leader shows the change and waits for your yes. It won't remove an agent that is in the middle of a brief.

### Who reviews whom: the desk's shape

**Where: the leader**

```
/agent-desk lead shape reviewer codex-x
```

Three shapes have names:
- **ring:** each agent is reviewed by the next. Every agent also stops to review, and none is a bottleneck.
- **pairs:** 1 and 2 review each other, 3 and 4. An odd one out is reviewed by the leader.
- **reviewer <agent>:** one dedicated reviewer reviews every pull request and writes no code, and the leader reviews it. It is the one bottleneck, but every other agent keeps writing.

The leader runs `node .agents/skills/agent-desk/scripts/desk.mjs shape …`, which rewrites desk.json and every open and queued brief's reviewer in one go. Then it tells each agent with `go`.

### Handing a brief to another agent

**Where: the leader**

```
/agent-desk lead reassign A3-beds to codex-x
```

The leader runs `node .agents/skills/agent-desk/scripts/desk.mjs reassign A3-beds --to codex-x`. The new agent carries on from the old agent's last push on a branch of its own, and desk-check accepts the old agent's commits up to that point. The old pull request is closed once the new one merges.

### Briefs written ahead: the queue

The leader may write briefs before their agent is free and keep them in `agents/desk/<project>/queue/`, with their tests in `agents/desk/<project>/queue/tests/`, so a queued red test never makes the suite red. A queued brief may say what it waits on (`waits_on:`). `node .agents/skills/agent-desk/scripts/desk.mjs plan` shows each agent's next three briefs and where one would sit idle, and `node .agents/skills/agent-desk/scripts/desk.mjs up <brief>` puts one up.

### Merging: every part of the suite, shared lists, and pushes

- **`node .agents/skills/agent-desk/scripts/desk.mjs suite`** runs every part of the repository's whole test command, which desk.json's `suite` lists, each to the end. One red part never hides the others. With `--brief <id>`, another open brief's red frozen test is said as expected.
- **`node .agents/skills/agent-desk/scripts/desk.mjs resolve-lists`**, in a conflicted merge, settles the files desk.json's `shared_lists` names (an offline file list, a generated module map). A list keeps both sides' entries, sorted. A generated file is rebuilt with its command.
- **`node .agents/skills/agent-desk/scripts/desk.mjs push`** sends the leader's commits. An agent's status commit that landed meanwhile is taken in and the push tried again; anything else stops it, for the leader to merge.

## Context and compaction

Every agent's conversation compacts at **500,000 tokens** unless you set otherwise, wherever it runs. The figure is `autocompact` in `agents/desk/<project>/desk.json` (per agent too), and the desk writes each tool's own setting from it, into the repository, so every copy of the repository carries it:

| Tool | Where it reads the figure |
|---|---|
| Claude Code | `.claude/settings.json`, `autoCompactWindow` (`/autocompact` shows it) |
| Codex | `.codex/config.toml`, `model_auto_compact_token_limit` |
| The Antigravity app, Gemini CLI | `.gemini/settings.json`, `model.compressionThreshold`, as a fraction of the window (0.5 for a 1M-token model) |
| Antigravity Remote Agents | your Antigravity settings; they are reported to compact near 256K tokens whatever is set, so an agent that can tell says so once in its first line |

Setup and `autocompact` write these three files. If your repository's `.gitignore` keeps one of them out, it reaches no agent, since every cloud agent works from a fresh clone. Either un-ignore it or set the figure in that tool's own settings; the figure in `desk.json` is then a wish, not a setting, for that tool's agents.

**Where: the leader**

```
/agent-desk lead autocompact 400000
```

Or for one agent, `/agent-desk lead autocompact 900000 gemini-x`. The leader saves it, the tool files follow, and it pushes; each agent's prompt names its figure and file.

## The report writes itself

An agent's pull request report used to be typed from memory. Now `node .agents/skills/agent-desk/scripts/desk.mjs preflight <brief id>` runs desk-check for the agent and writes the report's draft from what it ran: the files changed against the work branch, the brief's Done means as a checklist with the desk-check lines already ticked, desk-check's own last lines, and placeholders the agent must fill (the evidence for each Done means line, its assumptions, its questions). The draft lives under `.git/desk/`, so it is never committed, and `preflight <brief id> --pr N` puts it on the pull request and drops the "in progress" mark from the title. A report with `desk-check FAILED` at its head isn't for pushing, and preflight refuses to send it.

You type nothing for this: `take.md` and `revise.md` have the agents run it at their check step.

## The next brief writes itself

When an agent finishes a brief and nothing is ready for it, the leader looks at the spec for the next step and briefs it without asking you, as long as the step is clear.

**Where: the leader (it does this by itself after a merge; you can ask too)**

```
/agent-desk lead next
```

✅ For each agent without a brief: the next spec step (the `### A1. Title` headings under `## Release …` in the spec folder desk.json names), its words, and whether it is **clear** (no brief has named it: the leader writes its red tests, makes the brief with `brief <id> --for <agent> --from-spec A1`, whose title and Goal come from the step, and puts it up), **partly covered** (briefs exist but the step isn't marked done: the leader marks it or briefs the rest), or **needs the owner** (the step's words say stop, or that you decide: the leader asks you, on the issue if you have one). Which steps are done is `agents/desk/<project>/progress.json` on the work branch, which the leader marks (`/agent-desk lead next done A1`); `/agent-desk lead next list` shows every step with its state and its briefs.

Nothing is written to the spec itself, and the leader still writes every brief's tests, file lists and checks as before: only the choosing and the first words are automatic.

## Moving an agent to another tool

An agent can move from one tool to another at any time, say all four from Antigravity to Codex or Claude Code, or onto another model. Its name, brief, branch and pull request stay; only the conversation changes.

**Where: the leader, or any agent's conversation**

```
/agent-desk lead move gemini-x to codex
```

```
/agent-desk lead move all to claude-code
```

In an agent's conversation the words alone do: `move to codex` (that agent), `move agent-b to codex`, `move all to claude-code on Claude Opus 5.5`. The agent runs the desk's `move … --push`, which makes the change on the work branch in one commit and touches nothing else of its own; it is the one push to the work branch an agent ever makes, and only at your words.

Then:

1. **Paste the moved agent's prompt** (`/agent-desk status prompts`, or `node .agents/skills/agent-desk/scripts/desk.mjs prompts <agent>`) into a new conversation in the new tool, set up as step 3 above says for that tool. The agent resumes its brief from what is on GitHub.
2. **The old conversation stops by itself:** at its next look (awake) or your next `go` it says it has been moved, and does nothing more. Close it when you like.
3. If the agent was mid-brief with work it hadn't pushed, type `go` in the old conversation first and let it push, or the new one starts from the last push.

`/agent-desk status` shows each agent's tool and model after the move.

## What an agent can't do, and how that's enforced

- **Only its brief's files.** `node .agents/skills/agent-desk/scripts/check.mjs <brief id>` fails a file outside `may_change`, an edited frozen test, a desk or rules file, anything desk.json protects, or an applied migration. It reads the brief and desk.json from the work branch, so an agent can't widen its own. The agent runs it before every push, and the leader reruns it on every pull request.
- **Only its own branch.** The steps and `AGENTS.md` say so, and the leader reviews every pull request before anything merges. A tool's GitHub connection can usually push to any branch your account can, so this rests on the instructions and the review, not on a lock.
- **Never merges, approves or deploys.** Only the leader merges, and only into the work branch.
- **Never signs in for another tool.** The leader starts only agents in its own tool. You start the rest, signed in yourself. (Google's Gemini CLI FAQ forbids other software reusing its sign-in.)
- **Keeps asking before commands.** Leave each tool's ask-first setting on (Antigravity's Permission Preset above).
- **Its subagents do less than it does.** A review subagent's definition has no writing tool where the tool can take one away (Claude Code's `tools:`, Antigravity's `tools:`), a Codex review subagent has no shell, and `.agents/skills/agent-desk/protocol/subagent.md` forbids the rest. desk-check can't tell a subagent's commit from the agent's, so the leader counts anything on the branch as the agent's.

## One agent reviews its own work: subagents

A pushed pull request used to wait twice: for its reviewer agent to pick it up, then for the leader. Now **one designated agent** (the first, by default) may start **subagents** of its own, inside its own conversation: up to **2** at once, for two jobs only, **review** (an adversarial review of its own diff before it pushes, by `review.md`'s own list) and **checks** (running a test file or desk-check for it and saying what failed and why). The agent fixes what it agrees with, posts the subagent's review **unchanged** on its pull request (`Desk review of #N … by <agent>-review (subagent, <model>)`) and reports under a **Subagent review** heading, so you and the leader read what it was told, not what it kept. The leader verifies every finding, as with any review, and decides at once; the agent's `reviewer` stays for a **second look** the leader asks for by name (`/agent-desk lead review #N`), and isn't offered the pull request otherwise.

**Where: the leader's conversation**

```
/agent-desk lead subagents gemini-x on
```

✅ The leader runs `node .agents/skills/agent-desk/scripts/desk.mjs subagents gemini-x on`, which writes `subagents` into desk.json (`{ "max": 2, "scope": ["review", "checks"] }`) and the tool's definition files (`.claude/agents/desk-review.md` and `desk-checks.md` for Claude Code; `.codex/agents/desk-review.toml` and `desk-checks.toml` for Codex; `.agents/agents/desk-review.md` and `desk-checks.md` for Antigravity), commits and pushes them, and says so. `/agent-desk lead subagents gemini-x on --max 3 --scope review` narrows it; `--review-model <id>` or `--checks-model <id>` picks another of the tool's models (below; `validate` refuses one the tool's subagents can't run); `/agent-desk lead subagents gemini-x off` takes it away, and its reviewer reviews it again. `/agent-desk status` shows "Subagents: gemini-x up to 2 (review, checks) on …". When you set a desk up, `/agent-desk setup` asks the three questions: which agent, what for, which models.

A subagent **never** writes a file, commits, pushes, posts on GitHub or edits a brief or a test; its steps are `.agents/skills/agent-desk/protocol/subagent.md`, which it reads fresh from the work branch. It isn't an agent: no row on the board, no branch, no report.

## Which model for what

| Tool | plan (the leader, a brief's design) | code (writing a brief) | review (a subagent's adversarial review) | checks, and anything that isn't code |
|---|---|---|---|---|
| Claude Code | `opus-5.5` (Claude Opus 5.5), or `fable-5.1` (Claude Fable 5.1) where the account has it | `sonnet-5.5` (Claude Sonnet 5.5) | `opus-5.5` | `haiku-5.5` (Claude Haiku 5.5) |
| Codex | `gpt-6-astra` (GPT-6 Astra) | `gpt-6.1-sol` (GPT-6.1 Sol) | `gpt-6.1-sol`, reasoning effort high | `gpt-6-luna` (GPT-6 Luna); `gpt-6.1-terra` (GPT-6.1 Terra) for screens and visual checks |
| Antigravity | `gemini-4-argon` (Gemini 4 Argon), or `claude-opus-5.5` (Claude Opus 5.5) | `claude-sonnet-5.5` (Claude Sonnet 5.5), or `gemini-4-argon` | `gemini-4-argon`, the `pro` tier (a Claude agent's code is judged by Gemini: Google's own pattern, one family checking the other) | `gemini-3.8-flash` (Gemini 3.8 Flash), the `flash` tier |

The ids are the desk's own (`agents/desk/<project>/desk.json`'s `model` and `subagents.models`), the same whatever tool an agent is in; `node .agents/skills/agent-desk/scripts/desk.mjs models <tool>` prints each tool's four with the value the tool itself takes (Claude Code's `opus`, `sonnet`, `haiku`, `fable`; Codex's model id; Antigravity's `pro` or `flash` tier, the only ones its subagents run on). Antigravity's Claude rows are for its main agent alone. These are the models each tool offered when this version of the skill was released, a starting point, and they change with the tools: when a tool retires one, the skill's `.agents/skills/agent-desk/scripts/models.mjs` is where it is updated.

The rule: the leader plans and writes briefs on a **plan** model; an agent writing a brief runs on a **code** model; a review subagent runs the **review** model and a checks subagent the **checks** model; anything that isn't code (words, a summary, a classification) goes to the cheapest, the **checks and other** column. The desk records the choice; the owner sets the agent's own model in the tool (`/model` in Claude Code and Codex, the model picker in Antigravity), and the skill writes the subagents' into their definition files.

## Troubleshooting

| What you see | What to do |
|---|---|
| Anything looks wrong, or you don't know where to start | `/agent-desk status doctor`: it checks the whole desk and gives a fix line for each finding. |
| The tool doesn't know `/agent-desk agent` | Paste the agent's full prompt from `/agent-desk status` instead: it names its steps file directly. |
| The agent can't see the repository | Check the tool's GitHub connection and that this repository is attached. |
| The agent can't push or open the pull request | Reconnect GitHub in that tool and paste the prompt again, or open the pull request with the tool's own button. |
| `desk-check FAILED … outside_brief` | The agent changed a file its brief doesn't allow. It should undo it or ask in the pull request; the leader decides whether the brief changes. |
| `desk-check FAILED` on a test the brief never named | Most likely another open brief's frozen test: it stays red until that brief merges, so it isn't this agent's fault. Tell the leader; it narrows the brief's checks to the files that matter and keeps the whole suite for its own check. |
| `/agent-desk status` says an agent is **silent** | It has reported nothing for 20 minutes while awake: its tool may have ended the turn. Open its conversation; if it has stopped, type `go`. The leader has told you once and won't again until it reports and goes quiet anew. |
| `/agent-desk status` says an agent is **blocked** | It ran out of approaches and said what it ruled out. The leader answers in the pull request at its next look, or hands the brief on; nothing for you to do unless the leader asks. |
| Two or three Antigravity agents stop at their first step saying the conversation is another agent's, or an agent's `report` says the push was refused by this copy's pre-push hook | They share one folder, or the folder has the repository's hooks on. One clone per agent, opened as its own project in the app, hooks off: step 3, "Antigravity on a computer". `node .agents/skills/agent-desk/scripts/desk.mjs doctor` in the copy names a `core.hooksPath` that is set, with the fix (`git config --unset core.hooksPath`). |
| An Antigravity agent on automatic checking hangs: it looks busy for ever, typing does nothing, and only deleting the conversation helps | It was waiting inside a running command that never reported back; older copies of the skill waited that way, and it hung after about an hour. Update the skill (`/agent-desk install`, from a newer copy) and push, so the work branch carries it; then start the agent in a new conversation with its prompt. From 2.1.0 an Antigravity agent waits on a three-minute timer and ends its turn between looks. If it still hangs, `/agent-desk lead awake off <agent>` and tell the skill's maintainers what the conversation last showed. |
| An Antigravity agent's machine keeps restarting, or its wait is killed part way (`uVM is in STOPPED state`, `Host stream ended without a terminal result frame`) | Antigravity ends a silent background command after about three minutes and recreates the machine. An Antigravity agent's wait is now one short look, with a timer between looks, so no command is left running; update the desk (`/agent-desk install`, from a newer copy of the skill,) so the work branch carries it, and the agents pick it up at their next run. The agent's name and settings live in `.git/config`, which a restart keeps. |
| An agent seems lost, answers as another agent, or is doing something the board doesn't say | Type `/agent-desk refresh` in its conversation (`$agent-desk refresh` in Codex; the leader's too). It reads its name from its copy and its brief, row and report from the work branch, re-reads the rules, says them back in three lines and carries on from where it was. If the card shows a disagreement (its report and the board differ, another tool named for it, hooks on) it stops and tells you the line. |
| An awake agent stopped and said `wait:` or reported, and nothing is moving | Its tool ended the turn. Type `go` in its conversation: it reads the board and carries on, awake. |
| An awake agent should stop | Type `stop` in its conversation, or `/agent-desk lead awake off <agent>` (it stops at its next look, within a few minutes). |
| Two conversations act as the same agent, or `desk-check FAILED … wrong_agent` | A conversation lost its name. Each copy keeps its name (`git config desk.slot`) and refuses another agent's prompt, `go` or brief; the leader closes a stray pull request with a `rejected: wrong_agent` decision. Give the stray conversation nothing more, type `go` in the right agent's conversation, and if an agent has no conversation left, start a new one with its prompt. |
| "Nothing on the desk for <name>" | Its row isn't ready and nothing waits for its review. Ask the leader `/agent-desk status`. |
| A subagent wrote or pushed something, or a commit on an agent's branch says it came from one | desk-check can't tell a subagent's commit from the agent's, so the leader treats it as the agent's and the agent answers for it under `.agents/skills/agent-desk/protocol/subagent.md`. Check the definition files haven't been edited (`/agent-desk status doctor` names one that differs from what desk.json asks for; `node .agents/skills/agent-desk/scripts/desk.mjs setup --project <project>` writes them again), and if the tool keeps letting the subagent write, turn its subagents off (`/agent-desk lead subagents <agent> off`) and tell the leader. |
| The subagent review is always empty ("no findings") | A model reviewing its own family's code tends to agree with it. Ask the leader for a second look by another agent (`/agent-desk lead review #N`, or the reviewer's prompt from `/agent-desk status`), or move the review subagent onto another model (`/agent-desk lead subagents <agent> on --review-model <id>`; `/agent-desk lead models <tool>` lists them). |
| The agent wants to run something on `main` or a release branch | Deny it, and tell the leader what it was doing. |
| The board says `ready` or `changes` but the agent has pushed | The leader's look reads the agent's own report and gives the line to run (`fits: … set <agent> review --pr #N`); `preflight --pr` writes that report as part of the push. |
| Merged desk branches pile up on GitHub | The desk can't delete branches (a cloud session's git proxy refuses it). Delete merged `desk/<project>/…` branches yourself on GitHub, under **Branches**, now and then. |
| The leader gets a "merged" event for a desk pull request it merged into the work branch | GitHub marks a pull request merged once its commits reach its base. It is expected, and nothing to do. |
