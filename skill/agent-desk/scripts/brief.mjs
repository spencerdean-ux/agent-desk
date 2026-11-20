// A desk brief (agents/desk/assignments/<id>.md): the front matter the leader writes for one task,
// read back and checked against the desk it is on. Pure: no files, no git. The front matter is a
// small fixed shape (`key: value` lines and `key:` followed by `  - item` lines), so it is read here
// rather than with a YAML library the repository may not have.
import { isProtected } from "./scope.mjs";
import { agentNamed, protectedPaths, safePath, FORBIDDEN_BASES } from "./config.mjs";

export const SECTIONS = ["Goal", "Context", "Steps", "Done means", "Out of scope", "Stop and ask when"];
// waits_on: the briefs a queued one waits on , read by desk.mjs plan.
const LISTS = ["may_change", "frozen", "checks", "waits_on"];
const FIELDS = ["id", "project", "slot", "reviewer", "spec", "title", "base", "branch", "port"];
export const ID = /^[A-Za-z0-9][A-Za-z0-9-]{1,60}$/;

// A new brief from the template, addressed to its agent: every front-matter field the desk decides
// (project, base, branch, port, and the agent's reviewer unless another is named) filled in, the
// lists and the sections left for the leader to write, and the template's note to the leader
// dropped. Throws, in words, when it can't be addressed. Pure: the caller writes the file.
export function newBrief(template, cfg, { id, slot, spec, title, reviewer, goal, context }) {
  if (!ID.test(id || "")) throw new Error(`id “${id ?? ""}” must be letters, digits and hyphens, such as A3-launch-page`);
  // A spare brief (slot any) is held in the queue for whichever agent runs out first: its reviewer,
  // branch and port are filled in when it goes up (assignSpare).
  const spare = slot === "any";
  const agent = spare ? { port: "any", reviewer: "any" } : agentNamed(cfg, slot);
  if (!agent) throw new Error(`“${slot ?? ""}” isn't an agent on the desk (${(cfg.agents || []).map((a) => a.name).join(", ")})`);
  if (!spec || !String(spec).trim()) throw new Error("name the spec step with --spec <step>");
  if (!title || !String(title).trim()) throw new Error('give the brief a title with --title "<one line>"');
  const who = reviewer || agent.reviewer;
  if (!spare && who !== "leader" && (who === slot || !agentNamed(cfg, who))) throw new Error(`reviewer “${who}” must be another agent on the desk, or "leader"`);
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(String(template || ""));
  if (!m) throw new Error("the template has no front matter: install the skill again");
  const values = { id, project: cfg.project, slot, reviewer: who, spec: String(spec).trim(), title: String(title).trim().replace(/\n/g, " "), base: cfg.work_branch, branch: `desk/${cfg.project}/${slot}/${id}`, port: String(agent.port) };
  const head = m[1].split("\n").map((line) => {
    const field = /^([a-z_]+):\s*(.*)$/.exec(line);
    return field && values[field[1]] !== undefined ? `${field[1]}: ${values[field[1]]}` : line;
  }).join("\n");
  let body = m[2].replace(/<!--[\s\S]*?-->\n*/g, "").replace(/^\n+/, "");
  // From a spec step (--from-spec): the Goal is the step's own words and the Context names the file.
  // Function replacements, as a step's words may hold $& and its kin.
  if (goal) body = body.replace(/(## Goal\n\n)[\s\S]*?(?=\n## |$)/, (_, h) => `${h}${String(goal).trim()}\n`);
  if (context) body = body.replace(/(## Context\n\n)/, (_, h) => `${h}${String(context).trim()}\n\n`);
  return `---\n${head}\n---\n\n${body}`;
}

// The sections' words, by heading, in the order they come: { Goal: "…", Context: "…", … }.
export function briefSections(text) {
  const m = /^---\n[\s\S]*?\n---\n?([\s\S]*)$/.exec(String(text || ""));
  const body = m ? m[1] : String(text || "");
  const out = {};
  let cur = null;
  for (const line of body.split("\n")) {
    const h = /^## (.+)$/.exec(line);
    if (h) { cur = h[1].trim(); out[cur] = ""; continue; }
    if (cur !== null) out[cur] += (out[cur] ? "\n" : "") + line;
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim();
  return out;
}

export function parseBrief(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(String(text || ""));
  if (!m) return { frontMatter: false, sections: [] };
  const brief = { frontMatter: true, may_change: [], frozen: [], checks: [], waits_on: [] };
  let list = null;
  for (const line of m[1].split("\n")) {
    const item = /^ {2}- (.*)$/.exec(line);
    if (item && list) { brief[list].push(item[1].trim()); continue; }
    const field = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!field) { list = null; continue; }
    const [, key, value] = field;
    if (LISTS.includes(key)) { list = key; continue; }
    list = null;
    brief[key] = key === "port" ? Number(value) : value.trim();
  }
  brief.sections = [...m[2].matchAll(/^## (.+)$/gm)].map((h) => h[1].trim());
  return brief;
}

// Every way the brief is wrong, in words; [] when it is right. fileId is the file's name less .md;
// cfg is the desk it is on (desk.json), which says which agents there are and their ports.
export function briefProblems(brief, fileId, cfg) {
  if (!brief.frontMatter) return ["no front matter: a brief starts with --- lines"];
  const out = [];
  const names = (cfg.agents || []).map((a) => a.name);
  const agent = agentNamed(cfg, brief.slot);
  for (const k of FIELDS) if (brief[k] === undefined || brief[k] === "") out.push(`${k} is missing`);
  if (brief.id && !ID.test(brief.id)) out.push(`id “${brief.id}” isn't letters, digits and hyphens`);
  if (brief.id !== fileId) out.push(`file name “${fileId}” must be the id “${brief.id}”`);
  if (brief.project && brief.project !== cfg.project) out.push(`project “${brief.project}” isn't this desk's project, “${cfg.project}”`);
  if (!agent) out.push(`slot “${brief.slot}” isn't an agent on the desk (${names.join(", ")})`);
  if (brief.reviewer !== "leader" && (brief.reviewer === brief.slot || !names.includes(brief.reviewer)))
    out.push(`reviewer “${brief.reviewer}” must be another agent on the desk, or "leader"`);
  const branch = `desk/${cfg.project}/${brief.slot}/${brief.id}`;
  if (brief.branch !== branch) out.push(`branch must be ${branch} (desk/<project>/<agent>/<brief id>)`);
  if (FORBIDDEN_BASES.includes(brief.base)) out.push(`base can't be ${brief.base}: agents work into the work branch only`);
  if (agent && brief.port !== agent.port) out.push(`port must be ${agent.port} for ${brief.slot}`);
  const guarded = protectedPaths(cfg);
  if (!brief.may_change.length) out.push("may_change lists no file");
  for (const p of brief.may_change) {
    if (!safePath(p)) out.push(`may_change “${p}” isn't a path inside the repository`);
    else if (isProtected(p, guarded)) out.push(`may_change “${p}” is protected: the desk's own files, the rules and the repository's guarded files`);
  }
  for (const p of brief.frozen) {
    if (!safePath(p)) out.push(`frozen “${p}” isn't a path inside the repository`);
    if (brief.may_change.includes(p)) out.push(`“${p}” is both frozen and in may_change`);
  }
  // With the desk's test suite named (desk.json tests), desk-check runs what the branch changed, so a brief may list none.
  if (!brief.checks.length && !cfg.tests) out.push("checks lists no command");
  for (const w of brief.waits_on || []) if (!ID.test(w)) out.push(`waits_on “${w}” isn't a brief id`);
  // A brief handed from one agent to another (desk.mjs reassign) names who had it and where it stood.
  if (brief.handed_from !== undefined) {
    if (!names.includes(brief.handed_from) || brief.handed_from === brief.slot) out.push(`handed_from “${brief.handed_from}” must be the agent that had the brief before ${brief.slot}`);
    if (!/^[0-9a-f]{7,40}$/.test(brief.handed_head || "")) out.push("handed_head must be the commit the brief was handed over at");
  }
  for (const s of SECTIONS) if (!brief.sections.includes(s)) out.push(`the section “## ${s}” is missing`);
  return out;
}

// A front-matter field set to a value: replaced where it is, else added after the line `after` names
// (or at the end of the fields). Pure, on the brief's whole text.
function setField(text, key, value, after) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) throw new Error("the brief has no front matter");
  const lines = m[1].split("\n");
  const at = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (at >= 0) lines[at] = `${key}: ${value}`;
  else {
    const i = after ? lines.findIndex((l) => new RegExp(`^${after}:`).test(l)) : -1;
    lines.splice(i >= 0 ? i + 1 : lines.length, 0, `${key}: ${value}`);
  }
  return `---\n${lines.join("\n")}\n---` + text.slice(m[0].length);
}

// A queued brief's wave (desk.mjs brief --wave): the round it is worked in.
export const withWave = (text, n) => setField(String(text), "wave", String(n), "port");

// A spare brief given to an agent (desk.mjs up <id> --for <agent>): its slot, branch and port are the
// agent's, and its reviewer the agent's own.
export function assignSpare(text, cfg, to) {
  const agent = agentNamed(cfg, to);
  if (!agent) throw new Error(`“${to ?? ""}” isn't an agent on the desk (${(cfg.agents || []).map((a) => a.name).join(", ")})`);
  const b = parseBrief(text);
  let out = setField(String(text), "slot", to);
  out = setField(out, "reviewer", agent.reviewer && agent.reviewer !== to ? agent.reviewer : "leader");
  out = setField(out, "branch", `desk/${cfg.project}/${to}/${b.id}`);
  return setField(out, "port", String(agent.port));
}

// The brief with another reviewer (desk.mjs shape).
export const withReviewer = (text, reviewer) => setField(String(text), "reviewer", reviewer);

// The brief handed to another agent (desk.mjs reassign): its slot, branch and port are the new agent's,
// its reviewer the new agent's own (or the leader, where that would be the agent itself), and it
// records who had it, the pull request and the commit it stood at, so desk-check takes those commits.
export function reassignBrief(text, cfg, to, { from, pr, head }) {
  const agent = agentNamed(cfg, to);
  if (!agent) throw new Error(`“${to ?? ""}” isn't an agent on the desk (${(cfg.agents || []).map((a) => a.name).join(", ")})`);
  const b = parseBrief(text);
  if (b.slot === to) throw new Error(`${b.id} is ${to}'s already`);
  const reviewer = agent.reviewer && agent.reviewer !== to ? agent.reviewer : "leader";
  let out = setField(String(text), "slot", to);
  out = setField(out, "reviewer", reviewer);
  out = setField(out, "branch", `desk/${cfg.project}/${to}/${b.id}`);
  out = setField(out, "port", String(agent.port));
  out = setField(out, "handed_from", from, "port");
  out = setField(out, "handed_pr", pr || "none", "handed_from");
  return setField(out, "handed_head", head, "handed_pr");
}
