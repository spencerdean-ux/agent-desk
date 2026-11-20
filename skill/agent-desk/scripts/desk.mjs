#!/usr/bin/env node
// The desk's command line, for the leader, the owner and the agents alike.
//
//   node .agents/skills/agent-desk/scripts/desk.mjs validate                       desk.json, the board and every brief, checked
//   node .agents/skills/agent-desk/scripts/desk.mjs status                         who leads, each agent and the next thing to do
//   node .agents/skills/agent-desk/scripts/desk.mjs prompts [agent] [--review #N]  the prompt to paste for each agent (or one,
//                                                             with the pull request it is to review)
//   node .agents/skills/agent-desk/scripts/desk.mjs sync-board                     redraw the board's rows from desk.json
//   node .agents/skills/agent-desk/scripts/desk.mjs set <agent> <state> [--brief <id>] [--pr #N] [--notes "…"]
//                                                             move an agent's row (the leader, as the loop runs)
//   node .agents/skills/agent-desk/scripts/desk.mjs brief <id> --for <agent> --spec <step> --title "…" [--reviewer <name>]
//                                                             a new brief from the template, addressed to its agent
//   node .agents/skills/agent-desk/scripts/desk.mjs awake on|off [agent]           whether agents stay on the desk between steps
//                                                             (off unless turned on; one agent's own switch wins)
//   node .agents/skills/agent-desk/scripts/desk.mjs awake leader on|off [--idle <minutes>]
//                                                             whether the leader keeps watching the desk by itself
//                                                             (on unless turned off; asleep after 60 idle minutes)
//   node .agents/skills/agent-desk/scripts/desk.mjs move <agent>|all --to <tool> [--model <name>] [--started-by owner|leader] [--push]
//                                                             an agent (or every agent) into another tool or onto
//                                                             another model; --push makes the change on the work
//                                                             branch from any copy, an agent's included, in one commit
//   node .agents/skills/agent-desk/scripts/desk.mjs report <phase> [--brief <id>] [--pr #N] [--step "…"] [--words "…"] [--leader] [--fresh]
//                                                             what this copy's agent (or, with --leader, the leader)
//                                                             is doing: agents/desk/status/<name>.json on the work
//                                                             branch, one commit, nothing when the report is unchanged
//   node .agents/skills/agent-desk/scripts/desk.mjs autocompact <tokens> [agent]   where conversations compact (500000 unless set; the
//                                                             command writes each tool's setting from it)
//   node .agents/skills/agent-desk/scripts/desk.mjs doctor                         the whole desk checked: the board against origin's
//                                                             branches, the reports, GitHub (through gh) and this
//                                                             copy's own name, each finding with its fix
//   node .agents/skills/agent-desk/scripts/desk.mjs log [--since 2d|12h|<ISO>] [--agent <name>] [--limit <N>] [--md]
//                                                             the timeline of the work branch's desk commits
//   node .agents/skills/agent-desk/scripts/desk.mjs notify <event> [--agent <name>] [--brief <id>] [--pr #N] [--words "…"] [--post] [--force]
//                                                             tell the owner on the project's GitHub issue (blocked,
//                                                             silent, asleep, merged, question), once each;
//                                                             notify --setup --issue <N> [--events a,b] records the
//                                                             issue, notify --setup off clears it, notify alone says
//   node .agents/skills/agent-desk/scripts/desk.mjs preflight <brief id> [--pr #N] [--no-run]
//                                                             an agent's desk-check and its pull request report,
//                                                             written under .git/desk/; --pr puts it on the pull request
//   node .agents/skills/agent-desk/scripts/desk.mjs next [agent] [--list] | --done <ID> | --skip <ID> | --open <ID> [--note "…"]
//                                                             the next spec step for each agent without a brief, and
//                                                             the marks in agents/desk/progress.json
//   node .agents/skills/agent-desk/scripts/desk.mjs brief <id> --for <agent> --from-spec <ID> [--title "…"]
//                                                             a brief whose title and Goal come from the spec's step
//   node .agents/skills/agent-desk/scripts/desk.mjs refresh [--leader]              the card /agent-desk refresh reads back: who this copy's agent is,
//                                                             its row, its report, its step and the rules, from origin
//
// Each reads the files in this checkout; --ref <branch> reads them from a branch instead (after
// `git fetch origin`), for an agent whose checkout isn't the work branch. sync-board, set and brief
// write only here, on the work branch. Exit 0: done. 1: a problem, said. 2: it couldn't run.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, rmSync, renameSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { parseConfig, configProblems, agentNamed, isAwake, leaderAwake, moveAgents, autocompactOf, silenceMinutes, compactionFiles, subagentsOf, subagentFiles, notifyOf, portEnv, PROJECT, FORBIDDEN_BASES, shapeReviewers, SHAPES, AUTOCOMPACT_MIN, AUTOCOMPACT_MAX, NOTIFY_EVENTS, SUBAGENT_SCOPES, DEFAULT_SUBAGENTS, MAX_SUBAGENTS, TOOLS, TOOL_WORDS } from "./config.mjs";
import { MODELS, modelWords } from "./models.mjs";
import { PHASES, LEADER_PHASES, parseStatus, statusProblems, statusWords, sameReport, silence } from "./status.mjs";
import { parseBrief, briefProblems, briefSections, newBrief, reassignBrief, withReviewer } from "./brief.mjs";
import { nodeCounts, failingFiles, partWords } from "./suite.mjs";
import { codeFacts } from "./facts.mjs";
import { planDesk } from "./plan.mjs";
import { mergeJsonList, listProblems } from "./lists.mjs";
import { parseBoard, boardProblems, renderBoard, updateRow, prNumber, STATES } from "./board.mjs";
import { agentPrompt, nextStep } from "./prompts.mjs";
import { refreshCard } from "./refresh.mjs";
import { doctorFindings, doctorWords, pushRefusal, HOOKS_FIX } from "./doctor.mjs";
import { sinceDate, classifyCommit, formatLines, formatMarkdown } from "./log.mjs";
import { notifyBody, notifyKey, notifyLine } from "./notify.mjs";
import { preflightBody, prTitle } from "./preflight.mjs";
import { parseSpec, progressProblems, nextSteps, nextWords, listWords, stepGoal, stepContext, isSpecFile } from "./spec.mjs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { endProject } from "./cleanup.mjs";
import { DESK_ROOT, SKILL_HOME, SKILL_NAME, REPO_SKILL_HOMES, configPath, boardPath, assignmentsDir, queueDir, statusDir, progressPath } from "./paths.mjs";
import { writeRepoFiles, skillFile, skillVersion } from "./repo-files.mjs";

// The project's own files, set once the project is known (main): each project keeps them in a folder
// of its own, agents/desk/<project>/. QUEUE holds briefs written ahead, their tests in queue/tests/.
let CONFIG_PATH = "", BOARD = "", ASSIGNMENTS = "", QUEUE = "", STATUS_DIR = "", PROGRESS_PATH = "";
function useProject(project) {
  CONFIG_PATH = configPath(project); BOARD = boardPath(project); ASSIGNMENTS = assignmentsDir(project);
  QUEUE = queueDir(project); STATUS_DIR = statusDir(project); PROGRESS_PATH = progressPath(project);
}
const gitConf = (top, k) => (spawnSync("git", ["config", k], { cwd: top, encoding: "utf8" }).stdout || "").trim();
const queueFiles = (top, at) => {
  if (!at) return existsSync(join(top, QUEUE)) ? readdirSync(join(top, QUEUE)).filter((f) => f.endsWith(".md") && f !== "README.md").sort().map((f) => `${QUEUE}/${f}`) : [];
  const s = spawnSync("git", ["ls-tree", "--name-only", `${at}:${QUEUE}`], { cwd: top, encoding: "utf8" });
  return s.status === 0 ? s.stdout.split("\n").filter((f) => f.endsWith(".md") && f !== "README.md").sort().map((f) => `${QUEUE}/${f}`) : [];
};
const KEEP_WHEN_REMOVED = new Set(["ready", "in-progress", "review", "changes"]);
const USAGE = [
  "Usage: node .agents/skills/agent-desk/scripts/desk.mjs <command> [--project <name>] [--ref <branch>]",
  "  (--project names the desk where the repository holds more than one; a copy keeps its own in git config desk.project)",
  "  setup --project <name> [--title \"…\"] [--leader <name>] [--leader-tool <tool>] [--work-branch <branch>] [--repo <owner/name>]   set a project's desk up in agents/desk/<name>/, and give every agent's spin-up wording",
  "  migrate                                         move a desk from before each project had a folder of its own into agents/desk/<project>/",
  "  validate                                        desk.json, the board and every brief, checked",
  "  status                                          who leads, each agent and the next thing to do",
  "  prompts [agent] [--review #N]                   the prompt to paste for each agent, or one agent's, with a pull request to review",
  "  sync-board                                      redraw the board's rows from desk.json",
  "  set <agent> <state> [--brief <id>] [--pr #N] [--notes \"…\"]   move an agent's row: " + STATES.join(", "),
  "  brief <id> --for <agent> --spec <step> --title \"…\" [--reviewer <name>]   a new brief from the template",
  "  awake on|off [agent]                            whether agents stay on the desk between steps (off unless turned on)",
  "  awake leader on|off [--idle <minutes>]          whether the leader keeps watching by itself (on unless turned off; asleep after 60 idle minutes)",
  "  move <agent>|all --to <tool> [--model <name>] [--started-by owner|leader] [--push]   an agent into another tool; --push does it on the work branch from any copy",
  "  report <phase> [--brief <id>] [--pr #N] [--step \"…\"] [--words \"…\"] [--leader] [--fresh]   what this copy's agent is doing, on the work branch (" + PHASES.join(", ") + "); --fresh writes it even when unchanged",
  "  autocompact <tokens> [agent]                    where conversations compact (500000 unless set); setup and this command write each tool's setting",
  "  subagents <agent> on|off [--max N] [--scope review,checks] [--review-model <id>] [--checks-model <id>]   whether one agent may start subagents of its own (2, for review and checks, on the tool's defaults unless set); writes the tool's definition files",
  "  models [<tool>]                                 the four models each tool offers and which does what: plan, code, review, checks, other",
  "  doctor                                          the whole desk checked against origin, the reports, GitHub and this copy, each finding with its fix",
  "  log [--since 2d|12h|<ISO>] [--agent <name>] [--limit <N>] [--md]   the timeline of the work branch's desk commits, oldest first",
  "  notify <event> [--agent <name>] [--brief <id>] [--pr #N] [--words \"…\"] [--post] [--force]   tell the owner on the project's issue, once (" + NOTIFY_EVENTS.join(", ") + ")",
  "  notify --setup --issue <N> [--events a,b] | notify --setup --create | notify --setup off   where the owner is told (--create makes the issue); notify alone says",
  "  goodnight                                       the owner's good night: agents stop at their next look, then the desk; nothing moves until wake",
  "  wake                                            the owner's go at the leader: the desk is awake again, and names each agent's conversation to type go in",
  "  end [--yes] [--force]                           end the project: lists its branches; --yes archives the desk, deletes them and closes its pull requests and issue",
  "  preflight <brief id> [--pr #N] [--no-run]       desk-check and the pull request report, written under .git/desk/ (an agent's own)",
  "  next [agent] [--list] | --done <ID> | --skip <ID> | --open <ID> [--note \"…\"]   the next spec step for each agent without a brief; the marks in agents/desk/progress.json",
  "  brief <id> --for <agent> --from-spec <ID> [--title \"…\"]   a brief whose title and Goal are the spec step's",
  "  suite [--brief <id>]                            every part of the whole test command (desk.json's suite), each run to the end; with --brief, an open brief's own frozen test is expected red",
  "  reassign <brief id> --to <agent> [--pr #N]      hand an open brief to another agent: its header, both rows, and the decision for the old pull request",
  "  shape ring|pairs|reviewer <agent>               who reviews whom, by name: desk.json and every open and queued brief's reviewer",
  "  plan                                            each agent's next briefs from agents/desk/queue/, with the gaps where one would sit idle",
  "  up <brief id>                                   a queued brief and its tests moved in, and its agent's row set ready",
  "  resolve-lists                                   in a conflicted merge, settle desk.json's shared_lists (both sides kept and sorted, or rebuilt)",
  "  push                                            the leader's commits onto the work branch, taking in the agents' status commits and trying again",
  "  refresh [--leader]                              the card /agent-desk refresh reads back: who this copy's agent is, its row, its report, its step and the rules (--leader: the desk, for the leader)",
].join("\n");

// The words after the command: the plain ones in order, and each --name <value> (a --name followed by
// another --name, or by nothing, is a flag: its value is "").
function options(argv) {
  const plain = [], named = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) named[argv[i].slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : "";
    else plain.push(argv[i]);
  }
  return { plain, named };
}

// Where an agent's prompt is pasted, for each tool, in the cloud and in its app.
const WHERE = {
  "claude-code": "Claude Code, a session of its own on this repository (cloud: claude.ai/code; app: the desktop app or the claude command in a clone of its own)",
  codex: "Codex, a task of its own on this repository (cloud: Codex on the web, with this repository as its environment; app: the Codex app or command in a clone of its own)",
  antigravity: "Antigravity, a conversation of its own (cloud: a Remote Agents project on this repository; app: a project of its own whose one folder is this agent's own clone, started as Local, the repository's git hooks off)",
  other: "its own tool, a conversation of its own on this repository",
};
// The spin-up wording: for each agent named, where its prompt goes and the prompt itself, whole, in a
// block of its own. Setup and every command that changes who works where end with it.
function spinUp(cfg, names, { review } = {}) {
  const out = [];
  for (const n of names) {
    const a = agentNamed(cfg, n);
    if (!a) continue;
    const where = a.started_by === "leader" ? `${cfg.leader.name} starts ${a.name} itself, in its own tool, with this prompt` : `${WHERE[a.tool] || WHERE.other}. Paste it once; later, type go there`;
    out.push(`### ${a.name} on ${cfg.project}

Where: ${where}.

\`\`\`
${agentPrompt(cfg, a.name, { review })}
\`\`\`
`);
  }
  return out.join("\n");
}

