// The files a desk keeps in a repository outside any project's folder: the desk's block in the rules
// files each tool reads (AGENTS.md for Codex and Antigravity, CLAUDE.md for Claude Code), each tool's
// compaction setting, and the subagents' definitions. Setup writes them; they are the repository's, so
// two projects in one repository share them and the last one set wins.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { autocompactOf, compactionFiles, subagentFiles } from "./config.mjs";

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const skillFile = (p) => readFileSync(join(SKILL_DIR, p), "utf8");
export const skillVersion = () => skillFile("VERSION").trim();

const START = "<!-- agent-desk:start -->";
const END = "<!-- agent-desk:end -->";
export const RULES = [
  { file: "AGENTS.md", template: "templates/AGENTS-desk.md", heading: "# Rules for agents in this repository" },
  { file: "CLAUDE.md", template: "templates/CLAUDE-desk.md", heading: "# Notes for Claude in this repository" },
];
export const rulesBlock = (rule) => `${START}\n${skillFile(rule.template).trimEnd()}\n${END}\n`;

// The file with the desk's block in place: replaced where it is, else added after the file's own words.
export function withBlock(text, rule) {
  if (text === null) return `${rule.heading}\n\n${rulesBlock(rule)}`;
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a >= 0 && b > a) return text.slice(0, a) + rulesBlock(rule) + text.slice(b + END.length).replace(/^\n/, "");
  return text.replace(/\n*$/, "\n\n") + rulesBlock(rule);
}

const readAt = (dir, p) => existsSync(join(dir, p)) ? readFileSync(join(dir, p), "utf8") : null;
const put = (dir, p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };

// Writes them all for this desk, and answers the paths written.
export function writeRepoFiles(dir, cfg) {
  const written = [];
  for (const rule of RULES) { put(dir, rule.file, withBlock(readAt(dir, rule.file), rule)); written.push(rule.file); }
  for (const t of compactionFiles(autocompactOf(cfg))) { put(dir, t.file, t.apply(readAt(dir, t.file))); written.push(t.file); }
  for (const f of subagentFiles(cfg)) { put(dir, f.file, f.text); written.push(f.file); }
  return written;
}
