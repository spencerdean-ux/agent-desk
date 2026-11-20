// What the owner pastes, and where: each agent's prompt, and the one next step for each agent on the
// board. Pure: the caller hands in the settings and a board row.
import { agentNamed, isAwake, autocompactOf, subagentsOf, COMPACT_WHERE, TOOL_WORDS } from "./config.mjs";
import { prNumber } from "./board.mjs";

const PLACE = { antigravity: "its own conversation; in the Antigravity app on a computer, a project of its own whose one folder is its own clone of the repository, started as Local", codex: "its own task or session", "claude-code": "its own session", other: "its own conversation" };

// Where an Antigravity app conversation must be (three agents started on one
// folder, and a clone with the repository's hooks on could push nothing): its own clone, in a project
// of its own, started as Local, hooks off, checked before any desk work.
export const antigravityPlace = (cfg, a) => `In the Antigravity app on a computer, this conversation's folder must be ${a.name}'s own clone of the repository (for example ~/<parent>/${(cfg.repository || "repo").split("/").pop()}-${a.name}), in a project of its own, started as Local, not Worktree, with the repository's git hooks off (git config core.hooksPath prints nothing). Run pwd && git config desk.slot first, and stop if the slot names anyone else.`;

// The whole prompt that starts an agent. It works whether or not the tool has loaded the desk's
// skills, as it names the steps file directly; the short form is for a tool that has them.
// `review` names a pull request (12, #12 or its address) the agent is to review, so the owner
// needn't add it by hand: agent.md takes a named pull request first.
export function agentPrompt(cfg, name, { review } = {}) {
  const a = agentNamed(cfg, name);
  if (!a) throw new Error(`“${name}” isn't an agent on this desk (${(cfg.agents || []).map((x) => x.name).join(", ")})`);
  const wb = cfg.work_branch;
  const lines = [
    `Project: ${cfg.project} · Agent: ${a.name}${cfg.title ? ` (${cfg.title})` : ""}`,
    `You are desk agent ${a.name} on the project ${cfg.project}, for the GitHub repository ${cfg.repository}. The work branch is ${wb}. The leader is ${cfg.leader.name}, in ${TOOL_WORDS[cfg.leader.tool]}.`,
    `This conversation is ${a.name}'s for ${cfg.project}, for good. Your copy of the repository keeps your name (git config desk.slot): if it already names another agent or another project, this prompt was pasted into the wrong conversation, so stop, tell me, and do no desk work here.`,
  ];
  if (a.tool === "antigravity") lines.push(antigravityPlace(cfg, a));
  if (review) {
    const pr = prNumber(review);
    if (!pr) throw new Error(`“${review}” isn't a pull request number`);
    lines.push(`Review pull request ${pr} for ${cfg.project}: it waits for your review.`);
  }
  if (a.model) lines.push(`Your desk entry names the model ${a.model}. If you can tell you are running a different one, say so first, then carry on.`);
  const sub = subagentsOf(cfg, a);
  if (sub) lines.push(`You may start up to ${sub.max} subagents of your own, for ${sub.scope.join(" and ")} only, on ${sub.scope.map((k) => `${sub.models[k]} (${k})`).join(" and ")}, as take.md steps 4 and 5 and .agents/skills/agent-desk/protocol/subagent.md say (the tool's definitions are desk-${sub.scope.join(" and desk-")}); a subagent never writes a file, commits, pushes or posts, and the review it writes of your diff is posted by you, unchanged, as ${a.name}-review (subagent). Anything a subagent does on your branch counts as yours.`);
  lines.push(`Your conversation compacts at ${autocompactOf(cfg, a).toLocaleString("en-GB")} tokens (desk.json's autocompact), read from ${COMPACT_WHERE[a.tool] || COMPACT_WHERE.other}; if you can tell your tool won't honour it, say so once and carry on.`);
  lines.push(
    `In your copy of the repository, run: git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*" && git fetch origin`,
    `Then read your steps with: git show origin/${wb}:.agents/skills/agent-desk/protocol/agent.md`,
    "and follow them exactly. Where they say stop, stop and tell me why.",
    `Keep to this project: if this conversation has already worked on another project, stop and ask me for a new one.`,
    isAwake(cfg, a)
      ? a.tool === "antigravity"
        ? `This desk keeps you awake: when every step that fits is done, stay on the desk as agent.md step 5 says. Run the work branch's wait once (git show origin/${wb}:.agents/skills/agent-desk/scripts/wait.mjs > .git/desk-wait.mjs && node .git/desk-wait.mjs): it is one short look. Do what it says fits; on a wait: line set a 180-second one-shot timer with your schedule tool (prompt: "desk look for ${a.name} on ${cfg.project}: run the wait once, as agent.md step 5 says") and end your turn, and do the same again each time the timer wakes you. Never wait inside a running command (no sleep, no loop): that hangs this conversation. If you have no timer to set, report stopped, tell me once, and wait for my go. A stop: line, or my typing stop, ends it. If I type go, do the steps at once.`
        : `This desk keeps you awake: when every step that fits is done, don't stop but stay on the desk, as agent.md step 5 says, running the work branch's node .agents/skills/agent-desk/scripts/wait.mjs again and again (git show origin/${wb}:.agents/skills/agent-desk/scripts/wait.mjs > .git/desk-wait.mjs && node .git/desk-wait.mjs), doing what it says fits, and never end your turn until it prints a stop: line or I type stop. If I type go, do the steps at once.`
      : `Later, whenever I type go in this conversation, do the same again: fetch, read the board, and do every step that fits.`,
    `(Where this tool has loaded the agent-desk skill, the short form does the same: /agent-desk agent ${a.name} ${cfg.project} in Claude Code or Antigravity, $agent-desk agent ${a.name} ${cfg.project} in Codex.)`,
  );
  return lines.join("\n");
}