// The sentence after a move: who works where now, what the owner pastes, and what a row mid-brief means.
function movedWords(cfg, next, moved, boardRows, notes = []) {
  const out = [];
  for (const name of moved) {
    const was = agentNamed(cfg, name), is = agentNamed(next, name);
    const tool = TOOL_WORDS[is.tool];
    out.push(`${name} now works in ${tool}${is.model ? ` on ${is.model}` : ""}${was.tool !== is.tool ? ` (it was in ${TOOL_WORDS[was.tool]}, whose conversation stops by itself at its next look or go)` : ""}, started by the ${is.started_by}.`);
    const r = boardRows[name];
    if (r && ["ready", "in-progress", "review", "changes"].includes(r.state)) out.push(`  ${name} is ${r.state} with ${r.brief}: its new conversation carries on from what is on origin (${r.branch || `desk/${cfg.project}/${name}/${r.brief}`}); anything unpushed in the old copy stays there, so have the old conversation push first if it matters.`);
  }
  for (const n of notes) out.push(`  ${n}`);
  const owner = moved.filter((n) => agentNamed(next, n).started_by === "owner");
  if (owner.length) out.push(`Next: node .agents/skills/agent-desk/scripts/desk.mjs prompts ${owner.length === 1 ? owner[0] : ""} gives the prompt${owner.length === 1 ? "" : "s"} to paste in the new tool, in ${owner.length === 1 ? `${owner[0]}'s` : "each agent's"} own conversation, once.`);
  const leader = moved.filter((n) => agentNamed(next, n).started_by === "leader");
  if (leader.length) out.push(`${cfg.leader.name} starts ${leader.join(", ")} itself.`);
  return out.join("\n");
}

// A change made on origin's work branch from any copy: a worktree of its own on origin/<base>, the
// change (mutate(wt, there) writes files there and answers { message, say }, or { skip } for nothing
// to do), one commit (signed by the copy's agent, if it has one), one push, and nothing of the copy
// touched. A push another push beat is tried three times; one the copy's own pre-push hook refused is
// said as such at once (the worktree shares the copy's config, so its core.hooksPath, and has no
// node_modules: a repository hook that needs them refuses every such push, and trying again clears
// nothing). The desk never bypasses a hook (--no-verify): an agent's copy keeps the hooks off.
// move --push and report use it.
function pushToBase(top, base, mutate) {
  const run = (cwd, cmd, a) => spawnSync(cmd, a, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const g = (cwd, ...a) => { const r = run(cwd, "git", a); if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${(r.stderr || "").trim()}`); return r.stdout.trim(); };
  const slot = run(top, "git", ["config", "desk.slot"]).stdout.trim();
  const hooks = run(top, "git", ["config", "core.hooksPath"]).stdout.trim();
  const tmp = mkdtempSync(join(tmpdir(), "desk-push-"));
  const wt = join(tmp, "wt");
  try {
    let last = "";
    for (let tries = 0; tries < 3; tries++) {
      g(top, "fetch", "-q", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`);
      if (existsSync(wt)) { run(top, "git", ["worktree", "remove", "--force", wt]); }
      g(top, "worktree", "add", "-q", "--detach", wt, `origin/${base}`);
      const there = parseConfig(readFileSync(join(wt, CONFIG_PATH), "utf8"));
      if (there.error || configProblems(there).length) throw new Error(`${CONFIG_PATH} on origin/${base} is wrong: ${there.error || configProblems(there).join("; ")}`);
      const out = mutate(wt, there, slot);
      if (out.skip) return out.skip;
      g(wt, "add", "-A");
      g(wt, "commit", "-q", "-m", out.message);
      const pushed = run(wt, "git", ["push", "-q", "origin", `HEAD:refs/heads/${base}`]);
      if (pushed.status === 0) return `${out.say}\nPushed to ${base} as ${g(wt, "rev-parse", "--short", "HEAD")}.`;
      last = (pushed.stderr || "").trim();
      if (pushRefusal(last, { hooksPath: hooks }).kind === "hook") throw new Error(`the push to ${base} was refused by this copy's pre-push hook (git config core.hooksPath = ${hooks || "the repository's own hooks"}): the desk pushes from a temporary worktree with no node_modules, so a repository hook that needs them, or a receipt, refuses it, and trying again clears nothing. Fix: ${HOOKS_FIX}, then run this again. The hook said: ${last.split("\n").slice(-3).join(" ")}`);
    }
    throw new Error(`the push to ${base} was refused three times (${pushRefusal(last).kind === "race" ? "another push kept landing first" : "not as a race: read git's words"}): ${last}`);
  } finally {
    run(top, "git", ["worktree", "remove", "--force", wt]);
    run(top, "git", ["worktree", "prune"]);
    rmSync(tmp, { recursive: true, force: true });
  }
}

// The move, made on origin's work branch (pushToBase): desk.json changed, and a `moved` report for
// each agent whose tool changed, so its old conversation's wait says so at its next look.
function pushMove(top, cfg, args) {
  return pushToBase(top, cfg.work_branch, (wt, there, slot) => {
    const { next, moved } = moveAgents(there, args);
    const problems = configProblems(next);
    if (problems.length) throw new Error(`not moved: ${problems.join("; ")}`);
    writeFileSync(join(wt, CONFIG_PATH), JSON.stringify(next, null, 2) + "\n");
    for (const n of moved) {
      const was = agentNamed(there, n), is = agentNamed(next, n);
      if (was.tool !== is.tool) writeStatus(wt, { desk: 1, project: there.project, agent: n, tool: was.tool, phase: "moved", brief: "", pr: "", step: "", words: `now in ${TOOL_WORDS[is.tool]}`, at: new Date().toISOString() });
    }
    const where = moved.map((n) => `${n} to ${TOOL_WORDS[agentNamed(next, n).tool]}${agentNamed(next, n).model ? ` on ${agentNamed(next, n).model}` : ""}`).join(", ");
    const rows = parseBoard(readFileSync(join(wt, BOARD), "utf8")).slots;
    return {
      message: [`desk(${there.project}): ${where} (the owner's word${slot ? `, from ${slot}'s copy` : ""})`, "", `Desk-Project: ${there.project}`, ...(slot ? [`Desk-Agent: ${slot}`] : [])].join("\n"),
      say: `Moved on origin/${there.work_branch}.\n${movedWords(there, next, moved, rows)}`,
    };
  });
}

const writeStatus = (dir, st) => { mkdirSync(join(dir, STATUS_DIR), { recursive: true }); writeFileSync(join(dir, STATUS_DIR, `${st.agent}.json`), JSON.stringify(st, null, 2) + "\n"); };
const readStatus = (dir, name) => { const p = join(dir, STATUS_DIR, `${name}.json`); return existsSync(p) ? parseStatus(readFileSync(p, "utf8")) : null; };

// The report, made on origin's work branch: this copy's agent (git config desk.slot and desk.tool),
// or the leader with --leader. An unchanged report (same phase, brief, pull request and step) pushes
// nothing, so a desk where nothing moves stays quiet.
function pushReport(top, cfg, { phase, brief, pr, step, words, leader, fresh }) {
  const run = (a) => spawnSync("git", a, { cwd: top, encoding: "utf8" }).stdout.trim();
  const slot = run(["config", "desk.slot"]);
  const name = leader ? cfg.leader.name : slot;
  if (!name) throw new Error("this copy has no agent's name (git config desk.slot): an agent's first turn saves it, and the leader reports with --leader");
  const phases = leader ? [...LEADER_PHASES, ...PHASES] : PHASES;
  if (!phases.includes(phase)) throw new Error(`“${phase ?? ""}” isn't a phase: ${phases.join(", ")}`);
  if (pr !== undefined && pr !== "" && !/\d/.test(pr)) throw new Error(`“${pr}” isn't a pull request: give its number, #N or its address`);
  return pushToBase(top, cfg.work_branch, (wt, there) => {
    const agent = leader ? there.leader : agentNamed(there, name);
    if (!agent) throw new Error(`${name} isn't on the ${there.project} desk any more`);
    const tool = (!leader && run(["config", "desk.tool"])) || agent.tool;
    const was = readStatus(wt, name);
    const st = { desk: 1, project: there.project, agent: name, tool, phase, brief: brief ?? was?.brief ?? "", pr: pr !== undefined ? prNumber(pr) : was?.pr ?? "", step: step ?? "", words: words ?? "", at: new Date().toISOString() };
    if (["taking", "stopped", "moved", "awake", "asleep"].includes(phase) && pr === undefined) st.pr = brief ? "" : st.pr;
    // --fresh writes it even when nothing changed, so a start (a new conversation, go) and the wait's
    // heartbeat move its time, and an agent that is there is never read as silent.
    if (!fresh && was && !was.error && sameReport(was, st)) return { skip: `${name} already says ${statusWords(was)}: unchanged, nothing pushed.` };
    writeStatus(wt, st);
    return {
      message: [`desk(${there.project}): ${name} ${[phase, st.brief, st.pr].filter(Boolean).join(" ")}`, "", `Desk-Project: ${there.project}`, ...(leader ? [] : [`Desk-Agent: ${name}`])].join("\n"),
      say: `${name} says: ${statusWords(st)}.`,
    };
  });
}

// gh, where it is: its answer, or { missing: true } when it isn't on PATH. Every GitHub call the desk
// makes is gh api (REST): a Claude Code cloud session refuses GraphQL, so gh pr and gh issue never run.
function gh(cwd, args, input) {
  const r = spawnSync("gh", args, { cwd, encoding: "utf8", input, maxBuffer: 16 * 1024 * 1024 });
  if (r.error && r.error.code === "ENOENT") return { missing: true, status: null, stdout: "", stderr: "" };
  return r;
}
const firstLine = (s) => String(s || "").trim().split("\n")[0] || "";

// The spec files under desk.json's specs (a file, or the .md files in a folder), here or on a ref.
function specFiles(top, at, specs) {
  if (!specs) return [];
  const clean = specs.replace(/\/+$/, "");
  if (!at) {
    const full = join(top, clean);
    if (!existsSync(full)) return [];
    if (isSpecFile(clean) && !readdirSync(join(top, clean), { withFileTypes: true }).length === false) return [clean];
    try { return readdirSync(full).filter(isSpecFile).sort().map((f) => `${clean}/${f}`); } catch { return [clean]; }
  }
  const one = spawnSync("git", ["cat-file", "-t", `${at}:${clean}`], { cwd: top, encoding: "utf8" });
  if ((one.stdout || "").trim() === "blob") return [clean];
  const r = spawnSync("git", ["ls-tree", "--name-only", `${at}:${clean}`], { cwd: top, encoding: "utf8" });
  return r.status === 0 ? r.stdout.split("\n").filter(isSpecFile).sort().map((f) => `${clean}/${f}`) : [];
}

function topLevel() {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : process.cwd();
}

// Where to read from: null for this checkout, else the branch (local if it is there, else origin's).
function refAt(top, ref) {
  if (!ref) return null;
  return spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: top }).status === 0 ? ref : `origin/${ref}`;
}

// A file from this checkout, or from the branch; null when it isn't there.
function reader(top, at) {
  if (!at) return (p) => existsSync(join(top, p)) ? readFileSync(join(top, p), "utf8") : null;
  return (p) => { const s = spawnSync("git", ["show", `${at}:${p}`], { cwd: top, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }); return s.status === 0 ? s.stdout : null; };
}

function statusNames(top, at) {
  const isStatus = (f) => f.endsWith(".json");
  if (!at) return existsSync(join(top, STATUS_DIR)) ? readdirSync(join(top, STATUS_DIR)).filter(isStatus).map((f) => f.slice(0, -5)) : [];
  const s = spawnSync("git", ["ls-tree", "--name-only", `${at}:${STATUS_DIR}`], { cwd: top, encoding: "utf8" });
  return s.status === 0 ? s.stdout.split("\n").filter(isStatus).map((f) => f.slice(0, -5)) : [];
}

function briefIds(top, at) {
  const isBrief = (f) => f.endsWith(".md") && f !== "_template.md";
  if (!at) return existsSync(join(top, ASSIGNMENTS)) ? readdirSync(join(top, ASSIGNMENTS)).filter(isBrief).map((f) => f.slice(0, -3)) : [];
  const s = spawnSync("git", ["ls-tree", "--name-only", `${at}:${ASSIGNMENTS}`], { cwd: top, encoding: "utf8" });
  return s.status === 0 ? s.stdout.split("\n").filter(isBrief).map((f) => f.slice(0, -3)) : [];
}

