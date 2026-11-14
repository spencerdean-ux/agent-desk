// A shared list (desk.json's shared_lists): a file every brief adds a line to and nobody holds,
// such as an offline file list. On one desk it conflicted on most page merges, always settled by
// keeping both sides. A JSON list is merged here; a generated one is rebuilt by its
// own command. Pure: the caller hands in the three sides' text.
const asList = (text, side) => {
  let v;
  try { v = JSON.parse(text); } catch (err) { throw new Error(`the ${side} side isn't JSON (${err.message})`); }
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error(`the ${side} side isn't a JSON list of strings`);
  return v;
};

// Both sides' entries, less any either side removed from the base, once each and sorted.
export function mergeJsonList(base, ours, theirs) {
  const o = asList(ours, "ours"), t = asList(theirs, "theirs");
  const b = base == null ? [] : asList(base, "base");
  const gone = new Set(b.filter((x) => !o.includes(x) || !t.includes(x)));
  const all = [...new Set([...o, ...t])].filter((x) => !gone.has(x)).sort();
  return JSON.stringify(all, null, 2) + "\n";
}

// What is wrong with a shared JSON list: [] when it is valid, a list of strings and sorted.
export function listProblems(text) {
  let v;
  try { v = JSON.parse(text); } catch (err) { return [`isn't JSON (${err.message})`]; }
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return ["isn't a JSON list of strings"];
  for (let i = 1; i < v.length; i++) if (v[i - 1] > v[i]) return [`isn't sorted: “${v[i - 1]}” comes before “${v[i]}”`];
  return [];
}
