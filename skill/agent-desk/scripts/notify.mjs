// Telling the owner (desk.mjs notify): a short comment on the project's GitHub issue when an agent
// is blocked or silent, the desk falls asleep, a brief merges or the leader has a question: one
// issue per project, those five events. Each is told once: the key of
// a notice is kept in the posting checkout's git config. Pure: the caller posts or prints the body.
import { NOTIFY_EVENTS, notifyOf, leaderAwake } from "./config.mjs";

export { NOTIFY_EVENTS };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The comment body for one event: two lines at most, the project named, the footer last.
export function notifyBody(cfg, event, { agent, brief, pr, words, status } = {}, now = Date.now()) {
  if (!NOTIFY_EVENTS.includes(event)) throw new Error(`“${event ?? ""}” isn't an event the owner is told of: ${NOTIFY_EVENTS.join(", ")}`);
  const project = cfg.project, leader = cfg.leader?.name || "the leader";
  const foot = `\n\n— the desk for ${project}`;
  const report = () => {
    if (!agent) throw new Error(`${event} needs --agent <name>`);
    if (!status || !status.phase) throw new Error(`${agent} has no report in the project's status/ to tell from`);
  };
  switch (event) {
    case "blocked": {
      report();
      const b = brief || status.brief || "its brief", p = pr || status.pr || "", w = words || status.words || "no words given";
      return `**${agent} is blocked on ${b}** (${project}${p ? `, ${p}` : ""}): ${w}. The leader ${leader} answers in the pull request at its next look; nothing for you unless it asks.${foot}`;
    }
    case "silent": {
      report();
      const mins = Math.max(0, Math.floor((now - Date.parse(status.at)) / 60000));
      return `**${agent} has been silent for ${mins} minutes** on ${project} (last report: ${[status.phase, status.brief].filter(Boolean).join(" ")}, ${String(status.at).slice(11, 16)} UTC). If its conversation has stopped, type \`go\` there.${foot}`;
    }
    case "asleep":
      return `**The ${project} desk is asleep**: nothing has moved for ${leaderAwake(cfg).idleMinutes} minutes. \`/agent-desk lead watch\`, or any desk command, wakes the leader ${leader}.${foot}`;
    case "merged": {
      if (!brief) throw new Error("merged needs --brief <id> (and --pr #N, --agent <name>, --words \"what is up next\")");
      return `**${brief}${pr ? ` (${pr})` : ""} is merged** into ${cfg.work_branch} on ${project}${agent ? `, from ${agent}` : ""}. ${words || "Nothing is up next yet."}${foot}`;
    }
    case "question": {
      if (!words) throw new Error('question needs --words "…"');
      const about = [brief, pr].filter(Boolean).join(", ");
      return `**A question for you on ${project}**: ${words}${about ? ` (${about})` : ""} Answer on the pull request, or tell the leader ${leader}.${foot}`;
    }
    default: throw new Error(`“${event}” isn't an event`);
  }
}

// What makes a notice the same as one already told: a blocked or silent report by its time (a new
// report is a new notice), a merge by its brief and pull request (once ever), asleep by the hour,
// a question by its first words.
export function notifyKey(event, { agent, brief, pr, words, status } = {}, now = Date.now()) {
  const part = event === "blocked" || event === "silent" ? `${agent}-${status?.at || ""}`
    : event === "merged" ? `${brief}-${pr || ""}`
    : event === "asleep" ? new Date(now).toISOString().slice(0, 13)
    : String(words || "").slice(0, 40);
  return slug(`${event}-${part}`);
}

// One line on where the owner is told, for status and the doctor.
export function notifyLine(cfg) {
  const n = notifyOf(cfg);
  return n ? `Notifications: issue #${n.issue} (${n.events.join(", ")}).` : "Notifications: off (node .agents/skills/agent-desk/scripts/desk.mjs notify --setup --issue <N>).";
}

// The ready-made command the leader's look prints for an event it saw.
export const notifyCommand = (event, args = "") => `notify: node .agents/skills/agent-desk/scripts/desk.mjs notify ${event}${args ? ` ${args}` : ""} --post`;
