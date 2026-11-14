---
id: A0-short-name
project: my-project
slot: agent-a
reviewer: agent-b
spec: A0
title: One line saying what this brief builds
base: <the work branch>
branch: desk/my-project/agent-a/A0-short-name
port: 8811
may_change:
  - src/example.js
  - src/example/
frozen:
  - tests/example.test.mjs
checks:
  - node --test tests/example.test.mjs
---

<!-- The leader makes a brief with `node .agents/skills/agent-desk/scripts/desk.mjs brief <id> --for <agent> --spec <step> --title "…"`,
     which copies this file to <id>.md with project, slot, reviewer, base, branch and port filled in
     from desk.json, then writes the lists and the sections, commits it with the brief's frozen tests,
     and puts it on the board with `node .agents/skills/agent-desk/scripts/desk.mjs set <agent> ready --brief <id>`.
     A path ending in / allows the files under it. `checks` runs the frozen tests and any named browser
     checks. Where desk.json names the test suite (tests), desk-check adds the test files that read what
     the branch changed and the always-run checks itself, so list neither. Without it, add the test files
     the change touches; the repository's whole test command goes in only while no other brief is open, as
     another brief's frozen tests are red until it merges. `node .agents/skills/agent-desk/scripts/desk.mjs validate` checks
     every brief against desk.json. -->

## Goal

What exists when this is done, in two or three sentences, and the spec step it serves (the file under desk.json's `specs`).

## Context

The files to read first (the nearest sibling to mirror, the helpers to reuse), the parts of the repository's rules that apply, and what the frozen tests check.

## Steps

1. Numbered, small steps, in the order to do them.

## Done means

- Every frozen test passes, unedited.
- `node .agents/skills/agent-desk/scripts/check.mjs <id>` passes.
- What the pull request's report must show.

## Out of scope

What not to touch, even when it looks related.

## Stop and ask when

The situations in which the agent stops and asks in its pull request rather than deciding.
