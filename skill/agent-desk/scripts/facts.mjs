// What a branch's code does, read from its diff, never from the agent's words. A report
// can name tables, helpers and an id's type that aren't in the code; preflight writes these facts into
// the report, and the reviewer checks the prose against them.
// Pure: the caller hands in `git diff` text.
const uniq = (xs) => [...new Set(xs)].sort();

export function codeFacts(diff) {
  const added = [], removed = [], tables = [], routes = [], newFiles = [];
  let file = "", isNew = false;
  for (const line of String(diff || "").split("\n")) {
    if (line.startsWith("diff --git ")) { file = (/ b\/(.+)$/.exec(line) || [])[1] || ""; isNew = false; continue; }
    if (line.startsWith("new file mode")) { isNew = true; continue; }
    if (line.startsWith("+++ ")) { if (isNew && file) newFiles.push(file); continue; }
    if (line.startsWith("--- ") || line.startsWith("@@")) continue;
    const sign = line[0];
    if (sign !== "+" && sign !== "-") continue;
    const body = line.slice(1);
    const ex = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/.exec(body);
    if (ex) (sign === "+" ? added : removed).push(ex[1]);
    if (sign !== "+") continue;
    for (const m of body.matchAll(/\b(?:CREATE TABLE(?: IF NOT EXISTS)?|INSERT(?: OR \w+)? INTO|UPDATE|FROM|JOIN)\s+([A-Za-z_][\w]*)/gi)) if (!/^(SELECT|json_each|WHERE)$/i.test(m[1])) tables.push(m[1]);
    for (const m of body.matchAll(/["'`](\/api\/[^"'`\s]*)["'`]/g)) routes.push(m[1]);
  }
  // A name both added and removed was moved or reworded in place: it is neither.
  const a = uniq(added), r = uniq(removed);
  return { exports: { added: a.filter((x) => !r.includes(x)), removed: r.filter((x) => !a.includes(x)) }, tables: uniq(tables), routes: uniq(routes), newFiles: uniq(newFiles) };
}

// The facts as report lines.
export function factsLines(f) {
  if (!f) return [];
  const list = (xs) => xs.length ? xs.map((x) => `\`${x}\``).join(", ") : "none";
  return [
    "**Code facts (from the diff):**",
    `- exported, added: ${list(f.exports.added)}`,
    `- exported, removed: ${list(f.exports.removed)}`,
    `- tables named: ${list(f.tables)}`,
    `- routes named: ${list(f.routes)}`,
    `- new files: ${list(f.newFiles)}`,
  ];
}
