#!/usr/bin/env node
// Ending a project (desk.mjs end), and clearing a copy once it has ended (cleanup.mjs --local).
//
//   node .agents/skills/agent-desk/scripts/desk.mjs end [--project <name>]            lists what would go; changes nothing
//   node .agents/skills/agent-desk/scripts/desk.mjs end --yes [--force]                does it, from the leader's checkout of the work branch
//   node .agents/skills/agent-desk/scripts/cleanup.mjs --local [--project <name>] [--force]   in an agent's own copy, afterwards
//
// end --yes, in this order, so that a refusal part-way leaves nothing half done that matters:
//   1. moves agents/desk/<project>/ to agents/desk/archive/<project>/, commits and pushes (a push
//      that is refused is taken back, and nothing else happens);
//   2. closes each open pull request from the project's branches, with a line saying why;
//   3. deletes every desk/<project>/* branch on origin, and this checkout's own copies of them;
//   4. says so on the notifications issue and closes it.
// It never touches the work branch, another project's branches, or anything that isn't under
// desk/<project>/. A branch with commits the work branch doesn't hold, or an open pull request,
// stops it unless --force is given: that work is deleted for good.
// The leader can't reach the agents' own copies, so each agent runs --local there: it removes the
// copy's desk/<project>/* branches and its desk.* settings (its name, project, base, tool and marks).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DESK_ROOT, SKILL_HOME, projectDir } from "./paths.mjs";

const LOCAL = `node ${SKILL_HOME}/scripts/cleanup.mjs --local`;
const run = (cwd, cmd, a, input) => spawnSync(cmd, a, { cwd, encoding: "utf8", input, maxBuffer: 16 * 1024 * 1024 });
const git = (cwd, ...a) => { const r = run(cwd, "git", a); return r.status === 0 ? r.stdout.trim() : null; };
const firstLine = (s) => String(s || "").trim().split("\n")[0] || "";

// Where the finished desk is kept.
export const archiveDir = (project) => `${DESK_ROOT}/archive/${project}`;

// One row per branch of the project on origin: { branch, sha, merged, ahead, pr }. Pure.
export function branchPlan({ heads = {}, isMerged = () => false, ahead = () => 0, prs = null }) {
  return Object.keys(heads).sort().map((branch) => {
    const merged = isMerged(heads[branch]);
    const pr = Array.isArray(prs) ? (prs.find((p) => p.head === branch) || null) : null;
    return { branch, sha: heads[branch], merged, ahead: merged ? 0 : ahead(heads[branch]), pr: pr ? pr.number : null };
  });
}

