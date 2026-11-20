// The desk's next few briefs for each agent (desk.mjs plan), from the board, the open briefs
// and the queue (agents/desk/queue/). A queued brief goes up once every brief it waits on has merged and no
// open brief of another agent holds a file in its may_change; a shared list holds nobody. On one desk
// the leader worked this out by hand to answer the owner. Pure: nothing is changed.
const OPEN = new Set(["ready", "in-progress", "review", "changes"]);

export function planDesk({ cfg, rows = {}, open = {}, queue = [], shared = [], depth = 3 }) {
  const sharedSet = new Set(shared);
  const queued = new Set(queue.map((q) => q.id));
  const openIds = new Set(Object.values(rows).filter((r) => r && OPEN.has(r.state) && r.brief).map((r) => r.brief));
  const merged = (id) => !openIds.has(id) && !queued.has(id);
  const holder = (brief, file) => {
    for (const [name, r] of Object.entries(rows)) {
      if (!r || !OPEN.has(r.state) || name === brief.slot) continue;
      const o = open[r.brief];
      if (o && (o.may_change || []).some((p) => p === file || (p.endsWith("/") && file.startsWith(p)) || (file.endsWith("/") && p.startsWith(file)))) return r.brief;
    }
    return null;
  };
  const lines = [];
  for (const a of cfg.agents || []) {
    const parts = [];
    const r = rows[a.name];
    if (r && OPEN.has(r.state) && r.brief) parts.push(`${r.brief} (${r.state})`);
    for (const q of queue.filter((x) => x.slot === a.name)) {
      if (parts.length >= depth) break;
      const waits = (q.waits_on || []).filter((w) => !merged(w));
      const held = (q.may_change || []).filter((f) => !sharedSet.has(f)).map((f) => [f, holder(q, f)]).filter(([, h]) => h);
      const blockers = [...new Set([...waits, ...held.map(([, h]) => h)])];
      const why = [...waits.map((w) => `waits on ${w}`), ...held.map(([f, h]) => `${h} holds ${f}`)];
      if (!parts.length && blockers.length) parts.push(`idle until ${blockers.join(" and ")} merge${blockers.length === 1 ? "s" : ""} (${q.id}: ${why.join("; ")})`);
      parts.push(blockers.length ? `${q.id} (once ${blockers.join(" and ")} merge${blockers.length === 1 ? "s" : ""})` : q.id);
    }
    lines.push(`${a.name}: ${parts.length ? parts.join(", then ") : "nothing queued"}`);
  }
  // Briefs kept ready behind each agent's current one, and the spare pool (desk.json's ready and spare).
  if (Number.isInteger(cfg.ready)) for (const a of cfg.agents || []) {
    const have = queue.filter((x) => x.slot === a.name).length;
    if (have < cfg.ready) lines.push(`${a.name} has ${have} of ${cfg.ready} brief${cfg.ready === 1 ? "" : "s"} ready: write ${cfg.ready - have} more (desk.mjs next ${a.name} names the spec step; brief <id> --for ${a.name} --queue writes it)`);
  }
  const spares = queue.filter((x) => x.slot === "any").map((x) => x.id);
  const want = Number.isInteger(cfg.spare) ? cfg.spare : 0;
  if (spares.length || want) lines.push(`spare: ${spares.length ? spares.join(", ") : "none"}${spares.length < want ? ` (${spares.length} of ${want}: write ${want - spares.length} more)` : ""}`);
  return lines;
}
