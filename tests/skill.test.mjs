// The agent desk skill's own contracts: one self-contained folder (skill/agent-desk/) tied to no
// repository, branch or project. Install only makes the skill available; setup, per project, asks the
// project's name, keeps its files in agents/desk/<project>/ and always ends with every agent's
// spin-up wording. tests/core.test.mjs holds the desk's behaviour: briefs, the board, desk-check, the waits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, statSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

delete process.env.ANTIGRAVITY_AGENT;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SK = join(root, "skill/agent-desk");
const HOME = ".agents/skills/agent-desk";
const read = (p) => readFileSync(join(SK, p), "utf8");
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
const run = (cwd, script, ...a) => spawnSync(process.execPath, [script, ...a], { cwd, env, encoding: "utf8" });
const said = (r) => `${r.stdout}${r.stderr}`;
const walk = (dir, base = "") => readdirSync(join(dir, base), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(dir, join(base, e.name)) : [join(base, e.name)]);

// A repository with a GitHub origin and nothing of the desk in it, on the branch given.
function bare(branch = "feature/garden") {
  const dir = mkdtempSync(join(tmpdir(), "desk2-"));
  const git = (...a) => { const r = spawnSync("git", a, { cwd: dir, env, encoding: "utf8" }); assert.equal(r.status, 0, `git ${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  git("init", "-q", "-b", branch);
  git("remote", "add", "origin", "https://github.com/acme/garden.git");
  writeFileSync(join(dir, "README.md"), "# Garden\n");
  git("add", "-A"); git("commit", "-qm", "base");
  const desk = (...a) => run(dir, join(SK, "scripts/desk.mjs"), ...a);
  const install = (...a) => run(dir, join(SK, "scripts/install.mjs"), ...a);
  return { dir, git, desk, install, has: (p) => existsSync(join(dir, p)), read: (p) => readFileSync(join(dir, p), "utf8"), done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("the skill is one folder: a router under 12,000 characters, a file per sub-command, the steps, the scripts, the templates and a version, with no address of any home", () => {
  const skill = read("SKILL.md");
  assert.match(skill, /^---\nname: agent-desk\ndescription: .+\n---\n/);
  assert.ok(skill.length < 12000, `SKILL.md is ${skill.length} characters`);
  for (const c of ["install", "setup", "lead", "agent", "status", "refresh"]) {
    assert.ok(existsSync(join(SK, "commands", `${c}.md`)), `commands/${c}.md`);
    assert.ok(skill.includes(`commands/${c}.md`), `SKILL.md sends “${c}” to commands/${c}.md`);
  }
  for (const w of ["/agent-desk", "$agent-desk", "first word"]) assert.ok(skill.includes(w), `SKILL.md: ${w}`);
  for (const f of ["agent.md", "take.md", "review.md", "revise.md", "subagent.md", "lead.md"]) assert.ok(existsSync(join(SK, "protocol", f)), `protocol/${f}`);
  for (const f of ["desk.mjs", "check.mjs", "wait.mjs", "install.mjs", "config.mjs"]) assert.ok(existsSync(join(SK, "scripts", f)), `scripts/${f}`);
  for (const f of ["brief.md", "desk.json", "guide.md", "AGENTS-desk.md", "CLAUDE-desk.md"]) assert.ok(existsSync(join(SK, "templates", f)), `templates/${f}`);
  assert.match(read("VERSION").trim(), /^2\.\d+\.\d+$/);
  assert.ok(!existsSync(join(SK, "SOURCE.json")), "no SOURCE.json: the skill has no home to fetch from");
});

test("nothing published names anyone's repository, branch, project, agents or history: the skill, the README and the changelog read as nobody's in particular", () => {
  // Any repository's address, any dated note of who decided what, any path of a desk from before the
  // skill was one folder, and any clone of a fixed branch.
  const banned = [/github\.com\/(?!<)[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/, /--branch main\b/, /\b(January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b/,
    /the owner, \d/, /\bkit 1\.\d/i, /kit\/agent-desk/, /scripts\/desk\//, /agents\/desk\/protocol/, /field report/];
  const files = [...walk(SK).map((f) => join(SK, f)), join(root, "README.md"), join(root, "CHANGELOG.md"), join(root, "package.json")];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const b of banned) assert.ok(!b.test(text), `${f.slice(root.length + 1)} holds ${b}: “${(b.exec(text) || [])[0]}”`);
  }
});

test("the repository around the skill is ready to publish: a licence, a README that gives the ways in, one version everywhere, and a workflow that runs these tests", () => {
  const at = (p) => readFileSync(join(root, p), "utf8");
  assert.match(at("LICENSE"), /^MIT License/); assert.match(at("LICENSE"), /Permission is hereby granted, free of charge/);
  const pkg = JSON.parse(at("package.json"));
  assert.equal(pkg.version, read("VERSION").trim(), "package.json and the skill's VERSION agree");
  assert.equal(pkg.license, "MIT"); assert.equal(pkg.private, undefined); assert.deepEqual(pkg.dependencies || {}, {}); assert.match(pkg.scripts.test, /node --test/);
  assert.ok(at("CHANGELOG.md").includes(read("VERSION").trim()), "the changelog names this version");
  const readme = at("README.md");
  for (const w of ["node skill/agent-desk/scripts/install.mjs --target", "node skill/agent-desk/scripts/install.mjs --for-me", "node skill/agent-desk/scripts/install.mjs --pack", "/agent-desk setup", "$agent-desk",
    ".agents/skills/", ".claude/skills/", "~/.gemini/config/skills/", "Claude Code", "Codex", "Antigravity", "cloud", "Node 18", "MIT"]) assert.ok(readme.includes(w), `README: ${w}`);
  const flow = at(".github/workflows/test.yml");
  for (const w of ["node --test", "18", "20", "22"]) assert.ok(flow.includes(w), `the workflow: ${w}`);
  // What a user copies is the skill alone: nothing of the repository around it.
  for (const f of walk(SK)) assert.ok(!/(^|\/)(tests?|\.github|README\.md|LICENSE|package\.json)(\/|$)/.test(f), `${f} is the repository's, not the skill's`);
});

test("the template assumes no tool for the leader, and setup takes the leader's own name and tool", () => {
  const tpl = JSON.parse(read("templates/desk.json"));
  assert.deepEqual([tpl.leader.name, tpl.leader.tool], ["leader", "other"]);
  for (const a of tpl.agents) assert.equal(a.tool, "other", `${a.name}'s tool is the owner's to say`);
  const r = bare();
  try {
    let out = r.desk("setup", "--project", "garden-app", "--leader", "codex-lead", "--leader-tool", "codex");
    assert.equal(out.status, 0, said(out));
    const cfg = JSON.parse(r.read("agents/desk/garden-app/desk.json"));
    assert.deepEqual([cfg.leader.name, cfg.leader.tool], ["codex-lead", "codex"]);
    assert.match(out.stdout, /led by codex-lead/); assert.match(out.stdout, /The leader is codex-lead, in Codex/);
    out = r.desk("setup", "--project", "shed-app", "--leader-tool", "emacs");
    assert.equal(out.status, 2, said(out)); assert.match(said(out), /claude-code, codex, antigravity, other/); assert.ok(!r.has("agents/desk/shed-app"));
  } finally { r.done(); }
});

test("setup works for any GitHub repository and says what it needs where there is none: it never falls back to a repository of anyone's", () => {
  const r = bare();
  try {
    r.git("remote", "remove", "origin");
    let out = r.desk("setup", "--project", "garden-app");
    assert.equal(out.status, 2, said(out)); assert.match(said(out), /--repo <owner\/name>/); assert.ok(!r.has("agents"));
    out = r.desk("setup", "--project", "garden-app", "--repo", "someone-else/their-app");
    assert.equal(out.status, 0, said(out));
    assert.equal(JSON.parse(r.read("agents/desk/garden-app/desk.json")).repository, "someone-else/their-app");
    assert.ok(out.stdout.includes("for the GitHub repository someone-else/their-app"));
    r.git("remote", "add", "origin", "git@github.com:third/party.git");
    assert.equal(r.desk("setup", "--project", "shed-app").status, 0);
    assert.equal(JSON.parse(r.read("agents/desk/shed-app/desk.json")).repository, "third/party", "an ssh origin is read too");
  } finally { r.done(); }
});

test("install only makes the skill available: it copies the folder into a repository's two skills folders and writes nothing of any project", () => {
  const r = bare();
  try {
    let out = r.install("--target", r.dir);
    assert.equal(out.status, 0, said(out));
    for (const home of [".agents/skills/agent-desk", ".claude/skills/agent-desk"]) {
      for (const f of walk(SK)) assert.equal(r.read(join(home, f)), read(f), `${home}/${f}`);
    }
    for (const p of ["agents", "AGENTS.md", "CLAUDE.md", "scripts"]) assert.ok(!r.has(p), `install wrote ${p}, which is setup's`);
    assert.match(out.stdout, /setup/, "it says setup comes next");
    assert.equal(r.install("--check", "--target", r.dir).status, 0);
    writeFileSync(join(r.dir, HOME, "protocol/take.md"), "changed\n");
    out = r.install("--check", "--target", r.dir);
    assert.equal(out.status, 1); assert.match(out.stdout, /\.agents\/skills\/agent-desk\/protocol\/take\.md/);
    out = r.install("--target", r.dir, "--project", "garden-app");
    assert.equal(out.status, 2, "a project is setup's to name"); assert.match(said(out), /setup/);
  } finally { r.done(); }
});

