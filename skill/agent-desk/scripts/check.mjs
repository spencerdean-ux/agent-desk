#!/usr/bin/env node
// desk-check: holds a desk branch to its brief, then runs the brief's checks.
//
//   node .agents/skills/agent-desk/scripts/check.mjs <brief id> [--base <ref>] [--any-branch] [--no-run] [--no-affected]
//
// With the desk's test suite named in desk.json (tests), it first runs the test files that read what
// the branch changed and the always-run ones (scripts/affected.mjs), then the brief's own checks;
// --no-affected runs the brief's checks alone.
//
// The agent runs it before every push (in a cloud tool nothing else stops a push), and the leader
// runs it again when reviewing the pull request, with --base naming the pull request's base and
// --any-branch, as the review's checkout is detached.
//
// The brief and desk.json are read from the base, never from the branch, so an agent can't widen its
// own brief or the desk; a change to either on the branch is caught anyway, as both are protected.
// Exit 0: passed. 1: a violation or a failing check. 2: it couldn't run (said why).
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { parseBrief, briefProblems } from "./brief.mjs";
import { scopeViolations } from "./scope.mjs";
import { affectedTests } from "./affected.mjs";
import { parseConfig, configProblems, agentNamed, portEnv, protectedPaths } from "./config.mjs";
import { DESK_ROOT, configPath, assignmentsDir } from "./paths.mjs";

const WHY = {
  protected: "the desk, the agents' rules, the skills, the hooks and the repository's guarded files are never an agent's to change",
  frozen: "a test the leader wrote for this brief: make it pass, never edit it",
  applied_migration: "a migration the base already has may have run somewhere: add a new one instead",
  outside_brief: "not in the brief's may_change list: stop and ask in the pull request",
  wrong_agent: "an agent works only its own brief, in the conversation and copy that carry its name: stop, and tell the owner which agent this conversation is",
};

function git(args, opts = {}) {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !opts.soft) throw new Error(`git ${args.join(" ")}: ${(r.stderr || "").trim()}`);
  return r.status === 0 ? r.stdout.replace(/\n$/, "") : null;
}

function args(argv) {
  const out = { id: "", base: "", anyBranch: false, run: true, affected: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") out.base = argv[++i] || "";
    else if (argv[i] === "--any-branch") out.anyBranch = true;
    else if (argv[i] === "--no-run") out.run = false;
    else if (argv[i] === "--no-affected") out.affected = false;
    else if (argv[i] === "--project") out.project = argv[++i] || "";
    else if (!out.id) out.id = argv[i];
  }
  return out;
}

// origin/<base> when it is there (an agent's copy, after a fetch), else the local branch.
const resolveRef = (name) => [name.startsWith("origin/") ? name : `origin/${name}`, name].find((r) => git(["rev-parse", "--verify", "--quiet", r + "^{commit}"], { soft: true }));

function changedFiles(mergeBase) {
  const tracked = (git(["diff", "--name-status", "-M", mergeBase]) || "").split("\n").filter(Boolean).map((line) => {
    const [status, a, b] = line.split("\t");
    return status.startsWith("R") ? { status: "R", path: b, from: a } : { status: status[0], path: a };
  });
  const untracked = (git(["ls-files", "--others", "--exclude-standard"]) || "").split("\n").filter(Boolean).map((path) => ({ status: "A", path }));
  return [...tracked, ...untracked];
}

// Where to look for the base when none is given: the brief's own base, else the desk's work branch.
function defaultBase(file, project) {
  const local = git(["show", `HEAD:${file}`], { soft: true });
  if (local) return parseBrief(local).base || "";
  const cfg = configPath(project);
  return existsSync(cfg) ? (parseConfig(readFileSync(cfg, "utf8")).work_branch || "") : "";
}

// Which project the brief is in: the one named; else the branch's own (desk/<project>/<agent>/<id>);
// else this copy's (git config desk.project); else the only project here that holds the brief.
function projectOf(id, named) {
  if (named) return named;
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], { soft: true }) || "";
  const m = /^desk\/([^/]+)\/[^/]+\/(.+)$/.exec(branch);
  if (m && m[2] === id) return m[1];
  const own = git(["config", "desk.project"], { soft: true }) || "";
  if (own) return own;
  const here = existsSync(DESK_ROOT) ? readdirSync(DESK_ROOT, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(`${assignmentsDir(e.name)}/${id}.md`)).map((e) => e.name) : [];
  return here.length === 1 ? here[0] : "";
}

