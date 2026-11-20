// The owner's own defaults for new projects in a repository (agents/desk/defaults.json), and the team
// setup builds from the answers. A new project's settings come from three places, each over the last:
// the skill's own defaults, this repository's defaults file, and the answers given at setup. The file
// holds only what makes sense across projects: never a project's name, branch or repository.
// Pure: the caller reads and writes the file.
import { DESK_ROOT } from "./paths.mjs";
import { MAX_AGENTS, DEFAULT_AGENTS, DEFAULT_AUTOCOMPACT, AUTOCOMPACT_MIN, AUTOCOMPACT_MAX, DEFAULT_SILENCE_MINUTES, MAX_SILENCE_MINUTES, DEFAULT_IDLE_MINUTES, MAX_IDLE_MINUTES,
  DEFAULT_READY, MAX_READY, MAX_SPARE, shapeReviewers, safePath } from "./config.mjs";

export const DEFAULTS_PATH = `${DESK_ROOT}/defaults.json`;
// The tools setup counts agents for, with the word their names start from.
export const TEAM_TOOLS = [["claude", "claude-code", "claude"], ["codex", "codex", "codex"], ["antigravity", "antigravity", "gemini"]];

const whole = (min, max) => ({ read: (s) => /^\d+$/.test(s) ? Number(s) : NaN, ok: (v) => Number.isInteger(v) && v >= min && v <= max, say: `a whole number from ${min} to ${max}` });
const yesNo = { read: (s) => ({ on: true, yes: true, true: true, off: false, no: false, false: false })[String(s).toLowerCase()], ok: (v) => typeof v === "boolean", say: "on or off" };
const names = { read: (s) => String(s).split("|").map((x) => x.trim()).filter(Boolean), ok: (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.trim() && x.length <= 80), say: "model names with | between them" };
// Every setting a default may be kept for: how it is read from words, when it is right, and the skill's own value.
export const SETTINGS = {
  agents: { ...whole(1, MAX_AGENTS), own: DEFAULT_AGENTS, what: "how many agents" },
  claude: { ...whole(0, MAX_AGENTS), own: 0, what: "how many of them in Claude Code" },
  codex: { ...whole(0, MAX_AGENTS), own: 0, what: "how many in Codex (ChatGPT)" },
  antigravity: { ...whole(0, MAX_AGENTS), own: 0, what: "how many in Antigravity (Gemini)" },
  "models.claude-code": { ...names, own: null, what: "the models a Claude Code agent may use" },
  "models.codex": { ...names, own: null, what: "the models a Codex agent may use" },
  "models.antigravity": { ...names, own: null, what: "the models an Antigravity agent may use" },
  ready: { ...whole(1, MAX_READY), own: DEFAULT_READY, what: "briefs kept ready for each agent" },
  spare: { ...whole(0, MAX_SPARE), own: 0, what: "spare briefs kept for anyone" },
  prewrite: { ...yesNo, own: false, what: "write every wave and brief ahead" },
  specs: { read: (s) => String(s), ok: (v) => safePath(v), own: "docs/", say: "a path inside the repository", what: "where the spec is" },
  shape: { read: (s) => String(s), ok: (v) => v === "ring" || v === "pairs", own: "ring", say: "ring or pairs", what: "who reviews whom" },
  awake: { ...yesNo, own: false, what: "automatic checking" },
  silence_minutes: { ...whole(1, MAX_SILENCE_MINUTES), own: DEFAULT_SILENCE_MINUTES, what: "minutes of silence before the owner is warned" },
  idle_minutes: { ...whole(1, MAX_IDLE_MINUTES), own: DEFAULT_IDLE_MINUTES, what: "minutes the leader watches with nothing moving" },
  autocompact: { read: (s) => /^(off|none|no|false)$/i.test(s) ? false : /^\d+$/.test(s) ? Number(s) : NaN, ok: (v) => v === false || (Number.isInteger(v) && v >= AUTOCOMPACT_MIN && v <= AUTOCOMPACT_MAX), own: DEFAULT_AUTOCOMPACT, say: `tokens from ${AUTOCOMPACT_MIN} to ${AUTOCOMPACT_MAX}, or off (not set by the skill)`, what: "where a conversation compacts" },
  subagents: { ...yesNo, own: true, what: "the first agent may start subagents" },
};
export const SKILL_DEFAULTS = Object.fromEntries(Object.entries(SETTINGS).filter(([, s]) => s.own !== null).map(([k, s]) => [k, s.own]));

