# AGENTS.md (this repository)

This repository is the **agent-orchestration** harness itself: skills, an agent, templates and an installer for how any coding agent carries out work.

- **Execution control only.** Modes, loops, checks, progress reviews, records, delegation and handoffs. What's worth building and what success means belong to a product-reasoning harness; read product intent, don't define it.
- **Independent.** Nothing in `skills/`, `agents/`, `templates/` or `tools/` may require another harness. Integration is documented in the README only.
- **Tool-agnostic.** Never assume sub-agents, timers, hooks, background commands or session memory; give the fallback when a practice needs one. The session clock (`tools/clock.mjs`) runs from hooks where a tool has them; the skills say what to do without it.
- **Keep the coordinator free.** The main chat only triages, queues, routes, steers, checks evidence cheaply and reports in short turns. Workers execute. No coordinator implementation, long commands, sleeps, polling loops or blocking waits. Live state comes before every prompt and launch; one writer per working copy. The registry/queue survives handover. Explain the VS Code lesson without assuming other tools behave the same, and keep the single-threaded fallback. `npm test` checks these rules.
- **The session clock is mandatory.** `orchestrate`, the installed `AGENTS.md` section and the clock's own messages must all say it's required: act on every reminder, never weaken it, and keep time by hand without hooks. Never soften this to advice. `npm test` checks it.
- **Every role keeps the same limits.** A worker launch is not a coordinator roll-over. Only an explicit `mark rollover` after handover acknowledges it; use `--session <id>` when clocks share a folder. A coordinator hands the registry to one successor and adopts existing workers, never resets them.
- **The review build is always ready.** `orchestrate`, `stage-validation`, `coordinate`, the installed section (with its **Review build** fact) and the handoff template all say it: built only from validated commits, isolated from development, kept running, named in every report and handoff. `npm test` checks it.
- **Keep it project-agnostic.** No product names, people, machine paths or stack assumptions in shipped folders. `npm test` checks this.
- **Skills** are folders under `skills/` with a `SKILL.md` whose frontmatter has `name` (the folder's name) and `description` (starting "Use when…", at most 1024 characters).
- **The `orchestrate` skill routes to every other skill;** a new skill gets a row in its table and in the README.
- **Agents** are `agents/<name>.agent.md` with `name` and `description` frontmatter; the installer renames them for Claude Code. The `throughput-reviewer` questions match the `progress-review` skill's (tested).
- **Tools** are single-file Node 20+ ES modules with no dependencies, usable from the command line and importable for tests.
- **Check:** `npm test` (Node's own test runner). It runs in CI on every push.
- Copy here uses plain words, sentence case and no filler.
