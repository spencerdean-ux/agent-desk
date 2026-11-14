# install: make the skill available

Install copies this skill's own folder to where a tool looks for skills. It never names a project, writes a desk, or fetches anything: the copy is the folder you are reading from. Setting a project up is `setup`, a separate part.

Find this skill's folder first: it is the folder that holds this file's parent, `SKILL.md` (for example `.agents/skills/agent-desk/`, `.claude/skills/agent-desk/`, or one of the owner's own skills folders). Below it is `<skill>`.

The owner's words say where:

## Into a repository (what a cloud session needs)

A cloud session of any tool keeps nothing between sessions, so it reads skills from the repository.

1. Be on a branch you may push (never the default branch directly, where the repository's rules say so).
2. Run, from the repository's root:

   ```bash
   node <skill>/scripts/install.mjs --target .
   ```

   It writes `.agents/skills/agent-desk/` (Codex, Antigravity) and `.claude/skills/agent-desk/` (Claude Code), the same files, and warns if `.gitignore` keeps either out.
3. Commit those two folders, push, and open a pull request if the repository's rules want one.
4. Tell the owner what was written, and that `/agent-desk setup` comes next and asks the project's name.

**Another repository than this one:** clone it or add it to this session, then run the same command with `--target <its folder>`, from this skill's folder. Commit and push there, on a branch.

**To update** a repository's copy, run the same command from a newer copy of the skill. `--check --target .` lists every file that differs and changes nothing.

## For the owner, on a computer (the apps)

```bash
node <skill>/scripts/install.mjs --for-me
```

It copies the skill into `~/.claude/skills/` (Claude Code), `~/.agents/skills/` (Codex) and `~/.gemini/config/skills/` (Antigravity). This works only where the tool runs on the owner's own computer: say so if this is a cloud session, and offer the repository install instead.

## As one file

```bash
node <skill>/scripts/install.mjs --pack --out agent-desk.zip
```

One zip of the folder, to upload where a tool takes a skill as a zip, to unzip into a skills folder, or to carry to a repository that has no copy yet.

## If no copy can be run

Where this skill was loaded as text alone and its scripts aren't on this machine, say so, and ask the owner for the folder or the zip: never fetch it from an address you remember.
