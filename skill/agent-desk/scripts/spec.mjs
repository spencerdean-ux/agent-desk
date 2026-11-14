// The spec's steps, and which one comes next (desk.mjs next, brief --from-spec). A spec is markdown
// under desk.json's `specs` (a file, or a folder of .md files) with one heading per step, like
// `### A9. The responses dashboard`, under `## Release …` headings. The leader records which steps
// are finished in agents/desk/progress.json on the work branch; a brief's `spec:` field says which
// step it serves. Pure: the caller hands in the texts, the briefs and the board.
import { agentNamed } from "./config.mjs";

export { progressPath } from "./paths.mjs";
export const STEP_ID = /^[A-Z]+\d+[a-z]?$/;
const HEADING = /^### ([A-Z]+\d+[a-z]?)\. (.+?)\s*$/;
const ACTIVE = new Set(["ready", "in-progress", "review", "changes"]);
const PROGRESS_STATES = ["done", "skipped"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
// Words in a step that mean the owner decides before it is briefed.
const OWNER = /\b(stop|the owner decides|ask the owner|owner's approval|the owner approves)\b/i;

// The steps of one spec file: id, title, release (the nearest `## Release …` heading above, or
// none), body (its words to the next heading), file and line.
export function parseSpec(text, file = "") {
  const steps = [];
  let release = "", cur = null;
  String(text || "").split("\n").forEach((line, i) => {
    if (/^## /.test(line)) { release = /^## (release\b.*)$/i.test(line) ? line.slice(3).trim() : ""; cur = null; return; }
    const m = HEADING.exec(line);
    if (m) { cur = { id: m[1], title: m[2], release, body: "", file, line: i + 1 }; steps.push(cur); return; }
    if (cur) cur.body += (cur.body ? "\n" : "") + line;
  });
  for (const s of steps) s.body = s.body.trim();
  return { steps, releases: [...new Set(steps.map((s) => s.release).filter(Boolean))] };
}

// Every way progress.json is wrong against the desk and the spec; [] when it is right. With no
// steps given (the spec couldn't be read), a step's id is checked for shape alone.
export function progressProblems(progress, cfg, steps = []) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) return ["progress.json must hold one object"];
  if (progress.error) return [progress.error];
  const out = [];
  if (progress.desk !== 1) out.push("desk must be 1 (the file's format)");
  if (progress.project !== cfg.project) out.push(`project “${progress.project ?? ""}” isn't this desk's “${cfg.project}”`);
  const marks = progress.steps;
  if (!marks || typeof marks !== "object" || Array.isArray(marks)) { out.push("steps must be an object of step id → { state, at, note }"); return out; }
  const ids = new Set(steps.map((s) => s.id));
  for (const [id, m] of Object.entries(marks)) {
    if (!STEP_ID.test(id)) out.push(`“${id}” isn't a step id (letters, digits, perhaps a letter: A9, B12, A9b)`);
    else if (steps.length && !ids.has(id)) out.push(`${id} isn't a step in the spec`);
    if (!m || typeof m !== "object") { out.push(`${id} must be { state, at, note }`); continue; }
    if (!PROGRESS_STATES.includes(m.state)) out.push(`${id}: state “${m.state ?? ""}” isn't one of ${PROGRESS_STATES.join(", ")}`);
    if (typeof m.at !== "string" || !ISO.test(m.at)) out.push(`${id}: at “${m.at ?? ""}” isn't a time (an ISO date)`);
    if (m.note != null && typeof m.note !== "string") out.push(`${id}: note must be words`);
  }
  return out;
}

const SMALL = new Set(["a", "an", "and", "the", "of", "to", "in", "on", "for", "who", "with", "its", "it", "is", "part"]);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w && !SMALL.has(w)).slice(0, 3).join("-");

// What each agent whose row is done or idle, with no brief ready, should take next: the first open
// step (not marked done or skipped, and not in hand on an active row) not already offered to an
// earlier agent. A step no brief has ever named is `clear`; one with briefs that aren't marked is
// `partly` covered (the leader marks it or briefs the rest, and asks the owner if the spec reads two
// ways); `nothing` when the spec has no open step left. A step whose words say stop, or that the
// owner decides, is flagged needsOwner.
export function nextSteps({ steps = [], progress = { steps: {} }, briefs = [], board = {}, cfg, queued = [] }) {
  const marks = (progress && progress.steps) || {};
  const complete = (id) => PROGRESS_STATES.includes(marks[id]?.state);
  const rowOf = (briefId) => Object.entries(board).find(([, r]) => r && r.brief === briefId);
  const briefsOf = (id) => briefs.filter((b) => b.spec === id).map((b) => { const row = rowOf(b.id); return { id: b.id, slot: b.slot, state: row ? row[1].state : "done", pr: row ? row[1].pr || "" : "" }; });
  const inHand = steps.filter((s) => briefsOf(s.id).some((b) => ACTIVE.has(b.state)));
  const open = steps.filter((s) => !complete(s.id) && !inHand.includes(s));
  const needs = (cfg.agents || []).filter((a) => { const r = board[a.name]; return !r || !ACTIVE.has(r.state); });
  const proposals = [];
  let i = 0;
  for (const a of needs) {
    const step = open[i++];
    const row = board[a.name];
    const was = row && row.brief ? `${row.state} with ${row.brief}${row.pr ? `, ${row.pr}` : ""}` : "idle";
    if (!step) { proposals.push({ agent: a.name, was, kind: "nothing", step: null, briefs: [], needsOwner: false, suggestedId: "", queued: [] }); continue; }
    const its = briefsOf(step.id);
    proposals.push({ agent: a.name, was, kind: its.length ? "partly" : "clear", step, briefs: its, needsOwner: OWNER.test(step.body), suggestedId: `${step.id}-${slug(step.title) || "step"}`, queued: queued.filter((q) => q.spec === step.id) });
  }
  const done = Object.values(marks).filter((m) => m?.state === "done").length;
  const skipped = Object.values(marks).filter((m) => m?.state === "skipped").length;
  return { proposals, inHand, open, done, skipped, total: steps.length, briefsOf, complete };
}

