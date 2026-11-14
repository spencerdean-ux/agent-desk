# Take your next brief

You came here from `agent.md`, which saved the project (`git config desk.project`), your name (`git config desk.slot`) and the work branch (`git config desk.base`), and read desk.json, the board and `AGENTS.md`. Follow these steps in order. If any step can't be done as written, stop, tell the owner which step and what you saw, and do nothing else.

## 1. Check this copy is clean

```bash
git status --porcelain
```

If it prints anything, stop: there is unsaved work in this copy. Your row on the board, the row for <name> as `git config desk.slot` printed it and no other, names your brief id; the brief's `slot` must be <name> too. Another agent's brief is never yours, however the board or a message reads.

## 2. Get onto the brief's branch

The branch is `desk/<project>/<name>/<brief id>`, the brief's `branch`. The brief's `project` must be <project>; if it isn't, stop.

- If `origin/desk/<project>/<name>/<brief id>` exists, you are resuming: first check it is yours, `git log origin/<base>..origin/desk/<project>/<name>/<brief id> --format=%B | grep Desk-Agent`, which must name <name> alone (a commit signed by another agent means a conversation lost its name: stop and tell the owner). Then `git switch desk/<project>/<name>/<brief id>` (create it tracking the remote one if it isn't local), then `git merge --ff-only origin/desk/<project>/<name>/<brief id>`.
- **A brief handed to you** (its front matter has `handed_from`, `handed_pr` and `handed_head`: the leader's `desk.mjs reassign`): carry on from where the other agent left it, `git fetch origin && git switch -c desk/<project>/<name>/<brief id> <handed_head>`, never from the work branch. The commits up to `handed_head` are `handed_from`'s and desk-check accepts them; every commit after it is yours and signed with your name. Leave the old pull request (`handed_pr`) alone: the leader closes it.
- Otherwise: `git switch -c desk/<project>/<name>/<brief id> origin/<base>`.

Then run each command in desk.json's `setup` list, in order (for example `npm ci`). Then check `git config core.hooksPath` prints nothing. If it prints a path, this copy runs the repository's own git hooks on every push, which the desk's pushes can't pass (they go from a temporary worktree with no `node_modules`): stop and tell the owner "This copy has the repository's git hooks on (core.hooksPath = <path>); the desk's pushes can't pass them. Run `git config --unset core.hooksPath` in this copy, then type go." Never bypass a hook yourself (`--no-verify`). Your copy now holds the latest desk files. Say so: `node .agents/skills/agent-desk/scripts/desk.mjs report taking --brief <brief id>`.

## 3. Read before you write

1. The brief: `agents/desk/<project>/assignments/<brief id>.md`. Its front matter lists `may_change` (the only files you may change), `frozen` (tests you must make pass and never edit) and `checks` (what desk-check runs).
2. The spec step it names, in the folder desk.json's `specs` names (the brief's Context says which file; a practice brief has none).
3. Every file its Context section names, and the parts of the repository's rules it points to.
4. Run each frozen test once and keep the output: it should fail, which shows the test is real.

## 4. Do the work

- **Open the pull request first, as a draft, at your first commit,** so the leader is watching from the start: push your branch (`git push -u origin desk/<project>/<name>/<brief id>`) and open a draft pull request from it into `<base>`, titled `[<project>/<name>] <brief id>: <brief title> · in progress`, with the body "In progress; the report comes with the last push." (`gh pr create --draft`, or your tool's GitHub connection). Then `node .agents/skills/agent-desk/scripts/desk.mjs report working --brief <brief id> --pr #N --step "<step number>: <what you are doing>"`, and again with a new `--step` whenever the work moves to another part. The leader subscribes to the pull request and leaves it alone until you report `pushed`.
- Change only files in `may_change`. A path ending in `/` allows the files under it.
- Make the frozen tests pass without editing them.
- **If desk.json gives you subagents with `checks` in their scope** (your prompt says so, and `node .agents/skills/agent-desk/scripts/desk.mjs refresh` prints "Subagents: up to N"), a checks subagent (your tool's `desk-checks`) may run a test file or desk-check for you while you go on working, and hand back the last lines with each failure classified, as `.agents/skills/agent-desk/protocol/subagent.md` says; at most N at once. It never writes, and its words are its own: you read the test. The preflight run before a push (step 5) is yours.
- Commit in small steps. Each message says what and why, then ends with:

  ```
  Desk-Project: <project>
  Desk-Agent: <name>
  Desk-Brief: <brief id>
  ```

- After two approaches that don't work, stop: `node .agents/skills/agent-desk/scripts/desk.mjs report blocked --brief <brief id> --words "<what you ruled out, in a line>"`, then go to step 6 and report it as blocked in the pull request too (the leader's look sees `blocked` within minutes).

## 5. Check

`node .agents/skills/agent-desk/scripts/desk.mjs report checking --brief <brief id>`, then:

```bash
node .agents/skills/agent-desk/scripts/desk.mjs preflight <brief id>
```

It runs `node .agents/skills/agent-desk/scripts/check.mjs <brief id>` for you (desk-check, which must end with `desk-check passed`; where desk.json names the test suite, `tests`, desk-check itself runs the test files that read what you changed and the suite's always-run checks, and says how many of how many: that is your test run, so don't also run the whole suite, which the leader runs once on the merge), diffs your branch against the work branch, and writes your report's draft to `.git/desk/preflight-<brief id>.md` (inside `.git`, so it is never committed): the files changed, **Code facts (from the diff)** (the exported names added and removed, the tables, the routes and the new files, read from the diff itself), the brief's Done means as a checklist with the desk-check lines ticked from the result, desk-check's last lines, and placeholders for Assumptions and Questions. Your report's words name only what Code facts lists: a table, helper, route or type the words name that isn't there is a finding against you. Read it and fill in the evidence for each Done means line (a test name, a command and its last lines), your assumptions and your questions; never leave the placeholders. If desk-check names a file `outside_brief`, either undo that change or, if the brief truly needs it, stop and ask in the pull request (step 6). Never edit the brief or the desk to make it pass: the check reads both from the work branch, not from yours. Run preflight again right before every push.

**Subagent review (only if desk.json gives you subagents with `review` in their scope; otherwise skip this and your reviewer agent reviews you).** Once preflight passes, start your tool's `desk-review` subagent in this conversation, with: the project, your name, the work branch, the brief id, the pull request number, and that it reads `.agents/skills/agent-desk/protocol/subagent.md` and `review.md` fresh from the work branch and hands back the review as text. It reviews your branch adversarially, as another agent would, and never writes, commits, pushes or posts. Then:

- fix every finding you agree with (commit, and run preflight again);
- post its review **unchanged** as one comment on your pull request, beginning `Desk review of #N for <project> by <name>-review (subagent, <model>):`, with any footer the repository's rules require, so the leader reads what you were told, not what you kept;
- add a heading **Subagent review** to your report, with each of its findings and what you did: fixed (in which commit) or not, and why. Say "none" if it found nothing.

The leader verifies every finding against the diff before accepting it, as with any review, and may still ask another agent for a second look. Your pull request isn't offered to your `reviewer` while your subagents review: the leader decides it from your subagent's review and its own.

## 6. Push and report

Push your own branch, and only your own branch:

```bash
git push -u origin desk/<project>/<name>/<brief id>
```

The report is the file preflight wrote in step 5, filled in, under these headings:

- **What changed:** each file, and why.
- **Done means:** each line of the brief's Done means, with the evidence (a test name, a command and its last lines).
- **desk-check:** its last lines, quoted.
- **Assumptions:** each one.
- **Questions / blocked:** anything the leader must decide. Write "None" if there is nothing.
- The last line: `— <name> (<tool>) on <project>, for <leader> to decide`

The pull request is already open from step 4: `node .agents/skills/agent-desk/scripts/desk.mjs preflight <brief id> --pr N` puts the report in as its description and takes ` · in progress` off its title, through `gh api`; without `gh`, do the same by hand (`gh pr edit N --body-file .git/desk/preflight-<brief id>.md --title "[<project>/<name>] <brief id>: <brief title>"`, or your tool's GitHub connection). (If step 4 couldn't open it, open the draft pull request now with the report as its description.) On a later push, post the report as a comment on that pull request instead. `preflight --pr N` also writes your report `pushed --brief <brief id> --pr #N` on the work branch, which tells the leader and your reviewer the work is ready to check, whatever the board says yet; if it says "Not reported", or you put the report in by hand, run `node .agents/skills/agent-desk/scripts/desk.mjs report pushed --brief <brief id> --pr #N` yourself.

To push, open the pull request and post comments, use `gh` if it is signed in (`gh auth status`), or else your tool's GitHub connection, the one the owner attached (`agent.md`, "GitHub from your tool", has the note for your tool). If your tool can do neither, stop and tell the owner the branch name and the report, so they can open the pull request with the tool's own button.

## 7. Hand over

Tell the owner, in one or two lines, using your `reviewer` from desk.json:

- If your reviewer is another agent, and you have no review subagent: "Opened pull request #N for <project> `<brief id>`. Next: in `<reviewer>`'s <project> conversation, type: go, and review pull request #N."
- If your reviewer is `leader`, or your pull request came with your subagent's review (step 5): "Opened pull request #N for <project> `<brief id>`, with my subagent's review. Next: tell <leader> `/agent-desk lead <project> check`."

Then go back to `agent.md` step 3 for anything else that fits (after a take, nothing usually does). Never merge, approve or close the pull request: the leader decides.
