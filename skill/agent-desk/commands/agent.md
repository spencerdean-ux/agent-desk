# agent: start this conversation's desk work

The words after `agent` are your name and the project: `agent <name> <project>`. A prompt that begins "Project: <project>" and "You are desk agent <name>" gives the same two, with the repository and the work branch.

If either is missing, ask the owner. Never guess a name or a project, and never take another agent's.

1. In your copy of the repository:

   ```bash
   git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*" && git fetch origin
   ```

2. Find the work branch: your prompt names it; else `git config desk.base`; else the one branch on origin whose `agents/desk/<project>/desk.json` exists.
3. Read your steps fresh from it, and follow them exactly:

   ```bash
   git show origin/<work branch>:.agents/skills/agent-desk/protocol/agent.md
   ```

   Where they say stop, stop and tell the owner why.

Your name lives in this copy (`git config desk.slot`, with `desk.project`), not in your memory: if it already names another agent or another project, this conversation is theirs, so stop and say so.

Later, `go` in this conversation does the same again.
