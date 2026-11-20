// The desk's settings (agents/desk/<project>/desk.json): the project's name, who leads, which agents work, in which tool, on which
// model and for what, who reviews whom, and the work branch. Pure: the caller hands in the text.
// Every other desk script reads its agents from here, so changing the team never means editing code.
import { CORE_PROTECTED } from "./scope.mjs";
import { MODELS, DEFAULT_SUBAGENT_MODELS, modelRow, subagentModelIds, modelWords } from "./models.mjs";

export { configPath } from "./paths.mjs";
// Two agents unless the owner asks for more; six at most, as each needs ports of its own and more
// than that is more than one person can follow.
export const DEFAULT_AGENTS = 2;
export const MAX_AGENTS = 6;
export const TOOLS = ["claude-code", "codex", "antigravity", "other"];
export const TOOL_WORDS = { "claude-code": "Claude Code", codex: "Codex", antigravity: "Antigravity", other: "its own tool" };
// Branches an agent's work must never go straight into.
export const FORBIDDEN_BASES = ["main", "master", "staging", "production"];
// The leader stays awake unless told not to, and sleeps after this long with nothing moving on the
// desk (on by default, off after an hour of no activity); a week at most.
export const DEFAULT_IDLE_MINUTES = 60;
export const MAX_IDLE_MINUTES = 10080;
// Where an agent's conversation compacts, in tokens (500,000 for every
// agent wherever it runs); each tool reads it from its own settings file, which setup writes.
export const DEFAULT_AUTOCOMPACT = 500000;
export const AUTOCOMPACT_MIN = 100000;
export const AUTOCOMPACT_MAX = 1000000;
// An awake agent that has reported nothing for this long is flagged silent.
export const DEFAULT_SILENCE_MINUTES = 20;
export const MAX_SILENCE_MINUTES = 1440;
// The events the owner is told of on the project's GitHub issue (desk.json's notify): an agent blocked or silent, the desk asleep, a brief merged, a question for them.
export const NOTIFY_EVENTS = ["blocked", "silent", "asleep", "merged", "question"];
// One designated agent may start subagents of its own, for adversarial review of its own diff and for
// running checks only: by default one agent, up to 2 subagents, so its pull request
// needn't wait for another agent to pick it up. Present on an agent means allowed; absent means not.
// Briefs kept ready behind each agent's current one, and spare ones held for whichever agent runs out
// first (desk.json's ready and spare): one and none unless the owner asks for more.
export const DEFAULT_READY = 1;
export const MAX_READY = 5;
export const MAX_SPARE = 10;
export const SUBAGENT_SCOPES = ["review", "checks"];
export const DEFAULT_SUBAGENTS = 2;
export const MAX_SUBAGENTS = 4;
const tokens = (v) => Number.isInteger(v) && v >= AUTOCOMPACT_MIN && v <= AUTOCOMPACT_MAX;
const NAME = /^[a-z][a-z0-9-]{1,30}$/;
// A project's name goes into every branch, prompt, pull request and comment of its desk, so that
// several projects (in one repository or many) never mix: lower-case, digits and hyphens.
export const PROJECT = /^[a-z][a-z0-9-]{1,40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REF = /^[A-Za-z0-9._/-]{1,200}$/;
const ENV = /^[A-Z][A-Z0-9_]{0,40}$/;

export function parseConfig(text) {
  try { return JSON.parse(String(text)); }
  catch (err) { return { error: `desk.json isn't JSON: ${err.message}` }; }
}

export const safePath = (p) => typeof p === "string" && !!p && !p.startsWith("/") && !p.split("/").includes("..") && !p.includes("\\");
const short = (v, max) => typeof v === "string" && v.trim() !== "" && v.length <= max;

// Every way the settings are wrong, in words; [] when they are right.
export function configProblems(cfg) {
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return ["desk.json must hold one object"];
  if (cfg.error) return [cfg.error];
  const out = [];
  if (cfg.desk !== 1) out.push("desk must be 1 (the settings' format)");
  if (cfg.project === "archive") out.push("project can't be “archive”: that folder holds the desks of finished projects");
  if (!PROJECT.test(cfg.project || "")) out.push(`project “${cfg.project ?? ""}” must be a name of lower-case letters, digits and hyphens, such as garden-app`);
  if (cfg.title != null && !short(cfg.title, 120)) out.push("title must be a short line, or left out");
  if (!REPO.test(cfg.repository || "")) out.push(`repository “${cfg.repository ?? ""}” must be owner/name on GitHub`);
  if (!REF.test(cfg.work_branch || "")) out.push(`work_branch “${cfg.work_branch ?? ""}” isn't a branch name`);
  else if (FORBIDDEN_BASES.includes(cfg.work_branch)) out.push(`work_branch can't be ${FORBIDDEN_BASES.join(", ")}: agents work into a branch of the leader's`);

  if (cfg.asleep != null && (typeof cfg.asleep !== "string" || Number.isNaN(Date.parse(cfg.asleep)))) out.push("asleep must be the time the owner said good night (desk.mjs goodnight writes it, desk.mjs wake removes it), or left out");
  if (cfg.awake != null && typeof cfg.awake !== "boolean") out.push("awake must be true or false (off unless set): whether agents stay on the desk between steps");
  if (cfg.ready != null && !(Number.isInteger(cfg.ready) && cfg.ready >= 1 && cfg.ready <= MAX_READY)) out.push(`ready must be a whole number from 1 to ${MAX_READY} (${DEFAULT_READY} unless set): the briefs kept ready behind each agent's current one`);
  if (cfg.spare != null && !(Number.isInteger(cfg.spare) && cfg.spare >= 0 && cfg.spare <= MAX_SPARE)) out.push(`spare must be a whole number from 0 to ${MAX_SPARE} (none unless set): the spare briefs kept for whichever agent runs out first`);
  if (cfg.prewrite != null && typeof cfg.prewrite !== "boolean") out.push("prewrite must be true or false (false unless set): whether every wave and brief is written ahead from the spec");
  if (cfg.autocompact != null && cfg.autocompact !== false && !tokens(cfg.autocompact)) out.push(`autocompact must be false (not set by the skill) or a whole number of tokens from ${AUTOCOMPACT_MIN} to ${AUTOCOMPACT_MAX} (${DEFAULT_AUTOCOMPACT} unless set): where an agent's conversation compacts`);
  if (cfg.silence_minutes != null && !(Number.isInteger(cfg.silence_minutes) && cfg.silence_minutes >= 1 && cfg.silence_minutes <= MAX_SILENCE_MINUTES))
    out.push(`silence_minutes must be a whole number of minutes from 1 to ${MAX_SILENCE_MINUTES} (${DEFAULT_SILENCE_MINUTES} unless set): how long an awake agent may go without a report`);

  if (cfg.notify != null) {
    const n = cfg.notify;
    if (typeof n !== "object" || Array.isArray(n)) out.push("notify must be an object { issue, events }, or left out (notifications off)");
    else {
      if (!(Number.isInteger(n.issue) && n.issue >= 1)) out.push("notify: issue must be the number of the GitHub issue the owner is told on (a whole number from 1)");
      if (n.events != null && !(Array.isArray(n.events) && n.events.every((e) => NOTIFY_EVENTS.includes(e)) && new Set(n.events).size === n.events.length))
        out.push(`notify: events must list some of ${NOTIFY_EVENTS.join(", ")}, each once, or be left out for all of them`);
    }
  }

  const leader = cfg.leader || {};
  if (!NAME.test(leader.name || "")) out.push(`leader: name “${leader.name ?? ""}” must be lower-case letters, digits and hyphens`);
  if (!TOOLS.includes(leader.tool)) out.push(`leader: tool “${leader.tool ?? ""}” isn't one of ${TOOLS.join(", ")}`);
  if (leader.model != null && !short(leader.model, 80)) out.push("leader: model must be a short name, or null");
  if (leader.awake != null && typeof leader.awake !== "boolean") out.push("leader: awake must be true or false (on unless set to false): whether the leader keeps watching the desk between the owner's words");
  if (leader.idle_minutes != null && !(Number.isInteger(leader.idle_minutes) && leader.idle_minutes >= 1 && leader.idle_minutes <= MAX_IDLE_MINUTES))
    out.push(`leader: idle_minutes must be a whole number of minutes from 1 to ${MAX_IDLE_MINUTES} (${DEFAULT_IDLE_MINUTES} unless set): how long the leader stays awake with nothing moving on the desk`);

  const agents = Array.isArray(cfg.agents) ? cfg.agents : [];
  if (agents.length < 1 || agents.length > MAX_AGENTS)
    out.push(`agents: a desk has from 1 to ${MAX_AGENTS} agents (${DEFAULT_AGENTS} is the default); this one has ${agents.length}`);
  const names = agents.map((a) => a && a.name);
  const portEnvs = Array.isArray(cfg.port_env) ? cfg.port_env : [];
  if (!portEnvs.length || !portEnvs.every((e) => ENV.test(e))) out.push("port_env must list one or more environment variable names, such as PORT");
  const width = Math.max(1, portEnvs.length);

  agents.forEach((a, i) => {
    a = a || {};
    const who = `agent “${a.name ?? i + 1}”`;
    if (!NAME.test(a.name || "")) out.push(`${who}: name must be lower-case letters, digits and hyphens, 2 to 31 of them`);
    else if (names.indexOf(a.name) !== i) out.push(`agents: the name “${a.name}” is used twice`);
    if (a.name === leader.name || a.name === "leader") out.push(`${who}: shares its name with the leader`);
    if (!TOOLS.includes(a.tool)) out.push(`${who}: tool “${a.tool ?? ""}” isn't one of ${TOOLS.join(", ")}`);
    if (a.model != null && !short(a.model, 80)) out.push(`${who}: model must be a short name, or null for the tool's own choice`);
    if (a.models != null && !(Array.isArray(a.models) && a.models.length > 0 && a.models.every((m) => short(m, 80)))) out.push(`${who}: models must list the names of the models it may use, or be left out for any`);
    if (!short(a.job, 300)) out.push(`${who}: job is missing (what this agent is for, in a line)`);
    if (a.reviewer !== "leader" && (a.reviewer === a.name || !names.includes(a.reviewer)))
      out.push(`${who}: reviewer “${a.reviewer ?? ""}” must be another agent on the desk, or "leader"`);
    if (!Number.isInteger(a.port) || a.port < 1024 || a.port + width - 1 > 65000) out.push(`${who}: port must be a whole number from 1024 to 65000`);
    else agents.slice(0, i).forEach((b) => {
      if (Number.isInteger(b?.port) && a.port < b.port + width && b.port < a.port + width)
        out.push(`${who}: ports ${a.port}–${a.port + width - 1} overlap agent “${b.name}”'s`);
    });
    if (a.awake != null && typeof a.awake !== "boolean") out.push(`${who}: awake must be true or false, or left out for the desk's own setting`);
    if (a.autocompact != null && !tokens(a.autocompact)) out.push(`${who}: autocompact must be a whole number of tokens from ${AUTOCOMPACT_MIN} to ${AUTOCOMPACT_MAX}, or left out for the desk's own`);
    if (!["owner", "leader"].includes(a.started_by)) out.push(`${who}: started_by must be "owner" or "leader"`);
    else if (a.started_by === "leader" && a.tool !== leader.tool)
      out.push(`${who}: started_by “leader” needs the leader's own tool (${leader.tool}); the owner starts agents in any other tool`);
    if (a.subagents != null) for (const p of subagentProblems(a)) out.push(`${who}: subagents: ${p}`);
  });
  // One definition file per tool and kind holds one model, so two agents in one tool must agree.
  for (const tool of TOOLS) for (const kind of SUBAGENT_SCOPES) {
    const ids = new Set(agents.filter((a) => a && a.tool === tool && subagentsOf({ agents }, a)?.scope.includes(kind)).map((a) => subagentsOf({ agents }, a).models[kind]));
    if (ids.size > 1) out.push(`agents: the ${TOOL_WORDS[tool]} agents name different ${kind} models for their subagents (${[...ids].join(", ")}); one definition file holds one model, so they must agree`);
  }

  if (!Array.isArray(cfg.setup) || !cfg.setup.every((c) => typeof c === "string")) out.push("setup must be a list of commands (it may be empty)");
  if (!Array.isArray(cfg.protected)) out.push("protected must be a list of paths (it may be empty)");
  else for (const p of cfg.protected) if (!safePath(p)) out.push(`protected “${p}” isn't a path inside the repository`);
  if (cfg.specs != null && !safePath(cfg.specs)) out.push(`specs “${cfg.specs}” isn't a path inside the repository`);
  if (cfg.tests != null) {
    const t = cfg.tests;
    const paths = (v) => Array.isArray(v) && v.every(safePath);
    if (!t || typeof t !== "object" || Array.isArray(t)) out.push("tests must be an object, or left out (desk-check then runs the brief's checks alone)");
    else {
      if (!safePath(t.dir)) out.push(`tests: dir “${t.dir ?? ""}” must be the folder the test files are in, inside the repository`);
      if (!short(t.suffix, 40)) out.push("tests: suffix must end every test file's name, such as .test.mjs");
      if (!short(t.run, 300)) out.push("tests: run must be the command that runs test files given after it, such as node --test");
      if (t.always != null && !paths(t.always)) out.push("tests: always must list test files inside the repository, run by every desk-check");
      if (t.full_when != null && !paths(t.full_when)) out.push("tests: full_when must list files inside the repository whose change runs the whole suite");
      if (t.after != null && !(Array.isArray(t.after) && t.after.every((c) => short(c, 300)))) out.push("tests: after must list commands run after the tests, every time");
    }
  }
  // The whole test command, as its parts : desk.mjs suite runs each on its own, so one red
  // part never hides the rest, as a && once did.
  if (cfg.suite != null && !(Array.isArray(cfg.suite) && cfg.suite.length && cfg.suite.every((c) => short(c, 300))))
    out.push("suite must list the parts of the repository's whole test command, each a command of 300 characters at most, such as [\"npm run test:unit\", \"npm run test:e2e\"]; or be left out");
  // Lists every brief adds a line to and nobody holds : desk.mjs resolve-lists settles them in a merge.
  if (cfg.shared_lists != null) {
    if (!Array.isArray(cfg.shared_lists)) out.push("shared_lists must be a list of { file, rebuild? }: the files every brief adds a line to and nobody holds");
    else for (const s of cfg.shared_lists) {
      if (!s || typeof s !== "object" || !safePath(s.file)) out.push(`shared_lists: “${s?.file ?? s}” must be { "file": "<a path inside the repository>" }`);
      else if (s.rebuild != null && !short(s.rebuild, 300)) out.push(`shared_lists: ${s.file}'s rebuild must be the command that makes it again`);
    }
  }
  return out;
}

// Who reviews whom, by name(the owner's three shapes): a ring, where each agent is reviewed
// by the next in desk.json's order; pairs, 1 and 2 reviewing each other, 3 and 4, and an odd one out
// reviewed by the leader; or one dedicated reviewer who reviews everyone and is reviewed by the leader.
// Returns { agent: reviewer } for desk.mjs shape to write.
export const SHAPES = ["ring", "pairs", "reviewer"];
export function shapeReviewers(agents, shape, who) {
  const names = (agents || []).map((a) => a.name);
  if (!SHAPES.includes(shape)) throw new Error(`“${shape ?? ""}” isn't a shape: ring, pairs, or reviewer <agent>`);
  const out = {};
  if (shape === "ring") names.forEach((n, i) => { out[n] = names.length < 2 ? "leader" : names[(i + 1) % names.length]; });
  else if (shape === "pairs") names.forEach((n, i) => { const mate = i % 2 ? names[i - 1] : names[i + 1]; out[n] = mate || "leader"; });
  else {
    if (!names.includes(who)) throw new Error(`“${who ?? ""}” isn't an agent on the desk (${names.join(", ")}): name the dedicated reviewer`);
    for (const n of names) out[n] = n === who ? "leader" : who;
  }
  return out;
}

export const agentNamed = (cfg, name) => (cfg.agents || []).find((a) => a.name === name) || null;

// The agent's own block of ports, one per name in port_env: PORT is its port, the next its port + 1...
export function portEnv(cfg, agent) {
  const env = {};
  (cfg.port_env || ["PORT"]).forEach((name, i) => { env[name] = String(agent.port + i); });
  return env;
}

export const protectedPaths = (cfg) => [...CORE_PROTECTED, ...((cfg && cfg.protected) || [])];

// Whether an agent stays on the desk between steps (agent.md step 5, running .agents/skills/agent-desk/scripts/wait.mjs)
// or stops and waits for the owner's go: its own `awake`, else the desk's, else off. Off by default,
// at the owner's word: the owner turns it on with desk.mjs awake on.
export const isAwake = (cfg, agent) => typeof agent?.awake === "boolean" ? agent.awake : cfg?.awake === true;

// The leader's own switch: on unless desk.json's leader.awake is false, with the idle window after
// which it sleeps (leader.idle_minutes, 60 unless set). The owner sets both with desk.mjs awake leader.
export const leaderAwake = (cfg) => {
  const l = cfg?.leader || {};
  return { on: l.awake !== false, idleMinutes: Number.isInteger(l.idle_minutes) ? l.idle_minutes : DEFAULT_IDLE_MINUTES };
};

// An agent (or every agent) moved to another tool, model or starter (
// "move the current 4 agents in Antigravity over to Codex or to Claude Code"). Pure: answers the new
// settings and the names moved, or throws with the reason; the caller checks configProblems after.
export function moveAgents(cfg, { who, to, model, startedBy } = {}) {
  const names = (cfg.agents || []).map((a) => a.name);
  if (!who) throw new Error("name the agent to move, or all");
  if (who !== "all" && !names.includes(who)) throw new Error(`“${who}” isn't an agent on this desk (${names.join(", ")})`);
  if (to === undefined && model === undefined && startedBy === undefined) throw new Error("say where to: --to <tool>, --model <name> or --started-by owner|leader");
  if (to !== undefined && !TOOLS.includes(to)) throw new Error(`“${to}” isn't a tool the desk knows: ${TOOLS.join(", ")}`);
  if (startedBy !== undefined && !["owner", "leader"].includes(startedBy)) throw new Error(`started-by must be owner or leader, not “${startedBy}”`);
  const moved = who === "all" ? names : [who];
  const notes = [];
  const agents = cfg.agents.map((a) => {
    if (!moved.includes(a.name)) return a;
    const b = { ...a };
    if (to !== undefined) b.tool = to;
    // Subagent models are a tool's own: ids the new tool's subagents can't run fall back to its defaults.
    if (to !== undefined && to !== a.tool && b.subagents?.models && MODELS[to]?.length) {
      const kept = Object.fromEntries(Object.entries(b.subagents.models).filter(([, id]) => subagentModelIds(to).includes(id)));
      const dropped = Object.keys(b.subagents.models).filter((k) => !(k in kept));
      if (dropped.length) { notes.push(`${a.name}'s subagent ${dropped.join(" and ")} model${dropped.length > 1 ? "s" : ""} (${dropped.map((k) => b.subagents.models[k]).join(", ")}) can't run in ${TOOL_WORDS[to]}: its subagents run on ${TOOL_WORDS[to]}'s defaults instead (${dropped.map((k) => DEFAULT_SUBAGENT_MODELS[to][k]).join(", ")})`); b.subagents = { ...b.subagents }; if (Object.keys(kept).length) b.subagents.models = kept; else delete b.subagents.models; }
    }
    if (model !== undefined) b.model = model === "" || model === "null" ? null : model;
    if (startedBy !== undefined) b.started_by = startedBy;
    return b;
  });
  return { next: { ...cfg, agents }, moved, notes };
}

// Where an agent's conversation compacts: its own figure, else the desk's, else 500,000 tokens.
export const autocompactOf = (cfg, agent) => tokens(agent?.autocompact) ? agent.autocompact : tokens(cfg?.autocompact) ? cfg.autocompact : DEFAULT_AUTOCOMPACT;
// Whether the skill sets each tool's compaction at all: desk.json's autocompact false leaves every
// tool's own setting alone, and nothing is written, said or checked about it.
export const compactionOn = (cfg) => cfg?.autocompact !== false;
// The models an agent may use: its list, or null for any. A name is matched without regard to case.
export const allowedModels = (agent) => Array.isArray(agent?.models) && agent.models.length ? agent.models : null;
export const modelAllowed = (agent, model) => { const list = allowedModels(agent); return !list || list.some((m) => m.toLowerCase() === String(model || "").trim().toLowerCase()); };
// How long an awake agent may go without a report before the desk calls it silent.
export const silenceMinutes = (cfg) => Number.isInteger(cfg?.silence_minutes) ? cfg.silence_minutes : DEFAULT_SILENCE_MINUTES;
// Where each tool reads the compaction figure from, for the prompts and the guide.
export const COMPACT_WHERE = {
  "claude-code": "the repository's .claude/settings.json (autoCompactWindow), which setup writes; /autocompact shows it",
  codex: "the repository's .codex/config.toml (model_auto_compact_token_limit), which setup writes",
  antigravity: "Antigravity's own settings (the app reads the repository's .gemini/settings.json, model.compressionThreshold, as a fraction of the window; Remote Agents are reported to compact near 256K whatever is set)",
  other: "your tool's own setting",
};

// Where the owner is told: the issue and the events, or null for off (notify absent or null).
export const notifyOf = (cfg) => {
  const n = cfg?.notify;
  if (!n || typeof n !== "object" || !Number.isInteger(n.issue) || n.issue < 1) return null;
  return { issue: n.issue, events: Array.isArray(n.events) ? n.events.filter((e) => NOTIFY_EVENTS.includes(e)) : [...NOTIFY_EVENTS] };
};

// Every way an agent's `subagents` is wrong, in words; [] when it is right. A model id must be one
// its tool's subagents can run (models.mjs); another tool takes any short name.
function subagentProblems(a) {
  const s = a.subagents;
  if (!s || typeof s !== "object" || Array.isArray(s)) return ["must be an object { max, scope, models }, or left out (no subagents)"];
  const out = [];
  if (s.max != null && !(Number.isInteger(s.max) && s.max >= 1 && s.max <= MAX_SUBAGENTS)) out.push(`max must be a whole number from 1 to ${MAX_SUBAGENTS} (${DEFAULT_SUBAGENTS} unless set): how many subagents may run at once`);
  const scope = s.scope;
  if (!Array.isArray(scope) || !scope.length || !scope.every((k) => SUBAGENT_SCOPES.includes(k)) || new Set(scope).size !== scope.length)
    out.push(`scope must list some of ${SUBAGENT_SCOPES.join(", ")}, each once: what the subagents are for (review: adversarial review of this agent's own diff; checks: running tests and desk-check)`);
  if (s.models != null) {
    if (typeof s.models !== "object" || Array.isArray(s.models)) out.push("models must be an object { review, checks }, or left out for the tool's own defaults");
    else for (const [kind, id] of Object.entries(s.models)) {
      if (!SUBAGENT_SCOPES.includes(kind) || !(Array.isArray(scope) && scope.includes(kind))) { out.push(`models names “${kind}”, which isn't in this agent's scope (${Array.isArray(scope) ? scope.join(", ") : "none"})`); continue; }
      if (!short(id, 80)) { out.push(`models: the ${kind} model must be a short name`); continue; }
      if (MODELS[a.tool]?.length && !subagentModelIds(a.tool).includes(id))
        out.push(`the ${kind} model “${id}” isn't one ${TOOL_WORDS[a.tool]} subagents can run; they take: ${subagentModelIds(a.tool).join(", ")}`);
    }
  }
  return out;
}

// An agent's subagents, resolved: { max, scope, models } (a model for each kind in scope, the tool's
// default unless set), or null when it may start none. For an agent in another tool with no model
// set, the kind's model is "the tool's own".
export function subagentsOf(cfg, agent) {
  const s = agent?.subagents;
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  const scope = Array.isArray(s.scope) ? s.scope.filter((k) => SUBAGENT_SCOPES.includes(k)) : [];
  const d = DEFAULT_SUBAGENT_MODELS[agent.tool] || {};
  const models = {};
  for (const kind of scope) models[kind] = (s.models && typeof s.models === "object" && typeof s.models[kind] === "string" && s.models[kind]) || d[kind] || "the tool's own";
  return { max: Number.isInteger(s.max) && s.max >= 1 ? s.max : DEFAULT_SUBAGENTS, scope, models };
}

// What a subagent may do, by kind, for the definition files and the prompts.
export const SUBAGENT_KIND_WORDS = {
  review: "an adversarial review of the agent's own diff against its brief, handed back as text for the agent to fix what it agrees with and post unchanged on its pull request",
  checks: "running the command it is handed (a test file, desk-check, the brief's checks) and handing back the last lines with each failure classified",
};

// Each tool's subagent definition files, one per kind some allowed agent in that tool needs, in the
// tool's own format, with the model desk.json resolves and read-only tools where the tool can take
// them away (Claude Code's tools allowlist, Codex's shell_tool, Antigravity's tools list); the
// protocol (.agents/skills/agent-desk/protocol/subagent.md, read fresh from the work branch) holds the rest. The
// setup writes them and --check and the doctor read them back; desk.mjs subagents writes them
// too. Byte for byte: ok(text) is true only for the text written. Another tool has none.
export function subagentFiles(cfg) {
  const out = [];
  const wb = cfg?.work_branch || "";
  const agents = Array.isArray(cfg?.agents) ? cfg.agents : [];
  for (const tool of ["claude-code", "codex", "antigravity"]) {
    for (const kind of SUBAGENT_SCOPES) {
      const owners = agents.filter((a) => a && a.tool === tool && subagentsOf(cfg, a)?.scope.includes(kind));
      if (!owners.length) continue;
      const id = subagentsOf(cfg, owners[0]).models[kind];
      const row = modelRow(tool, id);
      const set = row ? row.set : id;
      const names = owners.map((a) => a.name).join(", ");
      const never = `You never write a file, run git add, commit, push or checkout, post on GitHub, or edit a brief or a test; asked for more than your steps allow, say so and stop. Hand your answer back as text to the agent that started you.`;
      const body = [
        `You are the desk ${kind} subagent of the desk agent that started you, on the project and work branch it names. You are not a desk agent: you have no row on the board and report to nobody but the agent that started you.`,
        `Before anything else, read your steps fresh from that work branch and follow them exactly:`,
        `    git show origin/<the work branch>:.agents/skills/agent-desk/protocol/subagent.md`,
        `Your work is ${SUBAGENT_KIND_WORDS[kind]}.`,
        never,
      ].join("\n\n") + "\n";
      let file, text;
      if (tool === "claude-code") {
        file = `.claude/agents/desk-${kind}.md`;
        const tools = kind === "review" ? "Read, Grep, Glob" : "Read, Grep, Glob, Bash";
        text = `---\nname: desk-${kind}\ndescription: The agent desk's ${kind} subagent: ${kind === "review" ? "reviews the agent's own diff adversarially" : "runs the checks it is handed"}; it writes, commits, pushes and posts nothing.\nmodel: ${set}\ntools: ${tools}\n---\n\n${body}`;
      } else if (tool === "codex") {
        file = `.codex/agents/desk-${kind}.toml`;
        const lines = [`name = "desk-${kind}"`, `description = "The agent desk's ${kind} subagent; it writes, commits, pushes and posts nothing."`, `model = "${set}"`, `model_reasoning_effort = "${kind === "review" ? "high" : "medium"}"`, `developer_instructions = """`, body.trimEnd(), `"""`];
        if (kind === "review") lines.push("", "[features]", "shell_tool = false");
        text = lines.join("\n") + "\n";
      } else {
        file = `.agents/agents/desk-${kind}.md`;
        const fm = [`subagent: true`, `description: The agent desk's ${kind} subagent; it writes, commits, pushes and posts nothing.`, `model: ${set}`];
        if (kind === "review") fm.push("tools:", "  - read");
        text = `---\n${fm.join("\n")}\n---\n\n${body}`;
      }
      out.push({ file, kind, tool, tools: TOOL_WORDS[tool], model: id, text, ok: (t) => t === text });
    }
  }
  return out;
}

// Each tool's own setting for where a conversation compacts, written from desk.json's autocompact
// by setup and read back by the doctor. Each file is merged: the one key or line is set,
// and whatever else the file holds stays. Gemini's is a fraction of the window, written for a
// 1M-token model.
const mergeJson = (text, set) => { let o = {}; try { o = JSON.parse(text || "{}"); } catch { o = {}; } return JSON.stringify(set(o && typeof o === "object" && !Array.isArray(o) ? o : {}), null, 2) + "\n"; };
const readJson = (text) => { try { return JSON.parse(text || "{}"); } catch { return {}; } };
export function compactionFiles(n) {
  const frac = Math.round((n / 1000000) * 1000) / 1000;
  return [
    { file: ".claude/settings.json", tools: "Claude Code", apply: (t) => mergeJson(t, (o) => ({ ...o, autoCompactWindow: n })), ok: (t) => readJson(t).autoCompactWindow === n },
    { file: ".codex/config.toml", tools: "Codex", apply: (t) => { const lines = String(t || "").split("\n").filter((l) => !/^\s*model_auto_compact_token_limit\s*=/.test(l)); while (lines.length && lines[lines.length - 1] === "") lines.pop(); return [...lines, `model_auto_compact_token_limit = ${n}`, ""].join("\n"); }, ok: (t) => new RegExp(`^model_auto_compact_token_limit = ${n}$`, "m").test(String(t || "")) },
    { file: ".gemini/settings.json", tools: "the Antigravity app and Gemini CLI", apply: (t) => mergeJson(t, (o) => ({ ...o, model: { ...(o.model && typeof o.model === "object" ? o.model : {}), compressionThreshold: frac } })), ok: (t) => readJson(t).model?.compressionThreshold === frac },
  ];
}
