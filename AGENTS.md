# AGENTS.md (this repository)

This repository is the agent-orchestration kit: skills, an agent, templates, an installer and the clock and guard hooks.

- **Execution control only.** How work runs; never what to build. Nothing in `skills/`, `agents/`, `templates/` or `tools/` may require another kit.
- **Lean by design.** Each rule lives in one place, and others link to it. No history, narrative or rarely used fallbacks. `MANDATORY` marks only the hard rules, and there are few. `npm test` holds the skills and agent to a word budget.
- **Compliance by mechanism.** A hard rule goes first in the checklist, as a yes/no question with its fix; where the host allows it, the guard or the clock enforces it too. The guard catches its own errors and allows the call.
- **Project-agnostic.** No product, person or machine names in shipped folders (tested).
- **Skills** are `skills/<name>/SKILL.md` with `name` (the folder) and `description` (starting "Use", at most 1024 characters); `orchestrate` routes to every other skill. **Agents** are `agents/<name>.agent.md`. **Tools** are single-file Node 20+ modules with no dependencies.
- **Check:** `npm test`, also run in CI on every push. Record each change in `CHANGELOG.md`.
- Plain words, sentence case, no filler.
