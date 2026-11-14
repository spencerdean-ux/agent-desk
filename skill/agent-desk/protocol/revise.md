# Answer the leader's decision on your pull request

The leader reads the review and posts a **Desk decision** on your pull request. You act on that decision only, never on a review finding the leader rejected. You came here from `agent.md`, which saved your name and the work branch and read the board. Follow these steps in order, and if one can't be done, stop and tell the owner why.

## 1. Find your pull request and its decision

```bash
git status --porcelain
```

Stop if it prints anything. Your brief id is on your row of the board, the row for <name> as `git config desk.slot` printed it, and no other.

Find your open pull request from `desk/<project>/<name>/<brief id>` and read its comments: with `gh pr list --head desk/<project>/<name>/<brief id>` and `gh pr view N --comments` if `gh` is signed in, or else through your tool's GitHub connection.

Find the newest comment that **starts with `Desk decision for <project>:`**. The leader writes it, possibly from the owner's account. If there is none newer than your last push, stop and tell the owner: "Waiting for <leader>'s decision on #N for <project>. Tell <leader> `/agent-desk lead <project> check`."

The decision lists numbered items, each one of:
- **fix:** what to do;
- **rejected:** with a reason. Leave it alone.
- **question:** answer it in your reply.

## 2. Bring your branch up to date

```bash
git switch desk/<project>/<name>/<brief id>
git merge --ff-only origin/desk/<project>/<name>/<brief id>
git merge origin/<base>
```

Then `node .agents/skills/agent-desk/scripts/desk.mjs report revising --brief <brief id> --pr N`, and run each command in desk.json's `setup` list. If this copy doesn't have your branch yet, `git switch desk/<project>/<name>/<brief id>` makes it from `origin/desk/<project>/<name>/<brief id>`. Use a merge, never a rebase. If the merge conflicts in a file outside your `may_change`, stop and ask.

## 3. Fix what the decision says

Fix each **fix** item within your brief's `may_change`, and never edit a frozen test. Commit with the same message endings as in `take.md` (`Desk-Project:`, `Desk-Agent:`, `Desk-Brief:`).

```bash
node .agents/skills/agent-desk/scripts/desk.mjs preflight <brief id>
```

It runs `node .agents/skills/agent-desk/scripts/check.mjs <brief id>` (desk-check), which must pass, and writes a fresh report draft to `.git/desk/preflight-<brief id>.md` for your reply.

## 4. Push and reply

```bash
git push origin desk/<project>/<name>/<brief id>
```

Then post a reply on the pull request, with `gh api repos/<repository>/issues/N/comments -F body=@<file>` (or `gh pr comment N --body-file <file>`) if `gh` is signed in, or else through your tool's GitHub connection. It holds:

- A first line: `Revised #N for <project>:`
- For each decision item, its number and either the commit that fixes it (short SHA) or your answer to the question.
- The last lines of desk-check.
- The last line: `— <name> (<tool>) on <project>, for <leader> to decide`

Then `node .agents/skills/agent-desk/scripts/desk.mjs report pushed --brief <brief id> --pr N`, which tells the leader the revision is ready to check: never skip it, as the leader's look reads your report, not the board, to see you pushed.

Never push to `main`, `staging`, the work branch or another agent's branch (the two desk commands that push one commit there, `report` and `move --push`, are the exceptions).

## 5. Hand over

Tell the owner: "Revised #N for <project>. Next: tell <leader> `/agent-desk lead <project> check`."

Then go back to `agent.md` step 3 for anything else that fits.
