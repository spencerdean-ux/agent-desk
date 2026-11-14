// Which test files read what a branch changed, so desk-check runs those (and the desk's
// always-run checks) instead of the whole suite at every push.
//
// A test reads a file when the file is in its closure: what it imports (static or dynamic, a
// require, a new URL(…, import.meta.url), a page's src or href), what those import in turn, and,
// in the test files and their helpers only, every path their code names in a string. A string
// names a path when it resolves, from the file's own folder or from the repository's root (and,
// for one starting "/", under public/, where a site serves its pages from), to a file, or to a
// folder (only a string with a "/" in it), which then stands for everything in it. A template
// literal names the folder its fixed start ends in. Outside the tests a string is a value, not a
// path ("ai", ".."), so only imports are followed there. It reads code, it doesn't run it, so a
// path built at run time is missed: a changed code file that no test reads therefore runs the
// whole suite rather than nothing.
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, normalize, extname } from "node:path";

const CODE = new Set([".js", ".mjs", ".cjs", ".ts", ".html", ".htm"]);
// What a person reads, not code: these alone run only the always-run checks.
const WORDS = new Set([".md", ".txt"]);
const QUOTED = /(["'])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const TEMPLATE = /`([^`$\\]*)\$\{/g;
const IMPORTS = [
  /\b(?:import|export)\s[^;'"`]*?\bfrom\s*(["'])([^"'\n]+)\1/g,
  /\bimport\s*\(\s*(["'])([^"'\n]+)\1/g,
  /\bimport\s*(["'])([^"'\n]+)\1/g,
  /\brequire\s*\(\s*(["'])([^"'\n]+)\1/g,
  /\bnew URL\s*\(\s*(["'])([^"'\n]+)\1\s*,\s*import\.meta\.url/g,
  /\b(?:src|href)\s*=\s*(["'])([^"'\n]+)\1/g,
];
const SKIP = /^(node_modules|vendor)\/|\/vendor\//;

export function affectedTests({ root, list, changed, tests }) {
  const files = new Set(list);
  const dirs = new Map(); // a folder -> every listed file under it
  for (const f of files) {
    let d = dirname(f);
    while (d && d !== ".") { if (!dirs.has(d)) dirs.set(d, []); dirs.get(d).push(f); d = dirname(d); }
  }
  const prefix = tests.dir.replace(/\/$/, "") + "/";
  const all = [...files].filter((f) => f.startsWith(prefix) && f.endsWith(tests.suffix) && !f.slice(prefix.length).includes("/")).sort();
  const always = (tests.always || []).filter((f) => files.has(f));
  const candidates = all.filter((f) => !always.includes(f));

  // Each file's edges: the files it names, and the folders it names (which stand for all in them).
  const edgesOf = new Map();
  const asPath = (from, s) => {
    if (!s || s.length > 300 || /^[a-z]+:/i.test(s) || s.includes("*")) return null;
    const clean = s.replace(/[?#].*$/, "").replace(/\/+$/, "");
    if (!clean) return null;
    const tries = clean.startsWith("/") ? [clean.slice(1), "public" + clean] : [join(dirname(from), clean), clean];
    for (const t of tries) {
      const p = normalize(t).replace(/\\/g, "/");
      if (p.startsWith("..") || p === ".") continue;
      if (files.has(p)) return { file: p };
      if (dirs.has(p)) return clean.includes("/") || s.endsWith("/") ? { dir: p } : null;
      for (const ext of [".js", ".mjs"]) if (files.has(p + ext)) return { file: p + ext };
    }
    return null;
  };
  const edges = (f) => {
    if (edgesOf.has(f)) return edgesOf.get(f);
    const out = { files: new Set(), dirs: new Set() };
    edgesOf.set(f, out);
    if (!CODE.has(extname(f)) || SKIP.test(f)) return out;
    let text = "";
    try { text = readFileSync(join(root, f), "utf8"); } catch { return out; }
    if (text.length > 2_000_000) return out;
    const add = (r) => {
      if (!r) return;
      if (r.file && r.file !== f) out.files.add(r.file);
      if (r.dir) { out.dirs.add(r.dir); for (const x of dirs.get(r.dir)) if (x !== f) out.files.add(x); }
    };
    for (const re of IMPORTS) for (const m of text.matchAll(re)) add(asPath(f, m[2]));
    if (!f.startsWith(prefix)) return out;
    for (const m of text.matchAll(QUOTED)) add(asPath(f, m[2]));
    for (const m of text.matchAll(TEMPLATE)) {
      const start = m[1].includes("/") ? m[1].slice(0, m[1].lastIndexOf("/") + 1) : "";
      if (start) add(asPath(f, start));
    }
    return out;
  };
  const closure = (t) => {
    const seen = new Set([t]), named = new Set();
    const queue = [t];
    while (queue.length) {
      const e = edges(queue.pop());
      for (const d of e.dirs) named.add(d);
      for (const n of e.files) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
    return { files: seen, dirs: named };
  };

  const full = (why) => ({ full: true, why, files: candidates, always, total: all.length });
  const hit = (tests.full_when || []).find((p) => changed.includes(p));
  if (hit) return full(`${hit} changed, which every test depends on`);

  // A folder a test names takes a file new to it, so a changed path counts as read when any
  // folder it sits in is one the closure names.
  const folders = (p) => { const out = []; let d = dirname(p); while (d && d !== ".") { out.push(d); d = dirname(d); } return out; };
  const closures = new Map(candidates.map((t) => [t, closure(t)]));
  const reads = (c, p) => c.files.has(p) || folders(p).some((d) => c.dirs.has(d));

  const picked = new Set();
  const unread = [];
  for (const p of changed) {
    if (always.includes(p)) continue;
    let any = false;
    for (const [t, c] of closures) if (t === p || reads(c, p)) { picked.add(t); any = true; }
    const gone = !existsSync(join(root, p));
    const code = !gone && !WORDS.has(extname(p)) && !p.startsWith(prefix);
    if (!any && code && !(statSync(join(root, p)).isDirectory())) unread.push(p);
  }
  if (unread.length) return full(`no test reads ${unread.join(", ")}, so the whole suite runs`);
  return { full: false, why: "", files: candidates.filter((t) => picked.has(t)), always, total: all.length };
}
