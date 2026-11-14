// The desk's timeline (desk.mjs log): what happened on the work branch, read from its commits by
// their effect, not their words: a report (agents/desk/status), a board move (the rows that changed
// between a commit and its parent), a brief put up (a file added under assignments/), desk.json
// changed, progress marked, a desk branch merged, and the rest under agents/desk/ as other. Pure:
// the caller hands in each commit with its paths and a way to read a file at it and at its parent.
import { parseBoard } from "./board.mjs";
import { parseBrief } from "./brief.mjs";
import { parseStatus } from "./status.mjs";

// A time from "2d", "12h", "30m" or an ISO date; null for none; throws for anything else.
export function sinceDate(spec, now = Date.now()) {
  if (!spec) return null;
  const m = /^(\d+)([dhm])$/.exec(String(spec).trim());
  if (m) return now - Number(m[1]) * { d: 86400000, h: 3600000, m: 60000 }[m[2]];
  const t = Date.parse(spec);
  if (Number.isNaN(t)) throw new Error(`“${spec}” isn't a time: give an ISO date, or a span like 2d, 12h or 30m`);
  return t;
}

// The rows that changed between two boards: "agent-a: review → done (#7)", "agent-b: idle → ready B1-y".
export function boardChanges(before, after) {
  const a = parseBoard(before || "").slots, b = parseBoard(after || "").slots;
  const blank = { state: "idle", brief: "", pr: "" };
  const out = [];
  for (const name of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
    const x = a[name] || blank, y = b[name] || blank;
    if (x.state === y.state && x.brief === y.brief && x.pr === y.pr) continue;
    const briefMoved = x.brief !== y.brief;
    const from = `${x.state}${briefMoved && x.brief ? ` ${x.brief}` : ""}`;
    const to = `${y.state}${briefMoved && y.brief ? ` ${y.brief}` : ""}${y.pr && (y.pr !== x.pr || y.state !== x.state) ? ` (${y.pr})` : ""}`;
    out.push(`${name}: ${from} → ${to}`);
  }
  return out;
}

