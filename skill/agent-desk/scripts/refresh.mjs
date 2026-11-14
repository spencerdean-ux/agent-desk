// The card /agent-desk refresh reads back to a drifted agent, or to the leader: who you are, what the board
// and your own report say, where you are in the steps, and the rules, every line from the copy's
// config and the work branch, none from memory. refreshCard is pure (desk.mjs gathers its input), so
// the words are tested without git.
import { agentNamed, leaderAwake, subagentsOf, TOOL_WORDS } from "./config.mjs";
import { ago } from "./status.mjs";

const WIDTH = 118;

// One section of a markdown file, from its heading to the next heading of the same or a higher
// level, or the desk block's end marker.
export function section(text, heading) {
  const s = String(text || "");
  const i = s.indexOf(heading);
  if (i < 0) return "";
  const level = (/^#+/.exec(heading) || [""])[0].length;
  const rest = s.slice(i + heading.length);
  const stop = rest.search(new RegExp(`\\n(#{1,${level}} |<!-- agent-desk:end -->)`));
  return (heading + (stop < 0 ? rest : rest.slice(0, stop))).trimEnd();
}

// Long lines folded at WIDTH, so the card reads in a chat window; continuation lines are indented.
function fold(line) {
  const out = [];
  let s = line;
  while (s.length > WIDTH) {
    let cut = s.lastIndexOf(" ", WIDTH);
    if (cut < 40) cut = WIDTH;
    out.push(s.slice(0, cut).trimEnd());
    s = "  " + s.slice(cut).trimStart();
  }
  out.push(s);
  return out;
}

const list = (v) => (Array.isArray(v) && v.length ? v.join(", ") : "none");
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const words = (st) => [st.phase, st.step].filter(Boolean).join(" ");

// Where an agent is in its step files, from the phase it last reported.
export function whereAgent(report, row = {}) {
  const pr = report?.pr || row.pr || "";
  const tag = pr ? ` (${pr})` : "";
  switch (report?.phase) {
    case "taking": return { file: "take.md", where: "take.md step 2 to 3: onto the brief's branch, read the brief, run the frozen tests once", next: "finish step 3, then step 4 (the work: open the draft pull request at the first commit)" };
    case "working": return { file: "take.md", where: `take.md step 4${report.step ? ` (${report.step})` : ""}`, next: "finish the step you were on, in may_change only; then step 5 (preflight) and 6 (push and report pushed)" };
    case "checking": return { file: "take.md", where: "take.md step 5 (preflight)", next: "make desk-check pass, fill the report in, then step 6: push and report pushed" };
    case "pushed": return { file: "revise.md", where: `take.md step 6 to 7: pushed${tag}, the leader's turn`, next: "wait for the decision; revise.md if it asks for changes (your row goes to changes), nothing if it merges" };
    case "reviewing": return { file: "review.md", where: `review.md${tag}`, next: "finish the review and post it, then report reviewed" };
    case "reviewed": return { file: "review.md", where: `review.md, posted${tag}: the leader's turn`, next: "agent.md step 3 for anything else that fits, else wait" };
    case "revising": return { file: "revise.md", where: `revise.md${tag}`, next: "answer each numbered point of the decision, preflight, push, report pushed" };
    case "blocked": return { file: "take.md", where: `take.md step 4, blocked${report.words ? ` (${report.words})` : ""}`, next: "nothing until the leader answers in the pull request or hands the brief on; say it again in one line if asked" };
    case "stopped": case "moved": return { file: "agent.md", where: `agent.md: you reported ${report.phase}`, next: "agent.md step 1 again, as go does, if the owner wants you back" };
    default: return { file: "agent.md", where: "agent.md step 3: do every step that fits (a review first, then your own row)", next: "a review that waits for you, your row if it is changes, ready or in-progress, else say nothing fits" };
  }
}

export function refreshCard(input) {
  return input.leader ? leaderCard(input) : agentCard(input);
}

function agentCard({ cfg, identity, row = {}, brief, report, branch = {}, dirty = false, agentsMd = "", now = Date.now() }) {
  const name = identity.slot;
  const a = agentNamed(cfg, name);
  const base = identity.base || cfg.work_branch;
  const out = [];
  if (!a) return [`You are ${name}, but ${cfg.project}'s desk.json has no agent of that name (${(cfg.agents || []).map((x) => x.name).join(", ")}): stop and tell the owner.`];
  out.push(`You are ${name} on ${cfg.project}, working into ${base}, in ${identity.tool || a.tool}${a.model ? ` on ${a.model}` : ""}. Job: ${a.job}. Reviewer: ${a.reviewer}. Leader: ${cfg.leader.name}.`);
  if (identity.tool && a.tool !== identity.tool) {
    out.push(`This conversation is finished: ${name} now works in ${a.tool} (${TOOL_WORDS[a.tool] || a.tool}). Paste my prompt there (node .agents/skills/agent-desk/scripts/desk.mjs prompts ${name}). Do no desk work here.`);
    return out.flatMap(fold);
  }
  const sub = subagentsOf(cfg, a);
  out.push(sub
    ? `Subagents: up to ${sub.max}, for ${sub.scope.join(" and ")}, on ${sub.scope.map((k) => `${sub.models[k]} (${k})`).join(" and ")} (take.md steps 4 and 5; they never write, commit, push or post; what they do on your branch is yours).`
    : `Subagents: none: you review nothing of your own; ${a.reviewer === "leader" ? cfg.leader.name : a.reviewer} reviews you.`);
  const title = brief?.title ? ` (${brief.title})` : "";
  out.push(`The board says: ${row.state || "idle"}${row.brief ? ` with ${row.brief}${title}` : ", no brief"}${row.pr ? `, pull request ${row.pr}` : ""}.`);
  if (report && report.phase) {
    out.push(`Your last report: ${words(report)}${report.phase === "blocked" && report.words ? ` (${report.words})` : ""}, ${ago(report.at, now)}.`);
    const mine = [report.brief, report.pr].filter(Boolean).join(" ");
    const boards = [row.brief, row.pr].filter(Boolean).join(" ");
    if ((report.brief && row.brief && report.brief !== row.brief) || (report.pr && row.pr && report.pr !== row.pr)) {
      out.push(`Your report says ${mine} but the board says ${boards}: trust the board and origin, and report again (node .agents/skills/agent-desk/scripts/desk.mjs report ${report.phase}${row.brief ? ` --brief ${row.brief}` : ""}${row.pr ? ` --pr ${row.pr}` : ""}).`);
    }
  } else out.push("Your last report: none yet.");
  if (row.brief) {
    const b = `desk/${cfg.project}/${name}/${row.brief}`;
    out.push(`Your branch ${b}: ${branch.onOrigin ? `on origin, ${plural(branch.ahead || 0, "commit")} ahead of ${base}` : "not on origin yet"}.`);
  }
  out.push(`This copy: ${dirty ? "has unsaved changes (git status --porcelain): finish or stash them before switching branches" : "clean"}.`);
  out.push(identity.hooksPath
    ? `core.hooksPath = ${identity.hooksPath}: this copy runs the repository's git hooks on every push, which the desk's pushes can't pass. Fix: git config --unset core.hooksPath, then run this again.`
    : "core.hooksPath: off (the desk's pushes can pass).");
  if (brief) {
    const lists = brief.lists || brief;
    out.push(`Your brief ${brief.id || row.brief}: may_change: ${list(lists.may_change)}`);
    out.push(`  frozen: ${list(lists.frozen)}`);
    out.push(`  checks: ${list(lists.checks)}`);
  } else if (row.brief) out.push(`Your brief ${row.brief} isn't in agents/desk/${cfg.project}/assignments/ on ${base}: stop and tell the owner.`);
  const w = whereAgent(report, row);
  out.push(`Where you are: ${w.where}.`);
  out.push(`Next: ${w.next}.`);
  out.push("Read fresh, whole:");
  for (const f of ["AGENTS.md", ".agents/skills/agent-desk/protocol/agent.md", `.agents/skills/agent-desk/protocol/${w.file}`]) out.push(`  git show origin/${base}:${f}`);
  const never = section(agentsMd, "### Never, as a desk agent");
  const always = section(agentsMd, "### Always, as a desk agent");
  out.push("");
  out.push(`Rules (AGENTS.md on ${base}):`);
  if (never || always) out.push(...[never, always].filter(Boolean).join("\n\n").split("\n"));
  else out.push(`(AGENTS.md on ${base} has no "### Never, as a desk agent" section: read its desk block whole.)`);
  return out.flatMap(fold);
}

function leaderCard({ cfg, rows = {}, reports = {}, leaderReport, leadMd = "", now = Date.now() }) {
  const base = cfg.work_branch;
  const out = [];
  out.push(`You lead ${cfg.project}, working into ${base}, as ${cfg.leader.name} (${TOOL_WORDS[cfg.leader.tool] || cfg.leader.tool}${cfg.leader.model ? `, ${cfg.leader.model}` : ""}). Agents: ${(cfg.agents || []).map((a) => `${a.name} (${a.tool}, reviewer ${a.reviewer})`).join("; ")}.`);
  const decide = [];
  for (const a of cfg.agents || []) {
    const r = rows[a.name] || { state: "idle", brief: "", pr: "" };
    const st = reports[a.name];
    const says = st && st.phase ? `says ${words(st)}${st.pr && st.pr !== r.pr ? ` ${st.pr}` : ""} · ${ago(st.at, now)}` : "no report yet";
    out.push(`${a.name}: ${r.state}${r.brief ? ` with ${r.brief}` : ""}${r.pr ? ` ${r.pr}` : ""}; ${says}.`);
    if (r.state === "review" || st?.phase === "pushed") decide.push(`${r.pr || st?.pr || "its pull request"} (${a.name}'s ${r.brief || st?.brief || "brief"}${st?.phase === "pushed" ? ", pushed" : ""})`);
    if (st?.phase === "blocked") decide.push(`${a.name} is blocked${st.words ? ` (${st.words})` : ""}: answer in its pull request or hand the brief on`);
  }
  out.push(`Your last report: ${leaderReport && leaderReport.phase ? `${words(leaderReport)}, ${ago(leaderReport.at, now)}` : "none yet"}.`);
  const la = leaderAwake(cfg);
  out.push(`Awake: ${la.on ? `on, asleep after ${la.idleMinutes} idle minutes (the wait is .agents/skills/agent-desk/scripts/wait.mjs --leader)` : "off (the owner's /agent-desk lead check moves the desk)"}.`);
  if (decide.length) {
    out.push(`Where you are: lead.md "Checking the desk": ${plural(decide.length, "thing")} wait${decide.length === 1 ? "s" : ""} for your decision.`);
    out.push(`Next: decide ${decide.join("; ")}: desk-check, the reviews, your own review, one numbered "Desk decision for ${cfg.project}:", the row moved, merge what passed.`);
  } else {
    out.push('Where you are: lead.md "Watching the desk": nothing waits for a decision.');
    out.push(`Next: the wait (node .agents/skills/agent-desk/scripts/wait.mjs --leader --once), the next brief for an agent whose row is done (desk.mjs next), or tell the owner nothing moves.`);
  }
  out.push("Read fresh, whole:");
  for (const f of [".agents/skills/agent-desk/protocol/lead.md", "AGENTS.md"]) out.push(`  git show origin/${base}:${f}`);
  out.push("");
  out.push(`Rules (lead.md on ${base}):`);
  // lead.md's opening paragraphs, up to its command table (the rest of the file is read whole).
  const head = [];
  for (const l of String(leadMd || "").split("\n## ")[0].split("\n")) {
    if (l.startsWith("|") || l.startsWith("The command line")) break;
    if (l.trim() && !l.startsWith("# ")) head.push(l);
  }
  if (head.length) out.push(...head);
  else out.push("(lead.md's opening paragraph wasn't found: read the file whole.)");
  return out.flatMap(fold);
}
