// The desk's health in one go (desk.mjs doctor): every way the desk disagrees with itself, with
// origin's branches, with the agents' reports, with GitHub or with this copy, each with the one thing
// that mends it. Pure: the caller gathers what origin, gh and the copy say and hands it in.
import { configProblems, agentNamed, isAwake, leaderAwake, autocompactOf, silenceMinutes, notifyOf } from "./config.mjs";
import { parseBoard, boardProblems } from "./board.mjs";
import { briefProblems } from "./brief.mjs";
import { statusProblems, silence } from "./status.mjs";
import { notifyLine } from "./notify.mjs";

const ACTIVE = new Set(["ready", "in-progress", "review", "changes"]);
// A row in these states has pushed its branch (take.md opens the pull request at the first commit).
const PUSHED = new Set(["review", "changes"]);
const CMD = "node .agents/skills/agent-desk/scripts/desk.mjs";

// What a refused push means, from git's own words: another push landed first (`race`: fetch and try
// again), the copy's pre-push hook declined it (`hook`: nothing clears by trying again), or something
// else (`other`). A remote's hook says "hook declined"; a local pre-push hook that exits non-zero says
// only "failed to push some refs" after its own words, so a copy whose core.hooksPath is set
// (`hooksPath`) reads any refusal that isn't a race as its hook's. The desk pushes its board commits
// from a temporary worktree, which shares the copy's config and so its hooks, and has no node_modules:
// a repository hook that needs them, or a receipt, refuses every such push, which was once said as
// "another push kept landing first".
export function pushRefusal(stderr, { hooksPath = "" } = {}) {
  const s = String(stderr || "");
  if (/fetch first|non-fast-forward|stale info/i.test(s)) return { kind: "race" };
  if (hooksPath || /hook declined|pre-push hook/i.test(s)) return { kind: "hook" };
  return { kind: "other" };
}

// The one fix for a copy that runs the repository's hooks: an agent's copy keeps them off.
export const HOOKS_FIX = "git config --unset core.hooksPath (an agent's copy keeps the repository's hooks off; a fresh clone has none)";

