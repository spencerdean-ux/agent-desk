#!/usr/bin/env node
// An awake agent's wait: watches the work branch on origin from the agent's own copy and says, in one
// line, what fits for it next, so it can work on while the owner is away.
//
//   node .agents/skills/agent-desk/scripts/wait.mjs [--once] [--every <minutes>] [--for <minutes>] [--no-mark]
//   node .agents/skills/agent-desk/scripts/wait.mjs --leader [--once] [--every <minutes>] [--for <minutes>] [--touch]
//
// It reads the agent's name, project and work branch from the copy (git config desk.slot, desk.project,
// desk.base; agent.md step 1 saves them), fetches origin's work branch, and reads desk.json and the
// board there. Then, in this order, the first that fits:
//   fits: review #N <branch>   another agent's row is `review` with a pull request whose brief names
//                              this agent as reviewer, at a head it hasn't reviewed
//   fits: revise <brief> #N    this agent's row is `changes`, since a board commit it hasn't acted on
//   fits: take <brief>         this agent's row is `ready` or `in-progress` and its branch isn't on origin yet
// Each fit is said once: the copy remembers it (git config desk.<brief>.acted), so the next look is
// quiet until the leader moves the board or the other agent pushes again. A row that is pushed and
// waits for the leader is nothing to do.
// With nothing to do it looks again every --every minutes (3) for --for minutes (25), then says so:
//   wait: nothing new for <name> on <project> …   (run it again)
// On Antigravity (the copy's git config desk.tool, or ANTIGRAVITY_AGENT=1) a run is every 1 for 1: about
// a minute, two looks, because Antigravity detaches a command past 10 s into a background stream and
// recreates the agent's machine once that stream has been silent for about three minutes; the agent runs it again on each wait:. While it sleeps it prints a heartbeat line
// every --beat seconds (20), so no run is ever silent; --once never sleeps and prints none.
// It stops, and the agent with it, when the desk says so:
//   stop: …   awake is off for this agent (desk.json's awake), it isn't on the desk, it has moved to
//             another tool (desk.json's tool against the copy's git config desk.tool), the copy's project
//             isn't the work branch's, or the copy has no name
// Exit 0: a fit. 3: nothing yet. 1: stop. 2: it couldn't run.
// It imports nothing of the desk's, so an agent runs the work branch's copy alone:
//   git show origin/<base>:.agents/skills/agent-desk/scripts/wait.mjs > .git/desk-wait.mjs && node .git/desk-wait.mjs
//
// --leader is the leader's own look, from its checkout of the work branch (desk.base, else the branch
// checked out): it watches every desk/<project>/* branch on origin and says
//   fits: check <branch>[, <branch>]   a branch moved or appeared since the last look (an agent pushed),
//                                      or an agent's report in agents/desk/status says pushed
//   fits: help <agent> (blocked …)     an agent's report says blocked, once per report
// and, where desk.json's notify names the owner's issue, a line before its last for each event the
// owner is told of (notify: node .agents/skills/agent-desk/scripts/desk.mjs notify <event> … --post): blocked with the help,
// silent the first time, asleep with the stop; the leader runs that line.
// once per head, never a head already merged into the work branch, and never on a checkout's first look,
// which only records what is there; a branch that went, or the work branch moving, is activity but no fit. Activity resets
// the leader's clock (git config desk.leader.active), and so does --touch (an event or the owner's
// word); with nothing moving for leader.idle_minutes (60 unless set) it says
//   stop: asleep …   and the leader stops watching until the owner wakes it
// or, with desk.json's leader.awake false, stop: at once. Nothing is marked for an agent.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// The project's own files (agents/desk/<project>/), set once the project is known. This file imports
// no sibling, as an agent runs it copied out of the work branch, so the paths are spelt here.
const ROOT = "agents/desk";
let CONFIG = "", BOARD = "", ASSIGNMENTS = "", STATUS = "";
function useProject(project) { const d = `${ROOT}/${project}`; CONFIG = `${d}/desk.json`; BOARD = `${d}/board.md`; ASSIGNMENTS = `${d}/assignments`; STATUS = `${d}/status`; }
// The projects with a desk on origin's work branch.
const projectsOn = (base) => (git(["ls-tree", "-r", "--name-only", `origin/${base}:${ROOT}`], { soft: true }) || "").split("\n").map((l) => /^([^/]+)\/desk\.json$/.exec(l)).filter(Boolean).map((m) => m[1]).sort();
const GONE = new Set(["stopped", "moved"]);

