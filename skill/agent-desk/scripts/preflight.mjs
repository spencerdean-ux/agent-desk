// An agent's report, written from what it ran (desk.mjs preflight): desk-check's verdict and last
// lines, the diff against the work branch, the brief's Done means with the check's lines ticked, and
// the agent's signature, in the shape take.md step 6 asks for. Pure: the caller runs desk-check and
// git and hands the results in; preflight never invents evidence the agent didn't give.
import { TOOL_WORDS } from "./config.mjs";
import { factsLines } from "./facts.mjs";

const EVIDENCE = "<evidence: a test name, a command and its last lines>";

// The Steps line that names a changed file, for its What changed line.
function reasonFor(path, steps = "") {
  const base = path.split("/").pop();
  const line = String(steps || "").split("\n").map((l) => l.trim()).find((l) => l.includes(path) || (base && l.includes(base)));
  return line ? line.replace(/^\d+\.\s*|^[-*]\s*/, "") : "—";
}

export function preflightBody({ cfg, brief, sections = {}, files = [], stat = "", commits = [], check = { passed: false, tail: "" }, name, tool, dirty = 0, facts = null }) {
  const toolWords = TOOL_WORDS[tool] || tool || "its tool";
  const verdict = check.passed ? "desk-check passed" : "desk-check FAILED";
  const lines = [];
  if (!check.passed) lines.push("**desk-check FAILED** — not for pushing yet; see below.", "");
  if (dirty) lines.push(`_${dirty} uncommitted change${dirty === 1 ? " isn't" : "s aren't"} in this report: commit first._`, "");
  lines.push("**What changed:**");
  if (files.length) for (const f of files) lines.push(`- \`${f.path}\` (${f.status}${Number.isFinite(f.added) && Number.isFinite(f.removed) ? `, +${f.added} −${f.removed}` : ""}): ${reasonFor(f.path, sections.Steps)}`);
  else lines.push("- nothing yet against the work branch");
  if (commits.length) lines.push(`- commits: ${commits.join("; ")}`);
  if (stat) lines.push(`- ${stat.trim().split("\n").pop().trim()}`);
  // What the code does, from the diff : the report's words name only what is here.
  if (facts) lines.push("", ...factsLines(facts));
  lines.push("", "**Done means:**");
  const done = String(sections["Done means"] || "").split("\n").map((l) => l.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
  if (!done.length) lines.push(`- [ ] (the brief lists none) — ${EVIDENCE}`);
  for (const d of done) lines.push(/check\.mjs|desk-check|frozen/i.test(d) ? `- [${check.passed ? "x" : " "}] ${d} — ${verdict}` : `- [ ] ${d} — ${EVIDENCE}`);
  lines.push("", `**desk-check:** ${check.passed ? "passed" : "FAILED"}`, "```", String(check.tail || "").trim(), "```", "", "**Assumptions:** None", "", "**Questions / blocked:** None", "", `— ${name} (${toolWords}) on ${cfg.project}, for ${cfg.leader?.name || "the leader"} to decide`);
  return lines.join("\n") + "\n";
}

// The pull request's title once the report is in: the in-progress mark gone.
export const prTitle = (cfg, name, brief) => `[${cfg.project}/${name}] ${brief.id}: ${brief.title}`;
