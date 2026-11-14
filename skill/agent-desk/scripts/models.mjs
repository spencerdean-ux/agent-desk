// The four models each tool offers, and which one does what on the desk: guidance for which
// model an agent or its subagents run on, by the tool they work in. These are the models each tool
// offered when this version was released, a starting point: a desk changes its own with desk.mjs
// subagents <agent> on --review-model <id>, and this table is updated when a tool retires one. Pure: it imports nothing and reads nothing.
//
// The ids are the desk's own short names, the same in every tool's desk.json, so an agent moved from
// one tool to another keeps a readable entry; `set` is the value the tool's own subagent field takes
// (Claude Code's `model:` alias, Codex's model id, Antigravity's tier). The roles: plan is the leader's
// work and a brief's design; code is writing a brief; review is adversarial review of a diff; checks
// is running tests and classifying what failed; other is anything that isn't code. A row with
// `subagent: false` is a model the tool's main agent may run but its subagents can't (Antigravity's
// subagents run on Gemini tiers only). Read from each tool's own documentation when this version was released.
export const ROLES = ["plan", "code", "review", "checks", "other"];

export const MODELS = {
  "claude-code": [
    { id: "opus-5.5", name: "Claude Opus 5.5", set: "opus", roles: ["plan", "review"] },
    { id: "sonnet-5.5", name: "Claude Sonnet 5.5", set: "sonnet", roles: ["code"] },
    { id: "haiku-5.5", name: "Claude Haiku 5.5", set: "haiku", roles: ["checks", "other"] },
    { id: "fable-5.1", name: "Claude Fable 5.1 (where the account has it)", set: "fable", roles: ["plan", "review"] },
  ],
  codex: [
    { id: "gpt-6-astra", name: "GPT-6 Astra", set: "gpt-6-astra", roles: ["plan"] },
    { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", set: "gpt-6.1-sol", roles: ["code", "review"] },
    { id: "gpt-6.1-terra", name: "GPT-6.1 Terra (screens and visual checks)", set: "gpt-6.1-terra", roles: ["checks", "other"] },
    { id: "gpt-6-luna", name: "GPT-6 Luna", set: "gpt-6-luna", roles: ["checks", "other"] },
  ],
  antigravity: [
    { id: "gemini-4-argon", name: "Gemini 4 Argon (paid Pro, Ultra and Enterprise)", set: "pro", roles: ["plan", "code", "review"] },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (every tier)", set: "flash", roles: ["checks", "other"] },
    { id: "claude-opus-5.5", name: "Claude Opus 5.5 (paid Pro and up; the main agent only)", set: "claude-opus-5.5", roles: ["plan"], subagent: false },
    { id: "claude-sonnet-5.5", name: "Claude Sonnet 5.5 (paid Pro and up; the main agent only)", set: "claude-sonnet-5.5", roles: ["code"], subagent: false },
  ],
  other: [],
};

// What a subagent runs unless desk.json's subagents.models says otherwise: the tool's review model
// and its checks model. Where a tool offers two families, its reviewer is the other family's (Google's
// own pattern: one model's code judged by another); Claude Code's is Opus, the owner's example.
export const DEFAULT_SUBAGENT_MODELS = {
  "claude-code": { review: "opus-5.5", checks: "haiku-5.5" },
  codex: { review: "gpt-6.1-sol", checks: "gpt-6-luna" },
  antigravity: { review: "gemini-4-argon", checks: "gemini-3.8-flash" },
};

export const modelRow = (tool, id) => (MODELS[tool] || []).find((m) => m.id === id) || null;
// The ids a subagent in this tool may run.
export const subagentModelIds = (tool) => (MODELS[tool] || []).filter((m) => m.subagent !== false).map((m) => m.id);

const TOOL_NAMES = { "claude-code": "Claude Code", codex: "Codex", antigravity: "Antigravity", other: "another tool" };

// The table in words, one line a model, for `desk.mjs models` and validate's refusal.
export function modelWords(tool) {
  const rows = MODELS[tool] || [];
  if (!rows.length) return `${TOOL_NAMES[tool] || tool}: any short model name; the desk records it and the owner sets it in the tool.`;
  const d = DEFAULT_SUBAGENT_MODELS[tool] || {};
  const lines = [`${TOOL_NAMES[tool] || tool} (desk.json id · the tool's own value · for):`];
  for (const m of rows) {
    const marks = [m.id === d.review ? "subagents' review by default" : "", m.id === d.checks ? "subagents' checks by default" : "", m.subagent === false ? "not for subagents" : ""].filter(Boolean);
    lines.push(`  ${m.id} · ${m.set} · ${m.roles.join(", ")} · ${m.name}${marks.length ? ` (${marks.join("; ")})` : ""}`);
  }
  return lines.join("\n");
}
