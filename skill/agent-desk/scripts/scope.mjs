// Which changed files a desk branch may not have changed, and why. Pure: the caller hands in the
// changed files (from git) and a way to ask whether a file is on the base.

// Never an agent's to change, whatever a brief says: the desk itself, the rules every tool loads,
// the skills, the hooks and the workflows that guard pushes. desk.json's `protected` adds the
// repository's own (its build and deploy files, the desk's tests).
export const CORE_PROTECTED = [
  "AGENTS.md", "CLAUDE.md", "GEMINI.md", "agents/desk/", ".agents/", ".claude/", ".codex/", ".gemini/", ".githooks/", ".github/",
];

const under = (path, entry) => entry.endsWith("/") ? path.startsWith(entry) : path === entry;
export const isProtected = (path, list = CORE_PROTECTED) => list.some((e) => under(path, e));

// changed: [{ status, path, from? }] (git's name-status letters; a rename carries `from`).
// Answers [{ path, reason }], reason one of protected, frozen, applied_migration, outside_brief.
export function scopeViolations({ brief, changed, baseHas, protectedPaths = CORE_PROTECTED }) {
  const out = [];
  const seen = new Set();
  const judge = (path, status) => {
    if (seen.has(path)) return;
    seen.add(path);
    let reason = null;
    if (isProtected(path, protectedPaths)) reason = "protected";
    else if (brief.frozen.includes(path)) reason = "frozen";
    // A migration the base already has may have run on a database: it is never edited, only followed.
    else if (path.startsWith("migrations/") && status !== "A" && baseHas(path)) reason = "applied_migration";
    else if (!brief.may_change.some((e) => under(path, e))) reason = "outside_brief";
    if (reason) out.push({ path, reason });
  };
  for (const c of changed) {
    judge(c.path, c.status);
    if (c.from) judge(c.from, "D");
  }
  return out;
}
