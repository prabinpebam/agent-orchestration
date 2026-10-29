# agent-orchestration

A project-agnostic harness for **how AI coding agents carry out work**: choosing an execution mode, running bounded loops with the owner present or away, checking at the depth each stage needs, reviewing progress about every 30 minutes, and changing course when progress stalls. Success is measured in useful, validated outcomes per unit of time, not in checklists completed or foundations laid early.

The main chat stays a **free coordinator**: it reads new prompts and live worker state, routes and queues work, steers or stops workers, checks deliveries cheaply and reports in short turns. Workers implement and run builds, tests and long commands. No coordinator sleeps, polls, blocking waits or watchers that keep a turn busy.

It's a set of **skills** (instructions an agent loads when they apply), one **agent** (a reviewer), **templates** and an installer with no dependencies. It works with GitHub Copilot (VS Code and CLI), Claude Code, Codex, and any agent that reads `AGENTS.md` or skill folders, without assuming they all offer the same capabilities.

It decides **how** to do the work, not **what** is worth building. It reads product intent when a project has some (for example, from [agentic-craft](https://github.com/prabinpebam/agentic-craft)), and stays useful for code tasks that have no formal spec.

## What's in it

| Skill | Use it when | What it gives you |
|---|---|---|
| [`orchestrate`](skills/orchestrate/SKILL.md) | Starting multi-step work; triaging prompts; the owner is away | The free coordinator and worker roles, intent-mode-bounds start, execution loop, session clock, review build and tool-portability fallbacks |
| [`execution-modes`](skills/execution-modes/SKILL.md) | Choosing or switching how to run the work | Three goal modes and two attention modes: what each produces first, defers, proves, and when it ends |
| [`stage-validation`](skills/stage-validation/SKILL.md) | Deciding which checks to run or what evidence a stage needs | Evidence by goal mode, validation tiers 0–3, the build-check-fix loop, refreshing the review build, blocked items, found on the way, ready to show, merging exactly what was tested |
| [`progress-review`](skills/progress-review/SKILL.md) | About every 30 minutes; at the end of an interval; when progress stalls | Nine questions (the last on the session's cost), stall signals, and how to change course |
| [`coordinate`](skills/coordinate/SKILL.md) | Triaging prompts, queuing, delegating, logging, reporting, reviewing and handing over | The durable registry/queue, event-driven completion, duplicate prevention, records, bounded workers and single-successor roll-overs |

| Agent | Job |
|---|---|
| [`throughput-reviewer`](agents/throughput-reviewer.agent.md) | About every 30 minutes of running work: is this the fastest path to validated progress? Same questions as `progress-review`, run as a sub-agent where the tool has them |

| Template | |
|---|---|
| [`work-plan.md`](templates/work-plan.md) | Intent, mode and bounds, coordinator and registry/queue location, ownership fields, increments with checks, working defaults, shortcuts, status |
| [`progress-log.md`](templates/progress-log.md) | The log line, tagged by mode |
| [`handoff.md`](templates/handoff.md) | The end-of-stretch handoff, including registry/queue, live workers, successor, review build and changes to intent |

| Tool (Node 20+, no dependencies) | |
|---|---|
| `tools/install.mjs` | Installs the skills and agent into a project, or for every project on the computer, with the session clock's hooks for Copilot |
| `tools/clock.mjs` | The session clock: run by the tool's hooks, it says when a progress review is due and when the session should roll over to a new one, so neither depends on the agent remembering |

## The session clock

Long runs forget the two things that keep them healthy: the review every 30 minutes, and handing over to a fresh session before the old one slows down (an editor holding hours of conversation gets sluggish, and each context compaction loses detail). The clock makes both scheduled.

**The clock is mandatory.** It's part of using this kit, not an add-on. Every session that runs work under these skills runs with it. Where a tool has no hooks, the agent keeps time by hand against the same limits. Its reminders are instructions: a due review comes before the next increment, and a due roll-over comes at the next safe point. The agent never disables the clock or loosens its limits; only the owner does, and records it in the project facts. A missing clock is fixed first (re-run the installer), and the progress review reports a skipped reminder as its top finding.

For GitHub Copilot (VS Code, the CLI and the app share the hook format) the installer writes `.github/hooks/orchestration-clock.json`, which runs `.github/hooks/orchestration-clock.mjs`:

| Hook | What the clock does |
|---|---|
| `sessionStart` | Starts the session's clock and tells the agent the limits |
| `postToolUse` | Counts the call; when a review is due or the session is past its limit, adds a reminder after the tool's result, repeated every 5 minutes until it's done |
| `preCompact` | Counts the compaction |
| `agentStop` | With a roll-over due, asks for one more turn to do it (once) |

Limits live in the hook configuration's `env`: `AO_REVIEW_MIN` (30), `AO_ROLLOVER_MIN` (90), `AO_ROLLOVER_TOOLS` (300), `AO_ROLLOVER_COMPACTIONS` (2); 0 turns one off. A review counts when the agent runs the `throughput-reviewer` agent, loads the `progress-review` skill or runs `mark review`. A roll-over counts only on explicit `mark rollover` after ownership transfers to the recorded successor, or after giving the owner the prompt to open one. **Creating a worker session is not a roll-over.** A coordinator transfers its registry to one fresh coordinator without waiting for or restarting workers; every role keeps the same limits.

`node .github/hooks/orchestration-clock.mjs status` shows the clock when the folder has one session. With multiple clocks, use `status --session <id>` or `mark review|rollover --session <id>`; an ambiguous command refuses to choose another session's clock. State is one small file per session in the system's temporary folder (or `AO_CLOCK_DIR`), never in the project; tool arguments are read only to recognise those commands. A broken hook prints `{}` and never stops work. For other tools, `orchestrate` gives the fallback, which is just as binding: compare the time with the last review and the session's start at every log line.

## The coordinator and queue

At the start of every coordinator turn, read unread messages and completion records, the live worker list and the registry/queue. Triage every new prompt: same writer's area, steer it or queue its follow-up; independent work, launch an isolated worker; dependent work, queue with an explicit trigger; correction, steer or stop. **One writer per working copy, always**; a separate branch in a shared folder is not isolation.

Keep a durable registry in the session's own store or an ignored file: **task, owner worker, working copy, state, trigger, completion signal**, plus coordinator/successor IDs. Workers report by message, completion record or both. The coordinator checks evidence and updates the queue at turn boundaries, never in a waiting loop. Before any worker or continuation is created, check pending messages and live workers for an existing owner or successor. Record uncertain launches and reconcile them rather than retrying.

**Ending a coordinator turn is not completion.** The owner's task is done only when every dispatched part has verified evidence. Never mark it complete to silence automated keep-working reminders while workers or queued items remain. Where the host can't idle with work pending, state that limitation and use its supported continuation.

## The review build

The owner reviews when they choose, not when the agent stops. So a **review build** is always built, running and ready to try: a local site or a stable build of the app, at the **last validated commit**, isolated from development so the owner can give early input and change course without disturbing the work, and without the work breaking what they're looking at.

| | |
|---|---|
| What it shows | Only commits whose checks passed. Never the working copy, uncommitted or failing work, or the dev server |
| Where it lives | Its own checkout (for example a git worktree detached at the validated commit), its own build output, its own port or user-data folder, demo or temporary data; never the owner's real data, accounts or remotes |
| When it moves | At each validated increment and each stage close: build in the review checkout, swap only when it's ready, check it answers. Never restarted while the owner may be using it without their agreement, and never takes their focus |
| Where it's named | Every status report and handoff: where it is, the commit it shows, how to open and refresh it |

`orchestrate` starts it (start step 5) and keeps it in the loop, `stage-validation` says when and how to refresh it, and `coordinate` puts it in reports and handoffs. Its project fact, **Review build**, says how to start and refresh it and where it is.

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
node agent-orchestration/tools/install.mjs path/to/your-project --for copilot
```

That copies the skills and the agent where each coding agent looks for them, installs the session clock's hooks for Copilot (an existing hook configuration is kept, with its limits), and adds an **Orchestration** section to the project's `AGENTS.md` (and `CLAUDE.md`, when there is one) with the project facts the skills read: where product intent lives, the work plan, the commands for each validation tier, the progress log, the coordinator registry/queue and completion signals, branch and merge rules (including whether the agent may merge, push or deploy), the review build, the review interval and the session limits. Fill those in. Run it again any time to update; your filled-in facts are kept (a fact added to the harness since appears as its placeholder, to fill in), and other sections of `AGENTS.md` are left alone.

Options:

```sh
node tools/install.mjs <project> --for copilot,claude,agents   # choose the layouts
node tools/install.mjs <project> --for copilot --templates docs/work # keep existing templates
node tools/install.mjs <project> --for copilot --dry-run --json      # show the complete plan
node tools/install.mjs --global --for copilot,claude,agents     # for every project on this computer
```

Noninteractive commands must specify `--for`. In a terminal, the existing target
detection remains available. `claude-code` maps to `claude`; `codex` and `cursor`
map to `agents`. These are layout mappings, not claims of discovery testing.

### Installer contract (unreleased)

`--dry-run --json` returns one object with `status`, a complete `plan`, `written`,
`changed` and `next`. The plan declares file hashes, prior hashes, effects
(`writes-project-files`, `runs-hooks`) and no network use; it creates no files.
`--approve-plan <plan.digest>` refuses a changed plan. `--uninstall` reverses only
the files this kit recorded and never touches a file it did not record, such as a
later `CLAUDE.md` or a clock configuration that existed before installation. Where
a file also holds owner text or another kit's marked section, uninstall removes only
this kit's section. Use the same scope and template arguments.
Exit codes are 0 (done), 1 (error), 2 (decision needed).

Original bytes and owned directories are recorded in `.kit-state/agent-orchestration.json`.
Repeated installation is a no-op. Filled project facts, templates and existing
clock configuration (including owner-tuned limits) are preserved. Modified managed
files block update or uninstall, even with `--yes`; there is no force-overwrite
default. Resolve the edits or keep the installation. Untracked files are never
recursively removed. Traversal, links, hard links and malformed section markers
are rejected, and caught write failures roll back.

Distributors can pass `--logical-root <destination>` when planning in an isolated
copy: personal clock hooks then name the final destination rather than the copy.
This does not change where files are written. Preserve `.kit-stage-*` originals if
a recovery error names them; power-loss recovery is manual. Never edit the ownership
record to force removal, or loosen the clock as a workaround.

The dependency-free contract engine is vendored in each independently usable kit;
identical copies are checked by the distributor's tests, with no cross-kit runtime
dependency. `node --test test/install-contract.test.mjs` exercises this repository's
real installer in disposable project folders.

## Works across coding agents

| Tool | Skills | Reviewer agent | Instructions | When a capability is missing |
|---|---|---|---|---|
| GitHub Copilot (VS Code, CLI) | `.github/skills/` (global `~/.copilot/skills/`) | `.github/agents/throughput-reviewer.agent.md` | `AGENTS.md` | — (the session clock runs from `.github/hooks/`, global `~/.copilot/hooks/`) |
| Claude Code | `.claude/skills/` (global `~/.claude/skills/`) | `.claude/agents/throughput-reviewer.md` | `CLAUDE.md` or `AGENTS.md` | No session clock installed: the agent checks the time at each log line |
| Codex and other agents using the open skills layout | `.agents/skills/` (global `~/.agents/skills/`) | Not installed | `AGENTS.md` | The `progress-review` skill carries the reviewer's questions for an inline review; no session clock |

### Tool portability

This was learned in **VS Code agent sessions**: a chat running a tool did not read queued prompts or sub-chat messages until its turn ended, and hooks fired between turns. Long completion-file polls hid a successor's message and caused a duplicate writer. Other tools may behave differently; preserve availability and ownership rather than hard-coding that mechanism.

Check each tool or IDE:

- Can it run parallel conversations or agents?
- How do messages reach a busy conversation?
- Does it notify on completion?
- Where can the registry persist?
- What happens to input arriving mid-turn?
- Can a turn end with work still pending, without marking the task complete?

Without messaging, workers write completion records and the coordinator checks them at the start of each turn. In a **single-threaded tool**, keep turns short, keep the queue in a file, check status first and ask the owner to re-prompt. Explicitly separate a bounded worker turn when necessary; long checks go to an external worker or the owner, not a blocking coordinator turn. Don't promise concurrent input handling or automatic wake-up when unavailable. `orchestrate` gives the remaining fallbacks for clocks, hooks, review builds and session memory.

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