// The one thing to do next for an agent, in words, from its board row.
export function nextStep(cfg, name, row = {}) {
  const a = agentNamed(cfg, name);
  if (!a) return `“${name}” isn't on the desk.`;
  const pr = row.pr || "its pull request";
  const lead = `tell ${cfg.leader.name}: /agent-desk lead ${cfg.project} check`;
  switch (row.state) {
    case "ready": return `${start(cfg, a)}: it takes ${row.brief}.`;
    case "in-progress": return `Wait for ${name} to open its pull request for ${row.brief}. If it stopped, ${lower(start(cfg, a))} again.`;
    case "review": {
      if (subagentsOf(cfg, a)?.scope.includes("review")) return `Nothing to type: ${pr} came with ${name}'s own subagent review, posted with the push, so no other agent reviews it unless asked by name; ${lead}.`;
      if (a.reviewer === "leader") return `${cap(lead)}: ${cfg.leader.name} reviews ${pr} itself.`;
      const reviewer = agentNamed(cfg, a.reviewer);
      if (reviewer && isAwake(cfg, reviewer)) return `Nothing to type: ${a.reviewer} is awake and reviews ${pr} on its own within a few minutes (if its conversation has stopped, node .agents/skills/agent-desk/scripts/desk.mjs prompts ${a.reviewer} --review ${pr} has the pull request in). Then ${lead}.`;
      return `${start(cfg, reviewer)}, adding "review pull request ${pr}" (node .agents/skills/agent-desk/scripts/desk.mjs prompts ${a.reviewer} --review ${pr} has it in). Then ${lead}.`;
    }
    case "changes": return `${start(cfg, a)}: it revises ${pr}. Then ${lead}.`;
    case "done": return `Put the next brief up for ${name}: node .agents/skills/agent-desk/scripts/desk.mjs brief <id> --for ${name} --spec <step> --title "…", then set ${name} ready --brief <id>.`;
    default: return `Nothing for ${name} now.`;
  }
}

// How an agent is moved: an awake one picks the board's move up by itself (its prompt pasted once);
// otherwise the owner types go in the conversation that holds its prompt, or the leader starts it.
function start(cfg, a) {
  if (a.started_by === "leader") return `Tell ${cfg.leader.name}: /agent-desk lead ${cfg.project} start ${a.name}`;
  if (isAwake(cfg, a)) return `Nothing to type: ${a.name} is awake in its ${TOOL_WORDS[a.tool]} conversation (${PLACE[a.tool]}) and picks it up on its own within a few minutes (its prompt, from desk.mjs prompts, pasted once the first time; go if it has stopped${a.tool === "antigravity" ? ", which it does, and says, where Antigravity gives it no timer" : ""})`;
  return `Type go in ${a.name}'s ${TOOL_WORDS[a.tool]} conversation (${PLACE[a.tool]}; its prompt, from desk.mjs prompts, the first time only)`;
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const lower = (s) => s[0].toLowerCase() + s.slice(1);
