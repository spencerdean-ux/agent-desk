# Changelog

## 2.2.0

- **Setup asks everything, in three rounds.** The project's name; how many agents and how many in Claude Code, Codex and Antigravity; the models each may use; briefs kept ready and spare; pre-writing; the spec; jobs and reviewers; automatic checking, the silence warning, compaction, subagents, who starts each agent and the work branch. Every question shows its default, and "use the defaults for the rest" is always an answer. `desk.mjs setup` takes the answers as options.
- **Your own defaults.** An answer that differs from the default can be kept for future projects in the repository: `desk.mjs defaults`, `defaults --set <key>=<value>`, `defaults --reset [key]`, in `agents/desk/defaults.json`.
- **Compaction can be left alone.** `autocompact: false` ("not set by the skill") writes no tool's compaction setting and says nothing of it.
- **Models an agent may use.** An agent's `models` list; an agent on another model stops and says so. The owner's "allow this model" in that conversation adds it: `desk.mjs models allow "<model>" --push`. Also `models check` and `models disallow`.
- **Briefs kept ready, and a spare pool.** desk.json's `ready` and `spare`; `desk.mjs plan` names a shortfall; `brief … --for any --queue` writes a spare and `up <id> --for <agent>` gives it to an agent.
- **Waves.** `brief … --queue --wave <n>`, `desk.mjs waves` (the plan, wave by wave, shown to the owner before any agent starts), `up --wave <n>`, and a review after each wave held to ten minutes (`waves --review <n>`, `waves --reviewed <n>`).

## 2.1.0

- **An awake agent in Antigravity no longer hangs.** It used to wait inside a running command, about once a minute, and after about an hour the conversation hung for good. Its wait is now one short look, and between looks it sets a 180-second timer with Antigravity's own `schedule` tool and ends its turn. With no timer to set, it reports `stopped` and waits for `go`. Claude Code and Codex wait as before.
- **The silence warning always arrives.** When an agent on automatic checking has reported nothing for 20 minutes (`silence_minutes`), the leader's look posts the comment on the project's issue itself, rather than printing a line for the leader to run. It does the same for a blocked agent and a sleeping desk.
- **Automatic checking needs the issue.** `desk.mjs awake on` refuses while the desk has no notifications issue; `desk.mjs notify --setup --create` makes one. `--no-notify` goes without, and `status` and `doctor` then say nobody is told.
- **Good night.** `desk.mjs goodnight` (the owner types "good night" at the leader) puts the agents to sleep at their next look, then the desk. Nothing moves until the owner types `go` at the leader (`desk.mjs wake`), then in each agent's conversation.
- **Ending a project.** `desk.mjs end` lists the project's branches on origin, merged or not; `end --yes` archives the desk to `agents/desk/archive/<project>/`, closes its open pull requests, deletes its branches and closes its issue. Unmerged work stops it unless `--force`. Each agent clears its own copy with `cleanup.mjs --local`.
- A project can't be named `archive`.

## 2.0.0

The first public release.

- One self-contained skill, `/agent-desk` (`$agent-desk` in Codex), whose first word picks the part: `install`, `setup`, `lead`, `agent`, `status`, `refresh`.
- The skill's folder carries its steps, scripts and templates. It names no repository, branch or project, and needs no network.
- Install only makes the skill available: into a repository's skills folders, into your own, or as a zip.
- Setup is per project. It asks the project's name, keeps each project in `agents/desk/<project>/`, and ends with the wording that starts each agent.
- Any number of projects can share a repository, each on its own.
