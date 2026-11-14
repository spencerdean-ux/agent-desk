# refresh: back on track

Typed into an agent's conversation, or the leader's, when it has drifted, stopped, or lost its place. Nothing is remembered: everything is read again.

1. Who you are is in this copy, never in memory:

   ```bash
   git config desk.slot; git config desk.project; git config desk.base; git config desk.tool
   ```

   A name there: you are that agent. None, and you lead a project here: you are its leader.
2. Print the card, read fresh from the copy and the work branch:

   ```bash
   node .agents/skills/agent-desk/scripts/desk.mjs refresh            # an agent
   node .agents/skills/agent-desk/scripts/desk.mjs refresh --leader   # the leader
   ```

   If the skill isn't in this copy's checkout (an agent on an older branch), run it from the owner's own skills folder, or merge the work branch in first.
3. Read again, fresh from the work branch, the files the card names: `AGENTS.md`, and `.agents/skills/agent-desk/protocol/agent.md` and the step file you are on (the leader: `protocol/lead.md`).
4. Say it back in three lines: who you are, on which project and branch; what the desk says you are doing, and where the board and your report disagree; the step you are on and the next.
5. Carry on from that step. Never start it again from the top, and stop where the card says the board and the copy disagree in a way you can't settle: tell the owner what you saw.