const quote = (body) => body.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n");
const cut = (body, n) => { const lines = body.split("\n"); return lines.length > n ? `${lines.slice(0, n).join("\n")}\n> …` : body; };

// The Goal a brief gets from its step (brief --from-spec).
export const stepGoal = (step) => `Spec step **${step.id}. ${step.title}**${step.file || step.release ? ` (${[step.file, step.release].filter(Boolean).join(", ")})` : ""}:\n\n${quote(step.body || "(the step has no words under its heading)")}`;
export const stepContext = (step) => `Read ${step.file || "the spec"}, step ${step.id} (quoted in the Goal), first.`;

// The proposals in words, for the leader.
export function nextWords(cfg, out, proposals, specs) {
  const inHand = out.inHand.length ? out.inHand.map((s) => `${s.id} — ${out.briefsOf(s.id).filter((b) => ACTIVE.has(b.state)).map((b) => `${b.id} ${b.state} for ${b.slot}`).join(", ")}`).join("; ") : "none";
  const lines = [`Next on ${cfg.project} (${out.done} of ${out.total} steps done${out.skipped ? `, ${out.skipped} skipped` : ""}; in hand: ${inHand}):`, ""];
  if (!proposals.length) lines.push("Every agent has a brief in hand or waiting: nothing to put up.");
  for (const p of proposals) {
    if (p.kind === "nothing") { lines.push(`${p.agent} (${p.was}): nothing left in ${specs}: every step is done, skipped or in hand. Ask the owner what comes next (node .agents/skills/agent-desk/scripts/desk.mjs notify question --words "…" --post).`); continue; }
    const s = p.step;
    lines.push(`${p.agent} (${p.was}): ${s.id}. ${s.title}  [${[s.release, `${s.file}:${s.line}`].filter(Boolean).join(", ")}]`);
    if (p.kind === "clear") lines.push(`  clear: no brief names ${s.id} yet.`);
    else lines.push(`  partly covered: ${p.briefs.map((b) => `${b.id} (${b.state}${b.pr ? ` ${b.pr}` : ""})`).join(", ")} — mark it (node .agents/skills/agent-desk/scripts/desk.mjs next --done ${s.id}) or brief the part that is left; ask the owner if the spec reads two ways.`);
    if (p.needsOwner) lines.push("  needs the owner: the step's words say to stop, or that the owner decides. Ask before briefing it (notify question).");
    for (const q of p.queued) lines.push(`  a queued brief exists: node .agents/skills/agent-desk/scripts/desk.mjs up ${q.id}`);
    lines.push(cut(quote(s.body || "(no words under the heading)"), 40).split("\n").map((l) => `  ${l}`).join("\n"));
    lines.push(`  brief it: node .agents/skills/agent-desk/scripts/desk.mjs brief ${p.suggestedId} --for ${p.agent} --from-spec ${s.id}`, "");
  }
  return lines.join("\n").trimEnd();
}

// Every step with its state and its briefs (next --list).
export function listWords(cfg, steps, out) {
  const state = (s) => out.complete(s.id) ? (out.inHand.includes(s) ? "in hand" : "done") : out.inHand.includes(s) ? "in hand" : "open";
  const marks = (id) => out.briefsOf(id);
  return [`Steps of ${cfg.project} (${out.done} done, ${out.skipped} skipped, ${out.inHand.length} in hand, ${out.open.length} open of ${out.total}):`, ...steps.map((s) => {
    const m = marks(s.id);
    return `  ${s.id}  ${state(s).padEnd(7)}  ${s.title}${s.release ? `  [${s.release}]` : ""}${m.length ? `  briefs: ${m.map((b) => `${b.id} (${b.state}${b.pr ? ` ${b.pr}` : ""})`).join(", ")}` : ""}`;
  })].join("\n");
}

// A spec file name is fine when it is markdown inside the repository.
export const isSpecFile = (p) => /\.md$/i.test(p) && !p.split("/").includes("..");
export { agentNamed };