// Every agent's report on origin's work branch: { name: status }.
function statuses(base) {
  const out = {};
  for (const f of (git(["ls-tree", "--name-only", `origin/${base}:${STATUS}`], { soft: true }) || "").split("\n").filter((x) => x.endsWith(".json"))) {
    try { out[f.slice(0, -5)] = JSON.parse(show(base, `${STATUS}/${f}`) || "{}"); } catch { /* an unreadable report is no report */ }
  }
  return out;
}
const minutesSince = (at, now) => Math.floor((now - Date.parse(at)) / 60000);

// The heartbeat: an awake agent's waiting report is written again once it is half of silence_minutes
// old (status.mjs's heartbeatDue, the same rule), so the leader never reads an agent that is here as
// silent (a fresh agent's hours-old waiting report, unchanged so never rewritten, read
// as "silent 693 min"). It goes through desk.mjs report --fresh: this file's sibling when it runs from
// .agents/skills/agent-desk/scripts/, else the copy's own .agents/skills/agent-desk/scripts/desk.mjs (this file is often run as .git/desk-wait.mjs).
function refreshWaiting(cfg, myReport) {
  const quietAfter = Number.isInteger(cfg.silence_minutes) ? cfg.silence_minutes : 20;
  if (!myReport || myReport.phase !== "waiting") return "";
  const mins = (Date.now() - Date.parse(myReport.at)) / 60000;
  if (!Number.isFinite(mins) || mins < quietAfter / 2) return "";
  const top = git(["rev-parse", "--show-toplevel"], { soft: true }) || ".";
  const desk = [fileURLToPath(new URL("./desk.mjs", import.meta.url)), join(top, ".agents/skills/agent-desk/scripts/desk.mjs")].find((p) => existsSync(p));
  if (!desk) return "your waiting report is getting old and .agents/skills/agent-desk/scripts/desk.mjs isn't in this copy to refresh it: run node .agents/skills/agent-desk/scripts/desk.mjs report waiting --fresh yourself";
  const r = spawnSync(process.execPath, [desk, "report", "waiting", "--fresh"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.status === 0) return "your waiting report refreshed (a heartbeat, so the leader doesn't read you as silent)";
  return `your waiting report wasn't refreshed: ${`${r.stderr || r.stdout || ""}`.trim().split("\n").pop()}`;
}
const reportWords = (st) => `${[st.phase, st.brief, st.pr].filter(Boolean).join(" ")}${st.step ? ` (${st.step})` : ""}`;

function args(argv) {
  const antigravity = process.env.ANTIGRAVITY_AGENT === "1" || (git(["config", "desk.tool"], { soft: true }) || "") === "antigravity";
  const o = { once: false, every: antigravity ? 1 : 3, for: antigravity ? 1 : 25, beat: 20, mark: true, leader: false, touch: false, antigravity };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--once") o.once = true;
    else if (v === "--beat") o.beat = Number(argv[++i]);
    else if (v === "--leader") o.leader = true;
    else if (v === "--project") o.project = argv[++i] || "";
    else if (v === "--touch") o.touch = true;
    else if (v === "--every") o.every = Number(argv[++i]);
    else if (v === "--for") o.for = Number(argv[++i]);
    else if (v === "--no-mark") o.mark = false;
    else throw new Error(`unknown option ${v}`);
  }
  if (!(o.every > 0) || !(o.for > 0)) throw new Error("--every and --for take minutes above zero");
  if (!(o.beat >= 0)) throw new Error("--beat takes seconds (0 for none)");
  return o;
}

