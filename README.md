# agent-orchestration

A project-agnostic harness for **how AI coding agents carry out work**: choosing an execution mode, running bounded loops with the owner present or away, checking at the depth each stage needs, reviewing progress about every 30 minutes, and changing course when progress stalls. Success is measured in useful, validated outcomes per unit of time, not in checklists completed or foundations laid early.

It's a set of **skills** (instructions an agent loads when they apply), one **agent** (a reviewer), **templates** and an installer with no dependencies. It works with GitHub Copilot (VS Code and CLI), Claude Code, Codex, and any agent that reads `AGENTS.md` or skill folders, without assuming they all offer the same capabilities.

It decides **how** to do the work, not **what** is worth building. It reads product intent when a project has some (for example, from [agentic-craft](https://github.com/prabinpebam/agentic-craft)), and stays useful for code tasks that have no formal spec.

## What's in it

| Skill | Use it when | What it gives you |
|---|---|---|
| [`orchestrate`](skills/orchestrate/SKILL.md) | Starting any multi-step task; the owner is away | The measure, the intent-mode-bounds start, the plan-act-check-record-review loop, the session clock, rules that hold everywhere, fallbacks for tools that lack a capability |
| [`execution-modes`](skills/execution-modes/SKILL.md) | Choosing or switching how to run the work | Three goal modes and two attention modes: what each produces first, defers, proves, and when it ends |
| [`stage-validation`](skills/stage-validation/SKILL.md) | Deciding which checks to run or what evidence a stage needs | Evidence by goal mode, validation tiers 0–3, the build-check-fix loop, blocked items, found on the way, ready to show, merging exactly what was tested |
| [`progress-review`](skills/progress-review/SKILL.md) | About every 30 minutes; at the end of an interval; when progress stalls | Nine questions (the last on the session's cost), stall signals, and how to change course |
| [`coordinate`](skills/coordinate/SKILL.md) | Logging, reporting, delegating, reviewing, handing over, rolling over to a new session | The work plan, progress log and handoff; status and reports; bounded delegation; independent review before risky merges; when and how to roll over |

| Agent | Job |
|---|---|
| [`throughput-reviewer`](agents/throughput-reviewer.agent.md) | About every 30 minutes of running work: is this the fastest path to validated progress? Same questions as `progress-review`, run as a sub-agent where the tool has them |

| Template | |
|---|---|
| [`work-plan.md`](templates/work-plan.md) | Intent (or three lines when there's no spec), mode and bounds, increments with their checks, working defaults, shortcuts, status |
| [`progress-log.md`](templates/progress-log.md) | The log line, tagged by mode |
| [`handoff.md`](templates/handoff.md) | The end-of-stretch handoff, including changes to the product intent |

| Tool (Node 20+, no dependencies) | |
|---|---|
| `tools/install.mjs` | Installs the skills and agent into a project, or for every project on the computer, with the session clock's hooks for Copilot |
| `tools/clock.mjs` | The session clock: run by the tool's hooks, it says when a progress review is due and when the session should roll over to a new one, so neither depends on the agent remembering |

## The session clock

Long runs forget the two things that keep them healthy: the review every 30 minutes, and handing over to a fresh session before the old one slows down (an editor holding hours of conversation gets sluggish, and each context compaction loses detail). The clock makes both scheduled. For GitHub Copilot (VS Code, the CLI and the app share the hook format) the installer writes `.github/hooks/orchestration-clock.json`, which runs `.github/hooks/orchestration-clock.mjs`:

| Hook | What the clock does |
|---|---|
| `sessionStart` | Starts the session's clock and tells the agent the limits |
| `postToolUse` | Counts the call; when a review is due or the session is past its limit, adds a reminder after the tool's result, repeated every 5 minutes until it's done |
| `preCompact` | Counts the compaction |
| `agentStop` | With a roll-over due, asks for one more turn to do it (once) |

Limits live in the hook configuration's `env`: `AO_REVIEW_MIN` (30), `AO_ROLLOVER_MIN` (90), `AO_ROLLOVER_TOOLS` (300), `AO_ROLLOVER_COMPACTIONS` (2); 0 turns one off. A review counts when the agent runs the `throughput-reviewer` agent, loads the `progress-review` skill or runs `mark review`; a roll-over counts when it starts a new session with a session tool, or runs `mark rollover` after asking the owner to open one. `node .github/hooks/orchestration-clock.mjs status` shows the clock. State is one small file per session in the system's temporary folder (or `AO_CLOCK_DIR`), never in the project; tool arguments are read only to recognise those commands. A broken clock prints `{}` and never stops work. For other tools, `orchestrate` gives the fallback: compare the time with the last review and the session's start at every log line.

## Modes

A mode is a goal plus an attention level, said in one line before work starts ("Mode: prove the risky assumption, keep going unattended").

| Goal | Produces first | Ends when |
|---|---|---|
| **Show me the UX sooner** | A playable or reviewable experience on realistic content; shortcuts listed | The owner gives a verdict |
| **Prove the risky assumption** | The smallest experiment against a criterion stated in advance | The result is in, or the time is up |
| **Make this production-ready** | Quality, accessibility, performance, tests and maintainability for validated work | Every done-when line has proof and it's live without breaking anything |

| Attention | How it runs |
|---|---|
| **Work with me** | Focused increments, about 15 minutes to something the owner can see, fast checks only |
| **Keep going unattended** | Explicit bounds, 45-minute intervals, decide and record working defaults, escalate only when needed, end with a handoff |

## Install

Clone it once, then install into any project:

```sh
git clone https://github.com/prabinpebam/agent-orchestration.git
node agent-orchestration/tools/install.mjs path/to/your-project
```

That copies the skills and the agent where each coding agent looks for them, installs the session clock's hooks for Copilot (an existing hook configuration is kept, with its limits), and adds an **Orchestration** section to the project's `AGENTS.md` (and `CLAUDE.md`, when there is one) with the project facts the skills read: where product intent lives, the work plan, the commands for each validation tier, the progress log, branch and merge rules (including whether the agent may merge, push or deploy), the review interval and the session limits. Fill those in. Run it again any time to update; your filled-in facts are kept, and other sections of `AGENTS.md` are left alone.

Options:

```sh
node tools/install.mjs <project> --for copilot,claude,agents   # choose the layouts
node tools/install.mjs <project> --templates docs/work          # also copy the templates (files already there are kept)
node tools/install.mjs <project> --dry-run                      # show what it would do
node tools/install.mjs --global --for copilot,claude,agents     # for every project on this computer
```

Without `--for`, it installs for Copilot, plus Claude Code when the project has `.claude/` or `CLAUDE.md`, plus the open skills layout when it has `.agents/`. The installer never deletes files; remove retired skills yourself.

## Works across coding agents

| Tool | Skills | Reviewer agent | Instructions | When a capability is missing |
|---|---|---|---|---|
| GitHub Copilot (VS Code, CLI) | `.github/skills/` (global `~/.copilot/skills/`) | `.github/agents/throughput-reviewer.agent.md` | `AGENTS.md` | — (the session clock runs from `.github/hooks/`, global `~/.copilot/hooks/`) |
| Claude Code | `.claude/skills/` (global `~/.claude/skills/`) | `.claude/agents/throughput-reviewer.md` | `CLAUDE.md` or `AGENTS.md` | No session clock installed: the agent checks the time at each log line |
| Codex and other agents using the open skills layout | `.agents/skills/` (global `~/.agents/skills/`) | Not installed | `AGENTS.md` | The `progress-review` skill carries the reviewer's questions for an inline review; no session clock |

Capabilities differ between tools and versions, so the skills never assume sub-agents, timers, hooks, background commands or memory between sessions. `orchestrate` lists the fallback for each: an inline review pass, reading the time at step boundaries and log lines, running long checks at interval ends, and treating the work plan, log and handoff as the memory.

## Use

Ask your agent as you normally would; the skills load when they apply. Some starting points:

- "Show me the UX for the setup flow sooner; I'll give feedback." (`orchestrate`, `execution-modes`)
- "Before we build the importer, prove it can handle 10,000 items in under 3 seconds." (prove the risky assumption)
- "The design is approved. Make it production-ready, unattended, for two hours; hand over when done." (`stage-validation`, `coordinate`)
- "Fix this bug." (no spec needed: the work plan's three lines, tier 1 checks)
- "Review progress: are we still on the fastest path?" (`progress-review`, `throughput-reviewer`)

## Using it with agentic-craft and Slate

Each harness works on its own. Used together, they hand artifacts across a clear line, with no shared skills and no overlapping instructions:

| Harness | Owns | Produces |
|---|---|---|
| [agentic-craft](https://github.com/prabinpebam/agentic-craft) | What is worth building and what success means | Promise, jobs, user-can statements, flows, UX direction, assumptions and risks, Definitions of Done |
| agent-orchestration | How the work is carried out, monitored and adapted | Work plan, mode and bounds, evidence, progress log, handoffs |
| [Slate](https://github.com/prabinpebam/slate) | Documentation authoring and reading | Browsable pages from either harness's artifacts, when useful |

What this harness reads from product intent, by its stable IDs:

| Product artifact | Used to |
|---|---|
| Promise and non-goals (P1…) | Judge drift in progress reviews ("traced to intent") |
| User-can statements and flows (U1…) | Plan increments that deliver them, each with the exact Try it for its build |
| Assumptions and risks (A1…), riskiest first | Choose "prove the risky assumption", and state its criterion |
| UX direction and views | Decide what "show me the UX sooner" produces first |
| Stages and Definitions of Done (1.1…, PD1…) | Cite, never redefine, what each increment delivers; the evidence is recorded beside the rows |
| Decisions with working defaults (O1…) | Cite them with the default in use instead of asking when unattended; new product questions go back in the handoff |

What flows back, in the handoff's "Changes to the intent": assumptions proven or disproven, promises at risk, and where the build differs from the spec, for the product owner to fold into the spec. Without a spec, the work plan's goal, done-when and limits lines stand in for all of it, and its own IDs keep the two namespaces apart: I1 increments, H1 hypotheses, W1 working defaults (execution choices only).

Slate presents the spec, the Definitions of Done, work plans and handoffs as navigable pages when a project wants them browsable. It isn't required for either harness.

## Split from agentic-craft

This harness was split from [agentic-craft](https://github.com/prabinpebam/agentic-craft) 0.1.0, which held both product reasoning and execution. What moved here:

| agentic-craft 0.1.0 | Here |
|---|---|
| `orchestrate` skill | `orchestrate`, `execution-modes`, `stage-validation`, `progress-review`, `coordinate` |
| The loop, blocked rows, found on the way, status and reporting from `definition-of-done` | `stage-validation`, `coordinate` |
| `throughput-reviewer` agent | `throughput-reviewer`, updated for goal and attention modes |
| `templates/progress-log.md`; the build steps and status in `templates/plan.md` | `progress-log.md`, `handoff.md`, `work-plan.md` |

Projects that installed agentic-craft 0.1.0 should delete its old `orchestrate` skill and `throughput-reviewer` agent copies, install this harness, and move the progress log and branch facts into the Orchestration section.

## Developing the harness

```sh
npm test    # node --test test/: skill metadata, routing, modes, reviewer questions, boundaries, links, the installer, the session clock
```

Keep it project-agnostic and independent: no product, person, machine or stack assumptions, and no dependence on another harness, in `skills/`, `agents/`, `templates/` or `tools/` (the tests check). A practice belongs here only once it has worked in a real project.

## Licence

MIT
