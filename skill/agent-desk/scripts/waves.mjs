// Waves (desk.mjs waves): the queue's briefs laid out round by round, where a wave is the briefs the
// agents work on side by side (a brief's front matter says `wave: <n>`), and the review after each
// wave, held to ten minutes so that adjusting the plan never becomes the work. Pure.
export const WAVE_REVIEW_MINUTES = 10;
const num = (b) => /^\d+$/.test(String(b.wave ?? "")) ? Number(b.wave) : null;
export const waveOf = num;

// { waves: { n: [brief] }, spare: [brief], loose: [brief] } from the queue's briefs.
export function wavePlan(queue = []) {
  const waves = {}, spare = [], loose = [];
  for (const b of queue) {
    if (b.slot === "any") spare.push(b);
    else if (num(b) === null) loose.push(b);
    else (waves[num(b)] ||= []).push(b);
  }
  return { waves, spare, loose };
}

const row = (b) => `- ${b.slot === "any" ? "" : `${b.slot}: `}${b.id}${(b.waits_on || []).length ? ` (waits on ${b.waits_on.join(", ")})` : ""}${b.title ? `: ${b.title}` : ""}`;

export function waveWords(cfg, queue, cmd) {
  const { waves, spare, loose } = wavePlan(queue);
  const ns = Object.keys(waves).map(Number).sort((a, b) => a - b);
  const out = [`The waves on ${cfg.project} (${queue.length} brief${queue.length === 1 ? "" : "s"} queued; nothing is changed):`];
  if (!ns.length) out.push("No queued brief names a wave (a brief's front matter says `wave: <n>`).");
  for (const n of ns) out.push("", `Wave ${n}`, ...waves[n].sort((a, b) => String(a.slot).localeCompare(String(b.slot))).map(row));
  if (spare.length) out.push("", "Spare (for whichever agent runs out first)", ...spare.map(row));
  if (loose.length) out.push("", "In no wave", ...loose.map(row));
  if (ns.length) out.push("", `Put a wave up, once the owner has said yes to the plan: ${cmd} up --wave ${ns[0]}. After a wave has merged: ${cmd} waves --review <n>.`);
  return out.join("\n");
}

// The review after wave n, in words: what is left to check, and how long is left to check it.
export function reviewWords(cfg, queue, n, started, now, cmd) {
  const mins = Math.max(0, Math.floor((now - Date.parse(started)) / 60000));
  const left = queue.filter((b) => b.slot === "any" || num(b) === null || num(b) > n);
  const over = mins > WAVE_REVIEW_MINUTES;
  return [
    `Wave ${n}'s review on ${cfg.project}: ${WAVE_REVIEW_MINUTES} minutes at most (started ${String(started).slice(11, 16)} UTC, ${mins} minute${mins === 1 ? "" : "s"} in${over ? `, over its ${WAVE_REVIEW_MINUTES}` : ""}).`,
    over ? `It has run over: stop here, put the next wave up as it stands, and tell the owner in one line what wasn't checked.` : "",
    "1. Read what the wave built: the merged pull requests' file lists and names (the desk's log since the wave began).",
    "2. For each brief still queued, look only for a major mismatch: a file or a name it relies on that no longer exists or changed shape, or a step the wave made unnecessary.",
    "3. Rewrite only those briefs (their lists, their steps, their frozen tests), and note each change in the project's progress.json.",
    `Still queued: ${left.length ? left.map((b) => b.id).join(", ") : "nothing"}.`,
    `Close it with: ${cmd} waves --reviewed ${n}`,
  ].filter(Boolean).join("\n");
}