function main() {
  const a = args(process.argv.slice(2));
  if (!a.id) { console.error("Usage: node .agents/skills/agent-desk/scripts/check.mjs <brief id> [--base <ref>] [--any-branch] [--no-run]"); return 2; }
  const top = git(["rev-parse", "--show-toplevel"], { soft: true });
  if (!top) { console.error("desk-check: run it inside the repository"); return 2; }
  process.chdir(top);
  const project = projectOf(a.id, a.project);
  if (!project) { console.error(`desk-check: can't tell which project ${a.id} is in: name it with --project <name>`); return 2; }
  const CONFIG_PATH = configPath(project);
  const file = `${assignmentsDir(project)}/${a.id}.md`;

  const baseName = a.base || defaultBase(file, project);
  const baseRef = baseName && resolveRef(baseName);
  if (!baseRef) { console.error(`desk-check: can't find the base “${baseName || "?"}”. Run: git fetch origin`); return 2; }

  const cfgText = git(["show", `${baseRef}:${CONFIG_PATH}`], { soft: true });
  if (cfgText === null) { console.error(`desk-check: there is no ${CONFIG_PATH} on ${baseRef}, so the desk isn't set up there (the leader's /agent-desk setup does it)`); return 2; }
  const cfg = parseConfig(cfgText);
  const cfgWrong = configProblems(cfg);
  if (cfgWrong.length) { console.error(`desk-check: ${CONFIG_PATH} on ${baseRef} is wrong:\n  ${cfgWrong.join("\n  ")}`); return 2; }

  const text = git(["show", `${baseRef}:${file}`], { soft: true });
  if (text === null) { console.error(`desk-check: brief_not_on_base: ${file} isn't on ${baseRef}`); return 1; }
  const brief = parseBrief(text);
  const name = `${cfg.project}/${a.id}`;
  const problems = briefProblems(brief, a.id, cfg);
  if (problems.length) { console.error(`desk-check: the brief on ${baseRef} is malformed:\n  ${problems.join("\n  ")}`); return 1; }

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!a.anyBranch && branch !== brief.branch) { console.error(`desk-check: wrong_branch: you are on “${branch}”; this brief is worked on “${brief.branch}”`); return 1; }

  // An agent's name lives in its copy (agent.md writes `desk.slot` on the first turn), so a copy that
  // says it is one agent never pushes another's brief. The leader's review checkout (--any-branch)
  // carries no such name, or its own, so the copy's name is read only on the agent's own run.
  const slot = git(["config", "desk.slot"], { soft: true });
  if (!a.anyBranch && slot && slot !== brief.slot) {
    console.log(`desk-check FAILED for ${name}: wrong_agent: this copy is ${slot}'s (git config desk.slot), and the brief ${a.id} belongs to ${brief.slot}. ${WHY.wrong_agent}.`);
    return 1;
  }

  const mergeBase = git(["merge-base", baseRef, "HEAD"]);
  // Every commit of the branch is signed `Desk-Agent: <name>` (AGENTS.md); one signed by another agent
  // means a conversation lost its name. This part the leader's review runs too.
  // A brief handed from one agent to another (desk.mjs reassign) takes the first agent's
  // commits up to the commit it was handed at, and none after.
  const handedHas = (c) => brief.handed_head && spawnSync("git", ["merge-base", "--is-ancestor", c, brief.handed_head]).status === 0;
  const signed = (git(["log", "--format=%H%x01%B%x00", `${mergeBase}..HEAD`], { soft: true }) || "").split("\0").filter((x) => x.includes("\x01"))
    .flatMap((m) => { const [c, body] = m.replace(/^\n/, "").split("\x01"); return [...body.matchAll(/^Desk-Agent:\s*(\S+)/gm)].map((x) => ({ c, who: x[1] })); });
  const strays = [...new Set(signed.filter((s) => s.who !== brief.slot && !(s.who === brief.handed_from && handedHas(s.c))).map((s) => s.who))];
  if (strays.length) {
    console.log(`desk-check FAILED for ${name}: wrong_agent: a commit on this branch is signed Desk-Agent: ${strays.join(", ")}, and the brief ${a.id} belongs to ${brief.slot}. ${WHY.wrong_agent}.`);
    return 1;
  }
  const changed = changedFiles(mergeBase);
  const violations = scopeViolations({
    brief, changed, protectedPaths: protectedPaths(cfg),
    baseHas: (p) => git(["cat-file", "-e", `${mergeBase}:${p}`], { soft: true }) !== null,
  });
  if (violations.length) {
    console.log(`desk-check FAILED for ${name} (against ${baseRef}):`);
    for (const v of violations) console.log(`  ${v.path}  ${v.reason}: ${WHY[v.reason]}`);
    return 1;
  }
  console.log(`desk-check: every changed file is inside ${name}'s brief.`);

  if (a.run) {
    // Each agent's checks get ports of their own, so agents running side by side never meet.
    const env = { ...process.env, ...portEnv(cfg, agentNamed(cfg, brief.slot)) };
    // Run from inside a test, a check's own node --test would report to that test and exit 0 whatever failed.
    delete env.NODE_TEST_CONTEXT;
    const cmds = [];
    if (cfg.tests && a.affected) {
      const list = [...(git(["ls-files"]) || "").split("\n"), ...(git(["ls-files", "--others", "--exclude-standard"]) || "").split("\n")].filter(Boolean);
      const paths = [...new Set(changed.flatMap((c) => c.from ? [c.path, c.from] : [c.path]))];
      const got = affectedTests({ root: top, list, changed: paths, tests: cfg.tests });
      if (got.full) console.log(`\ndesk-check: ${got.why}.`);
      else console.log(`\ndesk-check: ${got.files.length} of ${got.total} test files read what this branch changed; they run with the ${got.always.length} always-run.`);
      const files = [...got.always, ...got.files];
      if (files.length) cmds.push(`${cfg.tests.run} ${files.join(" ")}`);
      cmds.push(...(cfg.tests.after || []));
    }
    // Every command runs to the end, and each is said : stopping at the first failure hid
    // whatever the later ones would have found.
    const all = [...cmds, ...brief.checks], failed = [];
    for (const cmd of all) {
      console.log(`\n$ ${cmd}`);
      const r = spawnSync("sh", ["-c", cmd], { stdio: "inherit", env });
      if (r.status !== 0) failed.push(`“${cmd}” exited ${r.status ?? r.signal}`);
    }
    if (failed.length) {
      console.log(`\ndesk-check FAILED for ${name}: ${failed.length} of ${all.length} command${all.length === 1 ? "" : "s"} failed:`);
      for (const f of failed) console.log(`  ${f}`);
      return 1;
    }
  }
  console.log(`\ndesk-check passed for ${name}${a.run ? "" : " (scope only; checks not run)"}.`);
  return 0;
}

try { process.exitCode = main(); }
catch (err) { console.error("desk-check:", err.message); process.exitCode = 2; }