// [{ what, fix }]: heads is { branch: sha } from origin, or null when origin couldn't be asked;
// prs is [{ number, state, merged, head }] from GitHub, or null when it wasn't; identity is the
// copy's git config (desk.slot, project, base, tool); kitVersion is the skill's own VERSION when its folder
// is here; compaction is [{ file, exists, ok }] for each tool's settings file, and subagents the same
// (lists, the desk, is [{ file, problems }] for each shared JSON list)
// for each subagent definition desk.json asks for.
export function doctorFindings({ cfg, boardText, briefOf, briefIds = [], statuses = {}, heads = null, isMerged = () => false, identity = {}, kitVersion = null, prs = null, compaction = [], subagents = [], lists = [], now = Date.now() }) {
  const F = [];
  const add = (what, fix) => F.push({ what, fix });
  const cp = configProblems(cfg);
  if (cp.length) { for (const p of cp) add(`desk.json: ${p}`, `edit agents/desk/${cfg?.project || "<project>"}/desk.json, then ${CMD} validate`); return F; }
  const board = parseBoard(boardText || "");
  const rows = board.slots;
  if (boardText === null) add(`there is no agents/desk/${cfg.project}/board.md`, `${CMD} sync-board`);
  else for (const p of boardProblems(board, briefOf, cfg)) add(`board: ${p}`, p.includes("sync-board") ? `${CMD} sync-board` : /isn't in agents\/desk\/[^/]+\/assignments/.test(p) ? `${CMD} brief <id> --for <agent> --from-spec <step>, or ${CMD} set <agent> idle` : `${CMD} set <agent> <state> --brief <id>`);
  for (const id of briefIds) { const b = briefOf(id); if (b) for (const p of briefProblems(b, id, cfg)) add(`${id}: ${p}`, `edit agents/desk/${cfg.project}/assignments/${id}.md`); }

  for (const [name, st] of Object.entries(statuses)) {
    const probs = statusProblems(st, cfg);
    const onDesk = !!agentNamed(cfg, name) || name === cfg.leader?.name;
    if (probs.length) { add(`status/${name}.json: ${probs.join("; ")}`, onDesk ? `${name} reports again at its next step (${CMD} report …), which replaces it` : `git rm agents/desk/${cfg.project}/status/${name}.json and commit: ${name} isn't on the desk`); continue; }
    const a = agentNamed(cfg, name);
    if (!a) continue;
    const quiet = silence(cfg, st, now);
    if (quiet) add(`${name} is silent: ${quiet} min past silence_minutes (${silenceMinutes(cfg)}; last: ${[st.phase, st.brief].filter(Boolean).join(" ")}, ${String(st.at).slice(11, 16)} UTC)`, `open ${name}'s conversation and type go, or ${CMD} awake off ${name}`);
    if (st.phase === "blocked") add(`${name} is blocked on ${st.brief || "its brief"}: ${st.words || "no words"}`, `answer it in its pull request, or hand the brief on (/agent-desk lead help ${name})`);
    const row = rows[name];
    if (st.phase === "pushed" && st.pr && row && !["review", "changes", "done"].includes(row.state)) add(`${name} says pushed ${st.pr} but its row is ${row.state}`, `${CMD} set ${name} review --pr ${st.pr}`);
  }

  if (heads && typeof heads === "object") {
    for (const a of cfg.agents) {
      const row = rows[a.name];
      if (!row || !PUSHED.has(row.state) || !row.brief) continue;
      const branch = row.branch || `desk/${cfg.project}/${a.name}/${row.brief}`;
      if (!(branch in heads)) add(`${a.name}'s row says ${row.state} on ${row.brief}, but ${branch} isn't on origin`, `have ${a.name} push, or ${CMD} set ${a.name} ready --brief ${row.brief}`);
    }
    const named = new Set(Object.values(rows).map((r) => r.branch).filter(Boolean));
    for (const [branch, sha] of Object.entries(heads)) {
      if (named.has(branch)) continue;
      const m = new RegExp(`^desk/${cfg.project}/([a-z0-9-]+)/(.+)$`).exec(branch);
      if (!m) continue;
      if (isMerged(sha)) add(`${branch} is on origin, merged into ${cfg.work_branch}, and no row names it`, `git push origin --delete ${branch} (or, when the whole project is finished, ${CMD} end clears every one)`);
      else add(`${branch} is on origin and no row names it`, agentNamed(cfg, m[1]) && briefOf(m[2]) ? `${CMD} set ${m[1]} in-progress --brief ${m[2]}, or git push origin --delete ${branch}` : `git push origin --delete ${branch}, or put ${m[1]} and the brief ${m[2]} on the desk`);
    }
  }

  if (Array.isArray(prs)) {
    for (const a of cfg.agents) {
      const row = rows[a.name];
      if (!row || !row.pr) continue;
      const n = Number(String(row.pr).replace("#", ""));
      const pr = prs.find((p) => p.number === n);
      if (!pr) { add(`${a.name}'s row names ${row.pr}, which isn't a pull request into ${cfg.work_branch}`, `${CMD} set ${a.name} ${row.state} --brief ${row.brief} --pr <the right number>`); continue; }
      if (ACTIVE.has(row.state) && pr.state !== "open") add(`${a.name}'s row is ${row.state} with ${row.pr}, which is ${pr.merged ? "merged" : "closed"}`, pr.merged ? `${CMD} set ${a.name} done` : `${CMD} set ${a.name} ready --brief ${row.brief} (or idle)`);
      if (row.state === "done" && pr.state === "open") add(`${a.name}'s row is done but ${row.pr} is still open`, `merge or close ${row.pr}, or ${CMD} set ${a.name} review --pr ${row.pr}`);
      const branch = row.branch || `desk/${cfg.project}/${a.name}/${row.brief}`;
      if (pr.head && pr.head !== branch) add(`${row.pr}'s head is ${pr.head}, not ${a.name}'s ${branch}`, `${CMD} set ${a.name} ${row.state} --brief ${row.brief} --pr <the right number>`);
    }
  }

  if (identity.slot) {
    for (const k of ["project", "base", "tool"]) if (!identity[k]) add(`this copy is ${identity.slot}'s but has no desk.${k}`, `git config desk.${k} <value> (agent.md step 1 saves it on a first turn)`);
    if (identity.project && identity.project !== cfg.project) add(`this copy's desk.project is ${identity.project}, not ${cfg.project}`, `work in a copy of ${cfg.project}'s own, or git config desk.project ${cfg.project} if this copy truly is ${identity.slot}'s on ${cfg.project}`);
  }
  if (identity.hooksPath) add(`this copy runs the repository's git hooks on every push (core.hooksPath = ${identity.hooksPath}), which the desk's board pushes can't satisfy from their temporary worktree (no node_modules, no receipt)`, HOOKS_FIX);
  if (kitVersion && cfg.kit?.version && cfg.kit.version !== kitVersion) add(`desk.json says the skill's version ${cfg.kit?.version ?? "none"} and this copy's skill is ${kitVersion}`, "node .agents/skills/agent-desk/scripts/install.mjs --target . then commit the install");
  if (cfg.autocompact !== false) for (const c of compaction) if (c.exists && !c.ok) add(`${c.file} doesn't hold the compaction figure desk.json sets (${autocompactOf(cfg)} tokens)`, `node .agents/skills/agent-desk/scripts/install.mjs --target . (or write the figure into ${c.file})`);
  for (const s of subagents) {
    if (!s.exists) add(`${s.file} isn't in this copy: desk.json's subagents ask for that definition, so the tool has no such subagent here`, "node .agents/skills/agent-desk/scripts/install.mjs --target . (or desk.mjs subagents <agent> on), then commit the file");
    else if (!s.ok) add(`${s.file} isn't what desk.json's subagents ask for (its model or words differ)`, "node .agents/skills/agent-desk/scripts/install.mjs --target . (or desk.mjs subagents <agent> on), then commit the file");
  }
  // Automatic checking with no issue to post on: an agent that hangs is noticed by nobody.
  if ((cfg.agents || []).some((a) => isAwake(cfg, a)) && !notifyOf(cfg)) add(`automatic checking is on and nobody is told when an agent goes silent for ${silenceMinutes(cfg)} minutes (desk.json has no notify)`, `${CMD} notify --setup --create (it makes the issue), then commit and push desk.json`);
  // A shared JSON list (desk.json's shared_lists) left broken or out of order by a merge.
  for (const l of lists) for (const p of l.problems || []) add(`${l.file} (a shared list) ${p}`, `sort it and keep every entry both sides added (in a conflicted merge, ${CMD} resolve-lists does it), then commit`);
  return F;
}

// The whole answer in words: the header with its notes, each finding with its fix, the count and the
// desk's settings.
export function doctorWords(cfg, findings, notes = []) {
  const la = leaderAwake(cfg);
  const awake = (cfg.agents || []).filter((a) => isAwake(cfg, a)).map((a) => a.name);
  const settings = `Settings: ${awake.length ? `${awake.join(", ")} awake` : "no agent awake"}; the leader ${cfg.leader?.name} ${la.on ? `awake, asleep after ${la.idleMinutes} idle minutes` : "not awake"}${cfg.autocompact === false ? "" : `; conversations compact at ${autocompactOf(cfg).toLocaleString("en-GB")} tokens`}; ${notifyLine(cfg)}${cfg.kit?.version ? ` Kit ${cfg.kit.version}.` : ""}`;
  const where = `${cfg.project} (${cfg.work_branch}${notes.length ? `; ${notes.join("; ")}` : ""})`;
  if (!findings.length) return `The desk for ${where} is in order: nothing to fix.\n${settings}`;
  const lines = [`Doctor for ${where}:`];
  findings.forEach((f, i) => lines.push(`  ${i + 1}. ${f.what}`, `     fix: ${f.fix}`));
  lines.push(`${findings.length} finding${findings.length === 1 ? "" : "s"}. ${settings}`);
  return lines.join("\n");
}
