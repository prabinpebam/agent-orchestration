# agent-orchestration

Skills, an agent and Copilot hooks that control how a coding agent carries out work. The owner sees validated progress fast, never loses an instruction, and always gets their chat back. Project-agnostic, with no dependencies.

It decides how work runs, not what to build. Product intent comes from the project.

## What's in it

| Part | What it does |
| --- | --- |
| [`orchestrate`](skills/orchestrate/SKILL.md) | The entry point: the **pre-action checklist** run before every tool call and reply, the roles, the hooks, the loop and the clock |
| [`execution-modes`](skills/execution-modes/SKILL.md) | The mode ladder: **strict design** → **show me the UX sooner** → **make this production-ready**, plus **prove the risky assumption**; **work with me** or **keep going unattended** |
| [`stage-validation`](skills/stage-validation/SKILL.md) | Checks scoped to mode and risk, integrating and merging, the review build |
| [`progress-review`](skills/progress-review/SKILL.md) | The review every 30 active minutes |
| [`coordinate`](skills/coordinate/SKILL.md) | The registry, dispatch, messages, logs, handoffs and roll-overs |
| [`throughput-reviewer`](agents/throughput-reviewer.agent.md) | Runs the progress review as a separate pass |
| [`tools/clock.mjs`](tools/clock.mjs) | The session clock and the guard, run from Copilot hooks |
| [`templates/`](templates/) | Work plan, progress log and handoff starters |

## The rules, and how they're enforced

The hard rules are marked **MANDATORY**, and there are few of them. Each lives in one place. Where the host has hooks, a mechanism enforces them; elsewhere, the checklist does.

| Rule | Hook (Copilot) | Everywhere |
| --- | --- | --- |
| The main chat only talks to the owner | The guard denies shell, subagent, poll and wait tools in a session marked `main` | Checklist 1 |
| A coordinator's turns stay short | The guard denies builds, tests and waits in a session marked `coordinator` | Checklist 1 |
| No tests on an unapproved design; never the full suite in show me the UX sooner | The guard denies test, end-to-end, benchmark and CI-wait commands in modes `design` and `ux-sooner` | Checklist 2 |
| Handing over is not completion | — | Checklist 3 |
| Every owner instruction goes into the project's documentation system | — | Checklist 4 |
| Owner reports go only to the main chat, as 3 plain lines | — | Checklist 5 |
| Reviews every 30 active minutes; roll-overs at limits, idle time not counted; the main chat never rolls over; coordinators only at context limits; nobody while the owner is steering | The clock | Kept by hand |

Each session marks its role once with `node .github/hooks/orchestration-clock.mjs mark role main|coordinator|worker`. The mode is set with `mark mode design|ux-sooner|assumption|production-ready`, or by writing it in `.agent-orchestration/mode` in the working copy. The guard reads tool calls only to recognise commands; it stores and prints nothing from them. It catches its own errors and allows the call. If Node or the script itself is missing, Copilot treats the failed hook as a denial of every tool call, so keep `.github/hooks/` complete.

## Install

```sh
git clone https://github.com/prabinpebam/agent-orchestration.git
node agent-orchestration/tools/install.mjs path/to/project [--for copilot,claude,agents] [--templates docs/work] [--dry-run]
node agent-orchestration/tools/install.mjs --global [--for copilot,claude]
```

The installer copies the skills and the agent where each tool looks for them:

| Tool | Skills | Agent |
| --- | --- | --- |
| Copilot | `.github/skills/` | `.github/agents/` |
| Claude Code | `.claude/skills/` | `.claude/agents/` |
| The open layout | `.agents/skills/` | none |

For Copilot it also installs the clock and guard hooks in `.github/hooks/` (`orchestration-clock.json`, `orchestration-guard.json`); an existing configuration is kept.

It adds an **Orchestration** section to `AGENTS.md`, with project facts to fill in: product intent, the documentation system, reference products, the work plan, commands by tier, the progress log, the owner's main chat, the registry, branches and merges, the review build, and the limits. Run it again to update: filled-in facts are kept, and new facts appear as placeholders.

## Using it with other kits

It works alone. Alongside a product-reasoning kit such as [agentic-craft](https://github.com/prabinpebam/agentic-craft) and a documentation kit such as [Slate](https://github.com/prabinpebam/slate), this kit reads intent and Definitions of Done; it never defines them.

## Developing

`npm test` (Node 20+, no dependencies). See [AGENTS.md](AGENTS.md) and [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT
