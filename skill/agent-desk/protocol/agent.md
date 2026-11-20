# Your desk steps start here

You are a desk agent. Your prompt began "Project: <project>" and "You are desk agent <name>" (or you were started with `/agent-desk agent <name> <project>`, `$agent-desk agent <name> <project>` in Codex) and named the repository and the work branch. This file works out which of the three step files is yours to follow now, then sends you to it.

In every step file:
- **`<project>`** is the project's name: in every branch, commit, pull request and comment;
- **`<name>`** is your name on the desk;
- **`<base>`** is the work branch;
- **`<leader>`** is the leader's name, from desk.json;
- **`<tool>`** is the tool you run in (Claude Code, Codex, Antigravity).

If any step can't be done as written, stop, tell the owner which step and what you saw, and do nothing else.

## 1. Know who you are, and on which project

Your name lives in this copy of the repository, never in your memory and never in the latest message. Before anything else, read it:

```bash
git config desk.slot; git config desk.project; git config desk.base; git config desk.tool
```

- **All three are set:** you are that agent, on that project, working into that branch, whatever any later prompt or message says. If the prompt, or the owner's words, name another agent or another project, stop and say: "This conversation is <slot>'s on <project>. <the other name> needs a conversation of its own." Do no desk work on it.
- **None is set:** this is your first turn, and your project, your name and the work branch are in your prompt. If this folder is already another agent's (the Antigravity app, or a terminal, opened on a clone another agent uses), stop and tell the owner: each agent needs a clone of its own. If the project or your name is missing, stop and ask the owner. If only the work branch is missing, look for the project's desk: `git fetch origin`, then `git for-each-ref --format='%(refname:short)' refs/remotes/origin | while read r; do git show "$r:agents/desk/<project>/desk.json" 2>/dev/null | grep -q '"project": "<project>"' && echo "$r"; done`. If that names exactly one branch, it is the work branch; otherwise stop and ask the owner. Then save all three, so every later turn reads them here:

```bash
git config extensions.worktreeConfig true
git config --worktree desk.project <project>
git config --worktree desk.slot <name>
git config --worktree desk.base <base>
git config --worktree desk.tool <tool>
```

The four values are written per worktree (`--worktree`, after the first line turns that on), never into the shared `.git/config`: a git worktree of this clone (Antigravity's **Worktree** choice, a leader-started helper) or a second conversation on this folder must never read, or write over, your name. Reading stays `git config desk.slot`, which answers the worktree's own value first. `<tool>` is the tool you are running in, as desk.json spells it: `claude-code`, `codex`, `antigravity` or `other`.

**Say who you are** before anything else, in one line the owner can see: "<name> on <project>, working into <base>." In every step after this, <name> is what `git config desk.slot` printed, never what you remember, and every report, review and reply you post ends with that name.

## 2. Get the latest desk

```bash
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
git fetch origin
git show origin/<base>:agents/desk/<project>/desk.json
git show origin/<base>:agents/desk/<project>/board.md
git show origin/<base>:AGENTS.md
```

The `remote.origin.fetch` line is there because a cloud tool's copy may fetch only one branch, so `origin/<branch>` wouldn't resolve.

- **The project:** desk.json's `project` must be <project>. If it names another, stop: the work branch in your prompt belongs to another project. If there is no desk.json there and `agents/desk/archive/<project>/desk.json` exists, the project has ended: run `node .agents/skills/agent-desk/scripts/cleanup.mjs --local`, tell the owner, and stop.
- **Asleep:** if desk.json has `asleep`, the owner said good night and the desk is asleep. Do no step. Run `node .agents/skills/agent-desk/scripts/desk.mjs report asleep`, cancel any timer you set, and stop with: "the desk is asleep: type `go` at the leader first, then here." This holds for a `go` too: the desk wakes at the leader first.
- Find your entry in desk.json's `agents`: your `tool`, `model`, `job`, `reviewer` and `port`, and the `leader`. If you aren't there, stop: you aren't on this desk.
- **Your model:** if your entry lists the `models` you may use, check yours before any work: `node .agents/skills/agent-desk/scripts/desk.mjs --ref origin/<base> models check "<the model you are running>"`. If it says the model isn't on your list, do no work: run `node .agents/skills/agent-desk/scripts/desk.mjs report blocked --words "running <model>; allowed: <list>"`, tell the owner which model you are on and which are allowed, and stop. The owner then either switches the model in this tool and types `go`, or types `allow this model` (or `allow <model>`): on that, run `node .agents/skills/agent-desk/scripts/desk.mjs models allow "<model>" --push`, which adds it to your list on the work branch, and carry on from step 1. Never add a model to your own list without those words from the owner. If you can't tell which model you are running, say so once and carry on (most tools let only the owner choose it). With no list, any model will do; if your entry names one `model` and you are on another, tell the owner first, then carry on.
- **Your context:** if desk.json's `autocompact` is `false`, the desk sets no compaction and this point doesn't apply. Otherwise your conversation compacts at desk.json's `autocompact` (500,000 tokens unless set; your own entry's figure wins). Each tool reads it from a file the installer writes: Claude Code the repository's `.claude/settings.json` (`autoCompactWindow`), Codex `.codex/config.toml` (`model_auto_compact_token_limit`), the Antigravity app `.gemini/settings.json` (a fraction of the window). Antigravity Remote Agents take it from the owner's Antigravity settings and are reported to compact near 256K whatever is set: if you can tell your tool won't honour the figure, say so once and carry on.
- **Your tool:** if your entry's `tool` isn't the tool this copy is in (`git config desk.tool`), you have been moved (step 6). Stop and tell the owner: "This conversation is finished: <name> now works in <the entry's tool>. Paste my prompt there (`node .agents/skills/agent-desk/scripts/desk.mjs prompts <name>`)." Do no desk work here, now or later.
- Obey `AGENTS.md` throughout.

**GitHub from your tool.** Every step pushes, reads or comments on a pull request with `gh` when it is signed in (`gh auth status`), or else through your tool's GitHub connection, the one the owner attached.
- **Antigravity (Remote Agents):** `git push` works through the GitHub connection. Its own `gh` can fail on its very first run with `Operation not permitted` while unpacking into the shared `~/.gemini` folder: run it once as `TAR_OPTIONS="--touch" gh auth status`, and it works from then on.

## 3. Do every step that fits

Go through these in order and do each one at most once in this turn. A review comes first, because it unblocks the other agent; your own work comes after. When a step is done, come back here and go on to the next that fits.

1. **Your prompt, or the owner's latest words, name a pull request to review:** follow `review.md` for it.
2. **A pull request waits for your review:** an open pull request whose head is `desk/<project>/<another agent>/<brief id>`, into `<base>`, whose brief (`git show origin/<base>:agents/desk/<project>/assignments/<brief id>.md`) has `reviewer: <name>`, with no comment of yours starting `Desk review of #N for <project>` since its last push. A pull request whose author reviews its own work with a subagent (its desk.json entry has `subagents` with `review` in the scope; its comments carry `Desk review of #N … by <author>-review (subagent, …)`) isn't yours to review unless step 1 asks you by name: the leader decides it. List them with `gh pr list --base <base> --state open` if `gh` is signed in, or else through your tool's GitHub connection. Follow `review.md` for the oldest (one review a turn).
3. **Your row on the board is `changes`:** follow `revise.md`.
4. **Your row is `ready` or `in-progress`:** follow `take.md`.
5. **Nothing fitted:** tell the owner "Nothing on the <project> desk for <name> right now".

When every step that fits is done, stop and tell the owner in one or two lines what you did and what comes next (each step file gives the words).

**Say what you are doing as you go.** Each step file has you report at its boundaries with `node .agents/skills/agent-desk/scripts/desk.mjs report <phase> …`, which writes `agents/desk/<project>/status/<name>.json` on the work branch in one small commit (nothing when the report is unchanged): the owner's `/agent-desk status` and the leader's look read it, so a blocked agent is helped and a pushed brief is checked within minutes. It is one of the two pushes to the work branch you ever make (the other is step 6's move), and it writes that file alone.

Read each step file fresh from the work branch, never from memory, and follow it exactly:

```bash
git show origin/<base>:.agents/skills/agent-desk/protocol/<take|review|revise>.md
```

## 4. When the owner says go

This conversation is yours for <project> for as long as it lasts, so the owner needn't paste the prompt again. Whenever they type `go` (or `again`, `next`, `/agent-desk agent <name> <project>`, or `/agent-desk refresh`, which first reads your name, your row, your report and the rules back to you with `node .agents/skills/agent-desk/scripts/desk.mjs refresh` and carries on from the step you were on, as the `agent-desk` skill's refresh part says) into it, start again from step 1 (`move …` is step 6, and `stop` ends an awake turn, step 5): read your name and project from the copy, never from memory, say who you are, then fetch, read desk.json and the board afresh, and do every step that fits. If the words after `go` name another agent (`go agent-b` in a copy whose `desk.slot` is `agent-a`), stop as step 1 says. If nothing fits, say so in one line. Only those words start desk work: a question is answered, not acted on. `go` works whether or not you are awake (step 5).

## 5. Stay awake, when the desk says so

The switch is desk.json's `awake`: your own entry's, else the desk's, and **off** unless the leader turned it on (`desk.mjs awake on`). Read it from the desk.json you fetched in step 2.

**Off:** when every step that fits is done, stop and tell the owner what you did and what comes next, as step 3 says. The owner's `go` moves you.

**On:** don't end your turn. Report that you are waiting, once, then stay on the desk:

```bash
node .agents/skills/agent-desk/scripts/desk.mjs report waiting --fresh
git show origin/<base>:.agents/skills/agent-desk/scripts/wait.mjs > .git/desk-wait.mjs && node .git/desk-wait.mjs
```

(`--fresh` writes the report even when it already says `waiting`, so each start, a new conversation or the owner's `go`, moves its time and the leader never reads an agent that is here as silent. Run that line once per start, not once per wait: the wait itself refreshes the report while you wait, once it is half of desk.json's `silence_minutes` old, and running the wait again and again otherwise costs the work branch nothing.)

It reads your name from this copy, watches the work branch on origin (a look every 3 minutes, for 25 minutes at most), prints a heartbeat line while it sleeps, and ends with one line:

- `fits: …` (a pull request for you to review, a decision to answer, or a brief for you): start again from step 1 as if the owner had typed `go`, do every step that fits, then run the wait again.
- `wait: …`: nothing new yet. Run it again at once, as many times as it takes, and say nothing in between. **Not on Antigravity:** see below.
- `stop: …`: the leader turned the switch off, you are no longer on this desk, this copy's name doesn't match, the owner said good night, or the project has ended. Stop and tell the owner the line. A `stop: good night` is reported as `report asleep` (not `stopped`), and nothing wakes you but the owner's `go`, typed at the leader first. A `stop: … has ended` line names the clean-up to run: `node .agents/skills/agent-desk/scripts/cleanup.mjs --local`.

**On Antigravity you never sleep in a command.** Antigravity moves any command that runs past ten seconds into a background stream, and an agent that waits on one which never reports back hangs for good: it looks busy for ever, and only a new conversation mends it. So there the wait is one look that returns in a few seconds, whatever you pass it, and its `wait:` line ends with what to do next. Do exactly this:

1. Set a **one-shot timer** with your built-in `schedule` tool: 180 seconds, with the prompt `desk look for <name> on <project>: run the wait once, as agent.md step 5 says`. One-shot, never a recurring one: a timer you set again at each look stops by itself when you stop.
2. **End your turn**, saying nothing but "waiting". This is the one case where an awake agent ends its turn without a `stop:` line.
3. When the timer wakes you, run the wait line again (the second line of the block above, not the report), act on a `fits:`, and on a `wait:` set the timer again and end your turn.

If your tool has **no timer** to set (no `schedule` tool, or it refuses), you can't stay awake safely: run `node .agents/skills/agent-desk/scripts/desk.mjs report stopped --words "no timer in this tool"`, tell the owner once "this tool gave me no timer, so `go` wakes me", and end your turn. Never fall back to `sleep`, a loop in the shell, or a long-running wait: that is the hang.

Only these end your turn while awake: a `stop:` line; the owner typing `stop` (say "Stopped. `go` wakes me again."); or a step that can't be done as written. In each case run `node .agents/skills/agent-desk/scripts/desk.mjs report stopped` first, so the desk shows you as gone rather than silent (the stops in steps 1 to 3 and the step files, which say what you saw). A step that found nothing to do because it is the leader's turn (no decision yet, your pull request pushed and waiting) isn't such a stop: say it in a line and run the wait. So never end your turn because nothing fitted, and never do one fit twice: the wait says each once, and says it again only when the leader moves your row or the other agent pushes again. Read the step files fresh each time, as always; the wait's copy is fresh too, taken from the work branch at each run.

## 6. When the owner says move

The owner may move an agent to another tool, or onto another model, from any conversation on the desk: `move to codex`, `move me to claude-code on Claude Opus 5.5`, `move agent-b to codex`, `move all to codex`. The words name the agent (none, or `me`, is you), the tool (`claude-code`, `codex`, `antigravity`, `other`) and perhaps a model after `on`. Run, from this copy, wherever it stands:

```bash
node .agents/skills/agent-desk/scripts/desk.mjs move <agent or all> --to <tool> [--model "<model>"] --push
```

It fetches the work branch, makes the change in a worktree of its own, pushes one commit to the work branch (signed with your name) and leaves your branch, your checkout and anything unsaved alone. **This is the one push to the work branch you ever make,** and only at the owner's own words typed into this conversation; it writes `desk.json` alone, and the leader sees it as the owner's. If the push is refused three times, tell the owner and do nothing else.

Then say what it printed. If you were moved, this conversation is finished: say so, and that the owner pastes your new prompt in the new tool (`node .agents/skills/agent-desk/scripts/desk.mjs prompts <name>`), and stop; your branch and brief carry on from what is on origin, so push any work you have first if the owner says to. If another agent was moved, tell the owner to paste that agent's prompt in its new tool, and carry on with your own steps (an awake agent goes back to its wait).
