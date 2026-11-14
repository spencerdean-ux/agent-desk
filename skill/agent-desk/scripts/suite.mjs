// The repository's whole test command, run as its parts (desk.json's suite). Where the
// command is `<unit tests> && <end-to-end tests>`, an open brief's red frozen test stops at the &&, so a
// merge can break the second part unseen. desk.mjs suite runs every
// part on its own and says each; these are its pure readings of node --test's words.

// node --test's closing counts: { tests, pass, fail }, or null when the output has none.
export function nodeCounts(out) {
  const n = (k) => { const m = new RegExp(`^# ${k} (\\d+)$`, "m").exec(String(out || "")); return m ? Number(m[1]) : null; };
  const tests = n("tests"), pass = n("pass"), fail = n("fail");
  return tests === null || pass === null || fail === null ? null : { tests, pass, fail };
}

// The test files that failed, from node --test's top-level lines, relative to the repository's root.
// Node 22 names a failing test and gives its file in the block's own `location:` line; a file that
// failed outside any test is named itself. A subtest's lines are indented further and aren't read.
export function failingFiles(out, root = "") {
  const prefix = root ? root.replace(/\/+$/, "") + "/" : "";
  const rel = (f) => f.startsWith(prefix) ? f.slice(prefix.length) : f;
  const files = [];
  const add = (f) => { if (f && !files.includes(f)) files.push(f); };
  const lines = String(out || "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^not ok \d+ - (.+?)\s*(#.*)?$/.exec(lines[i]);
    if (!m) continue;
    let where = "";
    for (let j = i + 1; j < lines.length && !/^(not )?ok \d+ /.test(lines[j]) && !/^# /.test(lines[j]); j++) {
      const loc = /^ {2}location: '(.+?):\d+:\d+'/.exec(lines[j]);
      if (loc) { where = loc[1]; break; }
    }
    add(where ? rel(where) : /[\\/]|\.m?[jt]s$/.test(m[1]) ? rel(m[1]) : "");
  }
  return files;
}

// A part in words: its command, then its count or its exit.
export function partWords(p) {
  const what = p.counts ? `${p.counts.pass} of ${p.counts.tests} passed${p.counts.fail ? `, ${p.counts.fail} failed` : ""}` : p.status === 0 ? "passed" : `exited ${p.status}`;
  const why = p.expected ? `; expected: ${p.expected}` : "";
  return `${p.status === 0 ? "ok" : p.expected ? "expected" : "FAILED"}  ${p.cmd}  (${what}${why})`;
}