export function parseDefaults(text) {
  if (text === null || text === undefined) return {};
  try { const o = JSON.parse(String(text)); return o && typeof o === "object" && !Array.isArray(o) ? o : { error: "must hold one object" }; }
  catch (err) { return { error: `isn't JSON: ${err.message}` }; }
}

// Every way the file is wrong, in words; [] when it is right.
export function defaultsProblems(d) {
  if (d.error) return [d.error];
  const out = [];
  for (const [k, v] of Object.entries(d)) {
    if (!SETTINGS[k]) out.push(`“${k}” isn't a setting a default is kept for (${Object.keys(SETTINGS).join(", ")}): a project's own name, branch and repository are asked each time`);
    else if (!SETTINGS[k].ok(v)) out.push(`${k} must be ${SETTINGS[k].say}`);
  }
  return out;
}

// One "key=value" from words: [key, value], or it throws in words.
export function readSetting(pair) {
  const m = /^([a-z_.-]+)=(.*)$/i.exec(String(pair || ""));
  if (!m) throw new Error(`“${pair ?? ""}” isn't key=value`);
  const [, k, raw] = m;
  const s = SETTINGS[k];
  if (!s) throw new Error(`“${k}” isn't a setting a default is kept for: ${Object.keys(SETTINGS).join(", ")}`);
  const v = s.read(raw);
  if (!s.ok(v)) throw new Error(`${k} must be ${s.say}; “${raw}” isn't`);
  return [k, v];
}

// A value in words, as the owner would say it and as --set takes it.
export const settingWords = (k, v) => v === false && k === "autocompact" ? "not set by the skill" : typeof v === "boolean" ? (v ? "on" : "off") : Array.isArray(v) ? v.join(" | ") : typeof v === "number" && v >= 1000 ? v.toLocaleString("en-GB") : String(v);
export const settingArg = (k, v) => `${k}=${typeof v === "boolean" ? (k === "autocompact" ? "off" : v ? "on" : "off") : Array.isArray(v) ? v.join("|") : v}`;

// The table desk.mjs defaults prints: each setting, its value, and whose it is.
export function defaultsWords(repo = {}) {
  const width = Math.max(...Object.keys(SETTINGS).map((k) => k.length));
  const lines = Object.entries(SETTINGS).map(([k, s]) => {
    const mine = k in repo, v = mine ? repo[k] : s.own;
    return `${k.padEnd(width)}  ${v === null ? "any" : settingWords(k, v)}   (${mine ? "this repository's" : "the skill's own"}: ${s.what})`;
  });
  return [`The defaults a new project starts from (${DEFAULTS_PATH} holds this repository's own; an answer at setup wins over both):`, ...lines].join("\n");
}

// The agents for a new project: so many in each tool, named from the tool and a letter, with ports of
// their own and reviewers in the shape asked for. `e` is the settings in effect; `template` is the
// skill's own desk.json, whose first two jobs and subagents are the starting words.
export function buildTeam(e, template) {
  const counted = TEAM_TOOLS.flatMap(([key, tool, word]) => Array.from({ length: e[key] || 0 }, () => [tool, word]));
  const list = counted.length ? counted : Array.from({ length: e.agents }, () => ["other", "agent"]);
  if (list.length < 1 || list.length > MAX_AGENTS) throw new Error(`a desk has from 1 to ${MAX_AGENTS} agents; ${list.length} were asked for`);
  const seen = {};
  const jobs = (template.agents || []).map((a) => a.job);
  const agents = list.map(([tool, word], i) => {
    const letter = String.fromCharCode(97 + (seen[word] = (seen[word] ?? -1) + 1));
    const a = { name: `${word}-${letter}`, tool, model: null, job: jobs[i] || "A share of the work that overlaps nobody else's: the leader sets it", reviewer: "leader", port: 8811 + 10 * i, started_by: "owner" };
    const may = e[`models.${tool}`];
    if (Array.isArray(may) && may.length) a.models = [...may];
    if (i === 0 && e.subagents && template.agents?.[0]?.subagents) a.subagents = JSON.parse(JSON.stringify(template.agents[0].subagents));
    return a;
  });
  const reviewers = shapeReviewers(agents, e.shape || "ring");
  for (const a of agents) a.reviewer = reviewers[a.name];
  return agents;
}
