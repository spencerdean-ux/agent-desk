// An agent's own report of what it is doing (agents/desk/status/<agent>.json on the work branch),
// written by desk.mjs report at every step boundary and read by status, validate and the leader's
// look. The board stays the leader's: a report is what the agent says, never the row's state.
// Pure: the caller hands in the text, the desk's settings and the time.
import { agentNamed, isAwake, silenceMinutes } from "./config.mjs";

export { statusDir } from "./paths.mjs";
// What an agent says it is doing, in the order a brief goes through them; blocked, waiting, stopped
// and moved sit beside them.
export const PHASES = ["taking", "working", "checking", "pushed", "reviewing", "reviewed", "revising", "blocked", "waiting", "stopped", "moved"];
// What the leader says it is doing.
export const LEADER_PHASES = ["checking", "deciding", "merging", "awake", "asleep"];
// A report in one of these needs no one's attention: the agent has left.
const GONE = new Set(["stopped", "moved"]);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function parseStatus(text) {
  try {
    const s = JSON.parse(String(text));
    return s && typeof s === "object" && !Array.isArray(s) ? s : { error: "a status is one object" };
  } catch (err) { return { error: `isn't JSON: ${err.message}` }; }
}

// Every way a report is wrong against the desk it is on; [] when it is right.
export function statusProblems(st, cfg) {
  if (!st || typeof st !== "object") return ["a status is one object"];
  if (st.error) return [st.error];
  const out = [];
  if (st.desk !== 1) out.push("desk must be 1 (the report's format)");
  if (st.project !== cfg.project) out.push(`project “${st.project ?? ""}” isn't this desk's “${cfg.project}”`);
  const leader = st.agent === cfg.leader?.name;
  if (!leader && !agentNamed(cfg, st.agent)) out.push(`“${st.agent ?? ""}” isn't on the desk (${(cfg.agents || []).map((a) => a.name).join(", ")}, or the leader ${cfg.leader?.name})`);
  const phases = leader ? [...LEADER_PHASES, ...PHASES] : PHASES;
  if (!phases.includes(st.phase)) out.push(`phase “${st.phase ?? ""}” isn't one of ${phases.join(", ")}`);
  if (typeof st.at !== "string" || !ISO.test(st.at) || Number.isNaN(Date.parse(st.at))) out.push(`at “${st.at ?? ""}” isn't a time (an ISO date, as new Date().toISOString() writes it)`);
  for (const k of ["brief", "pr", "step", "words", "tool"]) if (st[k] != null && typeof st[k] !== "string") out.push(`${k} must be words`);
  return out;
}

// Two reports say the same thing when phase, brief, pull request and step agree: the time and the
// words don't make a new one, so an unchanged report pushes nothing.
export const sameReport = (a, b) => !!a && !!b && ["phase", "brief", "pr", "step"].every((k) => (a[k] || "") === (b[k] || ""));

// "3 min ago", "1 h 5 min ago", "just now".
export function ago(at, now = Date.now()) {
  const mins = Math.max(0, Math.floor((now - Date.parse(at)) / 60000));
  if (!Number.isFinite(mins)) return "at an unreadable time";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
}

// The report in words for a column: "working A1-x (4: the job) · 3 min ago".
export function statusWords(st, now = Date.now()) {
  if (!st || !st.phase) return "nothing yet";
  const what = [st.phase, st.brief, st.pr].filter(Boolean).join(" ");
  return `${what}${st.step ? ` (${st.step})` : ""}${st.phase === "blocked" && st.words ? `: ${st.words}` : ""} · ${ago(st.at, now)}`;
}

// Whether an awake agent's wait should write its waiting report again: a waiting report older than
// half of desk.json's silence_minutes, so it never reaches silence while the agent is there. An
// unchanged report pushes nothing by itself (sameReport), which once left a fresh agent's hours-old
// waiting report in place and the leader reading it as silent. Only a waiting report is refreshed:
// any other phase is a step the agent reports itself.
export function heartbeatDue(cfg, st, now = Date.now()) {
  const a = agentNamed(cfg, st?.agent);
  if (!a || !isAwake(cfg, a) || st.phase !== "waiting") return false;
  const mins = (now - Date.parse(st.at)) / 60000;
  return Number.isFinite(mins) && mins >= silenceMinutes(cfg) / 2;
}

// How many minutes an awake agent has gone without a report past desk.json's silence_minutes (0 for
// none, an agent that isn't awake, or one that has stopped or moved, which is gone, not silent).
export function silence(cfg, st, now = Date.now()) {
  const a = agentNamed(cfg, st?.agent);
  if (!a || !isAwake(cfg, a) || GONE.has(st.phase)) return 0;
  const mins = Math.floor((now - Date.parse(st.at)) / 60000);
  return Number.isFinite(mins) && mins > silenceMinutes(cfg) ? mins : 0;
}
