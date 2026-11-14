// The desk's board (agents/desk/board.md): the project, the work branch, and one row per agent saying which brief
// it has and where that brief stands. Only the leader edits it, so the agents never meet in it.
// Pure: the caller hands in the text, a way to read a brief by id, and the desk's settings.

// idle: nothing to do. ready: a brief waits to be taken. in-progress: the agent has it.
// review: its pull request waits for its reviewer and the leader's decision.
// changes: the leader's decision asks for changes. done: merged into the work branch (or closed).
export const STATES = ["idle", "ready", "in-progress", "review", "changes", "done"];
const NEEDS_BRIEF = new Set(["ready", "in-progress", "review", "changes", "done"]);
const ACTIVE = new Set(["ready", "in-progress", "review", "changes"]);
const MEANING = {
  idle: "nothing for this agent",
  ready: "a brief waits to be taken",
  "in-progress": "the agent has it",
  review: "its pull request waits for its reviewer, then the leader's decision",
  changes: "the leader's decision asks for changes",
  done: "merged into the work branch (or, for a practice run, closed)",
};

export function parseBoard(text) {
  const s = String(text || "");
  const base = (/^Work branch: `([^`]+)`/m.exec(s) || [])[1] || "";
  const project = (/^Project: `([^`]+)`/m.exec(s) || [])[1] || "";
  const slots = {};
  let inTable = false;
  for (const line of s.split("\n")) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length >= 6 && /^(Agent|Slot)$/.test(cells[0])) { inTable = true; continue; }
    if (!inTable) continue;
    if (cells.length < 6) { inTable = false; continue; }
    if (/^-+$/.test(cells[0])) continue;
    const [slot, state, brief, branch, pr, notes] = cells;
    slots[slot] = { state, brief: brief.replace(/`/g, ""), branch: branch.replace(/`/g, ""), pr, notes };
  }
  return { project, base, slots };
}

export function boardProblems(board, briefById, cfg, { reports = {} } = {}) {
  const out = [];
  const names = (cfg.agents || []).map((a) => a.name);
  if (board.project !== cfg.project) out.push(`the board's project “${board.project}” isn't desk.json's “${cfg.project}”: run .agents/skills/agent-desk/scripts/desk.mjs sync-board`);
  if (!board.base) out.push("the board names no work branch (a line “Work branch: `<branch>`”)");
  else if (board.base !== cfg.work_branch) out.push(`the board's work branch “${board.base}” isn't desk.json's “${cfg.work_branch}”: run .agents/skills/agent-desk/scripts/desk.mjs sync-board`);
  for (const name of Object.keys(board.slots)) if (!names.includes(name)) out.push(`“${name}” has a row on the board but isn't on the desk: run .agents/skills/agent-desk/scripts/desk.mjs sync-board`);
  for (const name of names) {
    const row = board.slots[name];
    if (!row) { out.push(`no row for agent “${name}”: run .agents/skills/agent-desk/scripts/desk.mjs sync-board`); continue; }
    if (!STATES.includes(row.state)) { out.push(`${name}: “${row.state}” isn't one of ${STATES.join(", ")}`); continue; }
    if (!NEEDS_BRIEF.has(row.state)) continue;
    const brief = row.brief ? briefById(row.brief) : null;
    if (!brief) { out.push(`${name} is ${row.state} with brief “${row.brief}”, which isn't in agents/desk/${cfg.project}/assignments/`); continue; }
    if (brief.slot !== name) out.push(`${name}'s brief “${row.brief}” belongs to ${brief.slot}`);
    if (ACTIVE.has(row.state) && brief.base !== cfg.work_branch) out.push(`${name}'s brief works into ${brief.base}, not the work branch ${cfg.work_branch}`);
  }
  // A pull request belongs to one brief (1.11.1): the same number on two rows, or a number the
  // agent's own report (agents/desk/status/<agent>.json, `reports`) puts on another brief, is a row
  // that kept its last brief's pull request, which an awake agent would read as this brief's.
  const byPr = {};
  for (const name of names) { const pr = board.slots[name]?.pr; if (pr) (byPr[pr] ||= []).push(name); }
  for (const [pr, who] of Object.entries(byPr)) if (who.length > 1) out.push(`“${who[0]}” and “${who.slice(1).join("”, “")}” both carry ${pr}: a pull request belongs to one brief`);
  for (const name of names) {
    const row = board.slots[name], st = reports[name];
    if (!row || !row.pr || !st || st.error || st.pr !== row.pr || !st.brief || st.brief === row.brief) continue;
    out.push(`${name}'s row carries ${row.pr} on ${row.brief}, but ${name}'s report says ${row.pr} is ${st.brief}'s: run .agents/skills/agent-desk/scripts/desk.mjs set ${name} ${row.state} --brief ${row.brief} --pr <the right number>, or leave --pr out`);
  }
  return out;
}

