// The desk's behaviour, on fixtures of its own: desk.json, briefs and the board held to one shape,
// desk-check catching each way a branch can leave its brief, the agents' and the leader's waits, the
// reports, the doctor, the log, and every desk.mjs command. tests/skill.test.mjs holds the skill's
// own contracts (install, setup, projects side by side, the spin-up wording).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseConfig, configProblems, portEnv, protectedPaths, isAwake, leaderAwake, autocompactOf, silenceMinutes, MAX_AGENTS, DEFAULT_AGENTS, TOOLS} from "../skill/agent-desk/scripts/config.mjs";
import { parseBrief, briefProblems, SECTIONS } from "../skill/agent-desk/scripts/brief.mjs";
import { scopeViolations, CORE_PROTECTED, isProtected } from "../skill/agent-desk/scripts/scope.mjs";
import { parseBoard, boardProblems, renderBoard, updateRow, STATES } from "../skill/agent-desk/scripts/board.mjs";
import { PHASES, LEADER_PHASES, parseStatus, statusProblems, silence, statusWords, sameReport } from "../skill/agent-desk/scripts/status.mjs";
import { NOTIFY_EVENTS, notifyOf, compactionFiles } from "../skill/agent-desk/scripts/config.mjs";
import { doctorFindings } from "../skill/agent-desk/scripts/doctor.mjs";
import { sinceDate, classifyCommit, boardChanges, formatLines, formatMarkdown } from "../skill/agent-desk/scripts/log.mjs";
import { notifyBody, notifyKey, notifyLine } from "../skill/agent-desk/scripts/notify.mjs";
import { preflightBody } from "../skill/agent-desk/scripts/preflight.mjs";
import { briefSections } from "../skill/agent-desk/scripts/brief.mjs";
import { parseSpec, progressProblems, nextSteps, STEP_ID } from "../skill/agent-desk/scripts/spec.mjs";
import { symlinkSync } from "node:fs";
import * as PROMPTS from "../skill/agent-desk/scripts/prompts.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// wait.mjs reads ANTIGRAVITY_AGENT=1 as "this is Antigravity". An Antigravity agent's own
// machine sets it, so every fixture's wait would read 1 minute there: the tests clear it, and the one
// test about it sets it itself (found on an Antigravity agent's own machine).
delete process.env.ANTIGRAVITY_AGENT;
const read = (p) => readFileSync(join(root, p), "utf8");
// The ported fixtures' project keeps its files in a folder of its own.
const CONFIG_PATH = "agents/desk/garden-app/desk.json";
const STATUS_DIR = "agents/desk/garden-app/status";
const ASSIGNMENTS = "agents/desk/garden-app/assignments";

const desk = (over = {}) => ({
  desk: 1, project: "garden-app", title: "Garden app", repository: "owner/repo", work_branch: "claude/work",
  leader: { name: "claude", tool: "claude-code", model: null },
  agents: [
    { name: "agent-a", tool: "antigravity", model: "Gemini 4 Argon", job: "Worker code", reviewer: "agent-b", port: 8811, started_by: "owner" },
    { name: "agent-b", tool: "antigravity", model: null, job: "Pages", reviewer: "agent-a", port: 8821, started_by: "owner" },
  ],
  setup: ["npm ci"], port_env: ["PORT", "FLOW_PORT", "NOTES_PORT"], protected: ["cloudbuild.yaml"], specs: "docs/",
  ...over,
});
const agent = (name, over = {}) => ({ name, tool: "codex", model: null, job: "Tests", reviewer: "agent-a", port: 8831, started_by: "owner", ...over });
const part = (s, heading) => s.slice(s.indexOf(heading)).split(/\n## /)[0];
const says = (problems, want) => assert.ok(problems.some((p) => p.includes(want)), `expected “${want}”, got ${JSON.stringify(problems)}`);

// ---- desk.json

test("the default desk has two agents, and a desk holds six at most", () => {
  assert.equal(DEFAULT_AGENTS, 2);
  assert.equal(MAX_AGENTS, 6);
  assert.deepEqual(TOOLS, ["claude-code", "codex", "antigravity", "other"]);
  assert.equal(CONFIG_PATH, "agents/desk/garden-app/desk.json");
  assert.deepEqual(configProblems(desk()), []);
});

test("a desk may have any number of agents from one to six", () => {
  const many = (n) => Array.from({ length: n }, (_, i) => agent(`agent-${i + 1}`, { port: 8811 + 10 * i, reviewer: n === 1 ? "leader" : `agent-${((i + 1) % n) + 1}` }));
  for (let n = 1; n <= 6; n++) assert.deepEqual(configProblems(desk({ agents: many(n) })), [], `${n} agents`);
  says(configProblems(desk({ agents: [] })), "agents");
  says(configProblems(desk({ agents: many(7) })), "6");
});

test("a desk that breaks a rule says which", () => {
  const two = desk().agents;
  const withAgents = (...a) => configProblems(desk({ agents: a }));
  says(configProblems(parseConfig("{ not json")), "JSON");
  says(configProblems(desk({ repository: "no-slash" })), "repository");
  says(configProblems(desk({ project: undefined })), "project");
  says(configProblems(desk({ project: "Trips Launch!" })), "project");
  for (const b of ["main", "master", "staging", "production"]) says(configProblems(desk({ work_branch: b })), "work_branch");
  says(configProblems(desk({ leader: { name: "claude", tool: "word" } })), "tool");
  says(withAgents(two[0], { ...two[1], name: "agent-a" }), "twice");
  says(withAgents(two[0], { ...two[1], name: "Gemini B" }), "name");
  says(withAgents(two[0], { ...two[1], name: "claude", reviewer: "agent-a" }), "leader");
  says(withAgents(two[0], { ...two[1], tool: "cursor" }), "tool");
  says(withAgents(two[0], { ...two[1], job: "" }), "job");
  says(withAgents(two[0], { ...two[1], reviewer: "agent-b" }), "reviewer");
  says(withAgents(two[0], { ...two[1], reviewer: "nobody" }), "reviewer");
  says(withAgents(two[0], { ...two[1], port: 80 }), "port");
  says(withAgents(two[0], { ...two[1], port: 8812 }), "port"); // inside agent-a's 8811–8813
  says(withAgents(two[0], { ...two[1], model: 42 }), "model");
  says(withAgents(two[0], { ...two[1], started_by: "robot" }), "started_by");
  says(configProblems(desk({ port_env: [] })), "port_env");
  says(configProblems(desk({ protected: ["../outside"] })), "protected");
});

test("the leader may start an agent only in its own tool; the owner starts the rest", () => {
  const [a, b] = desk().agents;
  says(configProblems(desk({ agents: [a, { ...b, started_by: "leader" }] })), "started_by");
  assert.deepEqual(configProblems(desk({ agents: [a, { ...b, tool: "claude-code", started_by: "leader" }] })), []);
});

test("an agent's ports are its own block, and the protected list adds the repository's own", () => {
  assert.deepEqual(portEnv(desk(), desk().agents[1]), { PORT: "8821", FLOW_PORT: "8822", NOTES_PORT: "8823" });
  const p = protectedPaths(desk());
  for (const e of CORE_PROTECTED) assert.ok(p.includes(e), e);
  assert.ok(p.includes("cloudbuild.yaml"));
  for (const e of ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "agents/desk/", ".agents/", ".claude/", ".githooks/", ".github/"])
    assert.ok(CORE_PROTECTED.includes(e), e);
  assert.ok(isProtected("cloudbuild.yaml", p));
  assert.ok(!isProtected("cloudbuild.yaml"));
});

// ---- briefs

const good = (over = {}) => {
  const f = { id: "A1-visibility", project: "garden-app", slot: "agent-a", reviewer: "agent-b", spec: "A1", title: "Hide drafts", base: "claude/work",
    branch: "desk/garden-app/agent-a/A1-visibility", port: "8811", ...over };
  const lists = { may_change: ["src/trip-visibility.js", "src/lib/"], frozen: ["tests/trip-draft-visibility.test.mjs"], checks: ["npm test"], ...(over.lists || {}) };
  delete f.lists;
  const head = Object.entries(f).map(([k, v]) => `${k}: ${v}`).join("\n");
  const body = Object.entries(lists).map(([k, v]) => `${k}:\n${v.map((x) => "  - " + x).join("\n")}`).join("\n");
  return `---\n${head}\n${body}\n---\n\n` + SECTIONS.map((s) => `## ${s}\n\nWords.\n`).join("\n");
};

test("a brief's front matter reads back as fields and lists", () => {
  const b = parseBrief(good());
  assert.equal(b.id, "A1-visibility");
  assert.equal(b.port, 8811);
  assert.deepEqual(b.may_change, ["src/trip-visibility.js", "src/lib/"]);
  assert.deepEqual(b.frozen, ["tests/trip-draft-visibility.test.mjs"]);
  assert.deepEqual(b.checks, ["npm test"]);
  assert.deepEqual(b.sections, SECTIONS);
  assert.deepEqual(briefProblems(b, "A1-visibility", desk()), []);
});

test("a brief that breaks a rule says which, against the desk it is on", () => {
  const p = (text, file = "A1-visibility", cfg = desk()) => briefProblems(parseBrief(text), file, cfg);
  says(p(good(), "Other-name"), "file name");
  says(p(good({ slot: "agent-c", branch: "desk/garden-app/agent-c/A1-visibility" })), "slot");
  says(p(good({ project: "other-project" })), "project");
  says(p(good({ reviewer: "agent-a" })), "reviewer");
  says(p(good({ reviewer: "nobody" })), "reviewer");
  says(p(good({ branch: "desk/garden-app/agent-b/A1-visibility" })), "branch");
  says(p(good({ branch: "desk/agent-a/A1-visibility" })), "branch"); // a branch must carry its project
  says(p(good({ base: "main" })), "base");
  says(p(good({ base: "staging" })), "base");
  says(p(good({ port: "8821" })), "port");
  says(p(good({ lists: { may_change: [] } })), "may_change");
  says(p(good({ lists: { may_change: ["../outside.js"] } })), "may_change");
  says(p(good({ lists: { may_change: ["CLAUDE.md"] } })), "protected");
  says(p(good({ lists: { may_change: ["cloudbuild.yaml"] } })), "protected"); // the repository's own extra
  says(p(good({ lists: { may_change: ["tests/x.test.mjs"], frozen: ["tests/x.test.mjs"] } })), "frozen");
  says(p(good({ lists: { checks: [] } })), "checks");
  says(p(good().replace("## Done means", "## Finished when")), "Done means");
  says(p("no front matter"), "front matter");
});

test("a brief may go to a third agent, and the leader may review", () => {
  const cfg = desk({ agents: [...desk().agents, agent("codex-a")] });
  const b = good({ slot: "codex-a", reviewer: "leader", branch: "desk/garden-app/codex-a/A1-visibility", port: "8831" });
  assert.deepEqual(briefProblems(parseBrief(b), "A1-visibility", cfg), []);
  says(briefProblems(parseBrief(b), "A1-visibility", desk()), "slot"); // not on a two-agent desk
});

// ---- scope

test("the scope check names every way a branch leaves its brief", () => {
  const brief = parseBrief(good());
  const onBase = new Set(["migrations/0064_multiagents_control.sql", "src/trips.js"]);
  const v = scopeViolations({
    brief,
    baseHas: (p) => onBase.has(p),
    protectedPaths: protectedPaths(desk()),
    changed: [
      { status: "M", path: "src/trip-visibility.js" },
      { status: "A", path: "src/lib/new-helper.js" },
      { status: "M", path: "src/trips.js" },
      { status: "M", path: "tests/trip-draft-visibility.test.mjs" },
      { status: "M", path: "CLAUDE.md" },
      { status: "M", path: "agents/desk/garden-app/desk.json" },
      { status: "M", path: "cloudbuild.yaml" },
      { status: "M", path: "migrations/0064_multiagents_control.sql" },
      { status: "R", path: "src/renamed.js", from: "src/trip-visibility.js" },
    ],
  });
  const by = Object.fromEntries(v.map((x) => [x.path, x.reason]));
  assert.equal(by["src/trip-visibility.js"], undefined);
  assert.equal(by["src/lib/new-helper.js"], undefined);
  assert.equal(by["src/trips.js"], "outside_brief");
  assert.equal(by["tests/trip-draft-visibility.test.mjs"], "frozen");
  assert.equal(by["CLAUDE.md"], "protected");
  assert.equal(by["agents/desk/garden-app/desk.json"], "protected");
  assert.equal(by["cloudbuild.yaml"], "protected");
  assert.equal(by["migrations/0064_multiagents_control.sql"], "applied_migration");
  assert.equal(by["src/renamed.js"], "outside_brief");
});

test("a migration already on the base can't be changed even when the brief lists it", () => {
  const brief = parseBrief(good({ lists: { may_change: ["migrations/"] } }));
  const v = scopeViolations({ brief, baseHas: (p) => p === "migrations/0064_multiagents_control.sql",
    changed: [{ status: "M", path: "migrations/0064_multiagents_control.sql" }, { status: "A", path: "migrations/0065_trip_launch.sql" }] });
  assert.deepEqual(v, [{ path: "migrations/0064_multiagents_control.sql", reason: "applied_migration" }]);
});

// ---- the board