// The run's schedule, said once at the start so the agent knows how long it holds the turn.
const schedule = (o) => `looking every ${o.every} min for ${o.for} min${o.antigravity ? " (Antigravity ends a silent background command after about three minutes and restarts your machine, so each run is short: run me again on wait:)" : ""}`;

// A sleep that is never silent: a heartbeat line every beat seconds, so a tool watching the stream sees life.
async function sleepBeating(ms, beat) {
  const started = Date.now();
  for (;;) {
    const left = ms - (Date.now() - started);
    if (left <= 0) return;
    const chunk = beat > 0 ? Math.min(left, beat * 1000) : left;
    await new Promise((resolve) => setTimeout(resolve, chunk));
    if (beat > 0 && Date.now() - started < ms) console.log(`… still waiting (${Math.round((Date.now() - started) / 1000)} s into this run)`);
  }
}

const git = (a, { soft = false } = {}) => {
  const r = spawnSync("git", a, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) { if (soft) return null; throw new Error(`git ${a.join(" ")}: ${(r.stderr || "").trim()}`); }
  return r.stdout.replace(/\n$/, "");
};
const show = (base, path) => git(["show", `origin/${base}:${path}`], { soft: true });
const sha = (ref) => { const out = git(["ls-remote", "origin", ref], { soft: true }); return out ? out.split("\t")[0] : ""; };

// The board's rows: { name: { state, brief, branch, pr } }, as .agents/skills/agent-desk/scripts/board.mjs reads them.
function rows(text) {
  const out = {};
  let inTable = false;
  for (const line of String(text || "").split("\n")) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length >= 6 && /^(Agent|Slot)$/.test(cells[0])) { inTable = true; continue; }
    if (!inTable) continue;
    if (cells.length < 6) { inTable = false; continue; }
    if (/^-+$/.test(cells[0])) continue;
    const [name, state, brief, branch, pr] = cells;
    out[name] = { state, brief: brief.replace(/`/g, ""), branch: branch.replace(/`/g, ""), pr };
  }
  return out;
}

const reviewerOf = (base, brief) => ((/^reviewer:\s*(\S+)/m.exec(show(base, `${ASSIGNMENTS}/${brief}.md`) || "") || [])[1] || "");
const isAwake = (cfg, a) => typeof a.awake === "boolean" ? a.awake : cfg.awake === true;
// An agent whose desk.json subagents include review reviews its own pull request with a subagent
// before pushing (take.md step 5), so the ring reviewer isn't offered it: the leader decides.
const selfReviews = (a) => Array.isArray(a?.subagents?.scope) && a.subagents.scope.includes("review");
const acted = (brief) => git(["config", `desk.${brief}.acted`], { soft: true }) || "";