test("install --for-me puts the skill in each tool's own folder, and --pack makes one zip of it", () => {
  const home = mkdtempSync(join(tmpdir(), "desk2-home-"));
  try {
    let out = run(home, join(SK, "scripts/install.mjs"), "--for-me", "--home", home);
    assert.equal(out.status, 0, said(out));
    for (const base of [".claude/skills", ".agents/skills", ".gemini/config/skills"]) {
      assert.equal(readFileSync(join(home, base, "agent-desk/SKILL.md"), "utf8"), read("SKILL.md"), base);
      assert.ok(existsSync(join(home, base, "agent-desk/scripts/desk.mjs")), `${base}: the scripts travel with it`);
    }
    const zip = join(home, "agent-desk.zip");
    out = run(home, join(SK, "scripts/install.mjs"), "--pack", "--out", zip);
    assert.equal(out.status, 0, said(out));
    assert.equal(readFileSync(zip).subarray(0, 2).toString(), "PK");
    // Read back here, with no tool the build machine might lack: every entry's name, and its bytes inflated.
    const buf = readFileSync(zip), entries = {};
    let at = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = buf.readUInt16LE(at + 10); at = buf.readUInt32LE(at + 16);
    for (let n = 0; n < count; n++) {
      assert.equal(buf.readUInt32LE(at), 0x02014b50, "a central directory entry");
      const size = buf.readUInt32LE(at + 20), nameLen = buf.readUInt16LE(at + 28), local = buf.readUInt32LE(at + 42);
      const name = buf.subarray(at + 46, at + 46 + nameLen).toString();
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      entries[name] = inflateRawSync(buf.subarray(start, start + size)).toString();
      at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    }
    for (const f of walk(SK)) assert.equal(entries[`agent-desk/${f}`], read(f), `the zip holds agent-desk/${f}, byte for byte`);
    assert.equal(Object.keys(entries).length, walk(SK).length, "and nothing else");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("setup needs the project's name, reads the repository for the rest, keeps the project in a folder of its own and ends with every agent's spin-up wording", () => {
  const r = bare();
  try {
    let out = r.desk("setup");
    assert.equal(out.status, 2, said(out)); assert.match(said(out), /project/i); assert.match(said(out), /name/i);
    assert.ok(!r.has("agents"), "nothing is written without a name");
    out = r.desk("setup", "--project", "Garden App");
    assert.equal(out.status, 2); assert.match(said(out), /lower-case/);
    out = r.desk("setup", "--project", "garden-app", "--title", "The garden app");
    assert.equal(out.status, 0, said(out));
    const cfg = JSON.parse(r.read("agents/desk/garden-app/desk.json"));
    assert.equal(cfg.project, "garden-app"); assert.equal(cfg.title, "The garden app");
    assert.equal(cfg.repository, "acme/garden", "the repository is read from origin");
    assert.equal(cfg.work_branch, "feature/garden", "the work branch is the session's own");
    assert.equal(cfg.agents.length, 2);
    assert.ok(r.has("agents/desk/garden-app/board.md"));
    for (const p of ["agents/desk/desk.json", "agents/desk/board.md", "scripts/desk"]) assert.ok(!r.has(p), `${p}: the old fixed place`);
    for (const f of ["AGENTS.md", "CLAUDE.md"]) assert.ok(r.read(f).includes("agent-desk:start"), `${f} holds the desk's block`);
    for (const a of cfg.agents) {
      assert.ok(out.stdout.includes(`You are desk agent ${a.name} on the project garden-app`), `the spin-up wording for ${a.name}`);
      assert.ok(out.stdout.includes(`/agent-desk agent ${a.name} garden-app`), `the short form for ${a.name}`);
    }
    assert.match(out.stdout, /Where:/);
    assert.ok(out.stdout.includes("acme/garden") && out.stdout.includes("feature/garden"));
    assert.ok(out.stdout.includes(`${HOME}/protocol/agent.md`), "the prompt names the steps inside the skill");
    assert.equal(r.desk("validate").status, 0, "one project here: no need to name it");
    // Again: the project's own settings are kept, and the wording is given again.
    writeFileSync(join(r.dir, "agents/desk/garden-app/desk.json"), JSON.stringify({ ...cfg, title: "Kept" }, null, 2) + "\n");
    out = r.desk("setup", "--project", "garden-app");
    assert.equal(out.status, 0, said(out));
    assert.equal(JSON.parse(r.read("agents/desk/garden-app/desk.json")).title, "Kept");
    assert.ok(out.stdout.includes("You are desk agent agent-a on the project garden-app"));
  } finally { r.done(); }
});

test("setup never takes the default or a release branch as the work branch: it asks for one and offers work/<project>", () => {
  const r = bare("main");
  try {
    let out = r.desk("setup", "--project", "garden-app");
    assert.equal(out.status, 2, said(out)); assert.match(said(out), /work\/garden-app/); assert.ok(!r.has("agents"));
    out = r.desk("setup", "--project", "garden-app", "--work-branch", "work/garden-app");
    assert.equal(out.status, 0, said(out));
    assert.equal(JSON.parse(r.read("agents/desk/garden-app/desk.json")).work_branch, "work/garden-app");
  } finally { r.done(); }
});

test("two projects live side by side on one branch, and a command with several and none named lists them and stops", () => {
  const r = bare();
  try {
    assert.equal(r.desk("setup", "--project", "garden-app").status, 0);
    assert.equal(r.desk("setup", "--project", "shed-app", "--title", "The shed").status, 0);
    assert.ok(r.has("agents/desk/garden-app/desk.json") && r.has("agents/desk/shed-app/desk.json"));
    let out = r.desk("validate");
    assert.equal(out.status, 2, said(out)); assert.match(said(out), /garden-app/); assert.match(said(out), /shed-app/); assert.match(said(out), /--project/);
    assert.equal(r.desk("validate", "--project", "shed-app").status, 0);
    out = r.desk("status", "--project", "garden-app");
    assert.equal(out.status, 0, said(out)); assert.match(out.stdout, /Project garden-app/); assert.ok(!out.stdout.includes("shed-app"));
    r.git("config", "desk.project", "shed-app");
    out = r.desk("status");
    assert.equal(out.status, 0, said(out)); assert.match(out.stdout, /Project shed-app/, "the copy's own project is the one meant");
    out = r.desk("set", "agent-a", "idle", "--project", "garden-app");
    assert.equal(out.status, 0, said(out));
    assert.ok(r.read("agents/desk/garden-app/board.md").includes("agent-a"));
  } finally { r.done(); }
});

test("a prompt names its own desk's repository, project and branch, and the steps inside the skill; the commands that change who works where give the wording again", async () => {
  const { agentPrompt } = await import("../skill/agent-desk/scripts/prompts.mjs");
  const cfg = { ...JSON.parse(read("templates/desk.json")), project: "shed-app", repository: "acme/shed", work_branch: "work/shed-app" };
  const p = agentPrompt(cfg, "agent-a");
  for (const w of ["Project: shed-app · Agent: agent-a", "acme/shed", "work/shed-app", `git show origin/work/shed-app:${HOME}/protocol/agent.md`, "/agent-desk agent agent-a shed-app", "$agent-desk agent agent-a shed-app"]) assert.ok(p.includes(w), w);
  const r = bare();
  try {
    assert.equal(r.desk("setup", "--project", "garden-app").status, 0);
    let out = r.desk("move", "agent-a", "--to", "codex");
    assert.equal(out.status, 0, said(out));
    assert.ok(out.stdout.includes("You are desk agent agent-a on the project garden-app"), "move gives the moved agent's wording");
    assert.ok(!out.stdout.includes("You are desk agent agent-b"), "and only the moved agent's");
    out = r.desk("prompts");
    assert.equal(out.status, 0); assert.match(out.stdout, /Where:/);
    for (const n of ["agent-a", "agent-b"]) assert.ok(out.stdout.includes(`You are desk agent ${n} on the project garden-app`), n);
  } finally { r.done(); }
});

test("the installed copy runs on its own: a repository with only the skill in it sets up and validates a desk", () => {
  const r = bare();
  try {
    assert.equal(r.install("--target", r.dir).status, 0);
    const own = (...a) => run(r.dir, join(r.dir, HOME, "scripts/desk.mjs"), ...a);
    let out = own("setup", "--project", "garden-app");
    assert.equal(out.status, 0, said(out));
    assert.equal(own("validate").status, 0);
    out = own("doctor");
    assert.ok(!/kit\/agent-desk|SOURCE\.json/.test(said(out)), said(out));
  } finally { r.done(); }
});

test("the desk's own files are never an agent's to change: the skill's folders and every project's folder are protected", async () => {
  const { isProtected, CORE_PROTECTED } = await import("../skill/agent-desk/scripts/scope.mjs");
  for (const p of [`${HOME}/scripts/desk.mjs`, ".claude/skills/agent-desk/SKILL.md", "agents/desk/garden-app/desk.json", "agents/desk/garden-app/assignments/A1.md", "AGENTS.md"]) assert.ok(isProtected(p, CORE_PROTECTED), p);
  assert.ok(!CORE_PROTECTED.some((p) => /^kit\/|^scripts\/desk/.test(p)), "no path of the old kit is named");
});

test("migrate moves a 1.x desk into its project's folder, takes the old copies away and gives every agent's new wording", () => {
  const r = bare();
  try {
    const put = (p, s) => { mkdirSync(dirname(join(r.dir, p)), { recursive: true }); writeFileSync(join(r.dir, p), s); };
    const cfg = { ...JSON.parse(read("templates/desk.json")), project: "old-app", repository: "acme/garden", work_branch: "feature/garden", kit: { source: "someone/somewhere", path: "kit/agent-desk", ref: "main", version: "1.14.0" } };
    put("agents/desk/desk.json", JSON.stringify(cfg, null, 2) + "\n");
    put("agents/desk/board.md", "# The board\n\nProject: `old-app`\nWork branch: `feature/garden`\n\n| Agent | State | Brief | Branch | PR | Notes |\n|---|---|---|---|---|---|\n| agent-a | idle |  |  |  |  |\n| agent-b | idle |  |  |  |  |\n");
    put("agents/desk/assignments/_template.md", "old template\n");
    put("agents/desk/status/agent-a.json", JSON.stringify({ desk: 1, project: "old-app", agent: "agent-a", tool: "other", phase: "waiting", brief: "", pr: "", step: "", words: "", at: new Date().toISOString() }) + "\n");
    put("agents/desk/progress.json", JSON.stringify({ desk: 1, project: "old-app", steps: {} }) + "\n");
    put("agents/desk/protocol/agent.md", "old steps\n"); put("agents/desk/README.md", "old guide\n");
    put("scripts/desk/desk.mjs", "// old\n"); put("scripts/desk/wait.mjs", "// old\n");
    for (const s of ["agent-desk", "desk-install", "desk-setup", "desk-lead", "desk-agent", "desk-status", "desk-refresh"]) for (const h of [".agents/skills", ".claude/skills"]) put(`${h}/${s}/SKILL.md`, `---\nname: ${s}\ndescription: old\n---\n`);
    r.git("add", "-A"); r.git("commit", "-qm", "a 1.x desk");
    assert.equal(r.install("--target", r.dir).status, 0);
    const out = r.desk("migrate");
    assert.equal(out.status, 0, said(out));
    for (const p of ["agents/desk/old-app/desk.json", "agents/desk/old-app/board.md", "agents/desk/old-app/status/agent-a.json", "agents/desk/old-app/progress.json", `${HOME}/SKILL.md`]) assert.ok(r.has(p), p);
    for (const p of ["agents/desk/desk.json", "agents/desk/board.md", "agents/desk/status", "agents/desk/protocol", "agents/desk/README.md", "agents/desk/assignments", "scripts/desk", ".agents/skills/desk-setup", ".claude/skills/desk-lead", ".agents/skills/desk-refresh"]) assert.ok(!r.has(p), `${p} is gone`);
    const now = JSON.parse(r.read("agents/desk/old-app/desk.json"));
    assert.equal(now.project, "old-app"); assert.ok(!JSON.stringify(now.kit || {}).includes("someone/somewhere"), "the old kit's home isn't carried over");
    for (const n of ["agent-a", "agent-b"]) assert.ok(out.stdout.includes(`You are desk agent ${n} on the project old-app`), `${n}'s new wording`);
    assert.equal(r.desk("validate").status, 0, said(r.desk("validate")));
    assert.equal(r.desk("migrate").status, 1, "nothing left to migrate, and it says so");
  } finally { r.done(); }
});

test("a new project's first brief can be written: the brief command makes the project's assignments folder", () => {
  const r = bare();
  try {
    assert.equal(r.desk("setup", "--project", "garden-app").status, 0);
    const out = r.desk("brief", "A1-beds", "--for", "agent-a", "--spec", "A1", "--title", "The beds");
    assert.equal(out.status, 0, said(out));
    assert.ok(r.has("agents/desk/garden-app/assignments/A1-beds.md"));
    assert.match(r.read("agents/desk/garden-app/assignments/A1-beds.md"), /^branch: desk\/garden-app\/agent-a\/A1-beds$/m);
  } finally { r.done(); }
});
