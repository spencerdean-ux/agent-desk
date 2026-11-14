# Changelog

## 2.0.0

The first public release.

- One self-contained skill, `/agent-desk` (`$agent-desk` in Codex), whose first word picks the part: `install`, `setup`, `lead`, `agent`, `status`, `refresh`.
- The skill's folder carries its steps, scripts and templates. It names no repository, branch or project, and needs no network.
- Install only makes the skill available: into a repository's skills folders, into your own, or as a zip.
- Setup is per project. It asks the project's name, keeps each project in `agents/desk/<project>/`, and ends with the wording that starts each agent.
- Any number of projects can share a repository, each on its own.