// A pull request, however it was given (12, #12, or its GitHub address), as the board writes it: #12.
export function prNumber(v) {
  const m = /(\d+)\s*$/.exec(String(v ?? "").trim());
  return m ? `#${m[1]}` : "";
}

// One agent's row moved to a state (rows: { name: { state, brief, branch, pr, notes } }), as the
// leader's `desk.mjs set` does: the brief is the one given or the row's own, the branch follows
// from the brief, the notes are the ones given or kept, and idle clears the row. The pull request
// is the one given, else the row's own while the brief is the same; a new brief starts with none
// (1.11.1: `set done` then `set ready --brief <next>` once carried the old brief's number onto the
// new row, and an awake agent reads its row's pull request as its brief's).
// The caller checks the result with boardProblems before writing it.
export function updateRow(rows, cfg, name, patch = {}) {
  const prev = rows[name] || { state: "idle", brief: "", branch: "", pr: "", notes: "" };
  const state = patch.state ?? prev.state;
  if (state === "idle") return { ...rows, [name]: { state, brief: "", branch: "", pr: "", notes: patch.notes ?? "" } };
  const brief = patch.brief ?? prev.brief;
  return {
    ...rows,
    [name]: {
      state,
      brief,
      branch: brief ? `desk/${cfg.project}/${name}/${brief}` : "",
      pr: patch.pr !== undefined ? prNumber(patch.pr) : brief === prev.brief ? prev.pr : "",
      notes: patch.notes ?? prev.notes,
    },
  };
}

const cell = (v) => String(v ?? "").replace(/\|/g, "/").replace(/\n/g, " ").trim();

// The board drawn from the settings: a row for each agent, in desk.json's order, keeping the rows
// it already has (rows: { name: { state, brief, branch, pr, notes } }); a new agent starts idle.
export function renderBoard(cfg, rows = {}) {
  const lines = (cfg.agents || []).map((a) => {
    const r = rows[a.name] || { state: "idle", brief: "", branch: "", pr: "", notes: "" };
    const branch = r.branch ? `\`${cell(r.branch)}\`` : "";
    return `| ${a.name} | ${cell(r.state)} | ${cell(r.brief)} | ${branch} | ${cell(r.pr)} | ${cell(r.notes)} |`;
  });
  return [
    `# Desk board: ${cfg.project}`,
    "",
    ...(cfg.title ? [cfg.title, ""] : []),
    `The leader (${cfg.leader?.name}) keeps this board. Agents read it and never edit it. Its rows follow agents/desk/${cfg.project}/desk.json: \`node .agents/skills/agent-desk/scripts/desk.mjs sync-board\` redraws them.`,
    "",
    `Project: \`${cfg.project}\``,
    "",
    `Work branch: \`${cfg.work_branch}\``,
    "",
    "| Agent | State | Brief | Branch | PR | Notes |",
    "|---|---|---|---|---|---|",
    ...lines,
    "",
    "## States",
    "",
    "| State | Meaning |",
    "|---|---|",
    ...STATES.map((s) => `| ${s} | ${MEANING[s]} |`),
    "",
  ].join("\n");
}
