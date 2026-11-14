# status: where a desk stands

The owner's words after `status` may name a project, and one of `prompts`, `doctor` or `log`.

1. `git fetch origin`. Which project: the one named; else this copy's own; else the only one here. With several and none named, list them and ask.
2. Run, from the work branch's checkout, or with `--ref <work branch>` from anywhere:

   ```bash
   node .agents/skills/agent-desk/scripts/desk.mjs status --project <project>
   ```

   - `doctor`: `desk.mjs doctor`, the whole desk checked, each finding with its fix.
   - `log`: `desk.mjs log [--since 2d] [--md]`, what happened, oldest first.
3. Tell the owner, in this order:
   - the project, its repository and work branch, and who leads;
   - a table of the agents (name, tool, model, job, reviewer, state, brief, pull request, and what each says it is doing, or **silent**);
   - any problems, each with its fix;
   - the one next thing to do for each agent, as a numbered step with **Where:** it is done.
4. **Give the wording.** For every agent whose next step is to be started, or when the words say `prompts`, run `node .agents/skills/agent-desk/scripts/desk.mjs prompts [agent] --project <project>` and give each prompt whole, in its own copyable block, under its **Where:** line. Where a row is `review` and its reviewer is another agent, give that reviewer's prompt with the pull request in it (`prompts <reviewer> --review #N`).