// One commit as an event { at, who, kind, words, agent, brief, pr }. c: { sha, at, parents, subject,
// trailers: { project, agent }, paths: [{ status, path }], readAt(path), readAtParent(path) }.
export function classifyCommit(c, { project, leader }) {
  const ev = { at: c.at, who: leader || "the leader", kind: "other", words: c.subject || "", agent: "", brief: "", pr: "" };
  const paths = (c.paths || []).map((p) => p.path);
  if ((c.parents || []).length > 1) {
    const num = /#(\d+)/.exec(c.subject || "");
    const branch = new RegExp(`desk/${project}/([a-z0-9-]+)/([A-Za-z0-9][A-Za-z0-9-]*)`).exec(c.subject || "");
    const ours = /^Merge (\S+) \(#(\d+), ([a-z][a-z0-9-]*)\)/.exec(c.subject || "");
    if (branch || ours) {
      ev.kind = "merged"; ev.pr = num ? `#${num[1]}` : ""; ev.agent = branch ? branch[1] : ours[3]; ev.brief = branch ? branch[2] : ours[1];
      ev.words = [ev.brief, ev.pr, ev.agent ? `(${ev.agent})` : ""].filter(Boolean).join(" ");
      return ev;
    }
    ev.words = `merge: ${c.subject}`;
    return ev;
  }
  const statusPaths = paths.filter((p) => /^agents\/desk\/[^/]+\/status\/[^/]+\.json$/.test(p));
  if (paths.length && statusPaths.length === paths.length) {
    const name = c.trailers?.agent || statusPaths[0].replace(/^agents\/desk\/[^/]+\/status\/|\.json$/g, "");
    const st = parseStatus(c.readAt(statusPaths[0]) || "{}");
    ev.who = name; ev.agent = name;
    if (st && !st.error && st.phase) {
      ev.kind = st.phase; ev.brief = st.brief || ""; ev.pr = st.pr || "";
      ev.words = `${[st.brief, st.pr].filter(Boolean).join(" ")}${st.step ? ` (${st.step})` : ""}${st.words ? `${st.brief || st.pr || st.step ? ": " : ""}${st.words}` : ""}`.trim();
    } else ev.kind = "status";
    return ev;
  }
  const boardFile = paths.find((p) => /^agents\/desk\/[^/]+\/board\.md$/.test(p));
  if (boardFile) {
    ev.kind = "board"; ev.who = c.trailers?.agent || leader || "the leader";
    const changes = boardChanges(c.readAtParent(boardFile), c.readAt(boardFile));
    ev.words = changes.length ? changes.join("; ") : c.subject || "the board";
    ev.agent = changes.length === 1 ? changes[0].split(":")[0] : "";
    return ev;
  }
  const added = (c.paths || []).find((p) => /^A/.test(p.status || "") && /^agents\/desk\/[^/]+\/assignments\/(?!_template\.md$)[^/]+\.md$/.test(p.path));
  if (added) {
    const id = added.path.replace(/^agents\/desk\/[^/]+\/assignments\/|\.md$/g, "");
    const b = parseBrief(c.readAt(added.path) || "");
    ev.kind = "brief"; ev.brief = id; ev.agent = b.slot || "";
    ev.words = `${id} for ${b.slot || "?"}${b.spec ? ` (spec ${b.spec})` : ""}${b.title ? `: ${b.title}` : ""}`;
    return ev;
  }
  if (paths.some((p) => /^agents\/desk\/[^/]+\/desk\.json$/.test(p))) { ev.kind = "desk"; ev.who = c.trailers?.agent || leader || "the leader"; return ev; }
  if (paths.some((p) => /^agents\/desk\/[^/]+\/progress\.json$/.test(p))) { ev.kind = "progress"; return ev; }
  return ev;
}

const stamp = (at) => new Date(at).toISOString().replace("T", " ").slice(0, 16) + "Z";
const clock = (at) => new Date(at).toISOString().slice(11, 16) + "Z";
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// One line per event, oldest first as given.
export function formatLines(events) {
  if (!events.length) return "";
  const w = Math.max(...events.map((e) => e.who.length), 4);
  return events.map((e) => `${stamp(e.at)}  ${e.who.padEnd(w)}  ${e.kind.padEnd(8)}  ${cut(e.words, 100)}`).join("\n");
}

// A digest for the owner: a heading per day, same-minute merge and board events folded into one.
export function formatMarkdown(events, cfg, { from, to } = {}) {
  const lines = [`## Desk log for ${cfg.project}, ${from ? stamp(from) : "the start"} to ${to ? stamp(to) : "now"}`];
  let day = "";
  const folded = [];
  for (const e of events) {
    const prev = folded[folded.length - 1];
    if (prev && prev.kind === "merged" && e.kind === "board" && clock(prev.at) === clock(e.at)) { prev.words += `; board: ${e.words}`; continue; }
    folded.push({ ...e });
  }
  for (const e of folded) {
    const d = new Date(e.at).toISOString().slice(0, 10);
    if (d !== day) { day = d; lines.push("", `### ${d}`); }
    lines.push(`- **${clock(e.at)}** ${e.who} ${e.kind === "merged" ? `merged ${e.words}` : e.kind === "brief" ? `put up ${e.words}` : e.kind === "board" ? `board: ${e.words}` : `${e.kind}: ${e.words}`}`);
  }
  const merged = events.filter((e) => e.kind === "merged").length, briefs = events.filter((e) => e.kind === "brief").length;
  const reports = events.filter((e) => !["merged", "brief", "board", "desk", "progress", "other", "status"].includes(e.kind)).length;
  const blocked = events.filter((e) => e.kind === "blocked").length;
  lines.push("", `Merged: ${merged} brief${merged === 1 ? "" : "s"}. Briefs put up: ${briefs}. Reports: ${reports}${blocked ? `, ${blocked} blocked` : ", none blocked"}.`);
  return lines.join("\n");
}