// One look at origin: { fit, line } for something to do, { stop, line }, or { line } for nothing yet.
function look(me, mark) {
  const text = show(me.base, CONFIG);
  if (text === null) return { stop: true, line: `stop: there is no ${CONFIG} on origin/${me.base}: the desk isn't set up there` };
  let cfg;
  try { cfg = JSON.parse(text); } catch (err) { return { stop: true, line: `stop: ${CONFIG} on origin/${me.base} isn't JSON (${err.message})` }; }
  if (cfg.project !== me.project) return { stop: true, line: `stop: this copy is ${me.slot}'s on ${me.project}, and origin/${me.base} holds the desk of ${cfg.project}: ${me.project} needs its own work branch` };
  const agents = Array.isArray(cfg.agents) ? cfg.agents : [];
  const a = agents.find((x) => x && x.name === me.slot);
  if (!a) return { stop: true, line: `stop: ${me.slot} isn't on the ${me.project} desk any more (desk.json's agents: ${agents.map((x) => x && x.name).join(", ")})` };
  const tool = git(["config", "desk.tool"], { soft: true });
  if (tool && a.tool && tool !== a.tool) return { stop: true, line: `stop: ${me.slot} has moved to ${a.tool} (desk.json), and this conversation is ${tool}'s, so it is finished: the owner pastes ${me.slot}'s new prompt in ${a.tool} (desk.mjs prompts ${me.slot})` };
  if (!isAwake(cfg, a)) return { stop: true, line: `stop: awake is off for ${me.slot} on ${me.project} (desk.json's awake): the owner's go moves ${me.slot} now, and the leader's desk.mjs awake on turns this back on` };
  const board = rows(show(me.base, BOARD));
  const boardCommit = git(["log", "-1", "--format=%H", `origin/${me.base}`, "--", BOARD], { soft: true }) || "";
  const fit = (brief, signal, line) => {
    if (acted(brief) === signal) return null;
    if (mark) git(["config", `desk.${brief}.acted`, signal]);
    return { fit: true, line };
  };
  const notes = [];
  const reports = statuses(me.base);
  // A review first: it unblocks the other agent. The board says so, or, while the leader hasn't moved
  // the row yet, the author's own report that it pushed a pull request .
  for (const other of agents) {
    if (!other || other.name === me.slot) continue;
    let r = board[other.name];
    const st = reports[other.name];
    if ((!r || r.state !== "review" || !r.pr) && st && st.phase === "pushed" && st.pr && st.brief) r = { state: "review", brief: st.brief, pr: st.pr, branch: "" };
    if (!r || r.state !== "review" || !r.pr || !r.brief) continue;
    if (reviewerOf(me.base, r.brief) !== me.slot) continue;
    if (selfReviews(other)) { notes.push(`${other.name}'s ${r.pr} came with its own subagent review: the leader decides it, and asks you by name for a second look if it wants one`); continue; }
    const branch = r.branch || `desk/${cfg.project}/${other.name}/${r.brief}`;
    const head = sha(`refs/heads/${branch}`);
    if (!head) continue;
    const f = fit(r.brief, `review:${r.pr}@${head}`, `fits: review ${r.pr} ${branch} (${other.name}'s ${r.brief}; you are its reviewer)`);
    if (f) return f;
  }
  const mine = board[me.slot];
  if (mine && mine.brief) {
    const branch = mine.branch || `desk/${cfg.project}/${me.slot}/${mine.brief}`;
    if (mine.state === "changes" && mine.pr) {
      const f = fit(mine.brief, `changes:${mine.pr}@${boardCommit}`, `fits: revise ${mine.brief} ${mine.pr} (the leader's decision asks for changes)`);
      if (f) return f;
      notes.push(`${mine.brief} ${mine.pr} is revised, as far as the board knows: the leader's turn`);
    } else if (mine.state === "ready" || mine.state === "in-progress") {
      if (sha(`refs/heads/${branch}`)) notes.push(`${mine.brief} is pushed (${branch} is on origin): the leader's turn`);
      else {
        const f = fit(mine.brief, `take:${mine.brief}`, `fits: take ${mine.brief} (your row is ${mine.state})`);
        if (f) return f;
        notes.push(`${mine.brief} was taken once already; the owner's go takes it again`);
      }
    } else if (mine.state === "review" && mine.pr) notes.push(`${mine.brief} ${mine.pr} waits for its review and the leader's decision`);
    else if (mine.state === "done") notes.push(`${mine.brief} is done; no next brief yet`);
  } else notes.push("your row is idle");
  const myReport = reports[me.slot];
  if (myReport && myReport.phase) notes.push(`your last report: ${reportWords(myReport)}`);
  const beat = refreshWaiting(cfg, myReport);
  if (beat) notes.push(beat);
  return { line: `wait: nothing new for ${me.slot} on ${me.project} (${notes.join("; ")})` };
}