test("the board is drawn from desk.json, one row per agent, and reads back", () => {
  const text = renderBoard(desk(), { "agent-a": { state: "done", brief: "D0-x", branch: "desk/garden-app/agent-a/D0-x", pr: "#9", notes: "closed" } });
  const board = parseBoard(text);
  assert.equal(board.base, "claude/work");
  assert.equal(board.project, "garden-app");
  assert.match(text, /^# Desk board: garden-app$/m);
  assert.deepEqual(Object.keys(board.slots), ["agent-a", "agent-b"]);
  assert.deepEqual(board.slots["agent-a"], { state: "done", brief: "D0-x", branch: "desk/garden-app/agent-a/D0-x", pr: "#9", notes: "closed" });
  assert.equal(board.slots["agent-b"].state, "idle");
  for (const s of STATES) assert.ok(text.includes(`| ${s} |`), s);
  const briefOf = () => parseBrief(good({ id: "D0-x", branch: "desk/garden-app/agent-a/D0-x" }));
  assert.deepEqual(boardProblems(board, briefOf, desk()), []);
});

test("a board out of step with desk.json, or pointing at a wrong brief, says so", () => {
  const cfg = desk();
  const row = (name, state, brief = "") => `| ${name} | ${state} | ${brief} | | | |`;
  const text = (base, ...rows) => `Project: \`garden-app\`\n\nWork branch: \`${base}\`\n\n| Agent | State | Brief | Branch | PR | Notes |\n|---|---|---|---|---|---|\n${rows.join("\n")}\n`;
  const p = (t, briefOf = () => null) => boardProblems(parseBoard(t), briefOf, cfg);
  says(p(text("other", row("agent-a", "idle"), row("agent-b", "idle"))), "work branch");
  says(p(text("claude/work", row("agent-a", "idle"))), "agent-b");
  says(p(text("claude/work", row("agent-a", "idle"), row("agent-b", "idle")).replace("garden-app", "another")), "project");
  says(p(text("claude/work", row("agent-a", "idle"), row("agent-b", "idle"), row("codex-z", "idle"))), "codex-z");
  says(p(text("claude/work", row("agent-a", "asleep"), row("agent-b", "idle"))), "asleep");
  says(p(text("claude/work", row("agent-a", "ready", "Missing"), row("agent-b", "idle"))), "Missing");
  says(p(text("claude/work", row("agent-a", "ready", "B1-x"), row("agent-b", "idle")),
    () => parseBrief(good({ id: "B1-x", slot: "agent-b", reviewer: "agent-a", branch: "desk/garden-app/agent-b/B1-x", port: "8821" }))), "agent-b");
  says(p(text("claude/work", row("agent-a", "ready", "A1-visibility"), row("agent-b", "idle")),
    () => parseBrief(good({ base: "claude/old" }))), "claude/old");
});

// ---- this repository's own desk







// ---- desk-check end to end, over a repository of its own with three agents

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "desk-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
  const git = (...a) => { const r = spawnSync("git", a, { cwd: dir, env, encoding: "utf8" }); assert.equal(r.status, 0, `git ${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  const put = (p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };
  const brief = (checks, mayChange = ["src/trip-visibility.js"]) => good({ slot: "codex-a", reviewer: "agent-a", branch: "desk/garden-app/codex-a/A1-visibility", port: "8831", lists: { may_change: mayChange, frozen: [], checks } });
  git("init", "-q", "-b", "claude/work");
  put(CONFIG_PATH, JSON.stringify(desk({ agents: [...desk().agents, agent("codex-a")] }), null, 2));
  put("src/trip-visibility.js", "export const a = 1;\n");
  put("src/trips.js", "export const b = 1;\n");
  put(`${ASSIGNMENTS}/A1-visibility.md`, brief(['node -e "process.exit(process.env.PORT === \'8831\' && process.env.NOTES_PORT === \'8833\' ? 0 : 3)"']));
  git("add", "-A"); git("commit", "-q", "-m", "base");
  git("switch", "-q", "-c", "desk/garden-app/codex-a/A1-visibility");
  const check = (...extra) => spawnSync(process.execPath, [join(root, "skill/agent-desk/scripts/check.mjs"), "A1-visibility", ...extra], { cwd: dir, env, encoding: "utf8" });
  return { dir, git, put, brief, check, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("desk-check passes a branch inside its brief and runs its checks on the agent's own ports", () => {
  const r = repo();
  try {
    r.put("src/trip-visibility.js", "export const a = 2;\n");
    r.git("commit", "-qam", "change");
    const out = r.check();
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /desk-check passed for garden-app\/A1-visibility/);
  } finally { r.done(); }
});

test("desk-check fails a file outside the brief, committed or not, and a new untracked one", () => {
  const r = repo();
  try {
    r.put("src/trips.js", "export const b = 2;\n");
    r.put("src/stray.js", "1\n");
    const out = r.check();
    assert.equal(out.status, 1);
    assert.match(out.stdout + out.stderr, /src\/trips\.js.*outside_brief/);
    assert.match(out.stdout + out.stderr, /src\/stray\.js.*outside_brief/);
  } finally { r.done(); }
});

test("desk-check reads the brief and desk.json from the base, so widening either on the branch changes nothing", () => {
  const r = repo();
  try {
    r.put(`${ASSIGNMENTS}/A1-visibility.md`, r.brief(["true"], ["src/trip-visibility.js", "src/trips.js"]));
    r.put(CONFIG_PATH, JSON.stringify(desk({ protected: [] }), null, 2));
    r.put("src/trips.js", "export const b = 2;\n");
    r.git("commit", "-qam", "widen my own brief");
    const out = r.check();
    assert.equal(out.status, 1);
    assert.match(out.stdout + out.stderr, /agents\/desk\/garden-app\/assignments\/A1-visibility\.md.*protected/);
    assert.match(out.stdout + out.stderr, /agents\/desk\/garden-app\/desk\.json.*protected/);
    assert.match(out.stdout + out.stderr, /src\/trips\.js.*outside_brief/);
  } finally { r.done(); }
});

test("desk-check refuses to run on another branch unless asked to (the leader's review)", () => {
  const r = repo();
  try {
    r.git("switch", "-q", "-c", "something-else");
    assert.match(r.check().stdout + r.check().stderr, /wrong_branch/);
    assert.equal(r.check("--any-branch").status, 0);
  } finally { r.done(); }
});

// desk-check no longer stops at the first failing
// check, as that hid what the later ones would have found; it runs them all and fails if any failed.
test("desk-check runs every check after a failing one, and still fails", () => {
  const r = repo();
  try {
    r.put(`${ASSIGNMENTS}/A1-visibility.md`, r.brief(["exit 4", "echo second-ran"]));
    r.git("commit", "-qam", "brief with a failing check");
    r.git("switch", "-q", "claude/work"); r.git("merge", "-q", "--ff-only", "desk/garden-app/codex-a/A1-visibility"); r.git("switch", "-q", "desk/garden-app/codex-a/A1-visibility");
    const out = r.check();
    assert.equal(out.status, 1);
    assert.match(out.stdout, /second-ran/);
    assert.match(out.stdout + out.stderr, /exit 4/);
  } finally { r.done(); }
});

// An agent's name lives in its copy (git config desk.slot, written on its first turn), not in its
// memory: two Antigravity conversations once both acted as one agent. desk-check reads the copy.
test("desk-check refuses a copy registered to another agent, and a commit another agent signed", () => {
  const r = repo();
  try {
    r.put("src/trip-visibility.js", "export const a = 2;\n");
    r.git("commit", "-qam", "change\n\nDesk-Project: garden-app\nDesk-Agent: codex-a\nDesk-Brief: A1-visibility");
    r.git("config", "desk.slot", "agent-a");
    let out = r.check();
    assert.equal(out.status, 1, "a copy that says it is agent-a can't push codex-a's brief");
    assert.match(out.stdout + out.stderr, /wrong_agent/);
    assert.match(out.stdout + out.stderr, /agent-a/);
    assert.match(out.stdout + out.stderr, /codex-a/);
    // The leader's review checkout isn't an agent's copy: --any-branch ignores the copy's own name.
    assert.equal(r.check("--any-branch").status, 0, "the leader's review passes");
    r.git("config", "desk.slot", "codex-a");
    assert.equal(r.check().status, 0, "the right agent's copy passes");
    r.git("config", "--unset", "desk.slot");
    assert.equal(r.check().status, 0, "a copy with no name recorded passes (made before the name was kept)");
    // A commit on the branch signed by another agent fails everyone, the leader's review included.
    r.put("src/trip-visibility.js", "export const a = 3;\n");
    r.git("commit", "-qam", "stray\n\nDesk-Project: garden-app\nDesk-Agent: agent-a\nDesk-Brief: A1-visibility");
    out = r.check("--any-branch");
    assert.equal(out.status, 1, "a commit signed agent-a on codex-a's branch");
    assert.match(out.stdout + out.stderr, /wrong_agent/);
    assert.match(out.stdout + out.stderr, /stray|Desk-Agent/);
  } finally { r.done(); }
});

test("desk-check says the desk isn't set up when the base has no desk.json", () => {
  const r = repo();
  try {
    r.git("switch", "-q", "claude/work"); r.git("rm", "-q", CONFIG_PATH); r.git("commit", "-qm", "no desk");
    r.git("switch", "-q", "desk/garden-app/codex-a/A1-visibility"); r.git("merge", "-q", "claude/work");
    const out = r.check();
    assert.equal(out.status, 2, out.stdout + out.stderr);
    assert.match(out.stderr, /desk\.json/);
  } finally { r.done(); }
});

// ---- staying awake: off unless the leader turns it on

test("an agent is awake only when desk.json says so: off by default, for the desk or for one agent", () => {
  const cfg = desk();
  assert.equal(isAwake(cfg, cfg.agents[0]), false, "off unless turned on");
  assert.equal(isAwake(desk({ awake: true }), cfg.agents[0]), true, "the desk's switch covers every agent");
  assert.equal(isAwake(desk({ awake: true }), { ...cfg.agents[0], awake: false }), false, "an agent's own switch wins");
  assert.equal(isAwake(cfg, { ...cfg.agents[0], awake: true }), true, "one agent can be awake alone");
  says(configProblems(desk({ awake: "yes" })), "awake");
  says(configProblems(desk({ agents: [{ ...cfg.agents[0], awake: 1 }, cfg.agents[1]] })), "awake");
  assert.deepEqual(configProblems(desk({ awake: true, agents: [{ ...cfg.agents[0], awake: false }, cfg.agents[1]] })), []);
  // The template ships with the switch written out and off, so the owner can see it is there.
  assert.equal(JSON.parse(read("skill/agent-desk/templates/desk.json")).awake, false);
});

// A desk with a GitHub-like origin: the leader's clone writes the board and pushes; the agent's copy
// keeps its name and runs wait.mjs, which reads origin's work branch and says what fits.
function deskWithOrigin({ awake = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "desk-wait-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
  const g = (cwd) => (...a) => { const r = spawnSync("git", a, { cwd, env, encoding: "utf8" }); assert.equal(r.status, 0, `git ${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  const origin = join(dir, "origin.git"), lead = join(dir, "lead"), copy = join(dir, "copy");
  g(dir)("init", "-q", "--bare", "-b", "claude/work", origin);
  g(dir)("clone", "-q", origin, lead);
  const L = g(lead);
  const cfg = desk({ awake, agents: [...desk().agents, agent("codex-a", { reviewer: "agent-a" })] });
  const put = (p, s) => { mkdirSync(dirname(join(lead, p)), { recursive: true }); writeFileSync(join(lead, p), s); };
  const brief = (id, slot, reviewer) => good({ id, slot, reviewer, branch: `desk/garden-app/${slot}/${id}`, port: String({ "agent-a": 8811, "agent-b": 8821, "codex-a": 8831 }[slot]), lists: { may_change: ["src/"], frozen: [], checks: ["true"] } });
  put(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  put(`${ASSIGNMENTS}/A1-x.md`, brief("A1-x", "agent-a", "agent-b"));
  put(`${ASSIGNMENTS}/B1-y.md`, brief("B1-y", "agent-b", "agent-a"));
  put(`${ASSIGNMENTS}/C1-z.md`, brief("C1-z", "codex-a", "agent-a"));
  put("src/a.js", "export const a = 1;\n");
  const board = (rows) => { put("agents/desk/garden-app/board.md", renderBoard(parseConfig(readFileSync(join(lead, CONFIG_PATH), "utf8")), rows)); L("add", "-A"); L("commit", "-qm", "board"); L("push", "-q", "origin", "claude/work"); };
  L("checkout", "-q", "-b", "claude/work"); L("add", "-A"); L("commit", "-qm", "base"); L("push", "-q", "-u", "origin", "claude/work");
  board({});
  g(dir)("clone", "-q", "-b", "claude/work", origin, copy);
  const C = g(copy);
  C("config", "desk.slot", "agent-a"); C("config", "desk.project", "garden-app"); C("config", "desk.base", "claude/work");
  const wait = (...a) => spawnSync(process.execPath, [join(root, "skill/agent-desk/scripts/wait.mjs"), "--once", ...a], { cwd: copy, env, encoding: "utf8" });
  // Another agent's branch, pushed from the leader's clone as if by that agent.
  const pushAs = (slot, id, n = 1) => { L("switch", "-q", "-c", `desk/garden-app/${slot}/${id}-${n}`, "claude/work"); put("src/a.js", `export const a = ${n + 1}; // ${slot}\n`); L("commit", "-qam", `work\n\nDesk-Project: garden-app\nDesk-Agent: ${slot}\nDesk-Brief: ${id}`); L("push", "-q", "-f", "origin", `HEAD:refs/heads/desk/garden-app/${slot}/${id}`); L("switch", "-q", "claude/work"); };
  const rewrite = (patch) => { const c = JSON.parse(readFileSync(join(lead, CONFIG_PATH), "utf8")); put(CONFIG_PATH, JSON.stringify(patch(c), null, 2)); };
  return { dir, copy, L, C, board, wait, pushAs, rewrite, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const last = (r) => (r.stdout.trim().split("\n").pop() || "") + (r.stderr ? ` ${r.stderr.trim()}` : "");

test("wait.mjs says what fits for the copy's agent from origin's board, once each, and nothing twice", () => {
  const d = deskWithOrigin();
  try {
    let r = d.wait();
    assert.equal(r.status, 3, last(r));
    assert.match(last(r), /^wait: nothing (new )?for agent-a on garden-app/);
    // A brief put up for it is a take, said once: the mark in the copy keeps the next look quiet.
    d.board({ "agent-a": { state: "ready", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "", notes: "" } });
    r = d.wait();
    assert.equal(r.status, 0, last(r));
    assert.match(last(r), /^fits: take A1-x\b/);
    assert.equal(d.wait().status, 3, "the same fit isn't said twice");
    // Once its branch is on origin the brief is pushed, and the leader's turn: no fit.
    d.pushAs("agent-a", "A1-x");
    d.C("config", "--unset-all", "desk.A1-x.acted");
    r = d.wait();
    assert.equal(r.status, 3, last(r));
    assert.match(last(r), /pushed|leader/);
    // The leader's decision asks for changes: a revise, once; the board's next commit for this row says it again.
    d.board({ "agent-a": { state: "changes", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#7", notes: "" } });
    r = d.wait();
    assert.equal(r.status, 0, last(r));
    assert.match(last(r), /^fits: revise A1-x #7\b/);
    assert.equal(d.wait().status, 3, "a revise is said once per decision");
    d.board({ "agent-a": { state: "changes", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#7", notes: "round 2" } });
    r = d.wait();
    assert.equal(r.status, 0, last(r));
    assert.match(last(r), /^fits: revise A1-x #7\b/);
    // Another agent's pull request whose brief names this agent as reviewer: a review, once per push to it.
    d.pushAs("agent-b", "B1-y");
    d.board({ "agent-a": { state: "done", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#7", notes: "" }, "agent-b": { state: "review", brief: "B1-y", branch: "desk/garden-app/agent-b/B1-y", pr: "#8", notes: "" } });
    r = d.wait();
    assert.equal(r.status, 0, last(r));
    assert.match(last(r), /^fits: review #8 desk\/garden-app\/agent-b\/B1-y\b/);
    assert.equal(d.wait().status, 3, "a review is said once per head");
    d.pushAs("agent-b", "B1-y", 2);
    r = d.wait();
    assert.equal(r.status, 0, last(r));
    assert.match(last(r), /^fits: review #8\b/);
    // A pull request whose brief names another reviewer isn't this agent's.
    d.board({ "agent-a": { state: "done", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#7", notes: "" }, "codex-a": { state: "review", brief: "C1-z", branch: "desk/garden-app/codex-a/C1-z", pr: "#9", notes: "" } });
    d.pushAs("codex-a", "C1-z");
    r = d.wait();
    assert.equal(r.status, 0, last(r), "codex-a's brief names agent-a as reviewer");
    assert.match(last(r), /^fits: review #9\b/);
    d.C("config", "desk.slot", "agent-b");
    assert.equal(d.wait().status, 3, "agent-b isn't C1-z's reviewer");
    // A review comes before the agent's own work.
    d.C("config", "desk.slot", "agent-a");
    d.pushAs("agent-b", "B1-y", 3);
    d.board({ "agent-a": { state: "ready", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "", notes: "" }, "agent-b": { state: "review", brief: "B1-y", branch: "desk/garden-app/agent-b/B1-y", pr: "#8", notes: "" } });
    d.C("config", "--unset-all", "desk.A1-x.acted");
    d.L("push", "-q", "origin", "--delete", "desk/garden-app/agent-a/A1-x");
    r = d.wait();
    assert.match(last(r), /^fits: review #8\b/);
    assert.match(last(d.wait()), /^fits: take A1-x\b/);
  } finally { d.done(); }
});

test("wait.mjs stops when the desk says so: awake off, not on the desk, another project, no name in the copy", () => {
  const d = deskWithOrigin({ awake: false });
  try {
    let r = d.wait();
    assert.equal(r.status, 1, last(r));
    assert.match(last(r), /^stop: .*awake.*off/);
    assert.match(last(r), /\bgo\b/, "it says the owner's go still moves the agent");
    // One agent can be awake on a desk that isn't.
    d.rewrite((c) => ({ ...c, agents: c.agents.map((a) => a.name === "agent-a" ? { ...a, awake: true } : a) }));
    d.board({});
    assert.equal(d.wait().status, 3, "agent-a alone is awake");
    d.C("config", "desk.slot", "agent-b");
    assert.equal(d.wait().status, 1, "agent-b isn't");
    // Taken off the desk, or on another project: stop, said.
    d.rewrite((c) => ({ ...c, awake: true, agents: c.agents.filter((a) => a.name !== "agent-b") }));
    d.board({});
    r = d.wait();
    assert.equal(r.status, 1, last(r));
    assert.match(last(r), /^stop: .*agent-b/);
    d.C("config", "desk.slot", "agent-a"); d.C("config", "desk.project", "other-project");
    r = d.wait();
    assert.equal(r.status, 1, last(r));
    assert.match(last(r), /^stop: .*other-project/);
    d.C("config", "--unset", "desk.project"); d.C("config", "--unset", "desk.slot");
    r = d.wait();
    assert.equal(r.status, 1, last(r));
    assert.match(last(r), /^stop: .*desk\.slot/);
    // The script is self-contained, so an agent can run the work branch's copy from anywhere.
    const src = read("skill/agent-desk/scripts/wait.mjs");
    assert.ok(!/from "\.\//.test(src) && !/from '\.\//.test(src), "wait.mjs imports no sibling: the agent runs the work branch's copy alone");
    for (const w of ["--once", "--every", "--for", "fits:", "wait:", "stop:"]) assert.ok(src.includes(w), `wait.mjs: ${w}`);
  } finally { d.done(); }
});

// ---- the leader stays awake too: on by default, asleep after an hour without activity

test("the leader is awake unless desk.json says otherwise, and sleeps after idle_minutes without activity (60 by default)", () => {
  const cfg = desk();
  assert.deepEqual(leaderAwake(cfg), { on: true, idleMinutes: 60 }, "on by default, an hour's idle window");
  assert.deepEqual(leaderAwake(desk({ leader: { ...cfg.leader, awake: false } })), { on: false, idleMinutes: 60 });
  assert.deepEqual(leaderAwake(desk({ leader: { ...cfg.leader, idle_minutes: 90 } })), { on: true, idleMinutes: 90 });
  says(configProblems(desk({ leader: { ...cfg.leader, awake: "yes" } })), "leader: awake");
  says(configProblems(desk({ leader: { ...cfg.leader, idle_minutes: 0 } })), "idle_minutes");
  says(configProblems(desk({ leader: { ...cfg.leader, idle_minutes: 1.5 } })), "idle_minutes");
  says(configProblems(desk({ leader: { ...cfg.leader, idle_minutes: 20000 } })), "idle_minutes");
  assert.deepEqual(configProblems(desk({ leader: { ...cfg.leader, awake: true, idle_minutes: 120 } })), []);
  const t = JSON.parse(read("skill/agent-desk/templates/desk.json"));
  assert.equal(t.leader.awake, true, "the template's leader is awake");
  assert.equal(t.leader.idle_minutes, 60, "and sleeps after an hour without activity");
});

test("wait.mjs --leader says which desk branches moved, counts activity, and sleeps after the idle window", () => {
  const d = deskWithOrigin({ awake: true });
  const leadWait = (...a) => spawnSync(process.execPath, [join(root, "skill/agent-desk/scripts/wait.mjs"), "--leader", "--once", ...a], { cwd: join(d.dir, "lead"), encoding: "utf8" });
  try {
    // A first look records what origin holds and starts the clock; nothing has moved yet.
    let r = leadWait();
    assert.equal(r.status, 3, last(r));
    assert.match(last(r), /^wait: nothing new for the leader (claude )?on garden-app/);
    assert.match(last(r), /first look/, "a checkout's first look is a baseline, said");
    assert.ok(d.L("config", "desk.leader.active"), "the clock is set");
    // A branch that was there before the first look, or whose head is already merged into the work branch, is no fit.
    d.L("config", "--unset-all", "desk.leader.refs");
    d.pushAs("codex-a", "C1-z");
    r = leadWait();
    assert.equal(r.status, 3, `a first look names nothing to check: ${last(r)}`);
    d.L("merge", "-q", "--no-ff", "-m", "merge C1-z", "origin/desk/garden-app/codex-a/C1-z"); d.L("push", "-q", "origin", "claude/work");
    d.pushAs("codex-a", "C1-z", 9);
    d.L("push", "-q", "-f", "origin", "claude/work:refs/heads/desk/garden-app/codex-a/C1-z");
    r = leadWait();
    assert.equal(r.status, 3, `a head merged into the work branch is settled: ${last(r)}`);
    // An agent's push is the leader's fit: check that branch. Said once per head.
    d.pushAs("agent-a", "A1-x");
    r = leadWait();
    assert.equal(r.status, 0, last(r));
    assert.match(last(r), /^fits: check desk\/garden-app\/agent-a\/A1-x\b/);
    assert.equal(leadWait().status, 3, "the same head isn't said twice");
    d.pushAs("agent-a", "A1-x", 2); d.pushAs("agent-b", "B1-y");
    r = leadWait();
    assert.equal(r.status, 0, last(r));
    assert.match(last(r), /desk\/garden-app\/agent-a\/A1-x/);
    assert.match(last(r), /desk\/garden-app\/agent-b\/B1-y/, "every branch that moved is named in the one line");
    // A branch that went (merged and deleted) is activity, not a fit.
    d.L("push", "-q", "origin", "--delete", "desk/garden-app/agent-b/B1-y");
    r = leadWait();
    assert.equal(r.status, 3, last(r));
    // With nothing moving for longer than idle_minutes the leader sleeps, and says how to wake it.
    const old = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    d.L("config", "desk.leader.active", old);
    r = leadWait();
    assert.equal(r.status, 1, last(r));
    assert.match(last(r), /^stop: .*60 minutes/);
    assert.match(last(r), /watch|go/);
    // --touch is the owner's or an event's word: activity now, awake again.
    r = leadWait("--touch");
    assert.equal(r.status, 3, last(r));
    assert.ok(new Date(d.L("config", "desk.leader.active")).getTime() > Date.now() - 60000, "touched");
    // A longer window keeps it awake; a push also resets the clock.
    d.rewrite((c) => ({ ...c, leader: { ...c.leader, idle_minutes: 180 } })); d.board({});
    d.L("config", "desk.leader.active", old);
    assert.equal(leadWait().status, 3, "two hours idle is inside a three-hour window");
    d.L("config", "desk.leader.active", old);
    d.pushAs("agent-a", "A1-x", 3);
    r = leadWait();
    assert.equal(r.status, 0, last(r));
    assert.ok(new Date(d.L("config", "desk.leader.active")).getTime() > Date.now() - 60000, "a push is activity");
    // The leader's own switch off: stop, said.
    d.rewrite((c) => ({ ...c, leader: { ...c.leader, awake: false } })); d.board({});
    r = leadWait();
    assert.equal(r.status, 1, last(r));
    assert.match(last(r), /^stop: .*leader.*off/);
  } finally { d.done(); }
});

// ---- moving an agent to another tool

test("a copy that knows its tool stops once desk.json moves its agent to another tool; an older copy carries on", () => {
  const d = deskWithOrigin({ awake: true });
  try {
    d.board({ "agent-a": { state: "ready", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "", notes: "" } });
    // An older copy (before the tool was recorded) can't tell, so it works on; agent.md step 2 asks it to compare.
    assert.equal(d.wait().status, 0, "no desk.tool recorded: the fit stands");
    d.C("config", "--unset-all", "desk.A1-x.acted");
    d.C("config", "desk.tool", "antigravity");
    assert.equal(d.wait().status, 0, "the copy's tool is the entry's: the fit stands");
    d.C("config", "--unset-all", "desk.A1-x.acted");
    d.rewrite((c) => ({ ...c, agents: c.agents.map((a) => a.name === "agent-a" ? { ...a, tool: "codex" } : a) }));
    d.board({ "agent-a": { state: "ready", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "", notes: "" } });
    const r = d.wait();
    assert.equal(r.status, 1, last(r));
    assert.match(last(r), /^stop: .*moved.*codex/i);
    assert.match(last(r), /antigravity/, "it names the tool this conversation is in");
  } finally { d.done(); }
});

test("desk.mjs move --push makes the move on the work branch from any copy, an agent's dirty desk branch included", () => {
  const d = deskWithOrigin({ awake: true });
  const deskCli = (cwd, ...a) => spawnSync(process.execPath, [join(root, "skill/agent-desk/scripts/desk.mjs"), ...a], { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" } });
  try {
    // The agent's copy: on its own branch, with work it hasn't committed. The owner types the move there.
    d.C("switch", "-q", "-c", "desk/garden-app/agent-a/A1-x", "origin/claude/work");
    writeFileSync(join(d.copy, "src/a.js"), "export const a = 'unsaved';\n");
    d.C("config", "desk.tool", "antigravity");
    let r = deskCli(d.copy, "move", "agent-a", "--to", "codex", "--push");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /pushed|claude\/work/, "it says the move went to the work branch");
    // Origin's work branch has it; the copy's branch, checkout and unsaved file are as they were.
    d.L("pull", "-q", "origin", "claude/work");
    const cfg = JSON.parse(readFileSync(join(d.dir, "lead", CONFIG_PATH), "utf8"));
    assert.equal(cfg.agents.find((a) => a.name === "agent-a").tool, "codex");
    assert.equal(d.C("rev-parse", "--abbrev-ref", "HEAD"), "desk/garden-app/agent-a/A1-x");
    assert.equal(readFileSync(join(d.copy, "src/a.js"), "utf8"), "export const a = 'unsaved';\n", "unsaved work is untouched");
    assert.equal(d.C("worktree", "list").split("\n").length, 1, "no worktree is left behind");
    const msg = d.L("log", "-1", "--format=%B", "origin/claude/work");
    assert.match(msg, /agent-a/); assert.match(msg, /codex/i); assert.match(msg, /Desk-Project: garden-app/);
    assert.match(msg, /Desk-Agent: agent-a/, "a move pushed from an agent's copy is signed by it");
    // And that copy now stops: it is the old tool's conversation.
    r = d.wait();
    assert.equal(r.status, 1, last(r));
    assert.match(last(r), /moved/);
    // From a copy with no name (the leader's, or a fresh one), the commit carries no agent's signature.
    r = deskCli(join(d.dir, "lead"), "move", "all", "--to", "claude-code", "--push");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    d.L("pull", "-q", "origin", "claude/work");
    assert.ok(!/Desk-Agent:/.test(d.L("log", "-1", "--format=%B")), "no agent signed the leader's move");
    assert.ok(JSON.parse(readFileSync(join(d.dir, "lead", CONFIG_PATH), "utf8")).agents.every((a) => a.tool === "claude-code"));
  } finally { d.done(); }
});

// ---- status reports, silence and autocompact

const deskRun = (cwd, ...a) => spawnSync(process.execPath, [join(root, "skill/agent-desk/scripts/desk.mjs"), ...a], { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" } });

test("a status report has one shape, and the desk reads silence and words from it", () => {
  const cfg = desk({ awake: true });
  for (const p of ["taking", "working", "checking", "pushed", "reviewing", "reviewed", "revising", "blocked", "waiting", "stopped", "moved"]) assert.ok(PHASES.includes(p), p);
  for (const p of ["checking", "deciding", "merging", "awake", "asleep"]) assert.ok(LEADER_PHASES.includes(p), p);
  assert.equal(STATUS_DIR, "agents/desk/garden-app/status");
  const at = "2026-11-09T01:12:30.000Z";
  const st = parseStatus(JSON.stringify({ desk: 1, project: "garden-app", agent: "agent-a", tool: "antigravity", phase: "working", brief: "A1-x", pr: "", step: "4: the job", words: "", at }));
  assert.deepEqual(statusProblems(st, cfg), []);
  says(statusProblems({ ...st, project: "other" }, cfg), "project");
  says(statusProblems({ ...st, agent: "nobody" }, cfg), "nobody");
  says(statusProblems({ ...st, phase: "dancing" }, cfg), "phase");
  says(statusProblems({ ...st, at: "yesterday" }, cfg), "at");
  assert.deepEqual(statusProblems({ ...st, agent: "claude", phase: "deciding" }, cfg), [], "the leader's own phases, under the leader's name");
  assert.ok(parseStatus("{nope").error, "junk says so");
  // Words for the status column, and silence against desk.json's window (20 minutes unless set).
  const now = Date.parse(at) + 3 * 60000;
  assert.match(statusWords(st, now), /^working A1-x \(4: the job\) · 3 min ago$/);
  assert.match(statusWords({ ...st, phase: "reviewing", pr: "#8", brief: "", step: "" }, now), /^reviewing #8 · 3 min ago$/);
  assert.equal(silenceMinutes(cfg), 20);
  assert.equal(silenceMinutes(desk({ silence_minutes: 45 })), 45);
  says(configProblems(desk({ silence_minutes: 0 })), "silence_minutes");
  assert.equal(silence(cfg, st, now), 0, "three minutes isn't silence");
  assert.equal(silence(cfg, st, Date.parse(at) + 23 * 60000), 23, "23 minutes is, for an awake agent");
  assert.equal(silence(desk(), st, Date.parse(at) + 23 * 60000), 0, "an agent that isn't awake is never silent");
  assert.equal(silence(cfg, { ...st, phase: "stopped" }, Date.parse(at) + 90 * 60000), 0, "a stopped or moved agent isn't silent, it's gone");
  assert.ok(sameReport(st, { ...st, at: "2027-01-01T00:00:00.000Z", words: "x" }), "the time and the words don't make a new report");
  assert.ok(!sameReport(st, { ...st, step: "5" }), "a step does");
  // autocompact: 500,000 tokens unless set, per desk or per agent.
  assert.equal(autocompactOf(desk(), desk().agents[0]), 500000);
  assert.equal(autocompactOf(desk({ autocompact: 400000 }), desk().agents[0]), 400000);
  assert.equal(autocompactOf(desk({ autocompact: 400000 }), { ...desk().agents[0], autocompact: 900000 }), 900000);
  says(configProblems(desk({ autocompact: 5000 })), "autocompact");
  says(configProblems(desk({ agents: [{ ...desk().agents[0], autocompact: "lots" }, desk().agents[1]] })), "autocompact");
  const t = JSON.parse(read("skill/agent-desk/templates/desk.json"));
  assert.equal(t.autocompact, 500000); assert.equal(t.silence_minutes, 20);
  for (const e of [".codex/", ".gemini/"]) assert.ok(CORE_PROTECTED.includes(e), `${e} is protected: the installer writes the tools' settings there`);
});

test("desk.mjs report writes an agent's status on the work branch from its own copy, once per change, and the leader's too", () => {
  const d = deskWithOrigin({ awake: true });
  try {
    d.board({ "agent-a": { state: "ready", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "", notes: "" } });
    d.C("switch", "-q", "-c", "desk/garden-app/agent-a/A1-x", "origin/claude/work");
    writeFileSync(join(d.copy, "src/a.js"), "export const a = 'unsaved';\n");
    d.C("config", "desk.tool", "antigravity");
    let r = deskRun(d.copy, "report", "working", "--brief", "A1-x", "--step", "4: the job");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /working/);
    d.L("pull", "-q", "origin", "claude/work");
    const file = join(d.dir, "lead", STATUS_DIR, "agent-a.json");
    const st = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(st.agent, "agent-a"); assert.equal(st.tool, "antigravity"); assert.equal(st.phase, "working"); assert.equal(st.brief, "A1-x"); assert.equal(st.step, "4: the job");
    assert.equal(st.project, "garden-app"); assert.ok(Date.parse(st.at) > Date.now() - 60000);
    const msg = d.L("log", "-1", "--format=%B");
    assert.match(msg, /agent-a working/); assert.match(msg, /Desk-Agent: agent-a/); assert.match(msg, /Desk-Project: garden-app/);
    assert.equal(readFileSync(join(d.copy, "src/a.js"), "utf8"), "export const a = 'unsaved';\n", "the copy is untouched");
    assert.equal(d.C("rev-parse", "--abbrev-ref", "HEAD"), "desk/garden-app/agent-a/A1-x");
    // The same report again pushes nothing: the work branch stays quiet while nothing changes.
    const head = d.L("rev-parse", "origin/claude/work");
    r = deskRun(d.copy, "report", "working", "--brief", "A1-x", "--step", "4: the job");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /unchanged|already/i);
    d.L("fetch", "-q", "origin");
    assert.equal(d.L("rev-parse", "origin/claude/work"), head, "no commit for an unchanged report");
    // A new phase does push, and a blocked report carries its words.
    r = deskRun(d.copy, "report", "blocked", "--brief", "A1-x", "--words", "two approaches failed: the fixture and the stub");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    d.L("pull", "-q", "origin", "claude/work");
    assert.match(readFileSync(file, "utf8"), /two approaches failed/);
    // A phase the desk doesn't know, or a copy with no name, is refused.
    assert.equal(deskRun(d.copy, "report", "dancing").status, 1);
    assert.equal(deskRun(join(d.dir, "lead"), "report", "working").status, 1, "the leader's checkout has no agent name: it reports with --leader");
    // The leader reports under its own name, with no agent's signature.
    r = deskRun(join(d.dir, "lead"), "report", "checking", "--pr", "#7", "--leader");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    d.L("pull", "-q", "origin", "claude/work");
    const ls = JSON.parse(readFileSync(join(d.dir, "lead", STATUS_DIR, "claude.json"), "utf8"));
    assert.equal(ls.agent, "claude"); assert.equal(ls.phase, "checking"); assert.equal(ls.pr, "#7");
    assert.ok(!/Desk-Agent:/.test(d.L("log", "-1", "--format=%B")));
    // status shows what each says, and validate reads the files.
    r = deskRun(join(d.dir, "lead"), "status");
    assert.match(r.stdout, /Agent says/);
    assert.match(r.stdout, /agent-a.*blocked A1-x/);
    r = deskRun(join(d.dir, "lead"), "validate");
    assert.ok(!/status\//.test(r.stdout), `well-formed reports validate: ${r.stdout}`);
    writeFileSync(file, JSON.stringify({ ...st, project: "other-project" }));
    r = deskRun(join(d.dir, "lead"), "validate");
    assert.equal(r.status, 1); assert.match(r.stdout, /status.*agent-a/);
  } finally { d.done(); }
});

test("wait.mjs --leader reads the agents' reports: a blocked agent and a pushed brief are fits, a silent agent is said once", () => {
  const d = deskWithOrigin({ awake: true });
  const lead = join(d.dir, "lead");
  const leadWait = (...a) => spawnSync(process.execPath, [join(root, "skill/agent-desk/scripts/wait.mjs"), "--leader", "--once", ...a], { cwd: lead, encoding: "utf8" });
  const put = (name, patch) => { mkdirSync(join(lead, STATUS_DIR), { recursive: true }); writeFileSync(join(lead, STATUS_DIR, `${name}.json`), JSON.stringify({ desk: 1, project: "garden-app", agent: name, tool: "antigravity", phase: "working", brief: "A1-x", pr: "", step: "", words: "", at: new Date().toISOString(), ...patch })); d.L("add", "-A"); d.L("commit", "-qm", "status"); d.L("push", "-q", "origin", "claude/work"); };
  try {
    d.board({ "agent-a": { state: "ready", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "", notes: "" } });
    assert.equal(leadWait().status, 3, "baseline");
    put("agent-a", { phase: "blocked", words: "the fixture refuses the second insert" });
    let r = leadWait();
    assert.equal(r.status, 0, last(r));
    assert.match(last(r), /^fits: help agent-a \(blocked on A1-x: the fixture refuses the second insert\)/);
    assert.equal(leadWait().status, 3, "said once");
    // A pushed report is a fit to check that branch, head seen or not.
    d.pushAs("agent-a", "A1-x");
    assert.equal(leadWait().status, 0, "the push itself");
    put("agent-a", { phase: "pushed", pr: "#7" });
    r = leadWait();
    assert.equal(r.status, 0, last(r));
    assert.match(last(r), /^fits: check desk\/garden-app\/agent-a\/A1-x/);
    assert.match(last(r), /pushed #7/);
    assert.equal(leadWait().status, 3, "said once");
    // Silence: an awake agent whose last report is old is named, and the owner is told once.
    put("agent-a", { phase: "waiting", at: new Date(Date.now() - 25 * 60000).toISOString() });
    r = leadWait();
    assert.equal(r.status, 3, last(r));
    assert.match(last(r), /agent-a silent 2[45] min/);
    assert.match(last(r), /tell the owner/i);
    r = leadWait();
    assert.match(last(r), /agent-a silent 2[45] min/);
    assert.ok(!/tell the owner/i.test(last(r)), "told once per silence");
    put("agent-a", { phase: "working", step: "5" });
    r = leadWait();
    assert.ok(!/silent/.test(last(r)), "a fresh report ends the silence");
    // A stopped agent is never silent, just gone.
    put("agent-a", { phase: "stopped", at: new Date(Date.now() - 90 * 60000).toISOString() });
    assert.ok(!/silent/.test(last(leadWait())));
  } finally { d.done(); }
});

// ---- the desk checks itself, keeps a timeline, tells the owner, writes the report and drafts the next brief

const deskRunIn = (cwd, extraEnv, ...a) => spawnSync(process.execPath, [join(root, "skill/agent-desk/scripts/desk.mjs"), ...a], { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com", ...extraEnv } });
// A stand-in gh first on PATH: it records every call's words and stdin, and answers canned JSON.
function ghShim(dir, answer = "{}") {
  const bin = join(dir, "bin"); mkdirSync(bin, { recursive: true });
  const log = join(dir, "gh.log");
  writeFileSync(join(bin, "gh"), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\ncat >> "${log}"\nprintf '\\n--\\n' >> "${log}"\necho '${answer}'\n`, { mode: 0o755 });
  return { bin, log, calls: () => existsSync(log) ? readFileSync(log, "utf8").split("\n--\n").filter(Boolean) : [] };
}
// A PATH with git alone, for the words said when gh isn't there.
function noGhPath(dir) {
  const bin = join(dir, "nogh"); mkdirSync(bin, { recursive: true });
  for (const tool of ["git", "sh"]) if (!existsSync(join(bin, tool))) symlinkSync(spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim(), join(bin, tool));
  return bin;
}
const SPEC = `# Garden app spec\n\n## Release A\n\n### A1. Beds and plants\n\nA bed holds plants.\n\n- A plant has a name.\n\n### A2. The watering plan\n\nEach plant is watered on its day. Stop here and ask the owner which days.\n\n## Release B\n\n### B1. Harvests\n\nA harvest is logged.\n\n## Not in this work\n\n### C9. Never\n`;

test("desk.json's notify names the owner's issue and the events, reads off when absent, and the compaction files are one list", () => {
  assert.deepEqual(NOTIFY_EVENTS, ["blocked", "silent", "asleep", "merged", "question"]);
  assert.equal(notifyOf(desk()), null);
  assert.equal(notifyOf(desk({ notify: null })), null);
  assert.deepEqual(notifyOf(desk({ notify: { issue: 12 } })), { issue: 12, events: NOTIFY_EVENTS });
  assert.deepEqual(notifyOf(desk({ notify: { issue: 12, events: ["blocked", "silent"] } })), { issue: 12, events: ["blocked", "silent"] });
  assert.deepEqual(configProblems(desk({ notify: { issue: 12, events: ["blocked"] } })), []);
  assert.deepEqual(configProblems(desk({ notify: null })), []);
  says(configProblems(desk({ notify: { issue: 0 } })), "notify");
  says(configProblems(desk({ notify: { issue: "12" } })), "notify");
  says(configProblems(desk({ notify: { issue: 12, events: ["dancing"] } })), "notify");
  says(configProblems(desk({ notify: { issue: 12, events: ["blocked", "blocked"] } })), "notify");
  says(configProblems(desk({ notify: 12 })), "notify");
  assert.ok(!("notify" in JSON.parse(read("skill/agent-desk/templates/desk.json"))), "off by default: the template has no notify");
  const files = compactionFiles(500000);
  assert.deepEqual(files.map((f) => f.file), [".claude/settings.json", ".codex/config.toml", ".gemini/settings.json"]);
  for (const f of files) assert.ok(f.ok(f.apply(null)) && f.tools, f.file);
  assert.ok(!files[0].ok(compactionFiles(400000)[0].apply(null)), "another figure doesn't pass");
});

const bareDoctor = { boardText: null, briefOf: () => null, briefIds: [], statuses: {}, heads: {}, isMerged: () => false, identity: {}, kitVersion: null, prs: null, compaction: [], now: Date.now() };

test("the doctor reads the desk against origin's branches, the reports and GitHub, and gives every finding a fix", () => {
  // an awake desk with nowhere to tell the owner is a finding of its own (2.1.0), so this desk has its issue
  const cfg = desk({ awake: true, notify: { issue: 12 } });
  says(doctorFindings({ cfg: desk({ awake: true }), boardText: renderBoard(desk({ awake: true }), {}), briefOf: () => null }).map((x) => x.what), "nobody is told");
  const briefs = { "A1-x": parseBrief(good({ id: "A1-x", branch: "desk/garden-app/agent-a/A1-x" })), "B1-y": parseBrief(good({ id: "B1-y", slot: "agent-b", reviewer: "agent-a", branch: "desk/garden-app/agent-b/B1-y", port: "8821" })) };
  const briefOf = (id) => briefs[id] || null;
  const board = (rows) => renderBoard(cfg, rows);
  const row = (state, pr = "") => ({ "agent-a": { state, brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr, notes: "" } });
  const run = (over) => doctorFindings({ ...bareDoctor, cfg, briefOf, briefIds: Object.keys(briefs), boardText: board({}), ...over });
  const whats = (f) => f.map((x) => x.what), fixes = (f) => f.map((x) => x.fix);
  assert.deepEqual(run({}), []);
  let f = run({ boardText: board(row("review", "#7")), heads: {} });
  for (const x of f) assert.ok(x.what && x.fix, JSON.stringify(x));
  says(whats(f), "isn't on origin"); says(fixes(f), "set agent-a ready --brief A1-x");
  f = run({ heads: { "desk/garden-app/agent-b/B1-y": "abc" } });
  says(whats(f), "desk/garden-app/agent-b/B1-y"); says(fixes(f), "set agent-b in-progress --brief B1-y");
  f = run({ heads: { "desk/garden-app/agent-b/B1-y": "abc" }, isMerged: () => true });
  says(fixes(f), "--delete");
  assert.deepEqual(run({ heads: null }), [], "origin unreachable: branches aren't judged");
  assert.deepEqual(run({ boardText: null }).length, 1); says(fixes(run({ boardText: null })), "sync-board");
  const old = new Date(Date.now() - 40 * 60000).toISOString(), fresh = new Date().toISOString();
  f = run({ statuses: { "agent-a": { desk: 1, project: "garden-app", agent: "agent-a", phase: "working", brief: "A1-x", at: old } } });
  says(whats(f), "silent"); says(fixes(f), "go");
  assert.deepEqual(run({ cfg: desk({ awake: false }), statuses: { "agent-a": { desk: 1, project: "garden-app", agent: "agent-a", phase: "working", brief: "A1-x", at: old } } }), [], "an agent that isn't awake is never silent");
  f = run({ statuses: { "agent-a": { desk: 1, project: "garden-app", agent: "agent-a", phase: "blocked", brief: "A1-x", words: "two approaches failed", at: fresh } } });
  says(whats(f), "blocked"); says(whats(f), "two approaches failed");
  f = run({ boardText: board(row("in-progress")), heads: { "desk/garden-app/agent-a/A1-x": "abc" }, statuses: { "agent-a": { desk: 1, project: "garden-app", agent: "agent-a", phase: "pushed", brief: "A1-x", pr: "#7", at: fresh } } });
  says(fixes(f), "set agent-a review --pr #7");
  f = run({ statuses: { nobody: { desk: 1, project: "garden-app", agent: "nobody", phase: "working", at: fresh } } });
  says(whats(f), "nobody");
  f = run({ boardText: board(row("review", "#7")), heads: { "desk/garden-app/agent-a/A1-x": "abc" }, prs: [{ number: 7, state: "closed", merged: true, head: "desk/garden-app/agent-a/A1-x" }] });
  says(fixes(f), "set agent-a done");
  f = run({ boardText: board(row("done", "#7")), prs: [{ number: 7, state: "open", merged: false, head: "desk/garden-app/agent-a/A1-x" }] });
  says(whats(f), "#7");
  f = run({ boardText: board(row("review", "#9")), heads: { "desk/garden-app/agent-a/A1-x": "abc" }, prs: [{ number: 7, state: "open", merged: false, head: "desk/garden-app/agent-a/A1-x" }] });
  says(whats(f), "#9");
  assert.deepEqual(run({ boardText: board(row("review", "#7")), heads: { "desk/garden-app/agent-a/A1-x": "abc" }, prs: [{ number: 7, state: "open", merged: false, head: "desk/garden-app/agent-a/A1-x" }] }), []);
  f = run({ identity: { slot: "agent-a", project: "", base: "", tool: "" } });
  says(fixes(f), "git config desk.project");
  f = run({ identity: { slot: "agent-a", project: "other", base: "claude/work", tool: "antigravity" } });
  says(whats(f), "other");
  assert.deepEqual(run({ identity: { slot: "", project: "", base: "", tool: "" } }), [], "no name is the leader's checkout");
  f = run({ kitVersion: "1.9.0", cfg: { ...cfg, kit: { version: "1.8.0" } } });
  says(fixes(f), "install.mjs");
  assert.deepEqual(run({ kitVersion: "1.9.0", cfg: { ...cfg, kit: { version: "1.9.0" } } }), []);
  f = run({ compaction: [{ file: ".claude/settings.json", exists: true, ok: false }] });
  says(whats(f), ".claude/settings.json");
  assert.deepEqual(run({ compaction: [{ file: ".claude/settings.json", exists: false, ok: false }] }), [], "a tool file that isn't here isn't wrong");
});

test("the desk log reads each commit shape on the work branch: a report, a board move, a new brief, a merge, and the rest as other", () => {
  const cfg = desk();
  const now = Date.parse("2026-11-09T02:05:00Z");
  assert.equal(sinceDate("2d", now), now - 2 * 86400000);
  assert.equal(sinceDate("3h", now), now - 3 * 3600000);
  assert.equal(sinceDate("2026-11-08T00:00:00Z", now), Date.parse("2026-11-08T00:00:00Z"));
  assert.equal(sinceDate("", now), null);
  assert.throws(() => sinceDate("soon", now));
  const before = renderBoard(cfg, { "agent-a": { state: "review", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#7", notes: "" } });
  const after = renderBoard(cfg, { "agent-a": { state: "done", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#7", notes: "" }, "agent-b": { state: "ready", brief: "B1-y", branch: "desk/garden-app/agent-b/B1-y", pr: "", notes: "" } });
  assert.deepEqual(boardChanges(before, after), ["agent-a: review → done (#7)", "agent-b: idle → ready B1-y"]);
  assert.deepEqual(boardChanges(after, after), []);
  const ctx = { project: "garden-app", leader: "claude" };
  const base = { sha: "abc1234", at: "2026-11-09T01:50:00Z", parents: ["p1"], subject: "", trailers: {}, paths: [], readAt: () => null, readAtParent: () => null };
  const status = { desk: 1, project: "garden-app", agent: "agent-a", phase: "pushed", brief: "A1-x", pr: "#7", step: "", words: "", at: "2026-11-09T01:50:00Z" };
  let e = classifyCommit({ ...base, subject: "desk(garden-app): agent-a pushed A1-x #7", trailers: { project: "garden-app", agent: "agent-a" }, paths: [{ status: "M", path: "agents/desk/garden-app/status/agent-a.json" }], readAt: () => JSON.stringify(status) }, ctx);
  assert.equal(e.kind, "pushed"); assert.equal(e.who, "agent-a"); assert.equal(e.agent, "agent-a"); assert.match(e.words, /A1-x #7/); assert.equal(e.at, "2026-11-09T01:50:00Z");
  e = classifyCommit({ ...base, subject: "fix", paths: [{ status: "M", path: "agents/desk/garden-app/board.md" }], readAt: () => after, readAtParent: () => before }, ctx);
  assert.equal(e.kind, "board"); assert.equal(e.who, "claude"); assert.match(e.words, /agent-a: review → done \(#7\)/); assert.match(e.words, /agent-b: idle → ready B1-y/);
  e = classifyCommit({ ...base, subject: "A1 for garden-app", paths: [{ status: "A", path: "agents/desk/garden-app/assignments/B1-y.md" }], readAt: () => good({ id: "B1-y", slot: "agent-b", title: "Hide drafts", spec: "B1" }) }, ctx);
  assert.equal(e.kind, "brief"); assert.match(e.words, /B1-y for agent-b \(spec B1\): Hide drafts/); assert.equal(e.agent, "agent-b"); assert.equal(e.brief, "B1-y");
  e = classifyCommit({ ...base, subject: "Merge A1-x (#7, agent-a) into the garden-app work branch", parents: ["p1", "p2"] }, ctx);
  assert.equal(e.kind, "merged"); assert.equal(e.pr, "#7"); assert.equal(e.agent, "agent-a"); assert.equal(e.brief, "A1-x");
  e = classifyCommit({ ...base, subject: "Merge pull request #12 from owner/desk/garden-app/agent-b/B1-y", parents: ["p1", "p2"] }, ctx);
  assert.equal(e.kind, "merged"); assert.equal(e.pr, "#12"); assert.equal(e.agent, "agent-b"); assert.equal(e.brief, "B1-y");
  e = classifyCommit({ ...base, subject: "Merge remote-tracking branch 'origin/x' into x", parents: ["p1", "p2"] }, ctx);
  assert.equal(e.kind, "other");
  e = classifyCommit({ ...base, subject: "desk(garden-app): agent-a to Codex (the owner's word)", trailers: { project: "garden-app" }, paths: [{ status: "M", path: "agents/desk/garden-app/desk.json" }, { status: "A", path: "agents/desk/garden-app/status/agent-a.json" }] }, ctx);
  assert.equal(e.kind, "desk"); assert.match(e.words, /Codex/);
  e = classifyCommit({ ...base, subject: "desk tidy-up", paths: [{ status: "M", path: ".agents/skills/agent-desk/protocol/lead.md" }] }, ctx);
  assert.equal(e.kind, "other"); assert.equal(e.words, "desk tidy-up");
  const lines = formatLines([e]);
  assert.match(lines, /^2026-11-09 01:50Z  /);
  assert.match(lines, /other/);
  const md = formatMarkdown([e], cfg, { from: "2026-11-08T23:00:00Z", to: "2026-11-09T02:05:00Z" });
  assert.match(md, /^## Desk log for garden-app/); assert.match(md, /### 2026-11-09/); assert.match(md, /01:50Z/);
});

test("notify renders each event in the desk's voice, asks for the words it needs, and keys each so it is told once", () => {
  const cfg = desk({ notify: { issue: 12 } });
  const now = Date.parse("2026-11-09T02:05:00Z");
  const st = { desk: 1, project: "garden-app", agent: "agent-a", phase: "blocked", brief: "A1-x", pr: "#7", step: "", words: "two approaches failed", at: "2026-11-09T01:12:00Z" };
  const blocked = notifyBody(cfg, "blocked", { agent: "agent-a", status: st }, now);
  assert.match(blocked, /\*\*agent-a is blocked on A1-x\*\*/); assert.match(blocked, /two approaches failed/); assert.match(blocked, /#7/);
  const silent = notifyBody(cfg, "silent", { agent: "agent-a", status: { ...st, phase: "working" } }, now);
  assert.match(silent, /silent for 53 minutes/); assert.match(silent, /working A1-x/); assert.match(silent, /01:12 UTC/); assert.match(silent, /`go`/);
  const asleep = notifyBody(cfg, "asleep", {}, now);
  assert.match(asleep, /asleep/); assert.match(asleep, /60 minutes/); assert.match(asleep, /\/agent-desk lead watch/);
  const merged = notifyBody(cfg, "merged", { brief: "A1-x", pr: "#7", agent: "agent-a", words: "Next up: B1-y for agent-b." }, now);
  assert.match(merged, /\*\*A1-x \(#7\) is merged\*\*/); assert.match(merged, /agent-a/); assert.match(merged, /Next up: B1-y for agent-b/);
  const question = notifyBody(cfg, "question", { words: "A12 says stop for the owner: release now?" }, now);
  assert.match(question, /question for you on garden-app/); assert.match(question, /release now\?/);
  for (const b of [blocked, silent, asleep, merged, question]) {
    assert.ok(b.trim().endsWith("— the desk for garden-app"), b);
    assert.ok(b.trim().split("\n").filter(Boolean).length <= 3, `short: ${b}`);
    assert.ok(/garden-app/.test(b), "the project is named");
  }
  assert.throws(() => notifyBody(cfg, "blocked", {}, now), /--agent/);
  assert.throws(() => notifyBody(cfg, "blocked", { agent: "agent-a" }, now), /report/);
  assert.throws(() => notifyBody(cfg, "merged", {}, now), /--brief/);
  assert.throws(() => notifyBody(cfg, "question", {}, now), /--words/);
  assert.throws(() => notifyBody(cfg, "dancing", {}, now), /event/);
  assert.equal(notifyKey("blocked", { agent: "agent-a", status: st }, now), notifyKey("blocked", { agent: "agent-a", status: st }, now + 60000));
  assert.notEqual(notifyKey("blocked", { agent: "agent-a", status: st }, now), notifyKey("blocked", { agent: "agent-a", status: { ...st, at: "2026-11-09T01:30:00Z" } }, now));
  assert.equal(notifyKey("merged", { brief: "A1-x", pr: "#7" }, now), notifyKey("merged", { brief: "A1-x", pr: "#7" }, now + 86400000));
  assert.notEqual(notifyKey("asleep", {}, now), notifyKey("asleep", {}, now + 3600000));
  for (const k of [notifyKey("question", { words: "Release now? Yes or no" }, now), notifyKey("silent", { agent: "agent-a", status: st }, now)]) assert.match(k, /^[a-z0-9-]+$/);
  assert.equal(notifyLine(cfg), "Notifications: issue #12 (blocked, silent, asleep, merged, question).");
  assert.match(notifyLine(desk()), /^Notifications: off \(node \.agents\/skills\/agent-desk\/scripts\/desk\.mjs notify --setup --issue <N>\)/);
});

test("preflight's report follows take.md's shape: the diff, Done means ticked from desk-check, the check quoted, None placeholders, the agent's signature", () => {
  const cfg = desk();
  const text = good({ id: "A1-x", branch: "desk/garden-app/agent-a/A1-x" }).replace("## Done means\n\nWords.", "## Done means\n\n- Every frozen test passes, unedited.\n- `node .agents/skills/agent-desk/scripts/check.mjs A1-x` passes.\n- The report shows the new route's answer.");
  const sections = briefSections(text);
  assert.deepEqual(Object.keys(sections), SECTIONS);
  assert.match(sections["Done means"], /check\.mjs A1-x/);
  assert.equal(sections.Goal, "Words.");
  const brief = parseBrief(text);
  const check = { passed: true, tail: "desk-check: every changed file is inside garden-app/A1-x's brief.\n\ndesk-check passed for garden-app/A1-x." };
  const body = preflightBody({ cfg, brief, sections, files: [{ status: "M", path: "src/trip-visibility.js", added: 12, removed: 3 }], stat: "1 file changed, 12 insertions(+), 3 deletions(-)", commits: ["hide drafts from readers"], check, name: "agent-a", tool: "antigravity", dirty: 0 });
  const order = ["**What changed:**", "**Done means:**", "**desk-check:**", "**Assumptions:**", "**Questions / blocked:**", "— agent-a (Antigravity) on garden-app, for claude to decide"];
  let last = -1;
  for (const h of order) { const i = body.indexOf(h); assert.ok(i > last, `${h} in order`); last = i; }
  assert.match(body, /`src\/trip-visibility\.js` \(M, \+12 −3\)/);
  assert.match(body, /hide drafts from readers/);
  assert.match(body, /- \[x\] Every frozen test passes, unedited\. — desk-check passed/);
  assert.match(body, /- \[x\] `node \.agents\/skills\/agent-desk\/scripts\/check\.mjs A1-x` passes\. — desk-check passed/);
  assert.match(body, /- \[ \] The report shows the new route's answer\. — <evidence/);
  assert.match(body, /desk-check passed for garden-app\/A1-x\./);
  assert.match(body, /\*\*Assumptions:\*\* None/); assert.match(body, /\*\*Questions \/ blocked:\*\* None/);
  assert.ok(!/FAILED/.test(body)); assert.ok(!/uncommitted/.test(body));
  const failed = preflightBody({ cfg, brief, sections, files: [], stat: "", commits: [], check: { passed: false, tail: "desk-check FAILED for garden-app/A1-x (against origin/claude/work):\n  src/other.js  outside_brief: a file the brief doesn't list" }, name: "agent-a", tool: "antigravity", dirty: 2 });
  assert.match(failed, /^\*\*desk-check FAILED\*\*/); assert.match(failed, /- \[ \] Every frozen test passes, unedited\. — desk-check FAILED/); assert.match(failed, /2 uncommitted changes/);
});

test("the spec's steps are read from its headings in release order, and next proposes the first step no mark or brief covers", () => {
  const { steps } = parseSpec(SPEC, "docs/spec.md");
  assert.deepEqual(steps.map((s) => s.id), ["A1", "A2", "B1", "C9"]);
  assert.equal(steps[0].title, "Beds and plants"); assert.equal(steps[0].release, "Release A"); assert.equal(steps[2].release, "Release B"); assert.equal(steps[3].release, "");
  assert.match(steps[0].body, /A bed holds plants/); assert.match(steps[0].body, /A plant has a name/); assert.ok(!/A2/.test(steps[0].body)); assert.equal(steps[0].file, "docs/spec.md"); assert.equal(steps[0].line, 5);
  assert.ok(STEP_ID.test("A9") && STEP_ID.test("B12") && STEP_ID.test("A9b") && !STEP_ID.test("a9") && !STEP_ID.test("3.1") && !STEP_ID.test("A9-x"));
  assert.deepEqual(parseSpec("# Nothing\n\nwords\n", "x.md").steps, []);
  const cfg = desk();
  const at = "2026-11-09T00:00:00.000Z";
  const progress = { desk: 1, project: "garden-app", steps: { A1: { state: "done", at, note: "A1a, A1b" } } };
  assert.deepEqual(progressProblems(progress, cfg, steps), []);
  says(progressProblems({ ...progress, project: "other" }, cfg, steps), "project");
  says(progressProblems({ ...progress, desk: 2 }, cfg, steps), "desk");
  says(progressProblems({ ...progress, steps: { Z9: { state: "done", at } } }, cfg, steps), "Z9");
  says(progressProblems({ ...progress, steps: { A1: { state: "maybe", at } } }, cfg, steps), "state");
  says(progressProblems({ ...progress, steps: { A1: { state: "done", at: "yesterday" } } }, cfg, steps), "at");
  const briefs = [{ id: "A1a-beds", spec: "A1", slot: "agent-a" }, { id: "A1b-plants", spec: "A1", slot: "agent-b" }];
  const board = { "agent-a": { state: "done", brief: "A1a-beds", pr: "#3" }, "agent-b": { state: "done", brief: "A1b-plants", pr: "#4" } };
  let out = nextSteps({ steps, progress, briefs, board, cfg });
  assert.equal(out.proposals.length, 2);
  assert.equal(out.proposals[0].agent, "agent-a"); assert.equal(out.proposals[0].step.id, "A2"); assert.equal(out.proposals[0].kind, "clear"); assert.equal(out.proposals[0].needsOwner, true, "the step says stop and ask the owner");
  assert.equal(out.proposals[1].agent, "agent-b"); assert.equal(out.proposals[1].step.id, "B1"); assert.equal(out.proposals[1].kind, "clear"); assert.equal(out.proposals[1].needsOwner, false);
  assert.match(out.proposals[0].suggestedId, /^A2-[a-z][a-z0-9-]*$/);
  out = nextSteps({ steps, progress: { ...progress, steps: {} }, briefs, board, cfg });
  assert.equal(out.proposals[0].step.id, "A1"); assert.equal(out.proposals[0].kind, "partly"); assert.deepEqual(out.proposals[0].briefs.map((b) => b.id), ["A1a-beds", "A1b-plants"]);
  assert.equal(out.proposals[1].step.id, "A2", "the next agent gets the next step, not the same one");
  out = nextSteps({ steps, progress, briefs: [...briefs, { id: "A2-water", spec: "A2", slot: "agent-a" }], board: { ...board, "agent-a": { state: "ready", brief: "A2-water", pr: "" } }, cfg });
  assert.equal(out.proposals.length, 1, "agent-a has a ready brief, so only agent-b is asked for");
  assert.equal(out.proposals[0].step.id, "B1"); assert.deepEqual(out.inHand.map((s) => s.id), ["A2"]);
  out = nextSteps({ steps, progress: { ...progress, steps: { A1: progress.steps.A1, A2: { state: "done", at }, B1: { state: "skipped", at }, C9: { state: "skipped", at } } }, briefs, board, cfg });
  assert.equal(out.proposals[0].kind, "nothing");
  assert.equal(out.done, 2); assert.equal(out.skipped, 2); assert.equal(out.total, 4);
});

test("desk.mjs doctor finds a row without its branch, a branch without its row, a silent agent and a copy without its tool, and is quiet once mended", () => {
  const d = deskWithOrigin();
  const lead = join(d.dir, "lead");
  try {
    // an awake desk with nowhere to tell the owner is a finding of its own (2.1.0), so this desk has its issue
    d.rewrite((c) => ({ ...c, notify: { issue: 12 } }));
    let r = deskRun(lead, "doctor");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /in order/); assert.match(r.stdout, /pull requests not checked/); assert.match(r.stdout, /leader's/);
    d.board({ "agent-a": { state: "review", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#7", notes: "" } });
    r = deskRun(lead, "doctor");
    assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /isn't on origin/); assert.match(r.stdout, /fix: /);
    d.pushAs("agent-a", "A1-x");
    d.pushAs("codex-a", "C1-z");
    r = deskRun(lead, "doctor");
    assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /desk\/garden-app\/codex-a\/C1-z/); assert.ok(!/isn't on origin/.test(r.stdout));
    d.board({ "agent-a": { state: "review", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#7", notes: "" }, "codex-a": { state: "in-progress", brief: "C1-z", branch: "desk/garden-app/codex-a/C1-z", pr: "", notes: "" } });
    assert.equal(deskRun(lead, "doctor").status, 0, deskRun(lead, "doctor").stdout);
    // an old report from an awake agent is silence; a report says how long
    mkdirSync(join(lead, STATUS_DIR), { recursive: true });
    writeFileSync(join(lead, `${STATUS_DIR}/agent-a.json`), JSON.stringify({ desk: 1, project: "garden-app", agent: "agent-a", tool: "antigravity", phase: "working", brief: "A1-x", pr: "#7", step: "", words: "", at: new Date(Date.now() - 45 * 60000).toISOString() }));
    d.board({ "agent-a": { state: "review", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#7", notes: "" }, "codex-a": { state: "in-progress", brief: "C1-z", branch: "desk/garden-app/codex-a/C1-z", pr: "", notes: "" } });
    r = deskRun(lead, "doctor");
    assert.equal(r.status, 1); assert.match(r.stdout, /agent-a .*silent/); assert.match(r.stdout, /go/);
    // GitHub through gh: a closed pull request on a review row
    const gh = ghShim(d.dir, '[{"number":7,"state":"closed","merged_at":"2026-11-09T01:00:00Z","head":{"ref":"desk/garden-app/agent-a/A1-x"}}]');
    r = deskRunIn(lead, { PATH: `${gh.bin}:${process.env.PATH}` }, "doctor");
    assert.match(r.stdout, /set agent-a done/); assert.ok(!/not checked/.test(r.stdout));
    assert.match(gh.calls()[0], /repos\/owner\/repo\/pulls/);
    // the agent's copy knows its own name but not its tool
    r = deskRun(d.copy, "doctor");
    assert.match(r.stdout, /git config desk.tool/);
    d.C("config", "desk.tool", "antigravity");
    assert.ok(!/desk.tool/.test(deskRun(d.copy, "doctor").stdout));
  } finally { d.done(); }
});

test("desk.mjs log lists the work branch's desk events oldest first, filters by agent and since, and renders a digest with --md", () => {
  const d = deskWithOrigin();
  const lead = join(d.dir, "lead");
  const rowA = (state, pr = "") => ({ "agent-a": { state, brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr, notes: "" } });
  try {
    d.board(rowA("ready"));
    let r = deskRun(d.copy, "report", "taking", "--brief", "A1-x"); assert.equal(r.status, 0, r.stderr);
    d.L("pull", "-q", "origin", "claude/work");
    d.pushAs("agent-a", "A1-x");
    d.board(rowA("review", "#7"));
    d.L("fetch", "-q", "origin"); d.L("merge", "--no-ff", "-q", "-m", "Merge A1-x (#7, agent-a) into the garden-app work branch", "origin/desk/garden-app/agent-a/A1-x"); d.L("push", "-q", "origin", "claude/work");
    d.board(rowA("done", "#7"));
    r = deskRun(lead, "log");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const out = r.stdout;
    for (const w of ["agent-a: idle → ready A1-x", "taking", "agent-a: ready → review (#7)", "merged", "#7", "agent-a: review → done"]) assert.ok(out.includes(w), `${w} in\n${out}`);
    assert.ok(out.indexOf("taking") < out.indexOf("merged") && out.indexOf("merged") < out.indexOf("review → done"), "oldest first");
    assert.ok(!/Desk-Project/.test(out));
    r = deskRun(lead, "log", "--agent", "agent-b");
    assert.equal(r.status, 0); assert.ok(!/agent-a/.test(r.stdout), r.stdout);
    r = deskRun(lead, "log", "--since", "2d"); assert.match(r.stdout, /merged/);
    r = deskRun(lead, "log", "--since", "2099-01-01T00:00:00Z"); assert.equal(r.status, 0); assert.match(r.stdout, /nothing/i);
    r = deskRun(lead, "log", "--limit", "1"); assert.equal(r.stdout.trim().split("\n").length, 1);
    r = deskRun(lead, "log", "--md"); assert.match(r.stdout, /^## Desk log for garden-app/); assert.match(r.stdout, /merged/);
    // an agent's copy reads the same timeline from origin
    r = deskRun(d.copy, "log"); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /merged/);
  } finally { d.done(); }
});

test("desk.mjs notify posts an event once through gh, hands the body over without it, and wait.mjs --leader tells the owner itself", () => {
  const d = deskWithOrigin();
  const lead = join(d.dir, "lead");
  const gh = ghShim(d.dir);
  const withGh = { PATH: `${gh.bin}:${process.env.PATH}` };
  const noGhBin = noGhPath(d.dir);
  const leadWaitIn = (PATH, ...a) => spawnSync(process.execPath, [join(root, "skill/agent-desk/scripts/wait.mjs"), "--leader", "--once", ...a], { cwd: lead, encoding: "utf8", env: { ...process.env, PATH } });
  const leadWait = (...a) => leadWaitIn(withGh.PATH, ...a);
  try {
    let r = deskRun(lead, "notify"); assert.equal(r.status, 0); assert.match(r.stdout, /Notifications: off/);
    r = deskRun(lead, "notify", "blocked", "--agent", "agent-a"); assert.equal(r.status, 1); assert.match(r.stderr, /report/);
    r = deskRun(lead, "notify", "--setup", "--issue", "12"); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /issue #12/); assert.match(r.stdout, /commit and push/);
    d.L("add", "-A"); d.L("commit", "-qm", "notify"); d.L("push", "-q", "origin", "claude/work");
    assert.match(deskRun(lead, "status").stdout, /Notifications: issue #12 \(blocked, silent, asleep, merged, question\)/);
    r = deskRun(d.copy, "report", "blocked", "--brief", "A1-x", "--words", "two approaches failed"); assert.equal(r.status, 0, r.stderr);
    d.L("pull", "-q", "origin", "claude/work");
    // the leader's look tells the owner itself: no line left for the leader to remember to run
    r = leadWait();
    assert.equal(r.status, 0, last(r)); assert.match(last(r), /^fits: help agent-a/);
    assert.match(r.stdout, /^told: Posted on #12: \*\*agent-a is blocked on A1-x/m, r.stdout);
    assert.ok(!/^notify:/m.test(r.stdout), r.stdout);
    assert.equal(gh.calls().length, 1); assert.match(gh.calls()[0], /repos\/owner\/repo\/issues\/12\/comments/); assert.match(gh.calls()[0], /agent-a is blocked on A1-x/); assert.match(gh.calls()[0], /two approaches failed/);
    r = deskRunIn(lead, withGh, "notify", "blocked", "--agent", "agent-a", "--post");
    assert.equal(r.status, 0); assert.match(r.stdout, /already told/); assert.equal(gh.calls().length, 1);
    r = deskRunIn(lead, withGh, "notify", "blocked", "--agent", "agent-a", "--post", "--force"); assert.equal(r.status, 0, r.stderr); assert.equal(gh.calls().length, 2);
    r = deskRunIn(lead, withGh, "notify", "merged", "--brief", "A1-x", "--pr", "#7", "--words", "Next up: B1-y for agent-b.");
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /A1-x \(#7\) is merged/); assert.equal(gh.calls().length, 2, "a preview posts nothing");
    const noGh = noGhPath(d.dir);
    r = deskRunIn(lead, { PATH: noGh }, "notify", "merged", "--brief", "A1-x", "--pr", "#7", "--words", "Next up: B1-y for agent-b.", "--post");
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /GitHub tool/); assert.match(r.stdout, /A1-x \(#7\) is merged/); assert.match(r.stdout, /issue #12/);
    r = deskRunIn(lead, { PATH: noGh }, "notify", "merged", "--brief", "A1-x", "--pr", "#7", "--post"); assert.match(r.stdout, /already told/);
    // a silence: the look posts it itself, once, and the last line stays a wait
    const stale = (name, mins) => writeFileSync(join(lead, `${STATUS_DIR}/${name}.json`), JSON.stringify({ desk: 1, project: "garden-app", agent: name, tool: "antigravity", phase: "working", brief: "A1-x", pr: "", step: "", words: "", at: new Date(Date.now() - mins * 60000).toISOString() }));
    stale("agent-a", 45);
    d.board({});
    r = leadWait();
    assert.equal(r.status, 3, last(r)); assert.match(last(r), /^wait: .*agent-a silent/);
    assert.match(r.stdout, /^told: Posted on #12: \*\*agent-a has been silent for 4[0-9] minutes/m, r.stdout);
    assert.ok(!/^notify:/m.test(r.stdout), r.stdout);
    assert.equal(gh.calls().length, 3); assert.match(gh.calls()[2], /silent for 4[0-9] minutes/);
    r = leadWait(); assert.ok(!/^(notify|told):/m.test(r.stdout), "a silence is told once"); assert.equal(gh.calls().length, 3);
    // with no gh the look hands the comment over to post, once
    stale("agent-b", 31);
    d.board({});
    r = leadWaitIn(noGhBin);
    assert.match(r.stdout, /^notify: .*issue #12/m, r.stdout); assert.match(r.stdout, /agent-b has been silent for 3[0-9] minutes/);
    r = leadWaitIn(noGhBin); assert.ok(!/^notify:/m.test(r.stdout), "handed over once");
    // a post gh refuses is tried again at the next look, and said
    const refusing = join(d.dir, "refuse"); mkdirSync(refusing); writeFileSync(join(refusing, "gh"), "#!/bin/sh\necho 'HTTP 502' >&2\nexit 1\n", { mode: 0o755 });
    writeFileSync(join(lead, `${STATUS_DIR}/codex-a.json`), JSON.stringify({ desk: 1, project: "garden-app", agent: "codex-a", tool: "codex", phase: "working", brief: "C1-z", pr: "", step: "", words: "", at: new Date(Date.now() - 22 * 60000).toISOString() }));
    d.board({});
    r = leadWaitIn(`${refusing}:${process.env.PATH}`);
    assert.match(r.stdout, /^notify: node \.agents\/skills\/agent-desk\/scripts\/desk\.mjs notify silent --agent codex-a --post/m, r.stdout);
    r = leadWait(); assert.match(r.stdout, /^told: Posted on #12: \*\*codex-a has been silent/m, r.stdout);
    // asleep: the stop line comes after the owner is told
    d.L("config", "desk.leader.active", new Date(Date.now() - 61 * 60000).toISOString());
    r = leadWait();
    assert.equal(r.status, 1, last(r)); assert.match(last(r), /^stop: asleep/);
    assert.match(r.stdout, /^told: Posted on #12: \*\*The garden-app desk is asleep/m, r.stdout);
    // a disabled event prints the body and says so, and the events are checked
    r = deskRun(lead, "notify", "--setup", "--issue", "12", "--events", "blocked,silent"); assert.equal(r.status, 0, r.stderr);
    assert.match(deskRun(lead, "status").stdout, /Notifications: issue #12 \(blocked, silent\)/);
    const posted = gh.calls().length;
    r = deskRunIn(lead, withGh, "notify", "asleep", "--post"); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /off/); assert.equal(gh.calls().length, posted);
    d.L("add", "-A"); d.L("commit", "-qm", "events"); d.L("push", "-q", "origin", "claude/work");
    r = leadWait(); assert.ok(!/(notify|told): .*asleep/.test(r.stdout), "a disabled event is told to nobody"); assert.equal(gh.calls().length, posted);
    assert.equal(deskRun(lead, "notify", "--setup", "--issue", "12", "--events", "dancing").status, 1);
    assert.equal(deskRun(lead, "notify", "--setup", "--issue", "0").status, 1);
    r = deskRun(lead, "notify", "--setup", "off"); assert.equal(r.status, 0, r.stderr); assert.match(deskRun(lead, "notify").stdout, /off/);
    assert.equal(deskRun(lead, "notify", "--ref", "claude/work", "--setup", "--issue", "12").status, 2);
  } finally { d.done(); }
});

test("desk.mjs preflight runs desk-check from the agent's copy, writes the report under .git/desk, exits with the check, and with --pr edits the pull request", () => {
  const d = deskWithOrigin();
  try {
    d.C("config", "desk.tool", "antigravity");
    d.C("switch", "-q", "-c", "desk/garden-app/agent-a/A1-x", "origin/claude/work");
    writeFileSync(join(d.copy, "src/a.js"), "export const a = 2;\n");
    d.C("commit", "-qam", "hide drafts from readers\n\nDesk-Project: garden-app\nDesk-Agent: agent-a\nDesk-Brief: A1-x");
    let r = deskRun(d.copy, "preflight", "A1-x");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /desk-check passed/); assert.match(r.stdout, /\.git\/desk\/preflight-A1-x\.md/); assert.match(r.stdout, /1 file/);
    const body = readFileSync(join(d.copy, ".git/desk/preflight-A1-x.md"), "utf8");
    assert.match(body, /\*\*What changed:\*\*/); assert.match(body, /`src\/a\.js`/); assert.match(body, /hide drafts from readers/); assert.match(body, /desk-check passed for garden-app\/A1-x/); assert.match(body, /— agent-a \(Antigravity\) on garden-app, for claude to decide/);
    assert.equal(spawnSync("git", ["status", "--porcelain"], { cwd: d.copy, encoding: "utf8" }).stdout.trim(), "", "nothing tracked is written");
    const gh = ghShim(d.dir);
    r = deskRunIn(d.copy, { PATH: `${gh.bin}:${process.env.PATH}` }, "preflight", "A1-x", "--pr", "7");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const call = gh.calls().find((c) => /pulls\/7/.test(c)); assert.ok(call, gh.calls().join("|"));
    assert.match(call, /PATCH/); assert.match(call, /\[garden-app\/agent-a\] A1-x: Hide drafts/); assert.ok(!/in progress/.test(call)); assert.match(call, /What changed/);
    assert.match(r.stdout, /#7/);
    writeFileSync(join(d.copy, "other.txt"), "x\n"); d.C("add", "other.txt"); d.C("commit", "-qm", "stray\n\nDesk-Project: garden-app\nDesk-Agent: agent-a\nDesk-Brief: A1-x");
    writeFileSync(join(d.copy, "src/a.js"), "export const a = 3;\n");
    r = deskRunIn(d.copy, { PATH: `${gh.bin}:${process.env.PATH}` }, "preflight", "A1-x", "--pr", "7");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const failed = readFileSync(join(d.copy, ".git/desk/preflight-A1-x.md"), "utf8");
    assert.match(failed, /^\*\*desk-check FAILED\*\*/); assert.match(failed, /1 uncommitted change/); assert.match(r.stdout, /not sent/);
    assert.equal(gh.calls().filter((c) => /pulls\/7/.test(c)).length, 1, "a failed check sends nothing");
    r = deskRunIn(d.copy, { PATH: noGhPath(d.dir) }, "preflight", "A1-x", "--no-run"); assert.equal(r.status, 1);
    d.C("checkout", "-q", "src/a.js"); d.C("reset", "-q", "--hard", "HEAD~1");
    r = deskRunIn(d.copy, { PATH: noGhPath(join(d.dir, "two")) }, "preflight", "A1-x", "--pr", "7"); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /GitHub connection|by hand/);
    d.C("config", "--unset", "desk.slot");
    r = deskRun(d.copy, "preflight", "A1-x"); assert.equal(r.status, 2); assert.match(r.stderr, /no name/);
  } finally { d.done(); }
});

// ---- an Antigravity agent's wait is short and never silent, so its machine isn't recreated

test("wait.mjs on Antigravity is one look and out, with no sleeping command, and names the timer; other tools keep the heartbeat", () => {
  // Antigravity moves a command past 10 s into a background stream, and an agent that waits on one
  // which never reports back hangs for good. So there the wait never sleeps: one look, and the
  // agent sets a timer and ends its turn.
  const d = deskWithOrigin();
  const W = join(root, "skill/agent-desk/scripts/wait.mjs");
  try {
    d.C("config", "desk.tool", "antigravity");
    let r = spawnSync(process.execPath, [W], { cwd: d.copy, encoding: "utf8", timeout: 30000 });
    assert.equal(r.status, 3, last(r));
    assert.equal(r.stdout.trim().split("\n").length, 1, r.stdout);
    assert.match(last(r), /^wait: nothing new for agent-a on garden-app/);
    assert.match(last(r), /180-second timer/); assert.match(last(r), /end your turn/);
    assert.ok(!/looking every|still waiting/.test(r.stdout), r.stdout);
    // --for and --every change nothing there: it still never sleeps
    r = spawnSync(process.execPath, [W, "--every", "5", "--for", "30"], { cwd: d.copy, encoding: "utf8", timeout: 30000 });
    assert.equal(r.status, 3, last(r)); assert.ok(!/still waiting/.test(r.stdout));
    // the leader's own look, in Antigravity, is the same
    r = spawnSync(process.execPath, [W, "--leader"], { cwd: join(d.dir, "lead"), encoding: "utf8", timeout: 30000, env: { ...process.env, ANTIGRAVITY_AGENT: "1" } });
    assert.equal(r.status, 3, last(r)); assert.match(last(r), /timer/); assert.ok(!/looking every|still waiting/.test(r.stdout), r.stdout);
    // another tool keeps its schedule and its heartbeat
    d.C("config", "desk.slot", "codex-a"); d.C("config", "desk.tool", "codex");
    r = spawnSync(process.execPath, [W, "--for", "0.001"], { cwd: d.copy, encoding: "utf8" });
    assert.match(r.stdout.split("\n")[0], /^looking every 3 min for 0\.001 min/, r.stdout);
    assert.ok(!/timer/.test(last(r)), last(r));
    r = spawnSync(process.execPath, [W, "--every", "0.01", "--for", "0.02", "--beat", "0.15"], { cwd: d.copy, encoding: "utf8" });
    assert.equal(r.status, 3, last(r));
    assert.ok(r.stdout.split("\n").filter((l) => /^… still waiting/.test(l)).length >= 2, r.stdout);
    assert.ok(!/^… still waiting/.test(d.wait().stdout), "--once never sleeps, so it never beats");
  } finally { d.done(); }
  const step5 = part(read("skill/agent-desk/protocol/agent.md"), "## 5.");
  for (const w of ["Antigravity", "one-shot timer", "180", "end your turn", "no timer", "report stopped", "never sleep"]) assert.ok(step5.includes(w), `agent.md step 5: ${w}`);
  assert.ok(read("skill/agent-desk/templates/guide.md").includes("busy for ever"), "the guide's troubleshooting covers the hanging agent");
  const cfg = desk({ awake: true });
  const promptFor = PROMPTS.agentPrompt;
  assert.match(promptFor(cfg, "agent-a"), /timer/, "an awake Antigravity agent's prompt names the timer");
  assert.ok(!/timer/.test(promptFor(desk({ awake: true, agents: [agent("agent-a", { reviewer: "agent-b", port: 8811 }), desk().agents[1]] }), "agent-a")), "another tool's doesn't");
});

// ---- the Antigravity desktop app


test("an agent's name is saved per worktree: agent.md step 1's commands give a clone and a worktree of it each their own name", () => {
  // Three Antigravity conversations once shared one folder, and Antigravity's Worktree choice (and
  // the leader-started Claude Code agents) make worktrees of one clone, whose plain git config is
  // shared. The step's own commands, run as written, must leave each worktree its own name.
  const agent = read("skill/agent-desk/protocol/agent.md");
  const step = part(agent, "## 1.");
  const block = [...step.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]).find((b) => /desk\.slot <name>/.test(b));
  assert.ok(block, "step 1 has the block that saves the four values");
  assert.match(block, /extensions\.worktreeConfig true/, "the block turns per-worktree config on first");
  assert.match(block, /--worktree desk\.slot <name>/, "the name is written per worktree");
  const dir = mkdtempSync(join(tmpdir(), "desk-wt-"));
  // A build machine has no git identity of its own (Cloud Build's Playwright image refused the
  // commit below), so the commit gets one here, as every other git helper in this file does.
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
  const sh = (cwd, script) => { const r = spawnSync("sh", ["-ec", script], { cwd, encoding: "utf8", env }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  try {
    sh(dir, "git init -q -b work main && cd main && git commit -q --allow-empty -m base && git worktree add -q ../second HEAD");
    const fill = (name) => block.replace(/<project>/g, "garden-app").replace(/<name>/g, name).replace(/<base>/g, "claude/work").replace(/<tool>/g, "antigravity");
    sh(join(dir, "main"), fill("agent-a"));
    sh(join(dir, "second"), fill("agent-b"));
    assert.equal(sh(join(dir, "main"), "git config desk.slot"), "agent-a", "the clone keeps the first name");
    assert.equal(sh(join(dir, "second"), "git config desk.slot"), "agent-b", "the worktree has its own");
    assert.equal(sh(join(dir, "second"), "git config desk.tool"), "antigravity");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a push refusal is read for what it is: a pre-push hook's, a lost race's, or something else", async () => {
  const { pushRefusal } = await import("../skill/agent-desk/scripts/doctor.mjs");
  assert.equal(typeof pushRefusal, "function", "doctor.mjs exports pushRefusal");
  assert.equal(pushRefusal("error: failed to push some refs to 'x'\nerror: hook declined to update refs/heads/claude/work").kind, "hook");
  assert.equal(pushRefusal("Cannot find package 'acorn' imported from scripts/gate.mjs\nerror: failed to push some refs to 'x'\n! [remote rejected] HEAD -> claude/work (pre-push hook declined)").kind, "hook");
  assert.equal(pushRefusal("To x\n ! [rejected] HEAD -> claude/work (fetch first)\nerror: failed to push some refs").kind, "race");
  assert.equal(pushRefusal(" ! [rejected] HEAD -> claude/work (non-fast-forward)").kind, "race");
  assert.equal(pushRefusal(" ! [rejected] HEAD -> claude/work (stale info)").kind, "race");
  assert.equal(pushRefusal("fatal: unable to access 'x': Could not resolve host").kind, "other");
  // A local pre-push hook's refusal carries no "hook declined" (a remote's does): the copy's own core.hooksPath is the tell.
  assert.equal(pushRefusal("Cannot find package 'acorn' imported from scripts/gate.mjs\nerror: failed to push some refs to 'x'", { hooksPath: ".githooks" }).kind, "hook");
  assert.equal(pushRefusal("Cannot find package 'acorn' imported from scripts/gate.mjs\nerror: failed to push some refs to 'x'").kind, "other");
  assert.equal(pushRefusal(" ! [rejected] HEAD -> claude/work (fetch first)", { hooksPath: ".githooks" }).kind, "race", "a race is a race whatever the hooks");
  assert.equal(pushRefusal("").kind, "other");
});

test("desk.mjs report stops at once when this copy's pre-push hook refuses, names the hook and its fix, and never calls it a race", () => {
  const d = deskWithOrigin();
  try {
    d.C("config", "desk.tool", "antigravity");
    const hooks = join(d.dir, "hooks"); mkdirSync(hooks);
    writeFileSync(join(hooks, "pre-push"), `#!/bin/sh\necho ran >> "${join(d.dir, "hook-runs")}"\necho "Cannot find package 'acorn' imported from scripts/multiagents-review-gate.mjs" >&2\nexit 1\n`, { mode: 0o755 });
    d.C("config", "core.hooksPath", hooks);
    const r = deskRun(d.copy, "report", "working", "--brief", "A1-x", "--step", "2: taking");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /pre-push hook/, "it names the hook");
    assert.match(r.stderr, /core\.hooksPath/, "it names the setting");
    assert.match(r.stderr, /git config --unset core\.hooksPath/, "it gives the fix");
    assert.ok(!/another push/.test(r.stderr), `not a race: ${r.stderr}`);
    assert.equal(readFileSync(join(d.dir, "hook-runs"), "utf8").trim().split("\n").length, 1, "one attempt, not three");
    assert.equal(d.C("worktree", "list").split("\n").length, 1, "no worktree is left behind");
    // The doctor and preflight see the setting before any push is tried.
    const doc = deskRun(d.copy, "doctor");
    assert.match(doc.stdout, /core\.hooksPath/); assert.match(doc.stdout, /git config --unset core\.hooksPath/);
    d.C("switch", "-q", "-c", "desk/garden-app/agent-a/A1-x", "origin/claude/work");
    const pf = deskRun(d.copy, "preflight", "A1-x", "--no-run");
    assert.match(pf.stdout + pf.stderr, /core\.hooksPath/, "preflight warns before the push");
    d.C("config", "--unset", "core.hooksPath");
    assert.ok(!/hooksPath/.test(deskRun(d.copy, "doctor").stdout), "quiet once the hooks are off");
  } finally { d.done(); }
});

test("the doctor's finding for a copy with the repository's hooks on says what the desk's pushes meet, and the fix", () => {
  const cfg = desk();
  const f = doctorFindings({ ...bareDoctor, cfg, identity: { slot: "agent-a", project: "garden-app", base: "claude/work", tool: "antigravity", hooksPath: ".githooks" } });
  const hit = f.find((x) => /core\.hooksPath = \.githooks/.test(x.what));
  assert.ok(hit, JSON.stringify(f));
  assert.match(hit.what, /temporary worktree/);
  assert.equal(hit.fix, "git config --unset core.hooksPath (an agent's copy keeps the repository's hooks off; a fresh clone has none)");
  // The bare fixture has no board, which is a finding of its own: only the hooks finding is measured.
  assert.ok(!doctorFindings({ ...bareDoctor, cfg, identity: { slot: "agent-a", project: "garden-app", base: "claude/work", tool: "antigravity", hooksPath: "" } }).some((x) => /hooksPath/.test(x.what)), "no finding with the hooks off");
});

test("a waiting report can be written afresh, so a go or a new conversation moves its time", () => {
  // F: an unchanged report pushes nothing, so an awake agent
  // started fresh and told go kept a waiting report hours old, and the leader read it as silent.
  const d = deskWithOrigin({ awake: true });
  try {
    d.C("config", "desk.tool", "antigravity");
    let r = deskRun(d.copy, "report", "waiting");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    d.L("fetch", "-q", "origin");
    const head1 = d.L("rev-parse", "origin/claude/work");
    const at1 = JSON.parse(d.L("show", `origin/claude/work:${STATUS_DIR}/agent-a.json`)).at;
    r = deskRun(d.copy, "report", "waiting");
    assert.match(r.stdout, /unchanged|already/i, "the plain report still pushes nothing");
    d.L("fetch", "-q", "origin");
    assert.equal(d.L("rev-parse", "origin/claude/work"), head1);
    r = deskRun(d.copy, "report", "waiting", "--fresh");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Pushed/);
    d.L("fetch", "-q", "origin");
    assert.notEqual(d.L("rev-parse", "origin/claude/work"), head1, "--fresh writes the report again");
    const st = JSON.parse(d.L("show", `origin/claude/work:${STATUS_DIR}/agent-a.json`));
    assert.equal(st.phase, "waiting");
    assert.ok(Date.parse(st.at) >= Date.parse(at1), "its time moved");
  } finally { d.done(); }
  const step5 = part(read("skill/agent-desk/protocol/agent.md"), "## 5.");
  assert.ok(step5.includes("report waiting --fresh"), "agent.md step 5 reports afresh on each start");
});

test("an awake agent's wait refreshes a waiting report before it reads as silent, and no more often than half of silence_minutes", async () => {
  const { heartbeatDue } = await import("../skill/agent-desk/scripts/status.mjs");
  const cfg = desk({ awake: true });
  const now = Date.now();
  const waiting = (minsAgo, over = {}) => ({ desk: 1, project: "garden-app", agent: "agent-a", tool: "antigravity", phase: "waiting", brief: "", pr: "", step: "", words: "", at: new Date(now - minsAgo * 60000).toISOString(), ...over });
  assert.equal(heartbeatDue(cfg, waiting(11), now), true, "past half of 20 minutes");
  assert.equal(heartbeatDue(cfg, waiting(5), now), false, "fresh enough");
  assert.equal(heartbeatDue(cfg, waiting(11, { phase: "working" }), now), false, "only a waiting report is a heartbeat's");
  assert.equal(heartbeatDue(desk({ awake: false }), waiting(11), now), false, "a sleeping agent isn't read for silence");
  assert.equal(heartbeatDue(desk({ awake: true, silence_minutes: 60 }), waiting(11), now), false, "half of the desk's own window");
  const d = deskWithOrigin({ awake: true });
  const lead = join(d.dir, "lead");
  const put = (minsAgo) => { mkdirSync(join(lead, STATUS_DIR), { recursive: true }); writeFileSync(join(lead, STATUS_DIR, "agent-a.json"), JSON.stringify(waiting(minsAgo))); d.L("add", "-A"); d.L("commit", "-qm", "status"); d.L("push", "-q", "origin", "claude/work"); };
  try {
    d.C("config", "desk.tool", "antigravity");
    put(2);
    let r = d.wait();
    assert.equal(r.status, 3, last(r));
    d.L("fetch", "-q", "origin");
    assert.equal(JSON.parse(d.L("show", `origin/claude/work:${STATUS_DIR}/agent-a.json`)).at, waiting(2).at, "a fresh report is left alone");
    put(12);
    r = d.wait();
    assert.equal(r.status, 3, last(r));
    assert.match(last(r), /refreshed/, "the wait says it refreshed the report");
    d.L("fetch", "-q", "origin");
    const st = JSON.parse(d.L("show", `origin/claude/work:${STATUS_DIR}/agent-a.json`));
    assert.equal(st.phase, "waiting");
    assert.ok(Date.parse(st.at) > now - 60000, `the report's time moved: ${st.at}`);
    assert.match(d.L("log", "-1", "--format=%B", "origin/claude/work"), /Desk-Agent: agent-a/);
    // The leader no longer reads it as silent.
    const lw = spawnSync(process.execPath, [join(root, "skill/agent-desk/scripts/wait.mjs"), "--leader", "--once"], { cwd: lead, encoding: "utf8" });
    assert.ok(!/silent/.test(last(lw)), last(lw));
  } finally { d.done(); }
});

// a new brief never inherits the old brief's pull request (`set agent-a done`, then
// `set agent-a ready --brief B2-…` once left B1a's pull request on the new row, and validate passed it;
// an awake agent could have read it as its B2 pull request).
test("updateRow: a different --brief clears the row's pull request; the same brief, or none, keeps it", () => {
  const cfg = desk();
  const rows = { "agent-a": { state: "done", brief: "B1a", branch: "desk/garden-app/agent-a/B1a", pr: "#32", notes: "" } };
  assert.equal(updateRow(rows, cfg, "agent-a", { state: "ready", brief: "B2" })["agent-a"].pr, "", "a new brief starts with no pull request");
  assert.equal(updateRow(rows, cfg, "agent-a", { state: "ready", brief: "B1a" })["agent-a"].pr, "#32", "the same brief keeps it");
  assert.equal(updateRow(rows, cfg, "agent-a", { state: "in-progress" })["agent-a"].pr, "#32", "no --brief keeps it");
  assert.equal(updateRow(rows, cfg, "agent-a", { state: "review", brief: "B2", pr: "240" })["agent-a"].pr, "#240", "a given --pr wins");
});

test("boardProblems: one pull request on two rows, or one the agent's own report puts on another brief, is a problem", () => {
  const cfg = desk();
  const briefOf = (id) => ({ slot: id.startsWith("B1a") || id === "B2" ? "agent-a" : "agent-b", base: cfg.work_branch });
  const row = (brief, pr, slot = "agent-a") => ({ state: "ready", brief, branch: `desk/garden-app/${slot}/${brief}`, pr, notes: "" });
  const idle = Object.fromEntries(cfg.agents.map((a) => [a.name, { state: "idle", brief: "", branch: "", pr: "", notes: "" }]));
  const board = (slots) => ({ project: cfg.project, base: cfg.work_branch, slots: { ...idle, ...slots } });
  const two = boardProblems(board({ "agent-a": row("B2", "#32"), "agent-b": row("B1b", "#32", "agent-b") }), briefOf, cfg);
  assert.equal(two.filter((x) => /#32/.test(x)).length, 1, two.join("; "));
  assert.match(two.join("\n"), /agent-a.*agent-b.*#32|agent-b.*agent-a.*#32/);
  const reports = { "agent-a": { desk: 1, project: cfg.project, agent: "agent-a", phase: "pushed", brief: "B1a", pr: "#32", at: new Date().toISOString() } };
  const stale = boardProblems(board({ "agent-a": row("B2", "#32") }), briefOf, cfg, { reports });
  assert.equal(stale.length, 1, stale.join("; "));
  assert.match(stale[0], /agent-a.*#32.*B2.*report says #32 is B1a/);
  assert.match(stale[0], /--pr/);
  assert.deepEqual(boardProblems(board({ "agent-a": row("B1a", "#32") }), briefOf, cfg, { reports }), [], "the report's own brief is fine");
  assert.deepEqual(boardProblems(board({ "agent-a": row("B2", "") }), briefOf, cfg, { reports }), [], "no pull request, nothing to say");
});

test("desk.mjs set: the leader's sequence (done, then ready with a new brief) leaves no pull request on the new row, says what it cleared, and validate refuses one put back", () => {
  const d = deskWithOrigin();
  try {
    const lead = join(d.dir, "lead");
    writeFileSync(join(lead, ASSIGNMENTS, "A2-w.md"), good({ id: "A2-w", slot: "agent-a", reviewer: "agent-b", branch: "desk/garden-app/agent-a/A2-w", port: "8811", lists: { may_change: ["src/"], frozen: [], checks: ["true"] } }));
    let r = deskRun(lead, "set", "agent-a", "review", "--brief", "A1-x", "--pr", "32");
    assert.equal(r.status, 0, last(r));
    r = deskRun(lead, "set", "agent-a", "done");
    assert.equal(r.status, 0, last(r));
    assert.equal(parseBoard(readFileSync(join(lead, "agents/desk/garden-app/board.md"), "utf8")).slots["agent-a"].pr, "#32", "done keeps the pull request, as before");
    r = deskRun(lead, "set", "agent-a", "ready", "--brief", "A2-w");
    assert.equal(r.status, 0, last(r));
    const row = parseBoard(readFileSync(join(lead, "agents/desk/garden-app/board.md"), "utf8")).slots["agent-a"];
    assert.equal(row.brief, "A2-w"); assert.equal(row.pr, "", "the new brief has no pull request yet");
    assert.match(r.stdout, /#32 was A1-x's and is cleared/);
    assert.ok(!/with A2-w \(#32\)/.test(r.stdout), r.stdout);
    r = deskRun(lead, "validate"); assert.equal(r.status, 0, last(r));
    // The same brief keeps it: review with --pr, then changes without.
    r = deskRun(lead, "set", "agent-a", "review", "--pr", "#240"); assert.equal(r.status, 0, last(r));
    r = deskRun(lead, "set", "agent-a", "changes"); assert.equal(r.status, 0, last(r));
    assert.equal(parseBoard(readFileSync(join(lead, "agents/desk/garden-app/board.md"), "utf8")).slots["agent-a"].pr, "#240");
    // A pull request the agent's own report puts on another brief: set and validate both refuse it.
    mkdirSync(join(lead, STATUS_DIR), { recursive: true });
    writeFileSync(join(lead, STATUS_DIR, "agent-a.json"), JSON.stringify({ desk: 1, project: "garden-app", agent: "agent-a", phase: "pushed", brief: "A1-x", pr: "#32", at: new Date().toISOString() }) + "\n");
    r = deskRun(lead, "set", "agent-a", "review", "--brief", "A2-w", "--pr", "32");
    assert.equal(r.status, 1, last(r)); assert.match(r.stderr, /report says #32 is A1-x/);
    const cfg = parseConfig(readFileSync(join(lead, CONFIG_PATH), "utf8"));
    const bad = updateRow(parseBoard(readFileSync(join(lead, "agents/desk/garden-app/board.md"), "utf8")).slots, cfg, "agent-a", { state: "review", brief: "A2-w", pr: "32" });
    writeFileSync(join(lead, "agents/desk/garden-app/board.md"), renderBoard(cfg, bad));
    r = deskRun(lead, "validate");
    assert.equal(r.status, 1, last(r)); assert.match(r.stdout, /report says #32 is A1-x/);
  } finally { d.done(); }
});

// `desk.mjs refresh` prints the card /agent-desk refresh reads back: who you are, what the
// board and your report say, where you are in the steps, and the rules, all from the copy and the
// work branch, never from memory.
test("refreshCard: an agent's card names who it is, its row, its report, its step and the rules from AGENTS.md", async () => {
  const { refreshCard } = await import("../skill/agent-desk/scripts/refresh.mjs");
  const cfg = desk();
  const agents = `# Rules\n\n<!-- agent-desk:start -->\n## The desk\n\n### Never, as a desk agent\n\n- Never push to \`main\`.\n\n### Always, as a desk agent\n\n- Run preflight.\n<!-- agent-desk:end -->\n\n## Other\n`;
  const base = {
    cfg, identity: { slot: "agent-a", project: "garden-app", base: "claude/work", tool: "antigravity", hooksPath: "" },
    row: { state: "in-progress", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#7", notes: "" },
    brief: { id: "A1-x", title: "Hide drafts", slot: "agent-a", may_change: ["src/"], frozen: ["tests/a.test.mjs"], checks: ["npm test"] },
    report: { desk: 1, agent: "agent-a", phase: "working", brief: "A1-x", pr: "#7", step: "4: the job", at: new Date(Date.now() - 5 * 60000).toISOString() },
    branch: { onOrigin: true, ahead: 2 }, dirty: false, agentsMd: agents, now: new Date(),
  };
  const lines = refreshCard(base).join("\n");
  assert.match(lines, /You are agent-a on garden-app, working into claude\/work, in antigravity/);
  assert.match(lines, /Reviewer:\s+agent-b/); assert.match(lines, /Leader: claude/);
  assert.match(lines, /The board says: in-progress with A1-x \(Hide drafts\), pull request #7/);
  assert.match(lines, /Your last report: working 4: the job, 5 min ago/);
  assert.match(lines, /desk\/garden-app\/agent-a\/A1-x: on origin, 2 commits ahead of claude\/work/);
  assert.match(lines, /This copy: clean/); assert.match(lines, /core\.hooksPath: off/);
  assert.match(lines, /may_change: src\//); assert.match(lines, /frozen: tests\/a\.test\.mjs/); assert.match(lines, /checks: npm test/);
  assert.match(lines, /Where you are: take\.md step 4 \(4: the job\)/);
  assert.match(lines, /Next: /);
  assert.match(lines, /### Never, as a desk agent/); assert.match(lines, /Never push to `main`/); assert.match(lines, /### Always, as a desk agent/);
  assert.ok(!lines.includes("## Other"), "only the desk block's rules, not the rest of AGENTS.md");
  assert.match(lines, /git show origin\/claude\/work:\.agents\/skills\/agent-desk\/protocol\/take\.md/);
  assert.ok(refreshCard(base).every((l) => l.length <= 120), "lines read in a chat");
  // A report on another brief than the row: trust the board and origin, report again.
  const stale = refreshCard({ ...base, report: { ...base.report, brief: "A0-old", pr: "#3" } }).join("\n");
  assert.match(stale, /report says A0-old #3.*board says A1-x #7.*trust the board/i);
  assert.match(stale, /report again/);
  // Pushed: the leader's turn. Blocked: take.md's stop. No report: agent.md step 3.
  assert.match(refreshCard({ ...base, row: { ...base.row, state: "review" }, report: { ...base.report, phase: "pushed", step: undefined } }).join("\n"), /Where you are: take\.md step 6 to 7.*leader's turn/);
  assert.match(refreshCard({ ...base, report: { ...base.report, phase: "blocked", words: "two approaches failed" } }).join("\n"), /Where you are: take\.md step 4, blocked \(two approaches failed\)/);
  assert.match(refreshCard({ ...base, report: null }).join("\n"), /Your last report: none yet/);
  assert.match(refreshCard({ ...base, report: null }).join("\n"), /Where you are: agent\.md step 3/);
  assert.match(refreshCard({ ...base, report: { ...base.report, phase: "reviewing", pr: "#8", step: undefined } }).join("\n"), /Where you are: review\.md \(#8\)/);
  assert.match(refreshCard({ ...base, branch: { onOrigin: false, ahead: 0 }, dirty: true, identity: { ...base.identity, hooksPath: ".githooks" } }).join("\n"), /not on origin yet[\s\S]*has unsaved changes[\s\S]*core\.hooksPath = \.githooks/);
  // Moved: desk.json names another tool for this agent.
  const moved = refreshCard({ ...base, identity: { ...base.identity, tool: "codex" } }).join("\n");
  assert.match(moved, /This conversation is finished: agent-a now works in antigravity/);
});

test("refreshCard --leader: the leader's card names every agent's row and report, the awake state, where it is in lead.md and its rules", async () => {
  const { refreshCard } = await import("../skill/agent-desk/scripts/refresh.mjs");
  const cfg = desk();
  const leadMd = `# Lead the desk\n\nYou are the leader named in \`agents/desk/garden-app/desk.json\`. You merge into the work branch only, never \`main\`.\n\n## Commands\n\n| a | b |\n`;
  const lines = refreshCard({
    cfg, leader: true, identity: { slot: "", project: "", base: "", tool: "", hooksPath: "" },
    rows: { "agent-a": { state: "review", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#7", notes: "" }, "agent-b": { state: "ready", brief: "B1-y", branch: "desk/garden-app/agent-b/B1-y", pr: "", notes: "" } },
    reports: { "agent-a": { desk: 1, agent: "agent-a", phase: "pushed", brief: "A1-x", pr: "#7", at: new Date(Date.now() - 3 * 60000).toISOString() } },
    leaderReport: { desk: 1, agent: "claude", phase: "awake", at: new Date(Date.now() - 60000).toISOString() },
    leadMd, now: new Date(),
  }).join("\n");
  assert.match(lines, /You lead garden-app, working into claude\/work/);
  assert.match(lines, /agent-a: review with A1-x #7; says pushed/);
  assert.match(lines, /agent-b: ready with B1-y; no report yet/);
  assert.match(lines, /Your last report: awake, 1 min ago/);
  assert.match(lines, /Where you are: lead\.md "Checking the desk"/);
  assert.match(lines, /Next:[^\n]*#7/);
  assert.match(lines, /merge into the work branch only, never `main`/);
  assert.match(lines, /git show origin\/claude\/work:\.agents\/skills\/agent-desk\/protocol\/lead\.md/);
});

test("desk.mjs refresh prints an agent's card from its copy and origin, the leader's with --leader, writes nothing, and refuses a copy with no name", () => {
  const d = deskWithOrigin();
  try {
    const lead = join(d.dir, "lead");
    d.board({ "agent-a": { state: "in-progress", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "", notes: "" } });
    d.C("pull", "-q", "origin", "claude/work");
    let r = deskRun(d.copy, "report", "working", "--brief", "A1-x", "--step", "4: the job");
    assert.equal(r.status, 0, last(r));
    const head = d.L("rev-parse", "origin/claude/work");
    r = deskRun(d.copy, "refresh");
    assert.equal(r.status, 0, last(r));
    assert.match(r.stdout, /You are agent-a on garden-app, working into claude\/work/);
    assert.match(r.stdout, /The board says: in-progress with A1-x/);
    assert.match(r.stdout, /Your last report: working 4: the job/);
    assert.match(r.stdout, /Where you are: take\.md step 4/);
    assert.match(r.stdout, /### Never, as a desk agent/);
    assert.match(r.stdout, /may_change: src\//);
    assert.equal(d.L("rev-parse", "origin/claude/work"), head, "refresh pushes nothing");
    assert.equal(d.C("status", "--porcelain"), "", "refresh writes nothing in the copy");
    d.L("pull", "-q", "origin", "claude/work");
    r = deskRun(lead, "refresh", "--leader");
    assert.equal(r.status, 0, last(r));
    assert.match(r.stdout, /You lead garden-app/); assert.match(r.stdout, /agent-a: in-progress with A1-x; says working/);
    assert.match(r.stdout, /Where you are: lead\.md/);
    // A clone with no name and not the leader's checkout.
    const other = join(d.dir, "other");
    assert.equal(spawnSync("git", ["clone", "-q", "-b", "claude/work", join(d.dir, "origin.git"), other], { encoding: "utf8" }).status, 0);
    r = deskRun(other, "refresh");
    assert.equal(r.status, 1, last(r)); assert.match(r.stderr, /no agent's name \(git config desk\.slot\)/); assert.match(r.stderr, /prompts <name>/); assert.match(r.stderr, /--leader/);
  } finally { d.done(); }
});

// ---- one designated agent may start subagents (adversarial review and checks only), and
// each tool has four models with a role each. The modules are imported inside the tests, so a missing
// one fails these tests alone.

test("models.mjs names four models per tool with a role each, the default subagent models are ones a subagent can run, and the table reads in words", async () => {
  const { MODELS, ROLES, DEFAULT_SUBAGENT_MODELS, modelRow, modelWords } = await import("../skill/agent-desk/scripts/models.mjs");
  assert.deepEqual(ROLES, ["plan", "code", "review", "checks", "other"]);
  for (const tool of ["claude-code", "codex", "antigravity"]) {
    assert.equal(MODELS[tool].length, 4, `${tool}: four models`);
    for (const m of MODELS[tool]) {
      assert.match(m.id, /^[a-z0-9.-]+$/, `${tool}: ${m.id} is a short id`);
      assert.ok(m.name && m.set && Array.isArray(m.roles) && m.roles.length && m.roles.every((r) => ROLES.includes(r)), `${tool}: ${m.id} has a name, a value the tool takes and roles`);
    }
    for (const role of ROLES) assert.ok(MODELS[tool].some((m) => m.roles.includes(role)), `${tool}: a model for ${role}`);
    const d = DEFAULT_SUBAGENT_MODELS[tool];
    for (const kind of ["review", "checks"]) {
      const row = modelRow(tool, d[kind]);
      assert.ok(row && row.subagent !== false, `${tool}'s default ${kind} model ${d[kind]} is one a subagent can run`);
      assert.ok(row.roles.includes(kind), `${tool}'s default ${kind} model has the role ${kind}`);
    }
    const words = modelWords(tool);
    for (const m of MODELS[tool]) assert.ok(words.includes(m.id) && words.includes(m.name), `${tool}: the words name ${m.id}`);
  }
  assert.deepEqual(MODELS.other, [], "another tool takes any short name");
  // The owner's example: in Claude Code, Opus 5.5 plans, Sonnet 5.5 codes, Haiku 5.5 does the rest.
  assert.ok(modelRow("claude-code", "opus-5.5").roles.includes("plan"));
  assert.ok(modelRow("claude-code", "sonnet-5.5").roles.includes("code"));
  assert.ok(modelRow("claude-code", "haiku-5.5").roles.includes("other") && modelRow("claude-code", "haiku-5.5").roles.includes("checks"));
  assert.equal(modelRow("claude-code", "opus-5.5").set, "opus", "Claude Code's subagent model field takes the alias");
  assert.equal(modelRow("codex", "gpt-6-luna").set, "gpt-6-luna", "Codex takes the model id");
  assert.equal(modelRow("antigravity", "gemini-4-argon").set, "pro", "Antigravity subagents take a tier");
  assert.equal(modelRow("antigravity", "gemini-3.8-flash").set, "flash");
  assert.equal(modelRow("antigravity", "claude-opus-5.5").subagent, false, "Antigravity's subagents run on Gemini tiers only");
  assert.equal(modelRow("codex", "opus-5.5"), null);
  assert.equal(modelRow("other", "anything"), null);
});

test("desk.json's subagents: present means allowed, the template gives the first agent two for review and checks, and validate refuses the rest", async () => {
  const { subagentsOf, SUBAGENT_SCOPES, DEFAULT_SUBAGENTS, MAX_SUBAGENTS } = await import("../skill/agent-desk/scripts/config.mjs");
  assert.deepEqual(SUBAGENT_SCOPES, ["review", "checks"]);
  assert.equal(DEFAULT_SUBAGENTS, 2);
  assert.equal(MAX_SUBAGENTS, 4);
  const tpl = JSON.parse(read("skill/agent-desk/templates/desk.json"));
  assert.deepEqual(tpl.agents[0].subagents, { max: 2, scope: ["review", "checks"] }, "the first agent may start two, for review and checks");
  assert.equal(tpl.agents[1].subagents, undefined, "the second may not");
  assert.deepEqual(configProblems(tpl), []);
  const cfg = desk();
  const [a, b] = cfg.agents;
  assert.equal(subagentsOf(cfg, a), null, "absent is not allowed");
  const on = { ...a, subagents: { max: 2, scope: ["review", "checks"] } };
  assert.deepEqual(configProblems(desk({ agents: [on, b] })), []);
  assert.deepEqual(subagentsOf(desk({ agents: [on, b] }), on), { max: 2, scope: ["review", "checks"], models: { review: "gemini-4-argon", checks: "gemini-3.8-flash" } }, "the models default to the tool's");
  assert.deepEqual(subagentsOf(desk({ agents: [on, b] }), { ...on, subagents: { max: 1, scope: ["checks"] } }).models, { checks: "gemini-3.8-flash" }, "only the kinds in scope get a model");
  const sub = (s, tool = a.tool) => configProblems(desk({ agents: [{ ...a, tool, subagents: s }, b] }));
  says(sub("yes"), "subagents");
  says(sub({ max: 5, scope: ["review"] }), "max");
  says(sub({ max: 0, scope: ["review"] }), "max");
  says(sub({ max: 2, scope: [] }), "scope");
  says(sub({ max: 2, scope: ["deploy"] }), "scope");
  says(sub({ max: 2, scope: ["review", "review"] }), "scope");
  says(sub({ max: 2, scope: ["review"], models: { checks: "gemini-3.8-flash" } }), "checks");
  let p = sub({ max: 2, scope: ["review"], models: { review: "claude-opus-5.5" } });
  says(p, "claude-opus-5.5"); says(p, "gemini-4-argon");
  p = sub({ max: 1, scope: ["review"], models: { review: "opus-5.5" } }, "codex");
  says(p, "opus-5.5"); says(p, "gpt-6.1-sol");
  assert.deepEqual(sub({ max: 1, scope: ["review"], models: { review: "opus-5.5" } }, "claude-code"), []);
  assert.deepEqual(sub({ max: 1, scope: ["checks"], models: { checks: "my-own-model" } }, "other"), [], "another tool takes any short name");
  says(sub({ max: 1, scope: ["checks"], models: { checks: "" } }, "other"), "checks");
});

test("subagentFiles gives one read-only definition per tool and kind an allowed agent needs, in each tool's own format, and none when nobody is allowed", async () => {
  const { subagentFiles } = await import("../skill/agent-desk/scripts/config.mjs");
  assert.deepEqual(subagentFiles(desk()), []);
  const cfg = desk({ agents: [
    { ...desk().agents[0], tool: "claude-code", subagents: { max: 2, scope: ["review", "checks"] } },
    { ...desk().agents[1], tool: "codex", subagents: { max: 1, scope: ["review"] } },
    agent("gem-c", { tool: "antigravity", reviewer: "agent-a", port: 8841, subagents: { max: 2, scope: ["review", "checks"] } }),
  ] });
  const files = subagentFiles(cfg);
  const by = Object.fromEntries(files.map((f) => [f.file, f]));
  assert.deepEqual(Object.keys(by).sort(), [".agents/agents/desk-checks.md", ".agents/agents/desk-review.md", ".claude/agents/desk-checks.md", ".claude/agents/desk-review.md", ".codex/agents/desk-review.toml"]);
  for (const f of files) { assert.ok(f.tools, `${f.file} says whose it is`); assert.ok(f.ok(f.text), `${f.file} reads itself as current`); assert.ok(!f.ok("stale\n"), `${f.file} reads a stale copy as drift`); }
  const cr = by[".claude/agents/desk-review.md"].text;
  assert.match(cr, /^name: desk-review$/m); assert.match(cr, /^model: opus$/m); assert.match(cr, /^tools: Read, Grep, Glob$/m);
  assert.ok(cr.includes(".agents/skills/agent-desk/protocol/subagent.md") && cr.includes("origin/<the work branch>") && !cr.includes("garden-app"), "it reads its steps fresh from the work branch its agent names, and is no one project's");
  assert.ok(/never/i.test(cr) && cr.includes("push") && cr.includes("commit"), "it says what it never does");
  const cc = by[".claude/agents/desk-checks.md"].text;
  assert.match(cc, /^model: haiku$/m); assert.match(cc, /^tools: Read, Grep, Glob, Bash$/m);
  const cx = by[".codex/agents/desk-review.toml"].text;
  assert.match(cx, /^name = "desk-review"$/m); assert.match(cx, /^model = "gpt-6\.1-sol"$/m); assert.match(cx, /^model_reasoning_effort = "high"$/m);
  assert.match(cx, /^shell_tool = false$/m, "a Codex review subagent has no shell"); assert.match(cx, /^developer_instructions = /m);
  const ar = by[".agents/agents/desk-review.md"].text;
  assert.match(ar, /^subagent: true$/m); assert.match(ar, /^model: pro$/m); assert.match(ar, /^tools:\n  - read$/m, "Antigravity's reviewer reads only");
  const ac = by[".agents/agents/desk-checks.md"].text;
  assert.match(ac, /^model: flash$/m); assert.ok(!/^tools:/m.test(ac), "the checks subagent's tools aren't narrowed: it runs commands");
});

test("an allowed agent's prompt names its subagents, its card says so, and a self-reviewed pull request waits for the leader alone", async () => {
  const { agentPrompt, nextStep } = await import("../skill/agent-desk/scripts/prompts.mjs");
  const { refreshCard } = await import("../skill/agent-desk/scripts/refresh.mjs");
  const cfg = desk({ agents: [{ ...desk().agents[0], subagents: { max: 2, scope: ["review", "checks"] } }, desk().agents[1]] });
  const p = agentPrompt(cfg, "agent-a");
  for (const w of ["2 subagents", "review", "checks", "gemini-4-argon", "gemini-3.8-flash", ".agents/skills/agent-desk/protocol/subagent.md", "never"]) assert.ok(p.includes(w), `prompt: ${w}`);
  assert.ok(!agentPrompt(cfg, "agent-b").includes("subagent"), "an agent without them hears nothing of them");
  assert.ok(!agentPrompt(desk(), "agent-a").includes("subagent"));
  const row = { state: "review", brief: "A1-x", pr: "#7" };
  const n = nextStep(cfg, "agent-a", row);
  assert.match(n, /subagent/); assert.match(n, /\/agent-desk lead garden-app check/); assert.ok(!n.includes("agent-b"), "the reviewer agent isn't waited for");
  assert.match(nextStep(desk(), "agent-a", row), /agent-b/, "without subagents the reviewer agent reviews");
  const card = (c, slot) => refreshCard({ cfg: c, identity: { slot, base: "claude/work", tool: "antigravity" }, row: { state: "idle" }, brief: null, report: null, branch: { onOrigin: false, ahead: 0 }, dirty: false, agentsMd: "" }).join("\n");
  assert.match(card(cfg, "agent-a"), /Subagents: up to 2, for review and checks, on gemini-4-argon \(review\) and gemini-3\.8-flash \(checks\)/);
  assert.match(card(cfg, "agent-b"), /Subagents: none/);
});

test("the doctor finds a subagent definition that is missing or stale in this copy, with the installer as the fix", () => {
  const cfg = desk({ agents: [{ ...desk().agents[0], subagents: { max: 2, scope: ["review", "checks"] } }, desk().agents[1]] });
  // A board in step with desk.json, so the only finding can be the definition's.
  const run = (subagents) => doctorFindings({ ...bareDoctor, cfg, boardText: renderBoard(cfg, {}), subagents });
  let f = run([{ file: ".agents/agents/desk-review.md", exists: false, ok: false }]);
  assert.equal(f.length, 1); assert.ok(f[0].what.includes(".agents/agents/desk-review.md")); assert.ok(f[0].fix.includes("install.mjs"));
  f = run([{ file: ".agents/agents/desk-review.md", exists: true, ok: false }]);
  assert.equal(f.length, 1); assert.ok(f[0].what.includes("desk-review.md"));
  assert.deepEqual(run([{ file: ".agents/agents/desk-review.md", exists: true, ok: true }]), []);
  assert.deepEqual(doctorFindings({ ...bareDoctor, cfg, boardText: renderBoard(cfg, {}) }), [], "no list given: nothing judged");
});

test("desk.mjs subagents switches an agent's subagents on and off and writes the definitions, models prints the table, and wait.mjs leaves a self-reviewed pull request to the leader", () => {
  const d = deskWithOrigin();
  const lead = join(d.dir, "lead");
  const cfgAt = () => JSON.parse(readFileSync(join(lead, CONFIG_PATH), "utf8"));
  try {
    let r = deskRun(lead, "subagents", "agent-a", "on");
    assert.equal(r.status, 0, last(r));
    assert.deepEqual(cfgAt().agents[0].subagents, { max: 2, scope: ["review", "checks"] });
    assert.equal(cfgAt().agents[1].subagents, undefined);
    assert.match(r.stdout, /agent-a may start up to 2 subagents/);
    assert.match(r.stdout, /\.agents\/agents\/desk-review\.md/, "it says which definitions it wrote");
    assert.ok(existsSync(join(lead, ".agents/agents/desk-review.md")) && existsSync(join(lead, ".agents/agents/desk-checks.md")), "an Antigravity agent's definitions are written");
    assert.match(readFileSync(join(lead, ".agents/agents/desk-review.md"), "utf8"), /^model: pro$/m);
    assert.equal(deskRun(lead, "validate").status, 0, last(deskRun(lead, "validate")));
    r = deskRun(lead, "subagents", "agent-a", "on", "--max", "3", "--scope", "review", "--review-model", "gemini-4-argon");
    assert.equal(r.status, 0, last(r));
    assert.deepEqual(cfgAt().agents[0].subagents, { max: 3, scope: ["review"], models: { review: "gemini-4-argon" } });
    r = deskRun(lead, "subagents", "agent-a", "on", "--max", "9");
    assert.equal(r.status, 1, last(r)); assert.match(last(r), /max/);
    r = deskRun(lead, "subagents", "agent-a", "on", "--review-model", "claude-opus-5.5");
    assert.equal(r.status, 1, last(r)); assert.match(last(r), /gemini-4-argon/, "the refusal names the tool's models");
    assert.deepEqual(cfgAt().agents[0].subagents, { max: 3, scope: ["review"], models: { review: "gemini-4-argon" } }, "a refused change writes nothing");
    r = deskRun(lead, "subagents", "nobody", "on");
    assert.equal(r.status, 1, last(r)); assert.match(last(r), /nobody/);
    r = deskRun(lead, "subagents", "agent-a", "off");
    assert.equal(r.status, 0, last(r));
    assert.equal(cfgAt().agents[0].subagents, undefined);
    assert.equal(deskRun(lead, "validate").status, 0);
    r = deskRun(lead, "models", "claude-code");
    assert.equal(r.status, 0, last(r));
    for (const w of ["opus-5.5", "sonnet-5.5", "haiku-5.5", "plan", "code", "checks"]) assert.ok(r.stdout.includes(w), `models claude-code: ${w}`);
    assert.ok(!r.stdout.includes("gpt-6"), "one tool asked, one tool shown");
    r = deskRun(lead, "models");
    for (const w of ["Claude Code", "Codex", "Antigravity", "gpt-6-luna", "gemini-3.8-flash"]) assert.ok(r.stdout.includes(w), `models: ${w}`);
    assert.equal(deskRun(lead, "models", "vim").status, 1);
    // agent-b reviews its own work with a subagent: its pull request isn't offered to agent-a, its ring reviewer.
    // (pushAs commits whatever the leader's clone holds uncommitted onto the agent's branch, so the desk.json change comes after it.)
    d.pushAs("agent-b", "B1-y");
    d.rewrite((c) => ({ ...c, agents: c.agents.map((a) => a.name === "agent-b" ? { ...a, subagents: { max: 2, scope: ["review", "checks"] } } : a) }));
    d.board({ "agent-b": { state: "review", brief: "B1-y", branch: "desk/garden-app/agent-b/B1-y", pr: "#8", notes: "" } });
    r = d.wait();
    assert.equal(r.status, 3, last(r));
    assert.match(r.stdout, /subagent/, "the wait says why: #8 came with agent-b's subagent review");
    d.rewrite((c) => ({ ...c, agents: c.agents.map((a) => a.name === "agent-b" ? { ...a, subagents: { max: 2, scope: ["checks"] } } : a) }));
    d.board({ "agent-b": { state: "review", brief: "B1-y", branch: "desk/garden-app/agent-b/B1-y", pr: "#8", notes: "" } });
    r = d.wait();
    assert.equal(r.status, 0, last(r));
    assert.match(last(r), /^fits: review #8\b/, "subagents for checks alone leave the review to the ring");
  } finally { d.done(); }
});

// ---- the suite's parts, the board kept in step, handing a brief on, shapes, the queue, shared lists,
// pushes that retry, and reports held to the diff. Each test loads its new module inside it, so one missing piece reddens
// its own tests and no other.

const leadOf = (d) => join(d.dir, "lead");
const putIn = (dir, p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };
const reportFor = (agent, phase, brief, pr) => JSON.stringify({ desk: 1, project: "garden-app", agent, tool: "antigravity", phase, brief, pr, step: "", words: "", at: new Date().toISOString() }, null, 2) + "\n";
const leaderWait = (d, ...a) => spawnSync(process.execPath, [join(root, "skill/agent-desk/scripts/wait.mjs"), "--leader", "--once", ...a], { cwd: leadOf(d), encoding: "utf8" });

test("desk.json's suite names the whole test command's parts, and shared_lists the files nobody holds", () => {
  assert.deepEqual(configProblems(desk({ suite: ["npm run test:unit", "npm run test:e2e"], shared_lists: [{ file: "public/list.json" }, { file: "src/map.js", rebuild: "node scripts/build-map.mjs" }] })), []);
  says(configProblems(desk({ suite: "npm test" })), "suite");
  says(configProblems(desk({ suite: [] })), "suite");
  says(configProblems(desk({ suite: ["x".repeat(400)] })), "suite");
  says(configProblems(desk({ shared_lists: [{ file: "../outside.json" }] })), "shared_lists");
  says(configProblems(desk({ shared_lists: [{ file: "a.json", rebuild: 3 }] })), "shared_lists");
  says(configProblems(desk({ shared_lists: "a.json" })), "shared_lists");
});

test("suite.mjs reads node --test's counts and its failing files, top level only", async () => {
  const { nodeCounts, failingFiles } = await import("../skill/agent-desk/scripts/suite.mjs");
  assert.deepEqual(nodeCounts("ok 1 - a\n# tests 5\n# suites 0\n# pass 4\n# fail 1\n"), { tests: 5, pass: 4, fail: 1 });
  assert.equal(nodeCounts("all good\n"), null);
  const out = "not ok 1 - /repo/tests/a.test.mjs\n  ---\n    not ok 1 - a subtest\nok 2 - /repo/tests/b.test.mjs\nnot ok 3 - tests/c.test.mjs\n";
  assert.deepEqual(failingFiles(out, "/repo"), ["tests/a.test.mjs", "tests/c.test.mjs"]);
});

test("desk.mjs suite runs every part to the end, and with --brief an open brief's own frozen test is expected red", () => {
  const d = deskWithOrigin();
  const lead = leadOf(d);
  try {
    d.rewrite((c) => ({ ...c, suite: ["node --test tests/red.test.mjs", `node -e "require('fs').writeFileSync('second-part-ran', '1')"`] }));
    putIn(lead, "tests/red.test.mjs", 'import { test } from "node:test";\nimport assert from "node:assert/strict";\ntest("red until B1-y merges", () => assert.equal(1, 2));\n');
    putIn(lead, `${ASSIGNMENTS}/B1-y.md`, good({ id: "B1-y", slot: "agent-b", reviewer: "agent-a", branch: "desk/garden-app/agent-b/B1-y", port: "8821", lists: { may_change: ["src/"], frozen: ["tests/red.test.mjs"], checks: ["true"] } }));
    d.board({ "agent-b": { state: "in-progress", brief: "B1-y", branch: "desk/garden-app/agent-b/B1-y", pr: "", notes: "" } });
    let r = deskRun(lead, "suite");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(existsSync(join(lead, "second-part-ran")), "the second part runs though the first failed");
    assert.match(r.stdout, /2 parts/); assert.match(r.stdout, /node --test tests\/red\.test\.mjs/); assert.match(r.stdout, /0 of 1|1 failed/);
    rmSync(join(lead, "second-part-ran"));
    r = deskRun(lead, "suite", "--brief", "A1-x");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /expected/); assert.match(r.stdout, /B1-y/);
    assert.ok(existsSync(join(lead, "second-part-ran")));
    d.rewrite((c) => { const { suite, ...rest } = c; return rest; });
    r = deskRun(lead, "suite");
    assert.equal(r.status, 2, r.stdout + r.stderr); assert.match(r.stderr, /suite/, "no suite named: says how to name one");
  } finally { d.done(); }
});

test("desk-check runs every command to the end and names each that failed", () => {
  const r = repo();
  try {
    r.git("switch", "-q", "claude/work");
    r.put(`${ASSIGNMENTS}/A1-visibility.md`, r.brief([`node -e "process.exit(4)"`, `node -e "require('fs').writeFileSync('second-ran', '1')"`]));
    r.git("commit", "-qam", "two checks");
    r.git("switch", "-q", "desk/garden-app/codex-a/A1-visibility");
    r.git("merge", "-q", "claude/work");
    r.put("src/trip-visibility.js", "export const a = 2;\n");
    r.git("commit", "-qam", "change");
    const out = r.check();
    assert.equal(out.status, 1, out.stdout + out.stderr);
    assert.ok(existsSync(join(r.dir, "second-ran")), "the second check ran though the first failed");
    assert.match(out.stdout, /1 of 2 commands failed/);
    assert.match(out.stdout, /process\.exit\(4\).*exited 4/);
  } finally { r.done(); }
});

test("codeFacts reads exported names, tables, routes and new files from the diff, and the report carries them", async () => {
  const { codeFacts } = await import("../skill/agent-desk/scripts/facts.mjs");
  const diff = [
    "diff --git a/src/a.js b/src/a.js", "--- a/src/a.js", "+++ b/src/a.js", "@@ -1,2 +1,4 @@",
    "-export function oldName() {}", "+export function newName() {}", "+export const RULE = 1;",
    '+  await env.DB.prepare("INSERT INTO trip_requests (id) VALUES (?)").run();', '+  route("/api/trips/:id/requests");',
    "diff --git a/src/b.js b/src/b.js", "new file mode 100644", "--- /dev/null", "+++ b/src/b.js", "@@ -0,0 +1 @@",
    '+const x = "SELECT * FROM poll_votes WHERE 1";',
  ].join("\n") + "\n";
  const f = codeFacts(diff);
  assert.deepEqual(f.exports.added, ["RULE", "newName"]);
  assert.deepEqual(f.exports.removed, ["oldName"]);
  assert.deepEqual(f.tables, ["poll_votes", "trip_requests"]);
  assert.deepEqual(f.routes, ["/api/trips/:id/requests"]);
  assert.deepEqual(f.newFiles, ["src/b.js"]);
  assert.deepEqual(codeFacts(""), { exports: { added: [], removed: [] }, tables: [], routes: [], newFiles: [] });
  const cfg = desk(); const brief = parseBrief(good({ id: "A1-x" }));
  const body = preflightBody({ cfg, brief, sections: {}, files: [], stat: "", commits: [], check: { passed: true, tail: "ok" }, name: "agent-a", tool: "antigravity", dirty: 0, facts: f });
  assert.match(body, /\*\*Code facts \(from the diff\):\*\*/);
  for (const w of ["`newName`", "`oldName`", "`trip_requests`", "`/api/trips/:id/requests`", "`src/b.js`"]) assert.ok(body.includes(w), w);
  assert.ok(body.indexOf("Code facts") < body.indexOf("**Done means:**"), "the facts come before the claims");
});

test("preflight --pr also reports the agent pushed with the pull request, so the leader's look sees it at once", () => {
  const d = deskWithOrigin();
  try {
    d.C("config", "desk.tool", "antigravity");
    d.C("switch", "-q", "-c", "desk/garden-app/agent-a/A1-x", "origin/claude/work");
    writeFileSync(join(d.copy, "src/a.js"), "export const a = 2;\n");
    d.C("commit", "-qam", "hide drafts\n\nDesk-Project: garden-app\nDesk-Agent: agent-a\nDesk-Brief: A1-x");
    const gh = ghShim(d.dir);
    const r = deskRunIn(d.copy, { PATH: `${gh.bin}:${process.env.PATH}` }, "preflight", "A1-x", "--pr", "7");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    d.L("fetch", "-q", "origin");
    const st = JSON.parse(d.L("show", "origin/claude/work:agents/desk/garden-app/status/agent-a.json"));
    assert.equal(st.phase, "pushed"); assert.equal(st.brief, "A1-x"); assert.equal(st.pr, "#7");
    assert.match(r.stdout, /pushed/);
  } finally { d.done(); }
});

test("the leader's look turns a board behind the agents into a ready-made set line, once, and a push after a decision names it", () => {
  const d = deskWithOrigin();
  const lead = leadOf(d);
  try {
    assert.equal(leaderWait(d).status, 3, "the first look is a baseline");
    d.board({ "agent-a": { state: "ready", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "", notes: "" } });
    d.pushAs("agent-a", "A1-x");
    putIn(lead, "agents/desk/garden-app/status/agent-a.json", reportFor("agent-a", "pushed", "A1-x", "#7"));
    d.board({ "agent-a": { state: "ready", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "", notes: "" } });
    const lines = [];
    for (let i = 0; i < 5; i++) lines.push(last(leaderWait(d)));
    assert.equal(lines.filter((l) => /set agent-a review --pr #7/.test(l)).length, 1, lines.join("\n"));
    assert.match(lines.find((l) => /set agent-a review/.test(l)), /^fits: /);
    assert.match(lines.find((l) => /set agent-a review/.test(l)), /board says ready/);
    // The leader's decision asks for changes; the agent pushes again: the look says it came after the decision.
    d.board({ "agent-a": { state: "changes", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#7", notes: "" } });
    leaderWait(d);
    d.pushAs("agent-a", "A1-x", 2);
    const r = leaderWait(d);
    assert.equal(r.status, 0, last(r));
    assert.match(last(r), /after your decision/); assert.match(last(r), /set agent-a review --pr #7/);
  } finally { d.done(); }
});

test("a reviewer's wait offers a pull request its author reports pushed, even while the board still says ready", () => {
  const d = deskWithOrigin();
  const lead = leadOf(d);
  try {
    d.pushAs("agent-b", "B1-y");
    putIn(lead, "agents/desk/garden-app/status/agent-b.json", reportFor("agent-b", "pushed", "B1-y", "#8"));
    d.board({ "agent-b": { state: "ready", brief: "B1-y", branch: "desk/garden-app/agent-b/B1-y", pr: "", notes: "" } });
    const r = d.wait();
    assert.equal(r.status, 0, last(r));
    assert.match(last(r), /^fits: review #8\b/);
  } finally { d.done(); }
});

test("desk.mjs status shows each open desk branch's head", () => {
  const d = deskWithOrigin();
  const lead = leadOf(d);
  try {
    d.pushAs("agent-a", "A1-x");
    d.board({ "agent-a": { state: "review", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#7", notes: "" } });
    const head = d.L("rev-parse", "--short", "origin/desk/garden-app/agent-a/A1-x");
    const r = deskRun(lead, "status");
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(head), `status names the head ${head}:\n${r.stdout}`);
  } finally { d.done(); }
});

test("desk.mjs reassign hands an open brief to another agent, and desk-check takes the first agent's commits up to the handed head only", () => {
  const d = deskWithOrigin();
  const lead = leadOf(d);
  try {
    d.board({ "agent-b": { state: "review", brief: "B1-y", branch: "desk/garden-app/agent-b/B1-y", pr: "#9", notes: "" } });
    d.pushAs("agent-b", "B1-y");
    d.L("fetch", "-q", "origin");
    const head = d.L("rev-parse", "origin/desk/garden-app/agent-b/B1-y");
    let r = deskRunIn(lead, { PATH: noGhPath(d.dir) }, "reassign", "B1-y", "--to", "codex-a");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const b = parseBrief(readFileSync(join(lead, ASSIGNMENTS, "B1-y.md"), "utf8"));
    assert.equal(b.slot, "codex-a"); assert.equal(b.branch, "desk/garden-app/codex-a/B1-y"); assert.equal(b.port, 8831);
    assert.equal(b.reviewer, "agent-a"); assert.equal(b.handed_from, "agent-b"); assert.equal(b.handed_pr, "#9"); assert.equal(b.handed_head, head);
    const rows = parseBoard(readFileSync(join(lead, "agents/desk/garden-app/board.md"), "utf8")).slots;
    assert.equal(rows["codex-a"].state, "ready"); assert.equal(rows["codex-a"].brief, "B1-y"); assert.equal(rows["agent-b"].state, "idle");
    assert.match(r.stdout, /Desk decision for garden-app/); assert.match(r.stdout, /handed over to codex-a/); assert.match(r.stdout, /desk\.mjs push/);
    assert.equal(deskRun(lead, "validate").status, 0);
    assert.equal(deskRunIn(lead, { PATH: noGhPath(join(d.dir, "x")) }, "reassign", "B1-y", "--to", "nobody").status, 1);
    d.L("add", "-A"); d.L("commit", "-qm", "reassign"); d.L("push", "-q", "origin", "claude/work");
    // codex-a carries on from the handed head: agent-b's commits are accepted, one signed after it isn't.
    d.L("switch", "-q", "-c", "desk/garden-app/codex-a/B1-y", head);
    const check = () => spawnSync(process.execPath, [join(root, "skill/agent-desk/scripts/check.mjs"), "B1-y", "--base", "origin/claude/work", "--no-run"], { cwd: lead, encoding: "utf8" });
    r = check(); assert.equal(r.status, 0, r.stdout + r.stderr);
    putIn(lead, "src/a.js", "export const a = 9;\n");
    d.L("commit", "-qam", "more\n\nDesk-Project: garden-app\nDesk-Agent: codex-a\nDesk-Brief: B1-y");
    r = check(); assert.equal(r.status, 0, r.stdout + r.stderr);
    putIn(lead, "src/a.js", "export const a = 10;\n");
    d.L("commit", "-qam", "late\n\nDesk-Project: garden-app\nDesk-Agent: agent-b\nDesk-Brief: B1-y");
    r = check(); assert.equal(r.status, 1); assert.match(r.stdout, /wrong_agent/);
    d.L("switch", "-q", "claude/work");
  } finally { d.done(); }
});

test("shapeReviewers sets every reviewer for a ring, pairs or one dedicated reviewer", async () => {
  const { SHAPES, shapeReviewers } = await import("../skill/agent-desk/scripts/config.mjs");
  assert.deepEqual(SHAPES, ["ring", "pairs", "reviewer"]);
  const agents = ["a", "b", "c"].map((n) => ({ name: n }));
  assert.deepEqual(shapeReviewers(agents, "ring"), { a: "b", b: "c", c: "a" });
  assert.deepEqual(shapeReviewers(agents, "pairs"), { a: "b", b: "a", c: "leader" });
  assert.deepEqual(shapeReviewers(agents, "reviewer", "c"), { a: "c", b: "c", c: "leader" });
  assert.deepEqual(shapeReviewers([{ name: "a" }], "ring"), { a: "leader" });
  assert.throws(() => shapeReviewers(agents, "reviewer", "z"), /z/);
  assert.throws(() => shapeReviewers(agents, "star"), /ring/);
});

test("desk.mjs shape rewrites desk.json and every open and queued brief's reviewer, leaving finished ones", () => {
  const d = deskWithOrigin();
  const lead = leadOf(d);
  try {
    putIn(lead, "agents/desk/garden-app/queue/Q1-q.md", good({ id: "Q1-q", slot: "agent-b", reviewer: "agent-a", branch: "desk/garden-app/agent-b/Q1-q", port: "8821" }));
    d.board({ "agent-a": { state: "done", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "#3", notes: "" },
      "agent-b": { state: "ready", brief: "B1-y", branch: "desk/garden-app/agent-b/B1-y", pr: "", notes: "" },
      "codex-a": { state: "in-progress", brief: "C1-z", branch: "desk/garden-app/codex-a/C1-z", pr: "", notes: "" } });
    const r = deskRun(lead, "shape", "reviewer", "codex-a");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const cfg = parseConfig(readFileSync(join(lead, CONFIG_PATH), "utf8"));
    assert.deepEqual(cfg.agents.map((a) => [a.name, a.reviewer]), [["agent-a", "codex-a"], ["agent-b", "codex-a"], ["codex-a", "leader"]]);
    const rev = (p) => parseBrief(readFileSync(join(lead, p), "utf8")).reviewer;
    assert.equal(rev(`${ASSIGNMENTS}/A1-x.md`), "agent-b", "a finished brief keeps the review it had");
    assert.equal(rev(`${ASSIGNMENTS}/B1-y.md`), "codex-a");
    assert.equal(rev(`${ASSIGNMENTS}/C1-z.md`), "leader");
    assert.equal(rev("agents/desk/garden-app/queue/Q1-q.md"), "codex-a");
    assert.match(r.stdout, /bottleneck/);
    assert.equal(deskRun(lead, "validate").status, 0);
    assert.equal(deskRun(lead, "shape", "star").status, 1);
  } finally { d.done(); }
});

test("planDesk lays out each agent's next briefs from the queue, its waits and the files open briefs hold, and marks an idle gap", async () => {
  const { planDesk } = await import("../skill/agent-desk/scripts/plan.mjs");
  const cfg = desk();
  const b = (id, slot, may, waits = []) => ({ id, slot, may_change: may, waits_on: waits });
  const lines = planDesk({ cfg, rows: { "agent-a": { state: "in-progress", brief: "A1" }, "agent-b": { state: "idle", brief: "" } },
    open: { A1: b("A1", "agent-a", ["src/x.js", "public/list.json"]) },
    queue: [b("Q1", "agent-b", ["src/x.js", "public/list.json"]), b("Q2", "agent-b", ["src/z.js"], ["Q1"]), b("Q3", "agent-a", ["public/list.json", "src/y.js"])],
    shared: ["public/list.json"] });
  const a = lines.find((l) => l.startsWith("agent-a")), bl = lines.find((l) => l.startsWith("agent-b"));
  assert.match(a, /A1.*Q3/, a);
  assert.match(bl, /idle until A1 merges/, bl); assert.match(bl, /src\/x\.js/); assert.ok(!bl.includes("public/list.json"), "a shared list holds nobody");
  assert.match(bl, /Q1.*Q2/, bl);
  const none = planDesk({ cfg, rows: {}, open: {}, queue: [], shared: [] });
  assert.ok(none.every((l) => /nothing queued/.test(l)), none.join("\n"));
});

test("desk.mjs plan reads the queue, and up moves a queued brief and its tests in and sets the row", () => {
  const d = deskWithOrigin();
  const lead = leadOf(d);
  try {
    putIn(lead, "agents/desk/garden-app/queue/Q1-q.md", good({ id: "Q1-q", slot: "agent-b", reviewer: "agent-a", branch: "desk/garden-app/agent-b/Q1-q", port: "8821",
      lists: { may_change: ["src/q.js"], frozen: ["tests/q1.test.mjs"], checks: ["true"], waits_on: ["A1-x"] } }));
    putIn(lead, "agents/desk/garden-app/queue/tests/q1.test.mjs", "// red\n");
    d.board({ "agent-a": { state: "in-progress", brief: "A1-x", branch: "desk/garden-app/agent-a/A1-x", pr: "", notes: "" } });
    let r = deskRun(lead, "plan");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /agent-b.*Q1-q/); assert.match(r.stdout, /A1-x/);
    r = deskRun(lead, "up", "Q1-q");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(existsSync(join(lead, ASSIGNMENTS, "Q1-q.md"))); assert.ok(!existsSync(join(lead, "agents/desk/garden-app/queue/Q1-q.md")));
    assert.ok(existsSync(join(lead, "tests/q1.test.mjs"))); assert.ok(!existsSync(join(lead, "agents/desk/garden-app/queue/tests/q1.test.mjs")));
    assert.equal(parseBoard(readFileSync(join(lead, "agents/desk/garden-app/board.md"), "utf8")).slots["agent-b"].state, "ready");
    assert.match(r.stdout, /red/); assert.match(r.stdout, /desk\.mjs push/);
    assert.equal(deskRun(lead, "up", "Q9-none").status, 1);
  } finally { d.done(); }
});

test("a queued brief may name what it waits on", () => {
  const b = parseBrief(good({ lists: { may_change: ["src/a.js"], frozen: [], checks: ["true"], waits_on: ["A0-first", "A0-second"] } }));
  assert.deepEqual(b.waits_on, ["A0-first", "A0-second"]);
  assert.deepEqual(briefProblems(b, "A1-visibility", desk()), []);
  says(briefProblems(parseBrief(good({ lists: { may_change: ["src/a.js"], frozen: [], checks: ["true"], waits_on: ["not an id!"] } })), "A1-visibility", desk()), "waits_on");
});

test("lists.mjs merges a shared JSON list from both sides, keeps a removal, sorts it, and says what is wrong with one", async () => {
  const { mergeJsonList, listProblems } = await import("../skill/agent-desk/scripts/lists.mjs");
  const base = '[\n  "a",\n  "old"\n]\n', ours = '[\n  "a",\n  "b",\n  "old"\n]\n', theirs = '[\n  "a",\n  "c"\n]\n';
  assert.equal(mergeJsonList(base, ours, theirs), '[\n  "a",\n  "b",\n  "c"\n]\n');
  assert.equal(mergeJsonList(null, '["b"]', '["a"]'), '[\n  "a",\n  "b"\n]\n');
  assert.throws(() => mergeJsonList(base, "{", theirs), /JSON/);
  assert.deepEqual(listProblems('[\n  "a",\n  "b"\n]\n'), []);
  says(listProblems('["b", "a"]'), "sorted");
  says(listProblems("[1, 2"), "JSON");
  says(listProblems('{"a": 1}'), "list");
});

test("desk.mjs resolve-lists settles a conflicted shared list and rebuilds a generated one, and leaves every other conflict alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "desk-lists-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
  const git = (...a) => spawnSync("git", a, { cwd: dir, env, encoding: "utf8" });
  try {
    git("init", "-q", "-b", "claude/work");
    putIn(dir, CONFIG_PATH, JSON.stringify(desk({ shared_lists: [{ file: "list.json" }, { file: "gen.txt", rebuild: `node -e "require('fs').writeFileSync('gen.txt', 'built\\n')"` }] }), null, 2));
    putIn(dir, "list.json", '[\n  "a"\n]\n'); putIn(dir, "gen.txt", "zero\n"); putIn(dir, "other.txt", "zero\n");
    git("add", "-A"); git("commit", "-qm", "base");
    git("switch", "-q", "-c", "side");
    putIn(dir, "list.json", '[\n  "a",\n  "b"\n]\n'); putIn(dir, "gen.txt", "side\n"); putIn(dir, "other.txt", "side\n");
    git("commit", "-qam", "side");
    git("switch", "-q", "claude/work");
    putIn(dir, "list.json", '[\n  "a",\n  "c"\n]\n'); putIn(dir, "gen.txt", "main\n"); putIn(dir, "other.txt", "main\n");
    git("commit", "-qam", "main");
    assert.notEqual(git("merge", "-q", "side").status, 0, "the fixture conflicts");
    const r = deskRun(dir, "resolve-lists");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(readFileSync(join(dir, "list.json"), "utf8"), '[\n  "a",\n  "b",\n  "c"\n]\n');
    assert.equal(readFileSync(join(dir, "gen.txt"), "utf8"), "built\n");
    const unmerged = git("diff", "--name-only", "--diff-filter=U").stdout.trim().split("\n").filter(Boolean);
    assert.deepEqual(unmerged, ["other.txt"]);
    assert.match(r.stdout, /list\.json/); assert.match(r.stdout, /gen\.txt/); assert.match(r.stdout, /other\.txt/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("desk.mjs push rebases the leader's commit over the agents' status commits and pushes, and stops at any other commit", () => {
  const d = deskWithOrigin();
  const lead = leadOf(d);
  try {
    // An agent's status lands on origin after the leader's last fetch.
    putIn(d.copy, "agents/desk/garden-app/status/agent-a.json", reportFor("agent-a", "waiting", "", ""));
    d.C("add", "-A"); d.C("commit", "-qm", "desk(garden-app): agent-a waiting"); d.C("push", "-q", "origin", "HEAD:claude/work");
    putIn(lead, "notes.md", "the leader's own\n"); d.L("add", "-A"); d.L("commit", "-qm", "leader's work");
    let r = deskRun(lead, "push");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    d.L("fetch", "-q", "origin");
    const log = d.L("log", "--format=%s", "origin/claude/work", "-3");
    assert.match(log, /leader's work/); assert.match(log, /agent-a waiting/);
    // Anything else on origin is the leader's to merge: push names it and pushes nothing.
    d.C("pull", "-q", "--rebase", "origin", "claude/work");
    putIn(d.copy, "src/a.js", "export const a = 7;\n"); d.C("commit", "-qam", "someone's code"); d.C("push", "-q", "origin", "HEAD:claude/work");
    putIn(lead, "notes.md", "again\n"); d.L("commit", "-qam", "leader again");
    r = deskRun(lead, "push");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /someone's code/);
    d.L("fetch", "-q", "origin");
    assert.doesNotMatch(d.L("log", "--format=%s", "origin/claude/work", "-1"), /leader again/);
  } finally { d.done(); }
});

test("the doctor finds a shared JSON list that isn't valid or sorted", () => {
  const cfg = desk({ shared_lists: [{ file: "public/list.json" }] });
  const f = doctorFindings({ ...bareDoctor, cfg, boardText: renderBoard(cfg, {}), lists: [{ file: "public/list.json", problems: ["isn't sorted: “b” comes before “a”"] }] });
  assert.ok(f.some((x) => x.what.includes("public/list.json") && /sorted/.test(x.what)), JSON.stringify(f));
  assert.ok(f.some((x) => /resolve-lists|sort/.test(x.fix)), JSON.stringify(f));
});

test("wait.mjs takes ANTIGRAVITY_AGENT=1 from the environment as Antigravity, whatever the copy says", () => {
  const d = deskWithOrigin();
  try {
    d.C("config", "desk.slot", "codex-a"); d.C("config", "desk.tool", "codex");
    const r = spawnSync(process.execPath, [join(root, "skill/agent-desk/scripts/wait.mjs")], { cwd: d.copy, encoding: "utf8", timeout: 30000, env: { ...process.env, ANTIGRAVITY_AGENT: "1" } });
    assert.equal(r.status, 3, last(r));
    assert.match(last(r), /180-second timer/);
    assert.ok(!/looking every/.test(r.stdout));
  } finally { d.done(); }
});

// ---- 2.1.0: the warning that can't be off, good night, and ending a project

test("automatic checking needs somewhere to tell the owner: awake on refuses without the issue, notify --setup --create makes one, and status says when nobody is told", () => {
  const d = deskWithOrigin({ awake: false });
  const lead = join(d.dir, "lead");
  try {
    let r = deskRun(lead, "awake", "on");
    assert.equal(r.status, 1, r.stdout); assert.match(r.stderr, /notify --setup --create/); assert.match(r.stderr, /silent/);
    assert.equal(JSON.parse(readFileSync(join(lead, CONFIG_PATH), "utf8")).awake, false, "nothing written");
    assert.equal(deskRun(lead, "awake", "on", "agent-a").status, 1, "one agent's switch too");
    assert.equal(deskRun(lead, "awake", "off").status, 0, "turning it off needs nothing");
    assert.equal(deskRun(lead, "awake", "leader", "on").status, 0, "the leader's own watch needs nothing");
    // the owner may still choose to go without, in so many words
    r = deskRun(lead, "awake", "on", "--no-notify"); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /nobody is told/);
    assert.match(deskRun(lead, "status").stdout, /nobody is told/);
    assert.match(deskRun(lead, "doctor").stdout, /nobody is told/);
    // the desk makes the issue itself
    const gh = ghShim(d.dir, '{"number": 31}');
    r = deskRunIn(lead, { PATH: `${gh.bin}:${process.env.PATH}` }, "notify", "--setup", "--create");
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /issue #31/);
    assert.match(gh.calls()[0], /repos\/owner\/repo\/issues/); assert.match(gh.calls()[0], /Desk notifications for garden-app/);
    assert.equal(JSON.parse(readFileSync(join(lead, CONFIG_PATH), "utf8")).notify.issue, 31);
    assert.ok(!/nobody is told/.test(deskRun(lead, "status").stdout));
    assert.equal(deskRun(lead, "awake", "on").status, 0);
    // without gh it says how to make one by hand
    deskRun(lead, "notify", "--setup", "off");
    r = deskRunIn(lead, { PATH: noGhPath(d.dir) }, "notify", "--setup", "--create");
    assert.equal(r.status, 1); assert.match(r.stderr, /Desk notifications for garden-app/); assert.match(r.stderr, /--setup --issue/);
  } finally { d.done(); }
  const leadMd = read("skill/agent-desk/protocol/lead.md");
  assert.ok(part(leadMd, "## Keeping agents awake").includes("notify --setup --create"));
  assert.ok(part(leadMd, "## Telling the owner").includes("if the leader has stopped too"), "lead.md says what the warning rests on");
});

test("good night puts the agents and then the desk to sleep, and only the owner's go, at the leader first, wakes them", () => {
  const d = deskWithOrigin();
  const lead = join(d.dir, "lead");
  const W = join(root, "skill/agent-desk/scripts/wait.mjs");
  const leadWait = () => spawnSync(process.execPath, [W, "--leader", "--once"], { cwd: lead, encoding: "utf8", env: { ...process.env, PATH: noGhPath(d.dir) } });
  const onOrigin = () => { d.C("fetch", "-q", "origin"); return JSON.parse(d.C("show", `origin/claude/work:${CONFIG_PATH}`)); };
  try {
    assert.ok(PHASES.includes("asleep"), "an agent can report asleep");
    const at = new Date(Date.now() - 90 * 60000).toISOString();
    assert.equal(silence(desk({ awake: true }), { desk: 1, project: "garden-app", agent: "agent-a", tool: "antigravity", phase: "asleep", brief: "", pr: "", step: "", words: "", at }), 0, "a sleeping agent isn't silent");
    says(configProblems(desk({ asleep: 5 })), "asleep");
    assert.deepEqual(configProblems(desk({ asleep: at })), []);
    assert.equal(leadWait().status, 3, "baseline");
    let r = deskRun(d.copy, "report", "waiting"); assert.equal(r.status, 0, r.stderr);
    r = deskRun(lead, "goodnight");
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /good night/i); assert.match(r.stdout, /Pushed/);
    assert.ok(!Number.isNaN(Date.parse(onOrigin().asleep)), "desk.json on the work branch says since when");
    assert.equal(onOrigin().awake, true, "the awake switch is left as it was");
    assert.match(deskRun(lead, "goodnight").stdout, /already asleep/);
    // the leader waits for the agents that are there
    r = leadWait(); assert.equal(r.status, 3, last(r)); assert.match(last(r), /^wait: good night: waiting for agent-a/);
    // the agent's next look stops it
    r = d.wait(); assert.equal(r.status, 1, last(r)); assert.match(last(r), /^stop: good night/); assert.match(last(r), /report asleep/); assert.match(last(r), /leader first/);
    r = deskRun(d.copy, "report", "asleep"); assert.equal(r.status, 0, r.stderr);
    // then the desk sleeps
    r = leadWait(); assert.equal(r.status, 1, last(r)); assert.match(last(r), /^stop: good night: every agent is asleep/); assert.match(last(r), /desk\.mjs wake/);
    assert.match(deskRun(lead, "status", "--ref", "origin/claude/work").stdout, /asleep since/i);
    // an agent that never answers doesn't keep the desk up past silence_minutes, and is named
    d.L("pull", "-q", "origin", "claude/work");
    d.rewrite((c) => ({ ...c, asleep: new Date(Date.now() - 30 * 60000).toISOString() }));
    writeFileSync(join(lead, `${STATUS_DIR}/agent-b.json`), JSON.stringify({ desk: 1, project: "garden-app", agent: "agent-b", tool: "antigravity", phase: "working", brief: "B1-y", pr: "", step: "", words: "", at: new Date(Date.now() - 50 * 60000).toISOString() }));
    d.board({});
    r = leadWait(); assert.equal(r.status, 1, last(r)); assert.match(last(r), /^stop: good night/); assert.match(last(r), /agent-b didn't answer/);
    assert.ok(!/silent|notify:|told:/.test(r.stdout), "no silence warning for a desk that is asleep");
    // go at the leader wakes the desk, and names each agent's conversation
    r = deskRun(lead, "wake");
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /awake again/); assert.match(r.stdout, /go/); for (const n of ["agent-a", "agent-b", "codex-a"]) assert.ok(r.stdout.includes(n), n);
    assert.equal(onOrigin().asleep, undefined);
    assert.match(deskRun(lead, "wake").stdout, /isn't asleep/);
    r = d.wait(); assert.equal(r.status, 3, last(r));
  } finally { d.done(); }
  const agentMd = read("skill/agent-desk/protocol/agent.md");
  assert.ok(part(agentMd, "## 2.").includes("the desk is asleep"), "an agent's go while the desk sleeps stops at step 2");
  assert.ok(part(agentMd, "## 2.").includes("leader first"));
  const leadMd = read("skill/agent-desk/protocol/lead.md");
  assert.ok(leadMd.includes("## Good night"), "lead.md has the section");
  for (const w of ["desk.mjs goodnight", "desk.mjs wake", "report asleep"]) assert.ok(part(leadMd, "## Good night").includes(w), `lead.md Good night: ${w}`);
  const cmd = read("skill/agent-desk/commands/lead.md");
  for (const w of ["good night", "`go`", "`end`"]) assert.ok(cmd.includes(w), `commands/lead.md: ${w}`);
});

test("desk.mjs end lists the project's branches, refuses unmerged work unless forced, then deletes them, archives the desk and tells each copy how to clear itself", () => {
  const d = deskWithOrigin();
  const lead = join(d.dir, "lead");
  const gh = ghShim(d.dir, '[{"number": 7, "head": {"ref": "desk/garden-app/agent-a/A1-x"}}, {"number": 9, "head": {"ref": "some/other-branch"}}]');
  const withGh = { PATH: `${gh.bin}:${process.env.PATH}` };
  const heads = () => d.L("ls-remote", "--heads", "origin").split("\n").map((l) => l.split("\t")[1]).filter(Boolean).map((r) => r.replace("refs/heads/", "")).sort();
  try {
    deskRun(lead, "notify", "--setup", "--issue", "12"); d.L("add", "-A"); d.L("commit", "-qm", "notify"); d.L("push", "-q", "origin", "claude/work");
    d.pushAs("agent-a", "A1-x");                                                         // work that isn't merged
    d.L("push", "-q", "origin", "claude/work:refs/heads/desk/garden-app/agent-b/B1-y");   // a branch already in the work branch
    d.L("push", "-q", "origin", "claude/work:refs/heads/desk/other-app/agent-a/Z1-q");    // another project's: never touched
    // without --yes it only lists
    let r = deskRunIn(lead, withGh, "end");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /desk\/garden-app\/agent-a\/A1-x\s+not merged.*#7/); assert.match(r.stdout, /desk\/garden-app\/agent-b\/B1-y\s+merged/);
    assert.ok(!/other-app|#9/.test(r.stdout), "another project's branch and pull request aren't its business");
    assert.match(r.stdout, /--yes/); assert.match(r.stdout, /nothing was changed/i);
    assert.equal(heads().length, 4);
    // unmerged work or an open pull request stops it
    r = deskRunIn(lead, withGh, "end", "--yes");
    assert.equal(r.status, 1, r.stdout); assert.match(r.stderr, /desk\/garden-app\/agent-a\/A1-x/); assert.match(r.stderr, /#7/); assert.match(r.stderr, /--force/);
    assert.equal(heads().length, 4, "nothing deleted");
    // forced: pull request closed, branches gone, the desk archived, the issue closed, all pushed
    r = deskRunIn(lead, withGh, "end", "--yes", "--force");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.deepEqual(heads(), ["claude/work", "desk/other-app/agent-a/Z1-q"], "the work branch and other projects stay");
    d.C("fetch", "-q", "origin");
    assert.notEqual(spawnSync("git", ["cat-file", "-e", `origin/claude/work:${CONFIG_PATH}`], { cwd: d.copy }).status, 0, "the project's desk is gone from its place"); // git answers 128 for a path that isn't there
    assert.equal(JSON.parse(d.C("show", "origin/claude/work:agents/desk/archive/garden-app/desk.json")).project, "garden-app");
    const calls = gh.calls().join("\n");
    assert.match(calls, /pulls\/7/); assert.match(calls, /state=closed/); assert.ok(!/pulls\/9/.test(calls));
    assert.match(calls, /issues\/12/); assert.match(calls, /has ended/);
    assert.match(r.stdout, /cleanup\.mjs --local/); for (const n of ["agent-a", "agent-b", "codex-a"]) assert.ok(r.stdout.includes(n), n);
    // an agent's copy hears of it at its next look, and clears itself
    r = d.wait(); assert.equal(r.status, 1, last(r)); assert.match(last(r), /^stop: garden-app has ended/); assert.match(last(r), /cleanup\.mjs --local/);
    d.C("branch", "desk/garden-app/agent-a/A1-x"); d.C("config", "desk.tool", "antigravity"); d.C("config", "desk.A1-x.acted", "take:A1-x");
    r = spawnSync(process.execPath, [join(root, "skill/agent-desk/scripts/cleanup.mjs"), "--local"], { cwd: d.copy, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /desk\/garden-app\/agent-a\/A1-x/);
    assert.equal(d.C("branch", "--list", "desk/garden-app/*"), "");
    assert.equal(spawnSync("git", ["config", "--get-regexp", "^desk\\."], { cwd: d.copy, encoding: "utf8" }).stdout.trim(), "", "no desk.* setting left");
    // a second end has nothing to do
    r = deskRunIn(lead, withGh, "end", "--project", "garden-app"); assert.notEqual(r.status, 0); assert.match(r.stderr, /garden-app/);
  } finally { d.done(); }
  assert.ok(read("skill/agent-desk/protocol/lead.md").includes("## Ending a project"));
});

test("desk.mjs end with everything merged needs no force, and without gh says what it couldn't do", () => {
  const d = deskWithOrigin();
  const lead = join(d.dir, "lead");
  try {
    d.L("push", "-q", "origin", "claude/work:refs/heads/desk/garden-app/agent-b/B1-y");
    const env = { PATH: noGhPath(d.dir) };
    let r = deskRunIn(lead, env, "end");
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /pull requests not checked/);
    // the leader's checkout is behind origin whenever an agent has reported since its last pull: end catches up first
    assert.equal(deskRun(d.copy, "report", "waiting").status, 0);
    r = deskRunIn(lead, env, "end", "--yes");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.deepEqual(d.L("ls-remote", "--heads", "origin").split("\n").map((l) => l.split("\t")[1]), ["refs/heads/claude/work"]);
    assert.ok(existsSync(join(lead, "agents/desk/archive/garden-app/desk.json")));
  } finally { d.done(); }
});
