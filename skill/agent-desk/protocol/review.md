# Review another agent's pull request

You are the adversarial reviewer. Your job is to find what is wrong, not to approve. The leader reads your review and decides which findings stand, and the leader has the final say. You came here from `agent.md`, which saved your name and the work branch and read desk.json. Follow these steps in order; if one can't be done, stop and tell the owner why.

## 1. Check it is yours to review

Read the pull request N: with `gh pr view N --json number,title,headRefName,baseRefName,state,isDraft,body` if `gh` is signed in, or else through your tool's GitHub connection.

- The head must be `desk/<project>/<another agent>/<brief id>`: this project's, and not yours, where "yours" is <name> as `git config desk.slot` printed it. **Never review your own pull request, or another project's.**
- The base must be the work branch.
- The state must be open.
- The brief (`git show origin/<base>:agents/desk/<project>/assignments/<brief id>.md`) must name you as its `reviewer`, unless the owner's prompt asked you by name.

Otherwise stop. If it is yours to review: `node .agents/skills/agent-desk/scripts/desk.mjs report reviewing --pr N`.

## 2. Read without disturbing your own work

**Don't switch branches.** This copy may hold your own brief's work.

```bash
git fetch origin
git show origin/<base>:agents/desk/<project>/assignments/<brief id>.md
git diff origin/<base>...origin/<head>
```

Also read:
- the spec step the brief names, with `git show origin/<base>:<the spec file>`;
- every changed file whole, with `git show origin/<head>:<path>`, not just the diff;
- for each changed file, its nearest existing sibling, which the code should mirror.

## 3. Look for these, in this order

1. **Scope:** a file outside the brief's `may_change`, a frozen test edited, a protected file touched. (The leader reruns desk-check too.)
2. **The spec, and the brief's rules, line by line.** Make the table **Brief says → diff does**: one row for every line of the brief's Context and Done means that says `must`, `never`, `use`, `only` or `always`, and every line of the spec step it names. Quote the line, and give the `path:line` in the diff that meets it, or `missing`, or `partly: <what is left>`. A row marked `missing` or `partly` is a finding. Then list what nobody asked for, and what looks done but is wrong. (On one desk, two reviews found nothing while a helper the brief named was never called and a rule the brief set was broken: the table finds both.)
   Read the report's **Code facts (from the diff)** beside its prose: a table, helper, route or type the words name that the facts don't list is a finding (`should`), as the words describe code that isn't there.
3. **Security:**
   - a route or command without the access check its siblings have;
   - data shown to someone the spec says mustn't see it;
   - output not escaped where it goes into HTML, SQL or a shell;
   - a query built from strings instead of bound values;
   - a secret or a person's data written to a log.
4. **Correctness:**
   - a write that doesn't check the version it read;
   - a check and its write in separate statements;
   - anything that could send an email or message twice;
   - an unhandled empty list, missing record or `null`;
   - time zones and day boundaries.
5. **Tests:** a test that passes without running the thing it tests, a loosened assertion, a fixed `sleep` instead of a wait.
6. **The repository's rules** (`AGENTS.md`, and the rules file the brief names): one responsibility per file, the flow mirrors its sibling, the house spelling and wording.

**Verify each finding before you write it down.** Read the exact lines, and run the code or a test aimed at that finding if you can without switching branches. Don't run the whole suite, desk-check or the brief's checks: desk-check ran them on the agent's push and the leader's merge runs the whole suite, so a fourth run finds nothing they can't. Drop anything you can't point at. Expect a third of your first ideas to be wrong.

## 4. Post one review comment

Post it with `gh pr review N --comment --body-file <file>` if `gh` is signed in, or else as a comment through your tool's GitHub connection. Never approve and never request changes.

The comment holds:
- A first line: `Desk review of #N for <project> by <name>: <k> blocking, <m> should, <n> nit`.
- The **Brief says → diff does** table (step 3.2), every row.
- The pull request report's desk-check lines, pasted as they are (the counts and its verdict); you don't run desk-check yourself.
- One numbered item per finding, in this form:

  ```
  **[blocking|should|nit] path:line**: mechanism → consequence → fix. (Evidence: …)
  ```

  `blocking` means wrong, unsafe, or failing the brief or spec; `should` means worth fixing now; `nit` means the author may ignore it.
- "No blocking findings" if that is so, and say what you checked.
- The last line: `— <name> (<tool>) on <project>, for <leader> to decide` (a review helper the leader started in its own tool signs `— <leader>-review (<tool>) on <project>, for <leader> to decide`, and hands the text to the leader to post instead of posting it).

You don't need to run desk-check on the other agent's branch: the leader reruns it on the pull request's head.

## 5. Hand over

`node .agents/skills/agent-desk/scripts/desk.mjs report reviewed --pr N`, then tell the owner: "Posted my review on #N for <project>. Next: tell <leader> `/agent-desk lead <project> check`."

Then go back to `agent.md` step 3 for anything else that fits: your own revision or brief. Don't fix the other agent's code, and don't push anything to its branch.