// The projects with a desk here (or on a ref): every folder under agents/desk/ that holds a desk.json.
function projectsAt(top, at) {
  if (!at) return existsSync(join(top, DESK_ROOT)) ? readdirSync(join(top, DESK_ROOT), { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(join(top, configPath(e.name)))).map((e) => e.name).sort() : [];
  const s = spawnSync("git", ["ls-tree", "-r", "--name-only", `${at}:${DESK_ROOT}`], { cwd: top, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return s.status === 0 ? s.stdout.split("\n").map((l) => /^([^/]+)\/desk\.json$/.exec(l)).filter(Boolean).map((m) => m[1]).sort() : [];
}

// Setting a project up (the skill's setup, after the leader has asked the owner): the project's name is
// the one thing never guessed. The repository is read from origin and the work branch is this
// checkout's, unless that is the default or a release branch. A project already set up keeps its own
// settings. It ends, always, with the wording that starts each agent.
function setup(top, named) {
  const project = named.project;
  if (!project) { console.error(`setup needs the project's name: node ${SKILL_HOME}/scripts/desk.mjs setup --project <name> [--title "<one line>"] [--leader <name>] [--leader-tool claude-code|codex|antigravity|other] [--work-branch <branch>] [--repo <owner/name>]\nAsk the owner for it (lower-case letters, digits and hyphens, such as garden-app): it is never made up, and it goes into every branch, brief, prompt and pull request of this desk.`); return 2; }
  if (!PROJECT.test(project)) { console.error(`“${project}” can't be a project's name: lower-case letters, digits and hyphens, starting with a letter, such as garden-app.`); return 2; }
  const g = (...a) => { const r = spawnSync("git", a, { cwd: top, encoding: "utf8" }); return r.status === 0 ? r.stdout.trim() : ""; };
  const path = configPath(project);
  let cfg, fresh = false;
  if (existsSync(join(top, path))) {
    cfg = parseConfig(readFileSync(join(top, path), "utf8"));
    if (cfg.error) { console.error(`${path} isn't JSON, so it was left alone: ${cfg.error}`); return 2; }
  } else {
    fresh = true;
    const repo = named.repo || (/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(g("remote", "get-url", "origin")) || [])[1] || "";
    if (!repo) { console.error("setup can't tell the GitHub repository (there is no GitHub origin here): name it with --repo <owner/name>."); return 2; }
    const here = g("rev-parse", "--abbrev-ref", "HEAD");
    const def = g("symbolic-ref", "--short", "refs/remotes/origin/HEAD").replace(/^origin\//, "");
    const branch = named["work-branch"] || here;
    if (!branch || branch === "HEAD" || FORBIDDEN_BASES.includes(branch) || (branch === def && !named["work-branch"])) {
      console.error(`setup needs a work branch for ${project}: this checkout is on ${here === "HEAD" || !here ? "no branch" : here}, ${FORBIDDEN_BASES.includes(branch) || branch === def ? "which agents never work straight into" : "so there is none to take"}. Make one and name it: git switch -c work/${project} && node ${SKILL_HOME}/scripts/desk.mjs setup --project ${project} --work-branch work/${project}`);
      return 2;
    }
    cfg = { ...JSON.parse(skillFile("templates/desk.json")), project, repository: repo, work_branch: branch };
    // The leader is whoever runs setup: its own name and tool, never one assumed.
    if (named.leader) cfg.leader = { ...cfg.leader, name: named.leader };
    if (named["leader-tool"]) cfg.leader = { ...cfg.leader, tool: named["leader-tool"] };
    if (named.title) cfg.title = named.title;
    else delete cfg.title;
  }
  cfg.kit = { version: skillVersion() };
  const problems = configProblems(cfg);
  if (problems.length) { console.error(`${fresh ? "The desk can't be set up like that" : `${path} has problems`}; nothing was written:\n  ${problems.join("\n  ")}`); return 2; }
  useProject(project);
  mkdirSync(join(top, DESK_ROOT, project), { recursive: true });
  writeFileSync(join(top, path), JSON.stringify(cfg, null, 2) + "\n");
  if (!existsSync(join(top, BOARD))) writeFileSync(join(top, BOARD), renderBoard(cfg));
  const written = writeRepoFiles(top, cfg);
  const others = projectsAt(top, null).filter((p) => p !== project);
  console.log([
    `The desk for ${project}${cfg.title ? ` (${cfg.title})` : ""} is ${fresh ? "set up" : "already set up, and kept as it was"} in ${DESK_ROOT}/${project}/: ${cfg.agents.length} agents, led by ${cfg.leader.name}, in ${cfg.repository}, working into ${cfg.work_branch}.`,
    `Also written, for the whole repository: ${written.join(", ")}.`,
    others.length ? `Other projects here, each on its own: ${others.join(", ")}. Add --project ${project} to this desk's commands, or once for this copy: git config desk.project ${project}.` : "",
    REPO_SKILL_HOMES.every((h) => existsSync(join(top, h, SKILL_NAME, "SKILL.md"))) ? "" : `The skill itself isn't in this repository yet, so a cloud agent can't read its steps: node <this skill>/scripts/install.mjs --target . puts it in ${REPO_SKILL_HOMES.join("/ and ")}/.`,
    fresh ? `Change who works on what in ${path} (the agents, their tools, models, jobs and reviewers), then: node ${SKILL_HOME}/scripts/desk.mjs sync-board --project ${project} && node ${SKILL_HOME}/scripts/desk.mjs validate --project ${project}.` : "",
    `Next: commit and push to ${cfg.work_branch}. Then start each agent with its wording below (node ${SKILL_HOME}/scripts/desk.mjs prompts --project ${project} gives it again at any time):`,
    "",
    spinUp(cfg, cfg.agents.map((a) => a.name)),
  ].filter((l, i, a) => l !== "" || a[i + 1] !== undefined && i === a.length - 2).join("\n"));
  return 0;
}

// A desk from before each project had a folder of its own (agents/desk/desk.json, the steps and scripts
// copied into the repository, seven skills): its project's files move into agents/desk/<project>/, the
// old copies go, and every agent gets its new wording, as its old prompt names paths that are gone.
function migrate(top) {
  const old = join(top, DESK_ROOT, "desk.json");
  if (!existsSync(old)) { console.log(`Nothing to migrate: there is no ${DESK_ROOT}/desk.json here.`); return 1; }
  const cfg = parseConfig(readFileSync(old, "utf8"));
  if (cfg.error || !PROJECT.test(cfg.project || "")) { console.error(`${DESK_ROOT}/desk.json can't be read for its project's name${cfg.error ? ` (${cfg.error})` : ""}: mend it first.`); return 2; }
  const project = cfg.project, dest = join(top, DESK_ROOT, project);
  if (existsSync(join(dest, "desk.json"))) { console.error(`${DESK_ROOT}/${project}/desk.json is already there: nothing was moved.`); return 2; }
  mkdirSync(dest, { recursive: true });
  const mv = (a, z) => { if (!existsSync(join(top, a))) return; mkdirSync(dirname(join(top, z)), { recursive: true }); if (spawnSync("git", ["mv", a, z], { cwd: top }).status !== 0) renameSync(join(top, a), join(top, z)); };
  const rm = (a) => { if (!existsSync(join(top, a))) return; spawnSync("git", ["rm", "-rqf", "--ignore-unmatch", a], { cwd: top }); rmSync(join(top, a), { recursive: true, force: true }); };
  rm(`${DESK_ROOT}/assignments/_template.md`);
  for (const f of ["desk.json", "board.md", "progress.json", "assignments", "queue", "status", "archive"]) {
    const src = join(top, DESK_ROOT, f);
    if (existsSync(src) && (!statSync(src).isDirectory() || readdirSync(src).length)) mv(`${DESK_ROOT}/${f}`, `${DESK_ROOT}/${project}/${f}`);
    else rm(`${DESK_ROOT}/${f}`);
  }
  for (const gone of [`${DESK_ROOT}/protocol`, `${DESK_ROOT}/README.md`, "scripts/desk"]) rm(gone);
  for (const home of REPO_SKILL_HOMES) for (const s of ["desk-install", "desk-setup", "desk-lead", "desk-agent", "desk-status", "desk-refresh"]) rm(`${home}/${s}`);
  if (existsSync(join(top, "scripts")) && !readdirSync(join(top, "scripts")).length) rmSync(join(top, "scripts"), { recursive: true });
  const next = { ...cfg, kit: { version: skillVersion() } };
  useProject(project);
  writeFileSync(join(top, CONFIG_PATH), JSON.stringify(next, null, 2) + "\n");
  const written = writeRepoFiles(top, next);
  console.log([
    `The desk for ${project} now lives in ${DESK_ROOT}/${project}/ (desk.json, the board, the briefs, the queue, the reports). The steps and scripts copied into the repository before, and the six older skills, are gone: they are the skill's own now, in ${SKILL_HOME}/.`,
    `Written again for the repository: ${written.join(", ")}.`,
    REPO_SKILL_HOMES.every((h) => existsSync(join(top, h, SKILL_NAME, "scripts", "desk.mjs"))) ? "" : `The skill isn't in this repository yet: node <this skill>/scripts/install.mjs --target . puts it in, and the agents need it there.`,
    `Next: node ${SKILL_HOME}/scripts/desk.mjs validate, commit, and push to ${next.work_branch}. Every agent's old prompt names paths that are gone, so stop each conversation's wait and give it its new wording:`,
    "",
    spinUp(next, next.agents.map((a) => a.name)),
  ].filter((l, i, a) => l !== "" || i === a.length - 2).join("\n"));
  return 0;
}

function main(argv) {
  const refIdx = argv.indexOf("--ref");
  const ref = refIdx >= 0 ? argv[refIdx + 1] : "";
  const rest = refIdx >= 0 ? argv.filter((_, i) => i !== refIdx && i !== refIdx + 1) : argv;
  const [cmd, ...words] = rest;
  const { plain, named } = options(words);
  const [name] = plain;
  const top = topLevel();
  const at = refAt(top, ref);
  const read = reader(top, at);
  if (!cmd || cmd === "help" || cmd === "--help") { console.log(USAGE); return cmd ? 0 : 2; }
  if (cmd === "setup") return setup(top, named);
  if (cmd === "migrate") return migrate(top);
  if (read(`${DESK_ROOT}/desk.json`) !== null && projectsAt(top, at).length === 0) { console.error(`This repository holds a desk from before the skill kept each project in a folder of its own (${DESK_ROOT}/desk.json). Move it with: node ${SKILL_HOME}/scripts/desk.mjs migrate`); return 2; }
  // Which project: the one named, else this copy's own (git config desk.project), else the only one here.
  const all = projectsAt(top, at);
  const own = gitConf(top, "desk.project");
  const project = named.project || (all.includes(own) ? own : "") || (all.length === 1 ? all[0] : "");
  delete named.project;
  if (!project) {
    if (!all.length) console.error(`There is no desk ${ref ? `on ${ref}` : "here"}: no project is set up under ${DESK_ROOT}/. The leader's /agent-desk setup does it, and asks the project's name (node ${SKILL_HOME}/scripts/desk.mjs setup --project <name>).`);
    else console.error(`${all.length} projects have a desk ${ref ? `on ${ref}` : "here"}: ${all.join(", ")}. Say which with --project <name>, or once for this copy: git config desk.project <name>.`);
    return 2;
  }
  useProject(project);
  const text = read(CONFIG_PATH);
  if (text === null) { console.error(`There is no ${CONFIG_PATH}${ref ? ` on ${ref}` : " here"}: the project ${project} isn't set up${all.length ? ` (set up: ${all.join(", ")})` : ""}. The leader's /agent-desk setup does it.`); return 2; }
  const cfg = parseConfig(text);
  const wrong = configProblems(cfg);
  if (wrong.length && cmd !== "validate") { console.error(`${CONFIG_PATH} is wrong:\n  ${wrong.join("\n  ")}`); return 1; }
  const briefOf = (id) => { const t = read(`${ASSIGNMENTS}/${id}.md`); return t === null ? null : parseBrief(t); };
  const statusOf = (name) => { const t = read(`${STATUS_DIR}/${name}.json`); return t === null ? null : parseStatus(t); };
  // Every agent's report by name, for the board checks (a pull request belongs to one brief).
  const reportsOf = (dir, ref) => Object.fromEntries(statusNames(dir, ref).map((n) => [n, statusOf(n)]).filter(([, st]) => st && !st.error));
  const boardText = read(BOARD);
  const board = parseBoard(boardText || "");

  switch (cmd) {
    case "validate": {
      const problems = [...wrong.map((p) => `desk.json: ${p}`)];
      if (!wrong.length) {
        if (boardText === null) problems.push(`there is no ${BOARD}: run .agents/skills/agent-desk/scripts/desk.mjs sync-board`);
        else problems.push(...boardProblems(board, briefOf, cfg, { reports: reportsOf(top, at) }).map((p) => `board: ${p}`));
        for (const id of briefIds(top, at)) problems.push(...briefProblems(briefOf(id), id, cfg).map((p) => `${id}: ${p}`));
        for (const name of statusNames(top, at)) problems.push(...statusProblems(statusOf(name), cfg).map((p) => `status/${name}.json: ${p}`));
        const progressText = read(PROGRESS_PATH);
        if (progressText !== null) {
          let progress; try { progress = JSON.parse(progressText); } catch (err) { progress = { error: `isn't JSON: ${err.message}` }; }
          const steps = specFiles(top, at, cfg.specs).flatMap((f) => parseSpec(read(f) || "", f).steps);
          problems.push(...progressProblems(progress, cfg, steps).map((p) => `progress.json: ${p}`));
        }
      }
      if (problems.length) { console.log(`The desk has ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n  ${problems.join("\n  ")}`); return 1; }
      console.log(`The desk for ${cfg.project} is in order: ${cfg.agents.length} agent${cfg.agents.length === 1 ? "" : "s"}, led by ${cfg.leader.name}, working into ${cfg.work_branch}.`);
      return 0;
    }
    case "status": {
      const out = [
        `Project ${cfg.project}${cfg.title ? `: ${cfg.title}` : ""}`,
        `Desk in ${cfg.repository}, working into ${cfg.work_branch}.`,
        `Leader: ${cfg.leader.name} (${cfg.leader.tool}${cfg.leader.model ? `, ${cfg.leader.model}` : ""}).`,
        "",
        "| Agent | Tool | Model | Job | Reviewer | Started by | State | Brief | PR | Agent says |",
        "|---|---|---|---|---|---|---|---|---|---|",
      ];
      const now = Date.now();
      const says = (name) => {
        const st = statusOf(name);
        if (!st) return "nothing yet";
        if (st.error) return `an unreadable report (${st.error})`;
        const quiet = silence(cfg, st, now);
        return quiet ? `silent ${quiet} min (last: ${st.phase}, ${st.at.slice(11, 16)} UTC)` : statusWords(st, now);
      };
      for (const a of cfg.agents) {
        const r = board.slots[a.name] || {};
        out.push(`| ${a.name} | ${a.tool} | ${a.model || "the tool's own"} | ${a.job} | ${a.reviewer} | ${a.started_by} | ${r.state || "no row"} | ${r.brief || ""} | ${r.pr || ""} | ${says(a.name)} |`);
      }
      const ls = statusOf(cfg.leader.name);
      out.push("", `The leader ${cfg.leader.name} says: ${ls && !ls.error ? statusWords(ls, now) : "nothing yet"}. An awake agent is silent after ${silenceMinutes(cfg)} minutes without a report (silence_minutes).`);
      out.push(`Conversations compact at ${autocompactOf(cfg).toLocaleString("en-GB")} tokens${cfg.agents.some((a) => a.autocompact != null) ? ` (${cfg.agents.filter((a) => a.autocompact != null).map((a) => `${a.name}: ${autocompactOf(cfg, a).toLocaleString("en-GB")}`).join(", ")})` : ""} (node .agents/skills/agent-desk/scripts/desk.mjs autocompact <tokens> [agent]).`);
      const subs = cfg.agents.map((a) => [a, subagentsOf(cfg, a)]).filter(([, s]) => s);
      out.push(subs.length
        ? `Subagents: ${subs.map(([a, s]) => `${a.name} up to ${s.max} (${s.scope.join(", ")}) on ${s.scope.map((k) => `${s.models[k]} for ${k}`).join(", ")}`).join("; ")}${subs.length < cfg.agents.length ? `; ${cfg.agents.filter((a) => !subagentsOf(cfg, a)).map((a) => a.name).join(", ")} none` : ""} (node .agents/skills/agent-desk/scripts/desk.mjs subagents <agent> on|off).`
        : "Subagents: none; every pull request waits for its reviewer agent (node .agents/skills/agent-desk/scripts/desk.mjs subagents <agent> on gives one agent up to 2, for review and checks).");
      out.push(notifyLine(cfg));
      if (!notifyOf(cfg) && cfg.agents.some((a) => isAwake(cfg, a))) out.push("Automatic checking is on and nobody is told when an agent goes silent: node .agents/skills/agent-desk/scripts/desk.mjs notify --setup --create makes the issue.");
      if (cfg.asleep) out.push("", `The desk is asleep since ${String(cfg.asleep).slice(0, 16).replace("T", " ")} UTC (the owner's good night): nothing moves until the owner types go at the leader (node .agents/skills/agent-desk/scripts/desk.mjs wake), then in each agent's conversation.`);
      const la = leaderAwake(cfg);
      out.push("", la.on ? `The leader ${cfg.leader.name} is awake: it watches the desk by itself and sleeps after ${la.idleMinutes} minutes without activity (node .agents/skills/agent-desk/scripts/desk.mjs awake leader on|off [--idle <minutes>]).` : `The leader ${cfg.leader.name} is not awake: the owner's /agent-desk lead check moves the desk (node .agents/skills/agent-desk/scripts/desk.mjs awake leader on [--idle <minutes>]).`);
      const awake = cfg.agents.filter((a) => isAwake(cfg, a)).map((a) => a.name), asleep = cfg.agents.filter((a) => !isAwake(cfg, a)).map((a) => a.name);
      out.push((awake.length ? `${awake.join(", ")} ${awake.length === 1 ? "stays" : "stay"} awake between steps` : "No agent stays awake between steps") + (asleep.length ? `; ${asleep.join(", ")} ${asleep.length === 1 ? "waits" : "wait"} for go` : "") + " (node .agents/skills/agent-desk/scripts/desk.mjs awake on|off [agent]).");
      out.push("", "Next:");
      for (const a of cfg.agents) out.push(`- ${a.name}: ${nextStep(cfg, a.name, board.slots[a.name])}`);
      // Each open brief's branch head on origin , so a push after the last decision shows.
      const remote = spawnSync("git", ["ls-remote", "origin", `refs/heads/desk/${cfg.project}/*`], { cwd: top, encoding: "utf8" });
      if (remote.status === 0) {
        const heads = Object.fromEntries((remote.stdout || "").split("\n").filter(Boolean).map((l) => { const [s, r] = l.split("\t"); return [r.replace(/^refs\/heads\//, ""), s]; }));
        const open = cfg.agents.map((a) => [a, board.slots[a.name]]).filter(([, r]) => r && KEEP_WHEN_REMOVED.has(r.state) && r.brief);
        if (open.length) out.push("", "Heads on origin:", ...open.map(([a, r]) => { const b = r.branch || `desk/${cfg.project}/${a.name}/${r.brief}`; return `- ${a.name}: ${b} ${heads[b] ? `at ${heads[b].slice(0, 7)}` : "isn't pushed yet"}`; }));
      }
      const problems = boardText === null ? [`there is no ${BOARD}`] : boardProblems(board, briefOf, cfg);
      if (problems.length) out.push("", "Problems:", ...problems.map((p) => `- ${p}`));
      console.log(out.join("\n"));
      return 0;
    }
    case "prompts": {
      const agents = name ? cfg.agents.filter((a) => a.name === name) : cfg.agents;
      if (!agents.length) { console.error(`“${name}” isn't an agent on this desk (${cfg.agents.map((a) => a.name).join(", ")})`); return 1; }
      if (named.review !== undefined && !name) { console.error("--review names a pull request for one agent: node .agents/skills/agent-desk/scripts/desk.mjs prompts <agent> --review #N"); return 1; }
      console.log(spinUp(cfg, agents.map((a) => a.name), { review: named.review }));
      return 0;
    }
    case "set": {
      if (ref) { console.error("set writes the board in this checkout: run it on the work branch, without --ref"); return 2; }
      const [agent, state] = plain;
      if (!agent || !state) { console.error("Usage: node .agents/skills/agent-desk/scripts/desk.mjs set <agent> <state> [--brief <id>] [--pr #N] [--notes \"…\"]"); return 2; }
      if (!agentNamed(cfg, agent)) { console.error(`“${agent}” isn't an agent on this desk (${cfg.agents.map((a) => a.name).join(", ")})`); return 1; }
      if (!STATES.includes(state)) { console.error(`“${state}” isn't a state: ${STATES.join(", ")}`); return 1; }
      if (boardText === null) { console.error(`there is no ${BOARD}: run .agents/skills/agent-desk/scripts/desk.mjs sync-board first`); return 1; }
      if (named.pr !== undefined && !/\d/.test(named.pr)) { console.error(`“${named.pr}” isn't a pull request: give its number, #N or its address`); return 1; }
      const was = board.slots[agent] || {};
      const rows = updateRow(board.slots, cfg, agent, { state, brief: named.brief, pr: named.pr, notes: named.notes });
      const problems = boardProblems({ ...board, slots: rows }, briefOf, cfg, { reports: reportsOf(top, at) }).filter((p) => p.startsWith(agent) || p.includes(`“${agent}”`));
      if (problems.length) { console.error(`Not set: ${problems.join("; ")}`); return 1; }
      writeFileSync(join(top, BOARD), renderBoard(cfg, rows));
      const r = rows[agent];
      const cleared = was.pr && !r.pr && r.state !== "idle" ? ` (${was.pr} was ${was.brief}'s and is cleared)` : "";
      console.log(`${agent} is ${r.state}${r.brief ? ` with ${r.brief}` : ""}${r.pr ? ` (${r.pr})` : ""} on ${cfg.project}${cleared}. Next: ${nextStep(cfg, agent, r)}`);
      return 0;
    }
    case "brief": {
      if (ref) { console.error("brief writes a file in this checkout: run it on the work branch, without --ref"); return 2; }
      const [id] = plain;
      if (!id || !named.for) { console.error("Usage: node .agents/skills/agent-desk/scripts/desk.mjs brief <id> --for <agent> --spec <step> --title \"…\" [--reviewer <name>]\n       node .agents/skills/agent-desk/scripts/desk.mjs brief <id> --for <agent> --from-spec <ID> [--title \"…\"] [--reviewer <name>]"); return 2; }
      let fromSpec = null;
      if (named["from-spec"] !== undefined) {
        const files = specFiles(top, at, cfg.specs);
        const steps = files.flatMap((f) => parseSpec(read(f) || "", f).steps);
        fromSpec = steps.find((st) => st.id === named["from-spec"]);
        if (!fromSpec) { console.error(`${named["from-spec"] || "(nothing)"} isn't a step in ${cfg.specs || "the spec"}${steps.length ? ` (${steps.map((st) => st.id).join(", ")})` : " (no \`### A1. Title\` heading found)"}`); return 1; }
      }
      const template = skillFile("templates/brief.md");
      const file = `${ASSIGNMENTS}/${id}.md`;
      if (read(file) !== null) { console.error(`${file} exists already, and a brief is never written over: pick another id, or edit that one`); return 1; }
      let text;
      try { text = newBrief(template, cfg, { id, slot: named.for, spec: fromSpec ? fromSpec.id : named.spec, title: named.title || (fromSpec ? fromSpec.title.slice(0, 120) : undefined), reviewer: named.reviewer, goal: fromSpec ? stepGoal(fromSpec) : undefined, context: fromSpec ? stepContext(fromSpec) : undefined }); }
      catch (err) { console.error(`Not written: ${err.message}`); return 1; }
      mkdirSync(join(top, ASSIGNMENTS), { recursive: true });
      writeFileSync(join(top, file), text);
      console.log([
        `${file} is addressed to ${named.for} on ${cfg.project} (reviewer ${parseBrief(text).reviewer}, branch ${parseBrief(text).branch}).`,
        "Next: fill in may_change, frozen and checks, and the sections under them; commit it with its frozen tests;",
        `then node .agents/skills/agent-desk/scripts/desk.mjs set ${named.for} ready --brief ${id}, and validate.`,
      ].join("\n"));
      return 0;
    }
    case "awake": {
      if (ref) { console.error("awake writes desk.json in this checkout: run it on the work branch, without --ref"); return 2; }
      if (plain[0] === "leader") {
        const mode = plain[1];
        if (!["on", "off"].includes(mode)) { console.error("Usage: node .agents/skills/agent-desk/scripts/desk.mjs awake leader on|off [--idle <minutes>]   (on unless turned off; asleep after 60 minutes without activity)"); return 2; }
        const leader = { ...cfg.leader, awake: mode === "on" };
        if (named.idle !== undefined) leader.idle_minutes = /^\d+$/.test(named.idle) ? Number(named.idle) : NaN;
        const next = { ...cfg, leader };
        const problems = configProblems(next);
        if (problems.length) { console.error(`Not set: ${problems.join("; ")}`); return 1; }
        writeFileSync(join(top, CONFIG_PATH), JSON.stringify(next, null, 2) + "\n");
        const la = leaderAwake(next);
        console.log(`The leader ${cfg.leader.name} is ${la.on ? `awake on ${cfg.project}: it watches the desk by itself and sleeps after ${la.idleMinutes} minutes without activity` : `not awake on ${cfg.project}: the owner's /agent-desk lead check moves the desk`}. Next: commit and push desk.json.`);
        return 0;
      }
      const [mode, who] = plain;
      if (!["on", "off"].includes(mode)) { console.error("Usage: node .agents/skills/agent-desk/scripts/desk.mjs awake on|off [agent]   (off unless turned on; an agent's own switch wins over the desk's)"); return 2; }
      if (who && !agentNamed(cfg, who)) { console.error(`“${who}” isn't an agent on this desk (${cfg.agents.map((a) => a.name).join(", ")})`); return 1; }
      const on = mode === "on";
      // Automatic checking with nobody told is how a hung agent goes unnoticed for hours: turning it
      // on needs the issue the silence warning is posted on, unless the owner says otherwise.
      if (on && !notifyOf(cfg) && named["no-notify"] === undefined) {
        console.error(`Not set: automatic checking needs somewhere to tell the owner when an agent goes silent for ${silenceMinutes(cfg)} minutes, and this desk has no notifications issue. Make one first: node .agents/skills/agent-desk/scripts/desk.mjs notify --setup --create (or notify --setup --issue <N> for one that exists), then run this again. To go without the warning, in so many words: awake on${who ? ` ${who}` : ""} --no-notify.`);
        return 1;
      }
      // The desk's switch is written after work_branch, where a reader looks for it; setting it for the
      // whole desk drops each agent's own, so "awake on" means everyone.
      const next = {};
      for (const [k, v] of Object.entries(cfg)) {
        if (k === "awake") { if (who) next.awake = v; continue; }
        if (k === "agents") next.agents = v.map((a) => { const b = { ...a }; if (!who) delete b.awake; else if (a.name === who) b.awake = on; return b; });
        else next[k] = v;
        if (k === "work_branch" && !who) next.awake = on;
      }
      if (!who && next.awake === undefined) next.awake = on;
      const problems = configProblems(next);
      if (problems.length) { console.error(`Not set: ${problems.join("; ")}`); return 1; }
      writeFileSync(join(top, CONFIG_PATH), JSON.stringify(next, null, 2) + "\n");
      const awake = next.agents.filter((a) => isAwake(next, a)).map((a) => a.name);
      console.log(`${who ? `${who} is` : "The desk is"} ${on ? "awake" : "not awake"} on ${cfg.project}: ${awake.length ? `${awake.join(", ")} ${awake.length === 1 ? "stays" : "stay"} on the desk between steps` : "every agent waits for go"}. Next: commit and push desk.json; a running agent reads the switch at its next look or go.${on && !notifyOf(next) ? " As you asked, nobody is told when an agent goes silent (notify --setup --create mends that)." : ""}`);
      return 0;
    }
    case "goodnight": {
      // The owner's good night: desk.json says since when, on the work branch, from any copy. The
      // agents stop at their next look and the leader once they have; awake is left as it was.
      if (ref) { console.error("goodnight writes on the work branch from this copy: never through --ref"); return 2; }
      try {
        console.log(pushToBase(top, cfg.work_branch, (wt, there) => {
          if (there.asleep) return { skip: `The ${there.project} desk is already asleep (since ${String(there.asleep).slice(11, 16)} UTC): nothing pushed. The owner's go wakes it: node .agents/skills/agent-desk/scripts/desk.mjs wake.` };
          const next = { ...there, asleep: new Date().toISOString() };
          writeFileSync(join(wt, CONFIG_PATH), JSON.stringify(next, null, 2) + "\n");
          const awake = there.agents.filter((a) => isAwake(there, a)).map((a) => a.name);
          return {
            message: [`desk(${there.project}): good night (the owner's word)`, "", `Desk-Project: ${there.project}`].join("\n"),
            say: `Good night: the ${there.project} desk is going to sleep. ${awake.length ? `${awake.join(", ")} ${awake.length === 1 ? "stops" : "stop"} at ${awake.length === 1 ? "its" : "their"} next look, within a few minutes, and report asleep` : "No agent is on automatic checking, so none has to stop"}; then watch once more (wait.mjs --leader) and it tells you to sleep too. Nothing moves until the owner types go here first (desk.mjs wake), then in each agent's conversation.`,
          };
        }));
        return 0;
      } catch (err) { console.error(`Not asleep: ${err.message}`); return 1; }
    }
    case "wake": {
      if (ref) { console.error("wake writes on the work branch from this copy: never through --ref"); return 2; }
      try {
        console.log(pushToBase(top, cfg.work_branch, (wt, there) => {
          if (!there.asleep) return { skip: `The ${there.project} desk isn't asleep: nothing pushed.` };
          const next = { ...there }; delete next.asleep;
          writeFileSync(join(wt, CONFIG_PATH), JSON.stringify(next, null, 2) + "\n");
          return {
            message: [`desk(${there.project}): awake again (the owner's go)`, "", `Desk-Project: ${there.project}`].join("\n"),
            say: [`The ${there.project} desk is awake again. Now type go in each agent's own conversation:`, ...there.agents.map((a) => `- ${a.name}: go, in ${a.tool === "other" ? "its own conversation" : `its ${TOOL_WORDS[a.tool]} conversation`}${isAwake(there, a) ? " (it goes back to automatic checking)" : ""}`), "An agent told go before this would have stopped: the desk was asleep."].join("\n"),
          };
        }));
        spawnSync("git", ["config", "desk.leader.active", new Date().toISOString()], { cwd: top });
        return 0;
      } catch (err) { console.error(`Not woken: ${err.message}`); return 1; }
    }
    case "end": {
      if (ref) { console.error("end changes the work branch and origin from the leader's checkout: never through --ref"); return 2; }
      return endProject({ top, cfg, yes: named.yes !== undefined, force: named.force !== undefined, gh });
    }
    case "move": {
      if (ref) { console.error("move writes desk.json here, or with --push on the work branch from any copy: never through --ref"); return 2; }
      const [who] = plain;
      const args = { who, to: named.to, model: named.model, startedBy: named["started-by"] };
      if (!who || (args.to === undefined && args.model === undefined && args.startedBy === undefined)) { console.error("Usage: node .agents/skills/agent-desk/scripts/desk.mjs move <agent>|all --to <tool> [--model <name>] [--started-by owner|leader] [--push]\n  tools: claude-code, codex, antigravity, other. --push makes the change on the work branch from any copy, an agent's included."); return 2; }
      if (named.push !== undefined) {
        try { console.log(pushMove(top, cfg, args)); return 0; }
        catch (err) { console.error(`Not moved: ${err.message}`); return 1; }
      }
      let moved;
      try { moved = moveAgents(cfg, args); } catch (err) { console.error(`Not moved: ${err.message}`); return 1; }
      const problems = configProblems(moved.next);
      if (problems.length) { console.error(`Not moved: ${problems.join("; ")}`); return 1; }
      writeFileSync(join(top, CONFIG_PATH), JSON.stringify(moved.next, null, 2) + "\n");
      const written = subagentFiles(moved.next).filter((f) => moved.moved.some((n) => agentNamed(moved.next, n).tool === f.tool));
      for (const f of written) { mkdirSync(join(top, f.file, ".."), { recursive: true }); writeFileSync(join(top, f.file), f.text); }
      console.log(`${movedWords(cfg, moved.next, moved.moved, board.slots, moved.notes)}${written.length ? `\nSubagent definitions written for the new tool: ${written.map((f) => f.file).join(", ")}.` : ""}\nThen commit and push desk.json${written.length ? " and the definition files" : ""} to ${cfg.work_branch}.`);
      console.log(`\nThe wording to start ${moved.moved.length === 1 ? "it" : "each"} in the new place:\n\n${spinUp(moved.next, moved.moved)}`);
      return 0;
    }
    case "report": {
      if (ref) { console.error("report writes on the work branch from this copy: never through --ref"); return 2; }
      const [phase] = plain;
      if (!phase) { console.error(`Usage: node .agents/skills/agent-desk/scripts/desk.mjs report <phase> [--brief <id>] [--pr #N] [--step "…"] [--words "…"] [--leader] [--fresh]\n  phases: ${PHASES.join(", ")}; the leader's: ${LEADER_PHASES.join(", ")}; --fresh writes an unchanged report again (its time moves)`); return 2; }
      try { console.log(pushReport(top, cfg, { phase, brief: named.brief, pr: named.pr, step: named.step, words: named.words, leader: named.leader !== undefined, fresh: named.fresh !== undefined })); return 0; }
      catch (err) { console.error(`Not reported: ${err.message}`); return 1; }
    }
    case "autocompact": {
      if (ref) { console.error("autocompact writes desk.json in this checkout: run it on the work branch, without --ref"); return 2; }
      const [tokens, who] = plain;
      if (!tokens) { console.error(`Usage: node .agents/skills/agent-desk/scripts/desk.mjs autocompact <tokens> [agent]   (${AUTOCOMPACT_MIN} to ${AUTOCOMPACT_MAX}; 500000 unless set)`); return 2; }
      const n = /^\d+$/.test(tokens) ? Number(tokens) : NaN;
      if (who && !agentNamed(cfg, who)) { console.error(`“${who}” isn't an agent on this desk (${cfg.agents.map((a) => a.name).join(", ")})`); return 1; }
      const next = who ? { ...cfg, agents: cfg.agents.map((a) => a.name === who ? { ...a, autocompact: n } : a) } : { ...cfg, autocompact: n };
      const problems = configProblems(next);
      if (problems.length) { console.error(`Not set: ${problems.join("; ")}`); return 1; }
      writeFileSync(join(top, CONFIG_PATH), JSON.stringify(next, null, 2) + "\n");
      const files = writeRepoFiles(top, next).filter((f) => !["AGENTS.md", "CLAUDE.md"].includes(f));
      console.log(`${who ? `${who}'s conversation compacts` : "Conversations compact"} at ${n.toLocaleString("en-GB")} tokens on ${cfg.project}. Each tool's settings file now says so (${files.join(", ")}). Next: commit and push desk.json and those files.`);
      return 0;
    }
    case "models": {
      const [tool] = plain;
      if (tool && !TOOLS.includes(tool)) { console.error(`“${tool}” isn't a tool the desk knows: ${TOOLS.join(", ")}`); return 1; }
      const tools = tool ? [tool] : TOOLS.filter((t) => MODELS[t].length);
      const out = tools.map((t) => modelWords(t));
      out.push("", "Who runs what: the leader plans on a plan model; an agent writing a brief codes on a code model; a review subagent runs the review model and a checks subagent the checks model; anything that isn't code goes to an other model. The desk records the choice (desk.json's model and subagents.models); the owner sets the agent's own model in the tool.");
      console.log(out.join("\n"));
      return 0;
    }
    case "subagents": {
      if (ref) { console.error("subagents writes desk.json and the definition files in this checkout: run it on the work branch, without --ref"); return 2; }
      const [who, mode] = plain;
      const usage = `Usage: node .agents/skills/agent-desk/scripts/desk.mjs subagents <agent> on|off [--max N] [--scope ${SUBAGENT_SCOPES.join(",")}] [--review-model <id>] [--checks-model <id>]   (${DEFAULT_SUBAGENTS} unless set, ${MAX_SUBAGENTS} at most; the models default to the tool's: desk.mjs models <tool>)`;
      if (!who || !["on", "off"].includes(mode)) { console.error(usage); return 2; }
      const a = agentNamed(cfg, who);
      if (!a) { console.error(`“${who}” isn't an agent on this desk (${cfg.agents.map((x) => x.name).join(", ")})`); return 1; }
      let next;
      if (mode === "off") {
        next = { ...cfg, agents: cfg.agents.map((x) => { if (x.name !== who) return x; const b = { ...x }; delete b.subagents; return b; }) };
      } else {
        const was = a.subagents && typeof a.subagents === "object" && !Array.isArray(a.subagents) ? a.subagents : {};
        const s = { max: was.max ?? DEFAULT_SUBAGENTS, scope: Array.isArray(was.scope) ? [...was.scope] : [...SUBAGENT_SCOPES] };
        if (was.models && typeof was.models === "object") s.models = { ...was.models };
        if (named.max !== undefined) s.max = /^\d+$/.test(named.max) ? Number(named.max) : NaN;
        if (named.scope !== undefined) s.scope = named.scope.split(",").map((k) => k.trim()).filter(Boolean);
        for (const kind of SUBAGENT_SCOPES) if (named[`${kind}-model`] !== undefined) s.models = { ...(s.models || {}), [kind]: named[`${kind}-model`] };
        if (s.models) { for (const k of Object.keys(s.models)) if (!s.scope.includes(k) && named[`${k}-model`] === undefined) delete s.models[k]; if (!Object.keys(s.models).length) delete s.models; }
        next = { ...cfg, agents: cfg.agents.map((x) => x.name === who ? { ...x, subagents: s } : x) };
      }
      const problems = configProblems(next);
      if (problems.length) { console.error(`Not set: ${problems.join("; ")}`); return 1; }
      writeFileSync(join(top, CONFIG_PATH), JSON.stringify(next, null, 2) + "\n");
      const s = subagentsOf(next, agentNamed(next, who));
      const files = subagentFiles(next).filter((f) => f.tool === a.tool);
      for (const f of files) { mkdirSync(join(top, f.file, ".."), { recursive: true }); writeFileSync(join(top, f.file), f.text); }
      if (s) {
        console.log(`${who} may start up to ${s.max} subagents on ${cfg.project}, for ${s.scope.join(" and ")} only, on ${s.scope.map((k) => `${s.models[k]} (${k})`).join(" and ")}. ${s.scope.includes("review") ? `Its pull requests come with its own subagent's review, so ${a.reviewer === "leader" ? cfg.leader.name : a.reviewer} reviews them only when asked by name.` : "Its pull requests still go to its reviewer."}`);
        console.log(files.length ? `Definitions written for ${TOOL_WORDS[a.tool]}: ${files.map((f) => f.file).join(", ")}.` : `${TOOL_WORDS[a.tool]} has no definition file the desk can write: the agent follows .agents/skills/agent-desk/protocol/subagent.md alone.`);
        console.log(`Next: commit and push desk.json${files.length ? " and the definition files" : ""} to ${cfg.work_branch}; ${who} reads the change at its next look or go (its prompt names the subagents: desk.mjs prompts ${who}).`);
        console.log(`\n${who}'s prompt now names its subagents; paste it again, or type go:\n\n${spinUp(next, [who])}`);
      } else {
        console.log(`${who} may start no subagents on ${cfg.project}: its pull requests wait for ${a.reviewer === "leader" ? cfg.leader.name : a.reviewer}'s review again. ${files.length ? `The ${TOOL_WORDS[a.tool]} definition files stay for the other agents that use them.` : `Any ${TOOL_WORDS[a.tool]} definition files left over may be deleted (nothing on this desk asks for them).`} Next: commit and push desk.json to ${cfg.work_branch}.`);
      }
      return 0;
    }
    case "refresh": {
      // Read-only: the card an agent (or the leader) reads back to get on track. An agent's copy
      // reads the desk from origin's work branch, as doctor does; the leader's checkout reads its own.
      const run = (a, cwd = top) => spawnSync("git", a, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const conf = (k) => (run(["config", k]).stdout || "").trim();
      const identity = { slot: conf("desk.slot"), project: conf("desk.project"), base: conf("desk.base"), tool: conf("desk.tool"), hooksPath: conf("core.hooksPath") };
      if (named.leader !== undefined) {
        const reports = reportsOf(top, at);
        console.log(refreshCard({ cfg, leader: true, identity, rows: board ? board.slots : {}, reports, leaderReport: reports[cfg.leader.name] || null, leadMd: read(".agents/skills/agent-desk/protocol/lead.md") || "" }).join("\n"));
        return 0;
      }
      if (!identity.slot) { console.error("This copy has no agent's name (git config desk.slot) and wasn't asked for the leader's card: paste the agent's prompt (node .agents/skills/agent-desk/scripts/desk.mjs prompts <name>) into the agent's conversation, or run this on the leader's checkout of the work branch with --leader."); return 1; }
      const base = identity.base || cfg.work_branch;
      let at2 = at, read2 = read, cfg2 = cfg;
      if (!ref && run(["fetch", "-q", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`]).status === 0) {
        at2 = `origin/${base}`; read2 = reader(top, at2);
        const t2 = read2(CONFIG_PATH); if (t2 !== null) { const c2 = parseConfig(t2); if (!c2.error && !configProblems(c2).length) cfg2 = c2; }
      }
      const boardText2 = read2(BOARD);
      const row = boardText2 === null ? {} : (parseBoard(boardText2).slots[identity.slot] || {});
      const briefText = row.brief ? read2(`${ASSIGNMENTS}/${row.brief}.md`) : null;
      const brief = briefText === null ? null : parseBrief(briefText);
      const st = read2(`${STATUS_DIR}/${identity.slot}.json`);
      const report = st === null ? null : parseStatus(st);
      const branch = { onOrigin: false, ahead: 0 };
      if (row.brief) {
        const b = `desk/${cfg2.project}/${identity.slot}/${row.brief}`;
        if (run(["fetch", "-q", "origin", `+refs/heads/${b}:refs/remotes/origin/${b}`]).status === 0) {
          branch.onOrigin = true;
          const n = run(["rev-list", "--count", `origin/${base}..origin/${b}`]);
          branch.ahead = n.status === 0 ? Number(n.stdout.trim()) || 0 : 0;
        }
      }
      const dirty = (run(["status", "--porcelain"]).stdout || "").trim() !== "";
      console.log(refreshCard({ cfg: cfg2, identity: { ...identity, base }, row, brief, report: report && !report.error ? report : null, branch, dirty, agentsMd: read2("AGENTS.md") || "" }).join("\n"));
      return 0;
    }
    case "doctor": {
      const run = (a, cwd = top) => spawnSync("git", a, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const conf = (k) => (run(["config", k]).stdout || "").trim();
      const identity = { slot: conf("desk.slot"), project: conf("desk.project"), base: conf("desk.base"), tool: conf("desk.tool"), hooksPath: conf("core.hooksPath") };
      // An agent's copy isn't on the work branch: it reads the desk from origin's.
      let at2 = at, read2 = read, cfg2 = cfg;
      if (!ref && identity.slot && identity.base && run(["fetch", "-q", "origin", `+refs/heads/${identity.base}:refs/remotes/origin/${identity.base}`]).status === 0) {
        at2 = `origin/${identity.base}`; read2 = reader(top, at2);
        const t2 = read2(CONFIG_PATH); if (t2 !== null) { const c2 = parseConfig(t2); if (!c2.error && !configProblems(c2).length) cfg2 = c2; }
      }
      const notes = [identity.slot ? `this copy is ${identity.slot}'s` : "this copy is the leader's"];
      const ls = run(["ls-remote", "origin", `refs/heads/desk/${cfg2.project}/*`]);
      let heads = null;
      if (ls.status === 0) {
        heads = {};
        for (const row of ls.stdout.split("\n").filter(Boolean)) { const [sha, r] = row.split("\t"); heads[r.replace(/^refs\/heads\//, "")] = sha; }
        run(["fetch", "-q", "origin", `+refs/heads/${cfg2.work_branch}:refs/remotes/origin/${cfg2.work_branch}`]);
      } else notes.push("branches not checked (no origin)");
      const isMerged = (sha) => run(["merge-base", "--is-ancestor", sha, `origin/${cfg2.work_branch}`]).status === 0;
      let prs = null;
      const g = gh(top, ["api", `repos/${cfg2.repository}/pulls?base=${encodeURIComponent(cfg2.work_branch)}&state=all&per_page=100`]);
      if (g.missing) notes.push("pull requests not checked (no gh)");
      else if (g.status !== 0) notes.push(`pull requests not checked (gh: ${firstLine(g.stderr) || "refused"})`);
      else { try { prs = JSON.parse(g.stdout).map((p) => ({ number: p.number, state: p.state, merged: !!p.merged_at, head: p.head?.ref || "" })); notes.push(`pull requests checked with gh (${prs.filter((p) => p.state === "open").length} open)`); } catch { notes.push("pull requests not checked (gh answered something that isn't JSON)"); } }
      const statuses = {};
      for (const n of statusNames(top, at2)) statuses[n] = parseStatus(read2(`${STATUS_DIR}/${n}.json`));
      let kitVersion = null; try { kitVersion = skillVersion(); } catch { kitVersion = null; }
      const compaction = compactionFiles(autocompactOf(cfg2)).map((c) => { const t = existsSync(join(top, c.file)) ? readFileSync(join(top, c.file), "utf8") : null; return { file: c.file, exists: t !== null, ok: t !== null && c.ok(t) }; });
      const subagents = subagentFiles(cfg2).map((f) => { const t = existsSync(join(top, f.file)) ? readFileSync(join(top, f.file), "utf8") : null; return { file: f.file, exists: t !== null, ok: t !== null && f.ok(t) }; });
      const lists = (cfg2.shared_lists || []).filter((s) => !s.rebuild && s.file.endsWith(".json")).map((s) => { const t = read2(s.file); return { file: s.file, problems: t === null ? [] : listProblems(t) }; });
      const findings = doctorFindings({ cfg: cfg2, boardText: read2(BOARD), briefOf: (id) => { const t = read2(`${ASSIGNMENTS}/${id}.md`); return t === null ? null : parseBrief(t); }, briefIds: briefIds(top, at2), statuses, heads, isMerged, identity, kitVersion, prs, compaction, subagents, lists });
      console.log(doctorWords(cfg2, findings, notes));
      return findings.length ? 1 : 0;
    }
    case "log": {
      const g = (a) => { const r = spawnSync("git", a, { cwd: top, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); return r.status === 0 ? r.stdout : null; };
      const base = (g(["config", "desk.base"]) || "").trim() || cfg.work_branch;
      g(["fetch", "-q", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`]);
      const refName = g(["rev-parse", "--verify", "--quiet", `origin/${base}^{commit}`]) !== null ? `origin/${base}` : base;
      let since; try { since = sinceDate(named.since || "", Date.now()); } catch (err) { console.error(err.message); return 2; }
      const limit = /^\d+$/.test(named.limit || "") ? Number(named.limit) : 50;
      const fmt = "%x1e%H%x1f%cI%x1f%P%x1f%s%x1f%(trailers:key=Desk-Project,valueonly)%x1f%(trailers:key=Desk-Agent,valueonly)%x1f";
      const out = g(["log", "--first-parent", "--name-status", ...(since ? [`--since=${new Date(since).toISOString()}`] : ["--max-count=2000"]), `--format=${fmt}`, refName]);
      if (out === null) { console.error(`log: couldn't read ${refName}: run git fetch origin ${base}`); return 2; }
      const commits = [];
      for (const chunk of out.split("\x1e")) {
        if (!chunk.trim()) continue;
        const [sha, at, parents, subject, project, agent, rest] = chunk.split("\x1f");
        const paths = (rest || "").split("\n").map((l) => /^([A-Z]\d*)\t(.+)$/.exec(l)).filter(Boolean).map((m) => ({ status: m[1], path: m[2].split("\t").pop() }));
        commits.push({ sha, at: new Date(at).toISOString(), parents: parents.split(" ").filter(Boolean), subject, trailers: { project: (project || "").trim(), agent: (agent || "").trim() }, paths });
      }
      const desk = (c) => c.parents.length > 1 || c.paths.some((p) => p.path.startsWith(`${DESK_ROOT}/${cfg.project}/`));
      const ctx = { project: cfg.project, leader: cfg.leader.name };
      const events = commits.filter(desk).map((c) => classifyCommit({ ...c, readAt: (p) => g(["show", `${c.sha}:${p}`]), readAtParent: (p) => c.parents[0] ? g(["show", `${c.parents[0]}:${p}`]) : null }, ctx))
        .filter((e) => e.kind !== "other" || !/^merge: /.test(e.words))
        .filter((e) => !named.agent || e.agent === named.agent || e.who === named.agent || e.words.includes(named.agent))
        .slice(0, limit).reverse();
      if (!events.length) { console.log(`Nothing on the ${cfg.project} desk${since ? ` since ${new Date(since).toISOString()}` : ""}${named.agent ? ` for ${named.agent}` : ""} (agents/desk/ on ${refName}).`); return 0; }
      console.log(named.md !== undefined ? formatMarkdown(events, cfg, { from: since ? new Date(since).toISOString() : events[0].at, to: new Date().toISOString() }) : formatLines(events));
      return 0;
    }
    case "notify": {
      const [event] = plain;
      if (named.setup !== undefined) {
        if (ref) { console.error("notify --setup writes desk.json in this checkout: run it on the work branch, without --ref"); return 2; }
        let next;
        if (named.setup === "off" || event === "off") { next = { ...cfg }; delete next.notify; }
        else if (named.create !== undefined) {
          const title = `Desk notifications for ${cfg.project}`;
          const text = `The desk posts here when an agent is blocked or silent, when the desk falls asleep, when a brief merges and when the leader has a question. Subscribe to this issue to be told.`;
          const byHand = `make an issue titled “${title}” in ${cfg.repository}, then node .agents/skills/agent-desk/scripts/desk.mjs notify --setup --issue <its number>`;
          const made = gh(top, ["api", `repos/${cfg.repository}/issues`, "-f", `title=${title}`, "-f", `body=${text}`]);
          if (made.missing) { console.error(`Not set: gh isn't here to make the issue. With your GitHub tool, ${byHand}.`); return 1; }
          let number = NaN; try { number = JSON.parse(made.stdout).number; } catch { /* said below */ }
          if (made.status !== 0 || !Number.isInteger(number)) { console.error(`Not set: gh couldn't make the issue (${firstLine(made.stderr) || "no number came back"}). By hand: ${byHand}.`); return 1; }
          const n = { issue: number };
          if (named.events !== undefined) n.events = named.events.split(",").map((e) => e.trim()).filter(Boolean);
          next = { ...cfg, notify: n };
        }
        else {
          const issue = /^#?\d+$/.test(named.issue || "") ? Number(String(named.issue).replace("#", "")) : NaN;
          const n = { issue };
          if (named.events !== undefined) n.events = named.events.split(",").map((e) => e.trim()).filter(Boolean);
          next = { ...cfg, notify: n };
        }
        const problems = configProblems(next);
        if (problems.length) { console.error(`Not set: ${problems.join("; ")}`); return 1; }
        writeFileSync(join(top, CONFIG_PATH), JSON.stringify(next, null, 2) + "\n");
        console.log(`${notifyLine(next)} Next: commit and push desk.json.`);
        return 0;
      }
      if (!event) { console.log(notifyLine(cfg)); return 0; }
      if (!NOTIFY_EVENTS.includes(event)) { console.error(`“${event}” isn't an event the owner is told of: ${NOTIFY_EVENTS.join(", ")}`); return 1; }
      const st = named.agent ? statusOf(named.agent) : null;
      const about = { agent: named.agent, brief: named.brief, pr: named.pr ? prNumber(named.pr) : undefined, words: named.words, status: st && !st.error ? st : null };
      let body; try { body = notifyBody(cfg, event, about); } catch (err) { console.error(`Not told: ${err.message}`); return 1; }
      const n = notifyOf(cfg);
      if (!n) { console.log(`${body}\n\nNotifications are off, so nothing was posted: say it yourself if it matters. ${notifyLine(cfg)}`); return 0; }
      if (!n.events.includes(event)) { console.log(`${body}\n\nNotifications for ${event} are off (events: ${n.events.join(", ")}), so nothing was posted.`); return 0; }
      if (named.post === undefined) { console.log(body); return 0; }
      const key = `desk.notified.${notifyKey(event, about)}`;
      const told = (spawnSync("git", ["config", key], { cwd: top, encoding: "utf8" }).stdout || "").trim();
      if (told && named.force === undefined) { console.log(`already told: ${key.slice(14)} (${told}); nothing posted (--force says it again).`); return 0; }
      const mark = () => spawnSync("git", ["config", key, new Date().toISOString()], { cwd: top });
      const r = gh(top, ["api", `repos/${cfg.repository}/issues/${n.issue}/comments`, "-F", "body=@-"], body);
      if (r.missing) { mark(); console.log(`${body}\n\ngh isn't here: post this on issue #${n.issue} with your GitHub tool.`); return 0; }
      if (r.status !== 0) { console.log(`${body}\n\ngh couldn't post it on issue #${n.issue}: ${firstLine(r.stderr) || "refused"}. Post it with your GitHub tool, or run me again.`); return 2; }
      mark();
      console.log(`Posted on #${n.issue}: ${firstLine(body)}`);
      return 0;
    }
    case "preflight": {
      const [id] = plain;
      if (!id) { console.error("Usage: node .agents/skills/agent-desk/scripts/desk.mjs preflight <brief id> [--pr #N] [--no-run]   (from your copy, on your branch)"); return 2; }
      const run = (a, opts = {}) => spawnSync("git", a, { cwd: top, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
      const slot = (run(["config", "desk.slot"]).stdout || "").trim(), tool = (run(["config", "desk.tool"]).stdout || "").trim();
      if (!slot) { console.error("Not run: this copy has no name (git config desk.slot): an agent's first turn saves it, and preflight is the agent's own step"); return 2; }
      const hooksPath = (run(["config", "core.hooksPath"]).stdout || "").trim();
      if (hooksPath) console.log(`Warning: this copy runs the repository's git hooks on every push (core.hooksPath = ${hooksPath}), which the desk's pushes can't pass from their temporary worktree. Before pushing: ${HOOKS_FIX}.`);
      const base = (run(["config", "desk.base"]).stdout || "").trim() || cfg.work_branch;
      run(["fetch", "-q", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`]);
      if (run(["rev-parse", "--verify", "--quiet", `origin/${base}^{commit}`]).status !== 0) { console.error(`Not run: origin/${base} isn't here. Run: git fetch origin ${base}`); return 2; }
      const briefText = run(["show", `origin/${base}:${ASSIGNMENTS}/${id}.md`]);
      if (briefText.status !== 0) { console.error(`Not run: ${ASSIGNMENTS}/${id}.md isn't on origin/${base}`); return 2; }
      const brief = parseBrief(briefText.stdout), sections = briefSections(briefText.stdout);
      const thereText = run(["show", `origin/${base}:${CONFIG_PATH}`]);
      const there = thereText.status === 0 ? parseConfig(thereText.stdout) : cfg;
      // desk-check is this file's own sibling, so a copy that holds only the work branch's wait is fine.
      const check = spawnSync(process.execPath, [fileURLToPath(new URL("./check.mjs", import.meta.url)), id, ...(named["no-run"] !== undefined ? ["--no-run"] : [])], { cwd: top, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const output = `${check.stdout || ""}${check.stderr || ""}`.trim();
      const verdict = { passed: check.status === 0, tail: output.split("\n").slice(-12).join("\n") };
      const mb = (run(["merge-base", `origin/${base}`, "HEAD"]).stdout || "").trim();
      const num = {}; for (const l of (run(["diff", "--numstat", `${mb}..HEAD`]).stdout || "").split("\n").filter(Boolean)) { const [a, d, ...rest] = l.split("\t"); num[rest.join("\t")] = [Number(a), Number(d)]; }
      const files = (run(["diff", "--name-status", "-M", `${mb}..HEAD`]).stdout || "").split("\n").filter(Boolean).map((l) => { const parts = l.split("\t"); const path = parts[parts.length - 1]; return { status: parts[0][0], path, added: num[path]?.[0], removed: num[path]?.[1] }; });
      const stat = (run(["diff", "--shortstat", `${mb}..HEAD`]).stdout || "").trim();
      const commits = (run(["log", "--format=%s", `${mb}..HEAD`]).stdout || "").split("\n").filter(Boolean).reverse();
      const dirty = (run(["status", "--porcelain"]).stdout || "").split("\n").filter(Boolean).length;
      const facts = codeFacts(run(["diff", `${mb}..HEAD`]).stdout || "");
      const body = preflightBody({ cfg: there.error ? cfg : there, brief, sections, files, stat, commits, check: verdict, name: slot, tool: tool || agentNamed(cfg, slot)?.tool || "", dirty, facts });
      const gitDir = resolve(top, (run(["rev-parse", "--git-dir"]).stdout || ".git").trim());
      mkdirSync(join(gitDir, "desk"), { recursive: true });
      const file = join(gitDir, "desk", `preflight-${id}.md`);
      writeFileSync(file, body);
      const rel = relative(top, file);
      console.log(`Preflight for ${id}: ${verdict.passed ? "desk-check passed" : "desk-check FAILED"}; ${files.length} file${files.length === 1 ? "" : "s"} changed against ${base}${dirty ? `; ${dirty} uncommitted change${dirty === 1 ? "" : "s"} left out` : ""}.`);
      console.log(`Report: ${rel}`);
      const title = prTitle(there.error ? cfg : there, slot, brief);
      if (!verdict.passed) { console.log(`Next: read the FAILED lines in the report, mend them, and run preflight again${named.pr !== undefined ? `; not sent to ${prNumber(named.pr)}: desk-check failed` : ""}.`); return 1; }
      if (named.pr !== undefined) {
        const n = prNumber(named.pr).slice(1);
        if (!n) { console.error(`“${named.pr}” isn't a pull request: give its number`); return 1; }
        const r = gh(top, ["api", "-X", "PATCH", `repos/${cfg.repository}/pulls/${n}`, "-F", "body=@-", "-f", `title=${title}`], body);
        if (r.missing) console.log(`gh isn't here: put the report in by hand through your tool's GitHub connection: the description from ${rel}, and the title "${title}".`);
        else if (r.status !== 0) { console.log(`gh couldn't edit #${n}: ${firstLine(r.stderr) || "refused"}. Put the report in by hand: the description from ${rel}, and the title "${title}".`); return 2; }
        else console.log(`#${n} now has the report as its description and the title "${title}".`);
        // The agent's own report says it pushed, with the pull request : the leader's look
        // and the reviewer's wait read it at once, whatever the board says yet.
        try { console.log(pushReport(top, cfg, { phase: "pushed", brief: id, pr: `#${n}` })); }
        catch (err) { console.log(`Not reported: ${err.message}. Run node .agents/skills/agent-desk/scripts/desk.mjs report pushed --brief ${id} --pr #${n}.`); }
      } else console.log(`Next: read it and fill in Done means' evidence, Assumptions and Questions; push; then node .agents/skills/agent-desk/scripts/desk.mjs preflight ${id} --pr <N> (which puts it on the pull request and drops the in-progress mark), or gh pr edit N --body-file ${rel} --title "${title}".`);
      return 0;
    }
    case "next": {
      const files = named.spec ? [named.spec] : specFiles(top, at, cfg.specs);
      const steps = files.flatMap((f) => parseSpec(read(f) || "", f).steps);
      if (!steps.length) { console.error(`the spec has no steps: next reads headings like \`### A1. Title\` under ${named.spec || cfg.specs || "desk.json's specs"}${files.length ? ` (${files.join(", ")})` : " (no .md file there)"}`); return 1; }
      const dup = steps.map((s) => s.id).filter((v, i, a) => a.indexOf(v) !== i);
      const progressText = read(PROGRESS_PATH);
      let progress = { desk: 1, project: cfg.project, steps: {} };
      if (progressText !== null) { try { progress = JSON.parse(progressText); } catch (err) { console.error(`${PROGRESS_PATH} isn't JSON: ${err.message}`); return 1; } }
      const pp = progressProblems(progress, cfg, steps);
      if (pp.length) { console.error(`${PROGRESS_PATH} is wrong: ${pp.join("; ")}`); return 1; }
      const marking = ["done", "skip", "open"].find((k) => named[k] !== undefined);
      if (marking) {
        if (ref) { console.error("next --done/--skip/--open writes progress.json in this checkout: run it on the work branch, without --ref"); return 2; }
        const idm = named[marking];
        if (!steps.some((s) => s.id === idm)) { console.error(`${idm || "(nothing)"} isn't a step in ${cfg.specs} (${steps.map((s) => s.id).join(", ")})`); return 1; }
        const state = marking === "skip" ? "skipped" : marking;
        if (state === "open") delete progress.steps[idm];
        else progress.steps[idm] = { state, at: new Date().toISOString(), ...(named.note ? { note: named.note } : {}) };
        writeFileSync(join(top, PROGRESS_PATH), JSON.stringify(progress, null, 2) + "\n");
        console.log(`${idm} is ${state}${named.note ? ` (${named.note})` : ""} on ${cfg.project}. Next: commit and push ${PROGRESS_PATH} with the board.`);
        return 0;
      }
      const briefs = briefIds(top, at).map((bid) => { const b = briefOf(bid) || {}; return { id: bid, spec: b.spec || "", slot: b.slot || "" }; });
      const queued = (!at && existsSync(join(top, QUEUE)) ? readdirSync(join(top, QUEUE)).filter((f) => f.endsWith(".md") && f !== "README.md") : []).map((f) => { const b = parseBrief(read(`${QUEUE}/${f}`) || ""); return { id: f.slice(0, -3), spec: b.spec || "", slot: b.slot || "" }; });
      const out = nextSteps({ steps, progress, briefs, board: board.slots, cfg, queued });
      if (named.list !== undefined) { console.log(listWords(cfg, steps, out)); return 0; }
      if (name && !agentNamed(cfg, name)) { console.error(`“${name}” isn't an agent on this desk (${cfg.agents.map((a) => a.name).join(", ")})`); return 1; }
      const chosen = name ? out.proposals.filter((p) => p.agent === name) : out.proposals;
      if (name && !chosen.length) { console.log(`${name} has a brief in hand (${board.slots[name]?.state} with ${board.slots[name]?.brief}): nothing to put up for it.`); return 0; }
      console.log(nextWords(cfg, out, chosen, named.spec || cfg.specs));
      if (dup.length) console.log(`\nNote: ${[...new Set(dup)].join(", ")} ${dup.length === 1 ? "is" : "are"} headed in more than one file under ${cfg.specs}; name the one spec with --spec <file>, or set desk.json's specs to it.`);
      return chosen.length && chosen.every((p) => p.kind === "nothing") ? 1 : 0;
    }
    case "suite": {
      // The whole test command as its parts (desk.json's suite): every part runs, whatever came before.
      if (!Array.isArray(cfg.suite) || !cfg.suite.length) { console.error('No suite here: desk.json\'s suite names the parts of the repository\'s whole test command, each run on its own, such as ["npm run test:unit", "npm run test:e2e"] (the leader\'s /agent-desk setup asks for it)'); return 2; }
      const id = named.brief;
      // An open brief's frozen tests are red until it merges: with --brief, a part that fails only there is expected.
      const frozenBy = {};
      for (const r of Object.values(board.slots)) {
        if (!r || !KEEP_WHEN_REMOVED.has(r.state) || !r.brief || r.brief === id) continue;
        for (const f of briefOf(r.brief)?.frozen || []) frozenBy[f] = r.brief;
      }
      const env = { ...process.env, ...(agentNamed(cfg, gitConf(top, "desk.slot")) ? portEnv(cfg, agentNamed(cfg, gitConf(top, "desk.slot"))) : {}) };
      delete env.NODE_TEST_CONTEXT;
      const parts = [];
      for (const cmd of cfg.suite) {
        console.log(`\n$ ${cmd}`);
        const r = spawnSync("sh", ["-c", cmd], { cwd: top, env, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
        process.stdout.write(r.stdout || ""); process.stderr.write(r.stderr || "");
        const out = `${r.stdout || ""}${r.stderr || ""}`;
        const p = { cmd, status: r.status ?? 1, counts: nodeCounts(out) };
        if (p.status !== 0 && id !== undefined) {
          const files = failingFiles(out, top);
          if (files.length && files.every((f) => frozenBy[f])) p.expected = `${[...new Set(files.map((f) => frozenBy[f]))].map((b) => `${b}'s frozen test`).join(" and ")}, red until it merges`;
        }
        parts.push(p);
      }
      const failed = parts.filter((p) => p.status !== 0 && !p.expected);
      console.log(`\nThe suite for ${cfg.project}, ${parts.length} part${parts.length === 1 ? "" : "s"}: ${failed.length ? `${failed.length} FAILED` : "every part passed or failed only where expected"}.`);
      for (const p of parts) console.log(`  ${partWords(p)}`);
      return failed.length ? 1 : 0;
    }
    case "reassign": {
      if (ref) { console.error("reassign writes the brief and the board in this checkout: run it on the work branch, without --ref"); return 2; }
      const [id] = plain, to = named.to;
      if (!id || !to) { console.error("Usage: node .agents/skills/agent-desk/scripts/desk.mjs reassign <brief id> --to <agent> [--pr #N]"); return 2; }
      const file = `${ASSIGNMENTS}/${id}.md`, text = read(file);
      if (text === null) { console.error(`${file} isn't here`); return 1; }
      const was = parseBrief(text), from = was.slot;
      if (!agentNamed(cfg, to)) { console.error(`“${to}” isn't an agent on this desk (${cfg.agents.map((a) => a.name).join(", ")})`); return 1; }
      const busy = board.slots[to];
      if (busy && KEEP_WHEN_REMOVED.has(busy.state) && busy.brief !== id) { console.error(`Not handed over: ${to} is ${busy.state} with ${busy.brief}. Settle or pause that first (set ${to} idle).`); return 1; }
      const fromRow = board.slots[from] || {};
      const pr = named.pr !== undefined ? prNumber(named.pr) : fromRow.brief === id ? fromRow.pr : "";
      const ls = spawnSync("git", ["ls-remote", "origin", `refs/heads/${was.branch}`], { cwd: top, encoding: "utf8" });
      const head = (ls.stdout || "").split("\t")[0].trim();
      if (!head) { console.error(`Not handed over: ${was.branch} isn't on origin, so there is nothing to carry on from. Make the brief again for ${to} instead (desk.mjs brief).`); return 1; }
      let next;
      try { next = reassignBrief(text, cfg, to, { from, pr, head }); } catch (err) { console.error(`Not handed over: ${err.message}`); return 1; }
      const nb = parseBrief(next), bp = briefProblems(nb, id, cfg);
      if (bp.length) { console.error(`Not handed over: ${bp.join("; ")}`); return 1; }
      let rows = updateRow(board.slots, cfg, to, { state: "ready", brief: id, pr: "" });
      if (fromRow.brief === id) rows = updateRow(rows, cfg, from, { state: "idle", notes: `${id} handed to ${to}` });
      const probs = boardProblems({ ...board, slots: rows }, (b) => (b === id ? nb : briefOf(b)), cfg).filter((p) => p.includes(to) || p.includes(from));
      if (probs.length) { console.error(`Not handed over: ${probs.join("; ")}`); return 1; }
      writeFileSync(join(top, file), next);
      writeFileSync(join(top, BOARD), renderBoard(cfg, rows));
      const decision = `Desk decision for ${cfg.project}:\n\n1. handed over to ${to}: ${id} carries on from ${head.slice(0, 7)} on ${nb.branch}${pr ? `, and this pull request (${pr}) closes when ${to}'s merges` : ""}.\n\n— ${cfg.leader.name}, leading ${cfg.project}`;
      console.log(`${id} is ${to}'s now: ${nb.branch}, port ${nb.port}, reviewed by ${nb.reviewer}, carrying on from ${from}'s ${head.slice(0, 7)}${pr ? ` (${pr})` : ""}. ${to} is ready with it${fromRow.brief === id ? `; ${from} is idle` : ""}.`);
      const n = pr ? pr.slice(1) : "";
      const posted = n ? gh(top, ["api", "-X", "POST", `repos/${cfg.repository}/issues/${n}/comments`, "-F", "body=@-"], decision) : { missing: true };
      if (n && !posted.missing && posted.status === 0) console.log(`Posted the decision on ${pr}.`);
      else console.log(`${n ? `Post this on ${pr}` : "The decision, for the old pull request"} by hand:\n\n${decision}\n`);
      console.log(`Next: validate, commit the brief and the board, then node .agents/skills/agent-desk/scripts/desk.mjs push; ${to} starts with git switch -c ${nb.branch} ${head.slice(0, 7)} (take.md).`);
      console.log(`\n${to}'s wording, if its conversation isn't running yet:\n\n${spinUp(cfg, [to])}`);
      return 0;
    }
    case "shape": {
      if (ref) { console.error("shape writes desk.json and the briefs in this checkout: run it on the work branch, without --ref"); return 2; }
      const [shape, who] = plain;
      let map;
      try { map = shapeReviewers(cfg.agents, shape, who); } catch (err) { console.error(`Not reshaped: ${err.message}`); return 1; }
      const next = { ...cfg, agents: cfg.agents.map((a) => ({ ...a, reviewer: map[a.name] })) };
      const problems = configProblems(next);
      if (problems.length) { console.error(`Not reshaped: ${problems.join("; ")}`); return 1; }
      writeFileSync(join(top, CONFIG_PATH), JSON.stringify(next, null, 2) + "\n");
      const said = cfg.agents.map((a) => `${a.name} reviewed by ${map[a.name]}${a.reviewer !== map[a.name] ? ` (was ${a.reviewer})` : ""}`);
      // The briefs still to be reviewed take the new reviewer: open ones on the board, and the queue's.
      const changed = [];
      const openIds = new Set(Object.values(board.slots).filter((r) => r && KEEP_WHEN_REMOVED.has(r.state) && r.brief).map((r) => r.brief));
      const queueDir = join(top, QUEUE);
      const files = [...[...openIds].map((b) => `${ASSIGNMENTS}/${b}.md`), ...(existsSync(queueDir) ? readdirSync(queueDir).filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => `${QUEUE}/${f}`) : [])];
      for (const f of files) {
        const t = read(f); if (t === null) continue;
        const b = parseBrief(t); const want = map[b.slot];
        if (!want || b.reviewer === want) continue;
        writeFileSync(join(top, f), withReviewer(t, want)); changed.push(`${f}: reviewer ${b.reviewer} → ${want}`);
      }
      const words = { ring: "each agent reviews the next: every agent also stops to review, and none is a bottleneck", pairs: "each agent reviews its partner: two coders keep each other moving, an odd one out goes to the leader", reviewer: `${who} reviews every pull request and writes no code, the leader reviews ${who}: the one bottleneck is ${who}, but every other agent keeps writing` };
      console.log([`The ${cfg.project} desk is a ${shape === "reviewer" ? "dedicated reviewer" : shape}: ${words[shape]}.`, ...said.map((s) => `  ${s}`),
        changed.length ? `Briefs changed:\n${changed.map((c) => `  ${c}`).join("\n")}` : "No open or queued brief needed a change.",
        "A test or a document that names who reviews whom changes with it. Next: validate, commit desk.json and the briefs, then node .agents/skills/agent-desk/scripts/desk.mjs push; tell the agents with go."].join("\n"));
      return 0;
    }
    case "plan": {
      const queue = [];
      for (const f of queueFiles(top, at)) { const t = read(f); if (t !== null) queue.push(parseBrief(t)); }
      const open = {};
      for (const r of Object.values(board.slots)) if (r && KEEP_WHEN_REMOVED.has(r.state) && r.brief) open[r.brief] = briefOf(r.brief) || { id: r.brief, may_change: [] };
      const lines = planDesk({ cfg, rows: board.slots, open, queue, shared: (cfg.shared_lists || []).map((s) => s.file) });
      console.log([`The next briefs on ${cfg.project} (${queue.length} queued in ${QUEUE}/; nothing is changed):`, ...lines.map((l) => `- ${l}`)].join("\n"));
      return 0;
    }
    case "up": {
      if (ref) { console.error("up moves the brief in this checkout: run it on the work branch, without --ref"); return 2; }
      const [id] = plain;
      if (!id) { console.error("Usage: node .agents/skills/agent-desk/scripts/desk.mjs up <brief id>   (a brief in agents/desk/queue/)"); return 2; }
      const from = `${QUEUE}/${id}.md`, text = read(from);
      if (text === null) { console.error(`${from} isn't here: desk.mjs plan lists the queue`); return 1; }
      const b = parseBrief(text);
      const busy = board.slots[b.slot];
      if (busy && KEEP_WHEN_REMOVED.has(busy.state)) { console.error(`Not put up: ${b.slot} is ${busy.state} with ${busy.brief}`); return 1; }
      const mv = (a, z) => { mkdirSync(join(top, dirname(z)), { recursive: true }); if (spawnSync("git", ["mv", a, z], { cwd: top }).status !== 0) renameSync(join(top, a), join(top, z)); };
      mv(from, `${ASSIGNMENTS}/${id}.md`);
      const moved = [];
      for (const f of b.frozen) if (existsSync(join(top, QUEUE, f))) { mv(`${QUEUE}/${f}`, f); moved.push(f); }
      const rows = updateRow(board.slots, cfg, b.slot, { state: "ready", brief: id, pr: "" });
      const probs = boardProblems({ ...board, slots: rows }, briefOf, cfg).filter((p) => p.includes(b.slot) || p.includes(id));
      if (probs.length) { console.error(`Put up, but the board isn't right: ${probs.join("; ")}`); return 1; }
      writeFileSync(join(top, BOARD), renderBoard(cfg, rows));
      console.log(`${id} is up for ${b.slot} on ${cfg.project}${moved.length ? `, with ${moved.join(", ")}` : ""}.\nNext: read it against the code as it stands now, run its frozen tests and see them red for the reason the brief gives, commit it as its red commit, validate, then node .agents/skills/agent-desk/scripts/desk.mjs push.`);
      return 0;
    }
    case "resolve-lists": {
      if (ref) { console.error("resolve-lists settles this checkout's merge: run it here, without --ref"); return 2; }
      const g = (...a) => spawnSync("git", a, { cwd: top, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const unmerged = (g("diff", "--name-only", "--diff-filter=U").stdout || "").split("\n").filter(Boolean);
      if (!unmerged.length) { console.log("Nothing is conflicted here."); return 0; }
      const lists = new Map((cfg.shared_lists || []).map((s) => [s.file, s]));
      const done = [], left = [];
      for (const f of unmerged) {
        const s = lists.get(f);
        if (!s) { left.push(f); continue; }
        try {
          if (s.rebuild) {
            g("checkout", "--ours", "--", f);
            const r = spawnSync("sh", ["-c", s.rebuild], { cwd: top, stdio: "inherit" });
            if (r.status !== 0) throw new Error(`“${s.rebuild}” exited ${r.status}`);
            done.push(`${f}: rebuilt with ${s.rebuild}`);
          } else {
            const side = (n) => { const r = g("show", `:${n}:${f}`); return r.status === 0 ? r.stdout : null; };
            writeFileSync(join(top, f), mergeJsonList(side(1), side(2), side(3)));
            done.push(`${f}: both sides' entries kept, sorted`);
          }
          g("add", "--", f);
        } catch (err) { left.push(`${f} (${err.message})`); }
      }
      if (done.length) console.log(`Settled:\n${done.map((d) => `  ${d}`).join("\n")}`);
      if (left.length) { console.log(`Still conflicted, yours to settle:\n${left.map((d) => `  ${d}`).join("\n")}`); return 1; }
      console.log("Every conflict is settled: run the checks, then commit the merge.");
      return 0;
    }
    case "push": {
      // The leader's committed work onto the work branch, around the agents' status commits: those touch
      // agents/desk/status/ alone, so they are taken in and the push tried again, three times at most.
      if (ref) { console.error("push sends this checkout's commits: run it on the work branch, without --ref"); return 2; }
      const g = (...a) => spawnSync("git", a, { cwd: top, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const base = cfg.work_branch;
      const here = (g("rev-parse", "--abbrev-ref", "HEAD").stdout || "").trim();
      if (here !== base) { console.error(`push sends the work branch: this checkout is on ${here || "no branch"}, not ${base}`); return 2; }
      if ((g("status", "--porcelain", "--untracked-files=no").stdout || "").trim()) { console.error("Not pushed: commit or put away what is changed here first"); return 1; }
      const hooks = gitConf(top, "core.hooksPath");
      let last = "";
      for (let tries = 0; tries < 3; tries++) {
        if (g("fetch", "-q", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`).status !== 0) { console.error(`Not pushed: couldn't fetch origin/${base}`); return 1; }
        const incoming = (g("rev-list", "--reverse", `HEAD..origin/${base}`).stdout || "").split("\n").filter(Boolean);
        for (const c of incoming) {
          const paths = (g("diff-tree", "--no-commit-id", "--name-only", "-r", "-m", c).stdout || "").split("\n").filter(Boolean);
          if (!paths.length || paths.some((p) => !p.startsWith(`${STATUS_DIR}/`))) {
            console.log(`Not pushed: origin/${base} has ${(g("log", "-1", "--format=%h %s", c).stdout || c).trim()}, which isn't an agent's status. Merge origin/${base} in yourself, check it, then push again.`);
            return 1;
          }
        }
        if (incoming.length) {
          // A merge of the leader's (a desk pull request merged here) is kept as a merge; else a rebase.
          const merges = (g("rev-list", "--merges", `origin/${base}..HEAD`).stdout || "").trim();
          const r = merges ? g("merge", "-q", "--no-edit", "-m", "Merge the agents' status into the work branch", `origin/${base}`) : g("rebase", "-q", `origin/${base}`);
          if (r.status !== 0) { g(merges ? "merge" : "rebase", "--abort"); console.log(`Not pushed: taking in the agents' status didn't go cleanly (${firstLine(r.stderr)}).`); return 1; }
        }
        const p = g("push", "-q", "origin", `HEAD:refs/heads/${base}`);
        if (p.status === 0) { console.log(`Pushed ${base} as ${(g("rev-parse", "--short", "HEAD").stdout || "").trim()}${incoming.length ? `, over ${incoming.length} status commit${incoming.length === 1 ? "" : "s"} of the agents'` : ""}.`); return 0; }
        last = (p.stderr || "").trim();
        if (pushRefusal(last, { hooksPath: hooks }).kind === "hook") { console.log(`Not pushed: the pre-push hook refused it (the desk never bypasses one):\n${last}`); return 1; }
      }
      console.log(`Not pushed: refused three times. git said: ${last}`);
      return 1;
    }
    case "sync-board": {
      if (ref) { console.error("sync-board writes the board in this checkout: run it on the work branch, without --ref"); return 2; }
      const names = new Set(cfg.agents.map((a) => a.name));
      const stuck = Object.entries(board.slots).filter(([n, r]) => !names.has(n) && KEEP_WHEN_REMOVED.has(r.state));
      if (stuck.length) {
        console.log(`Not redrawn: ${stuck.map(([n, r]) => `${n} is ${r.state} with ${r.brief}`).join("; ")}. Finish or hand over that brief first, or put the agent back in desk.json.`);
        return 1;
      }
      writeFileSync(join(top, BOARD), renderBoard(cfg, board.slots));
      console.log(`Board for ${cfg.project} redrawn: ${cfg.agents.map((a) => a.name).join(", ")}, working into ${cfg.work_branch}.`);
      return 0;
    }
    default:
      console.error(USAGE);
      return 2;
  }
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (err) { console.error("desk:", err.message); process.exitCode = 2; }