// The list, in words, one line a branch.
export function planWords(cfg, rows, notes = []) {
  const out = [`Ending ${cfg.project}${cfg.title ? ` (${cfg.title})` : ""}: its branches on origin, against ${cfg.work_branch}.`, ""];
  if (!rows.length) out.push(`- no desk/${cfg.project}/* branch is on origin`);
  for (const r of rows) out.push(`- ${r.branch}  ${r.merged ? "merged" : `not merged (${r.ahead || "some"} commit${r.ahead === 1 ? "" : "s"} the work branch doesn't hold)`}${r.pr ? `, open pull request #${r.pr}` : ""}`);
  if (notes.length) out.push("", ...notes.map((n) => `(${n})`));
  return out.join("\n");
}

// What stops an end that isn't forced: work that would be lost.
export const blockers = (rows) => rows.filter((r) => !r.merged || r.pr);

// desk.mjs end. gh is the caller's gh(cwd, args, input): its answer, or { missing: true }.
export function endProject({ top, cfg, yes = false, force = false, gh, log = console.log, err = console.error }) {
  const project = cfg.project, base = cfg.work_branch, repo = cfg.repository;
  const notes = [];
  const fetched = run(top, "git", ["fetch", "-q", "--prune", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`, `+refs/heads/desk/${project}/*:refs/remotes/origin/desk/${project}/*`]);
  if (fetched.status !== 0) { err(`Not ended: origin couldn't be read (${firstLine(fetched.stderr) || "git fetch failed"}).`); return 2; }
  const heads = {};
  for (const row of (git(top, "ls-remote", "origin", `refs/heads/desk/${project}/*`) || "").split("\n").filter(Boolean)) { const [sha, ref] = row.split("\t"); heads[ref.replace(/^refs\/heads\//, "")] = sha; }
  let prs = null;
  const g = gh(top, ["api", `repos/${repo}/pulls?state=open&per_page=100`]);
  if (g.missing) notes.push("pull requests not checked (no gh): deleting a branch closes its pull request on GitHub all the same");
  else if (g.status !== 0) notes.push(`pull requests not checked (gh: ${firstLine(g.stderr) || "refused"})`);
  else { try { prs = JSON.parse(g.stdout).map((p) => ({ number: p.number, head: p.head?.ref || "" })).filter((p) => p.head in heads); } catch { notes.push("pull requests not checked (gh answered something else)"); } }
  const rows = branchPlan({
    heads, prs,
    isMerged: (sha) => run(top, "git", ["merge-base", "--is-ancestor", sha, `origin/${base}`]).status === 0,
    ahead: (sha) => Number(git(top, "rev-list", "--count", `origin/${base}..${sha}`) || 0),
  });
  const agents = (cfg.agents || []).map((a) => a.name);
  if (!yes) {
    log(planWords(cfg, rows, notes));
    log(`\nNothing was changed. To end the project: node ${SKILL_HOME}/scripts/desk.mjs end --yes${blockers(rows).length ? " --force" : ""}${blockers(rows).length ? `\n--force is needed because ${blockers(rows).length === 1 ? "one branch holds" : `${blockers(rows).length} branches hold`} work that isn't in ${base} or has an open pull request: it would be deleted for good.` : ""}\nThat moves ${projectDir(project)}/ to ${archiveDir(project)}/, deletes the branches above${prs && prs.length ? ", closes their pull requests" : ""}${cfg.notify?.issue ? `, and closes issue #${cfg.notify.issue}` : ""}. ${base} itself is never touched.`);
    return 0;
  }
  const stop = blockers(rows);
  if (stop.length && !force) {
    err(`Not ended: this work isn't in ${base} and would be deleted for good:\n${stop.map((r) => `  ${r.branch}${r.merged ? "" : `: ${r.ahead || "some"} commit${r.ahead === 1 ? "" : "s"} not merged`}${r.pr ? `${r.merged ? ":" : ","} open pull request #${r.pr}` : ""}`).join("\n")}\nMerge or close it first, or say you mean it: node ${SKILL_HOME}/scripts/desk.mjs end --yes --force`);
    return 1;
  }
  const here = git(top, "rev-parse", "--abbrev-ref", "HEAD");
  if (here !== base) { err(`Not ended: this checkout is on ${here || "no branch"}, and the desk is archived on ${base}: check it out and run this again.`); return 1; }
  if ((git(top, "status", "--porcelain") || "") !== "") { err("Not ended: this checkout has uncommitted changes. Commit or put them away first, so the archive is one clean commit."); return 1; }
  // An agent's report lands on origin without passing through this checkout, so it is usually a few
  // commits behind: catch up first, so the archive holds the last reports and its push isn't refused.
  if (git(top, "rev-parse", "HEAD") !== git(top, "rev-parse", `origin/${base}`) && run(top, "git", ["merge", "-q", "--ff-only", `origin/${base}`]).status !== 0) {
    err(`Not ended: this checkout and origin/${base} have each moved (commits here that aren't pushed). Push them first (node ${SKILL_HOME}/scripts/desk.mjs push), then run this again. Nothing was changed.`);
    return 1;
  }
  const to = archiveDir(project);
  if (existsSync(join(top, to))) { err(`Not ended: ${to}/ is already there (an earlier project of this name). Move it aside first.`); return 1; }
  // 1. the archive, pushed before anything is deleted
  mkdirSync(join(top, DESK_ROOT, "archive"), { recursive: true });
  const moved = run(top, "git", ["mv", projectDir(project), to]);
  if (moved.status !== 0) { err(`Not ended: ${projectDir(project)}/ couldn't be moved (${firstLine(moved.stderr)}).`); return 1; }
  const message = [`desk(${project}): the project has ended, and its desk is archived`, "", `Its branches on origin are deleted: ${rows.length ? rows.map((r) => r.branch).join(", ") : "none"}.`, "", `Desk-Project: ${project}`].join("\n");
  const committed = run(top, "git", ["commit", "-q", "-m", message]);
  if (committed.status !== 0) { run(top, "git", ["reset", "-q", "--hard", "HEAD"]); err(`Not ended: the archive couldn't be committed (${firstLine(committed.stderr || committed.stdout)}). Nothing was deleted.`); return 1; }
  const pushed = run(top, "git", ["push", "-q", "origin", `HEAD:refs/heads/${base}`]);
  if (pushed.status !== 0) {
    run(top, "git", ["reset", "-q", "--hard", "HEAD~1"]);
    err(`Not ended: the push to ${base} was refused (${(pushed.stderr || "").trim().split("\n").find((l) => /rejected|error:|denied|hook/i.test(l)) || (pushed.stderr || "").trim().split("\n")[0] || "git push failed"}), so the archive commit was taken back and nothing was deleted. Bring this checkout up to origin (node ${SKILL_HOME}/scripts/desk.mjs push, or git pull --rebase) and run this again.`);
    return 1;
  }
  const done = [`${projectDir(project)}/ is now ${to}/ on ${base}.`];
  // 2. the pull requests
  for (const r of rows.filter((x) => x.pr)) {
    gh(top, ["api", `repos/${repo}/issues/${r.pr}/comments`, "-f", `body=Closed: the ${project} project has ended, and its desk branches are deleted.${r.merged ? "" : " This branch wasn't merged."}\n\n— the desk for ${project}`]);
    const c = gh(top, ["api", "-X", "PATCH", `repos/${repo}/pulls/${r.pr}`, "-f", "state=closed"]);
    done.push(c.status === 0 ? `Pull request #${r.pr} closed.` : `Pull request #${r.pr} couldn't be closed (${firstLine(c.stderr) || "refused"}): deleting its branch closes it.`);
  }
  // 3. the branches
  if (rows.length) {
    const del = run(top, "git", ["push", "-q", "origin", "--delete", ...rows.map((r) => r.branch)]);
    if (del.status !== 0) { done.push(`The branches couldn't all be deleted (${(del.stderr || "").trim().split("\n").pop()}): delete what is left with git push origin --delete <branch>.`); }
    else done.push(`${rows.length} branch${rows.length === 1 ? "" : "es"} deleted on origin: ${rows.map((r) => r.branch).join(", ")}.`);
  } else done.push("No branch to delete on origin.");
  clearLocalBranches(top, project, base, { force: true });
  run(top, "git", ["fetch", "-q", "--prune", "origin", `+refs/heads/desk/${project}/*:refs/remotes/origin/desk/${project}/*`]);
  // 4. the notifications issue
  if (Number.isInteger(cfg.notify?.issue)) {
    const n = cfg.notify.issue;
    const said = gh(top, ["api", `repos/${repo}/issues/${n}/comments`, "-f", `body=**${project} has ended.** Its desk is archived in \`${to}/\` on ${base}, and its ${rows.length} desk branch${rows.length === 1 ? "" : "es"} ${rows.length === 1 ? "is" : "are"} deleted. Nothing more is posted here.\n\n— the desk for ${project}`]);
    if (said.missing) done.push(`gh isn't here: say on issue #${n} that ${project} has ended, and close it, with your GitHub tool.`);
    else { const c = gh(top, ["api", "-X", "PATCH", `repos/${repo}/issues/${n}`, "-f", "state=closed"]); done.push(c.status === 0 ? `Issue #${n} told and closed.` : `Issue #${n} couldn't be closed (${firstLine(c.stderr) || "refused"}).`); }
  }
  log([`${project} has ended.`, ...done, "", `Each agent's own copy still holds its desk branches and its name. In each conversation (${agents.join(", ")}), have the agent run:`, `  ${LOCAL}`, "An agent that is still on automatic checking is told so at its next look. Then those conversations can be closed."].join("\n"));
  return 0;
}

// This copy's own desk/<project>/* branches, deleted; the copy moves off one first. Returns their names.
function clearLocalBranches(top, project, base, { force = false } = {}) {
  const mine = (git(top, "for-each-ref", "--format=%(refname:short)", `refs/heads/desk/${project}/`) || "").split("\n").filter(Boolean);
  if (!mine.length) return [];
  const here = git(top, "rev-parse", "--abbrev-ref", "HEAD") || "";
  if (mine.includes(here)) {
    if (!force && (git(top, "status", "--porcelain") || "") !== "") throw new Error(`this copy is on ${here} with uncommitted changes: commit, put them away, or run again with --force to lose them`);
    const moved = base && (run(top, "git", ["switch", "-q", ...(force ? ["-f"] : []), base]).status === 0 || run(top, "git", ["switch", "-q", ...(force ? ["-f"] : []), "--detach", `origin/${base}`]).status === 0);
    if (!moved && run(top, "git", ["switch", "-q", ...(force ? ["-f"] : []), "--detach"]).status !== 0) throw new Error(`this copy couldn't leave ${here}`);
  }
  for (const b of mine) run(top, "git", ["branch", "-q", "-D", b]);
  return mine;
}

// cleanup.mjs --local: an agent's copy, once its project has ended.
function local(argv) {
  const named = {}; for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) named[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
  const top = git(process.cwd(), "rev-parse", "--show-toplevel");
  if (!top) { console.error("cleanup: this isn't a git repository"); return 2; }
  const project = named.project || git(top, "config", "desk.project") || "";
  const base = git(top, "config", "desk.base") || "";
  const out = [];
  if (project) {
    let gone;
    try { gone = clearLocalBranches(top, project, base, { force: named.force !== undefined }); } catch (e) { console.error(`Not cleared: ${e.message}`); return 1; }
    out.push(gone.length ? `Deleted this copy's branch${gone.length === 1 ? "" : "es"}: ${gone.join(", ")}.` : `This copy has no desk/${project}/* branch.`);
    run(top, "git", ["fetch", "-q", "--prune", "origin", `+refs/heads/desk/${project}/*:refs/remotes/origin/desk/${project}/*`]);
  } else out.push("This copy names no project (git config desk.project), so no branch was looked for: say which with --project <name>.");
  // The copy's name, project, base, tool and marks: every desk.* setting, in the worktree's own file and the shared one.
  let keys = 0;
  for (const scope of ["--worktree", "--local"]) {
    const list = run(top, "git", ["config", scope, "--name-only", "--get-regexp", "^desk\\."]);
    if (list.status !== 0) continue;
    for (const k of [...new Set(list.stdout.split("\n").filter(Boolean))]) { if (run(top, "git", ["config", scope, "--unset-all", k]).status === 0) keys++; }
  }
  out.push(keys ? `Cleared ${keys} desk setting${keys === 1 ? "" : "s"} from this copy (its name, project, work branch, tool and marks).` : "This copy held no desk settings.");
  for (const f of ["desk-wait.mjs", "desk"]) { const p = git(top, "rev-parse", "--git-path", f); if (p && existsSync(join(top, p))) rmSync(join(top, p), { recursive: true, force: true }); }
  out.push("This copy is no longer on a desk. If a timer is still set in this conversation, cancel it; the conversation can be closed.");
  console.log(out.join("\n"));
  return 0;
}

const same = (a, b) => { try { return realpathSync(a) === realpathSync(b); } catch { return a === b; } };
if (process.argv[1] && same(fileURLToPath(import.meta.url), process.argv[1])) {
  const argv = process.argv.slice(2);
  if (!argv.includes("--local")) { console.error(`Usage: ${LOCAL} [--project <name>] [--force]   (an agent's own copy, once its project has ended)\nThe leader ends a project with: node ${SKILL_HOME}/scripts/desk.mjs end`); process.exitCode = 2; }
  else process.exitCode = local(argv.filter((a) => a !== "--local"));
}