// The leader's look: every desk branch of the project on origin, against the ones seen last time.
function lookAsLeader(base, touch) {
  const text = show(base, CONFIG);
  if (text === null) return { stop: true, line: `stop: there is no ${CONFIG} on origin/${base}: the desk isn't set up there` };
  let cfg;
  try { cfg = JSON.parse(text); } catch (err) { return { stop: true, line: `stop: ${CONFIG} on origin/${base} isn't JSON (${err.message})` }; }
  const leader = cfg.leader || {};
  const name = leader.name || "the leader";
  if (leader.awake === false) return { stop: true, line: `stop: the leader ${name} is switched off on ${cfg.project} (desk.json's leader.awake is false): the owner's /agent-desk lead check moves the desk now, and desk.mjs awake leader on turns the leader's watching back on` };
  const idle = Number.isInteger(leader.idle_minutes) ? leader.idle_minutes : 60;
  const now = Date.now();
  // The owner's issue and the events it carries (desk.json's notify), for the ready-made notify lines.
  const nt = cfg.notify && typeof cfg.notify === "object" && Number.isInteger(cfg.notify.issue) && cfg.notify.issue >= 1
    ? { events: Array.isArray(cfg.notify.events) ? cfg.notify.events : ["blocked", "silent", "asleep", "merged", "question"] } : null;
  const tell = (event, args) => nt && nt.events.includes(event) ? [`notify: node .agents/skills/agent-desk/scripts/desk.mjs notify ${event}${args ? ` ${args}` : ""} --post`] : [];
  const pre = [];
  const seenText = git(["config", "desk.leader.refs"], { soft: true });
  const firstLook = seenText === null;
  const seen = JSON.parse(seenText || "{}");
  const heads = {};
  for (const row of (git(["ls-remote", "origin", `refs/heads/desk/${cfg.project}/*`], { soft: true }) || "").split("\n").filter(Boolean)) {
    const [sha, ref] = row.split("\t");
    heads[ref.replace(/^refs\/heads\//, "")] = sha;
  }
  // A head already merged into the work branch is settled, however it moved; and the first look of a
  // checkout is a baseline, never a list of everything that ever happened.
  const merged = (h) => spawnSync("git", ["merge-base", "--is-ancestor", h, `origin/${base}`]).status === 0;
  const moved = firstLook ? [] : Object.keys(heads).filter((b) => seen[b] !== heads[b] && !merged(heads[b])).sort();
  const gone = Object.keys(seen).filter((b) => !(b in heads));
  const baseHead = sha(`refs/heads/${base}`);
  const baseMoved = baseHead && baseHead !== (git(["config", "desk.leader.base"], { soft: true }) || "");
  let active = Date.parse(git(["config", "desk.leader.active"], { soft: true }) || "") || 0;
  if (!active || touch || moved.length || gone.length || baseMoved) {
    active = now;
    git(["config", "desk.leader.active", new Date(now).toISOString()]);
  }
  git(["config", "desk.leader.refs", JSON.stringify(heads)]);
  if (baseHead) git(["config", "desk.leader.base", baseHead]);
  const agents = Array.isArray(cfg.agents) ? cfg.agents : [];
  const board = rows(show(base, BOARD));
  const rowOf = (branch) => Object.entries(board).find(([n, r]) => (r.branch || `desk/${cfg.project}/${n}/${r.brief}`) === branch);
  if (moved.length) {
    // A push after the leader's decision asked for changes: the row is behind it .
    const after = moved.map((b) => [b, rowOf(b)]).filter(([, r]) => r && r[1].state === "changes" && r[1].pr)
      .map(([b, [n, r]]) => `${b} pushed ${heads[b].slice(0, 7)} after your decision; set ${n} review --pr ${r.pr}`);
    return { fit: true, line: `fits: check ${moved.join(", ")} (pushed since the last look${after.length ? `; ${after.join("; ")}` : ""})` };
  }
  // The agents' own reports: a blocked agent needs the leader; a pushed brief is ready to check; an
  // awake agent silent past silence_minutes is said, and the owner told once per silence.
  const reports = statuses(base);
  const seenStatus = JSON.parse(git(["config", "desk.leader.seen-status"], { soft: true }) || "{}");
  const quietAfter = Number.isInteger(cfg.silence_minutes) ? cfg.silence_minutes : 20;
  // The board behind the agent : its report says it pushed a pull request, and its row isn't
  // at review with that number. The line to run, said once for each pull request and head.
  const drift = (a, st) => {
    if (!["pushed", "revising"].includes(st.phase) || !st.pr) return "";
    const row = board[a.name] || {};
    if (row.state === "review" && row.pr === st.pr) return "";
    const branch = row.branch || `desk/${cfg.project}/${a.name}/${st.brief || row.brief || ""}`;
    const key = `${st.pr}@${heads[branch] || st.at}`;
    const seenDrift = JSON.parse(git(["config", "desk.leader.seen-drift"], { soft: true }) || "{}");
    if (seenDrift[a.name] === key) return "";
    seenDrift[a.name] = key; git(["config", "desk.leader.seen-drift", JSON.stringify(seenDrift)]);
    return `set ${a.name} review --pr ${st.pr} (${a.name} ${st.phase} ${st.pr}; the board says ${row.state || "nothing"}${row.pr && row.pr !== st.pr ? ` ${row.pr}` : ""})`;
  };
  const silent = [];
  for (const a of agents) {
    const st = reports[a?.name];
    if (!st || !st.phase) continue;
    if (st.phase === "blocked" && seenStatus[a.name] !== st.at) {
      seenStatus[a.name] = st.at; git(["config", "desk.leader.seen-status", JSON.stringify(seenStatus)]);
      return { fit: true, pre: [...pre, ...tell("blocked", `--agent ${a.name}`)], line: `fits: help ${a.name} (blocked on ${st.brief || "its brief"}: ${st.words || "no words"})` };
    }
    if (st.phase === "pushed" && seenStatus[a.name] !== st.at) {
      seenStatus[a.name] = st.at; git(["config", "desk.leader.seen-status", JSON.stringify(seenStatus)]);
      const branch = board[a.name]?.branch || `desk/${cfg.project}/${a.name}/${st.brief || board[a.name]?.brief || ""}`;
      const lag = drift(a, st);
      return { fit: true, line: `fits: check ${branch} (${a.name} says pushed ${st.pr || ""}${lag ? `; ${lag}` : ""})`.replace(/ \)/, ")") };
    }
    { const lag = drift(a, st); if (lag) return { fit: true, pre, line: `fits: ${lag}` }; }
    const awake = typeof a.awake === "boolean" ? a.awake : cfg.awake === true;
    const mins = minutesSince(st.at, now);
    if (awake && !GONE.has(st.phase) && Number.isFinite(mins) && mins > quietAfter) {
      const toldKey = `desk.leader.told-silent.${a.name}`;
      const told = git(["config", toldKey], { soft: true }) === st.at;
      if (!told) { git(["config", toldKey, st.at]); pre.push(...tell("silent", `--agent ${a.name}`)); }
      silent.push(`${a.name} silent ${mins} min (last: ${st.phase}, ${String(st.at).slice(11, 16)} UTC)${told ? "" : ": tell the owner once, in one line"}`);
    }
  }
  if (now - active > idle * 60000) return { stop: true, pre: [...pre, ...tell("asleep")], line: `stop: asleep: nothing has moved on the ${cfg.project} desk for ${idle} minutes (leader.idle_minutes); the owner's /agent-desk lead watch, or any desk command, wakes the leader ${name} again (wait.mjs --leader --touch)` };
  const notes = [firstLook ? `first look: ${Object.keys(heads).length} desk branch${Object.keys(heads).length === 1 ? "" : "es"} recorded` : "", gone.length ? `${gone.join(", ")} went (merged or closed)` : "", baseMoved ? "the work branch moved" : "", ...silent].filter(Boolean);
  return { pre, line: `wait: nothing new for the leader ${name} on ${cfg.project}${notes.length ? ` (${notes.join("; ")})` : ""}; asleep after ${idle} minutes without activity` };
}

async function main(argv) {
  const o = args(argv);
  if (o.leader) {
    const base = git(["config", "desk.base"], { soft: true }) || git(["rev-parse", "--abbrev-ref", "HEAD"], { soft: true });
    if (!base || base === "HEAD") { console.log("stop: this checkout is on no branch: check out the work branch, or set git config desk.base"); return 1; }
    if (!o.once) console.log(schedule(o));
    const started = Date.now();
    let failed = 0, touch = o.touch;
    for (;;) {
      const fetched = git(["fetch", "-q", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`], { soft: true });
      if (fetched === null && ++failed >= 3) { console.log(`wait: couldn't fetch origin/${base} three times running; run me again`); return 3; }
      if (fetched !== null) {
        failed = 0;
        // Which project the leader watches: the one named, else this checkout's own, else the only one there.
        const all = projectsOn(base), own = git(["config", "desk.project"], { soft: true }) || "";
        const project = o.project || (all.includes(own) ? own : "") || (all.length === 1 ? all[0] : "");
        if (!project) { console.log(all.length ? `stop: ${all.length} projects have a desk on origin/${base} (${all.join(", ")}): say which with --project <name>, or git config desk.project <name>` : `stop: no project has a desk on origin/${base} (${ROOT}/<project>/desk.json): the desk isn't set up there`); return 1; }
        useProject(project);
        const r = lookAsLeader(base, touch);
        touch = false;
        for (const l of r.pre || []) console.log(l);
        if (r.fit) { console.log(r.line); return 0; }
        if (r.stop) { console.log(r.line); return 1; }
        if (o.once) { console.log(r.line); return 3; }
        if (Date.now() - started + o.every * 60000 > o.for * 60000) { console.log(`${r.line}; nothing new in ${Math.round((Date.now() - started) / 60000)} minutes, so run me again`); return 3; }
      }
      await sleepBeating(o.every * 60000, o.beat);
    }
  }
  const me = { slot: git(["config", "desk.slot"], { soft: true }), project: git(["config", "desk.project"], { soft: true }), base: git(["config", "desk.base"], { soft: true }) };
  if (!me.slot || !me.project || !me.base) {
    console.log(`stop: this copy has no name (git config desk.slot, desk.project and desk.base must all be set: agent.md step 1 saves them on a first turn)`);
    return 1;
  }
  useProject(me.project);
  if (!o.once) console.log(schedule(o));
  const started = Date.now();
  let failed = 0;
  for (;;) {
    const fetched = git(["fetch", "-q", "origin", `+refs/heads/${me.base}:refs/remotes/origin/${me.base}`], { soft: true });
    if (fetched === null && ++failed >= 3) { console.log(`wait: couldn't fetch origin/${me.base} three times running; run me again`); return 3; }
    if (fetched !== null) {
      failed = 0;
      const r = look(me, o.mark);
      if (r.fit) { console.log(r.line); return 0; }
      if (r.stop) { console.log(r.line); return 1; }
      if (o.once) { console.log(r.line); return 3; }
      if (Date.now() - started + o.every * 60000 > o.for * 60000) { console.log(`${r.line}; nothing new in ${Math.round((Date.now() - started) / 60000)} minutes, so run me again`); return 3; }
    }
    await sleepBeating(o.every * 60000, o.beat);
  }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { console.error(`wait: ${err.message}`); process.exitCode = 2; });
