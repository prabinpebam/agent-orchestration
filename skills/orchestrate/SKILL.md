---
name: orchestrate
description: Use before every tool call and reply in any multi-step task, at the start of work, when the owner gives new direction, and when the owner is away. The entry point to agent-orchestration - the mandatory pre-action checklist, the roles (the owner's main chat, one coordinator, bounded workers), the mode ladder (strict design, show me the UX sooner, prove the risky assumption, make this production-ready), the hooks that enforce them (the mandatory session clock and the guard), the loop, and which skill to use next.
---

# Orchestrate

The measure is **useful, validated outcomes the owner can see, per unit of their time**. Each rule lives in one place; the hard ones are here.

## Pre-action checklist (MANDATORY)

Before every tool call and every reply, answer each question. A "yes" means stop and take the fix.

1. **Role.** Am I the main chat about to run a shell, build, test, subagent, poll or wait, or a coordinator about to build, test or wait? → Delegate it to a worker chat.
2. **Mode.** Is the next check more than the [mode](../execution-modes/SKILL.md#the-ladder) allows: any test before the owner approved the design, or the full suite outside production-ready? → Don't run it.
3. **Completion.** Am I about to say "done" or "completed", or call a completion tool, while something I dispatched isn't verified where the owner can see it? → Say "In progress:" with what's running, who has it and when the owner will see it.
4. **Docs.** Has the owner given a requirement, attachment or reference that isn't in the project's documentation system yet, or am I closing an increment without updating it? → Write it down first, in the same commit as the work.
5. **Owner reports.** Is this message for the owner going anywhere but their main chat, or is it not a decision, something to try or a safety blocker, or does it hold IDs or code? → Don't send it, or rewrite it as at most 3 plain lines.
6. **Ownership.** Is the chat I'm routing to stale (no action in 30 minutes, no acknowledgement), or does another writer own this working copy? → Find the live owner in the registry, or start a fresh one; one writer per working copy.
7. **Ready to try.** Am I saying "ready" without having opened that review build myself and reached the change through the normal UI? → Open it first.

## Roles

| Role | Does | Never |
| --- | --- | --- |
| Main chat | Talks to the owner: triages each prompt, routes it, reports back. Always ready for the next prompt. | Runs commands, builds, tests, subagents, polls, waits or launches. Rolls over. |
| Coordinator (one) | Keeps the registry and dependency map, writes briefs, dispatches every ready item, verifies and integrates. Short turns. | Implements, builds, tests or waits in a turn. Rolls over except at its context limits. |
| Worker | One bounded item in its own working copy: build, check, docs, commit, handoff. | Widens scope, writes to another's working copy, messages the owner except as in check 5. |

**Triage, for every owner prompt:** read live state (unread messages, the registry, live chats) → classify it (new item, change of direction, priority, rule change, question) → route it to the current coordinator, or start one if there's none or it's stale → reply in 1 to 3 lines that answer the prompt: what changed, who has it, when the owner will see something. Delegate in separate chats, never in-turn subagents or waits; without parallel chats, keep a file queue and short turns. The coordinator's mechanics are in [`coordinate`](../coordinate/SKILL.md).

## Modes

Work moves up [the ladder](../execution-modes/SKILL.md#the-ladder): **strict design** (screens only, until the owner approves the design) → **show me the UX sooner** (the working feature, unhardened) → **make this production-ready**. **Prove the risky assumption** is a spike beside it. Attention is **work with me** or **keep going unattended**. Name the mode in every brief, and tell the guard: `node .github/hooks/orchestration-clock.mjs mark mode design|ux-sooner|assumption|production-ready`, or write it in `.agent-orchestration/mode` in the working copy.

## Hooks (MANDATORY)

With the installed Copilot hooks:

- **The guard** (`orchestration-guard.json`, before each tool call) denies shell, subagent, poll and wait tools in a session marked `main`; denies builds, tests and waits in one marked `coordinator`; and denies tests, end-to-end runs, benchmarks and CI waits in the modes `design` and `ux-sooner`.
- **The clock** (`orchestration-clock.json`) counts active time only, asks for a progress review every 30 active minutes, and asks for a roll-over at its limits.

Mark the role once, first thing: `node .github/hooks/orchestration-clock.mjs mark role main|coordinator|worker`. Never disable a hook, loosen its limits or change a role or mode to get past a denial; only the owner does. Without hooks, this checklist is the guard and you keep the time by hand.

## The loop

1. **Pick.** The owner's queue first, then every ready item in the work plan, in parallel where they don't share files.
2. **Brief.** Goal, mode, done when, bounds (time, files, working copy), where its docs go, what it may decide.
3. **Build** the smallest slice the owner can see. When the owner approves a prototype, the next slice wires it into the main app.
4. **Record.** Requirements, decisions and changed behaviour go into the project's documentation system in the same commit.
5. **Check** what the mode allows and the change's risk needs ([`stage-validation`](../stage-validation/SKILL.md)); fix; commit.
6. **Show.** Refresh the review build, open it, then report: something to try, a decision, or a blocker.
7. **Log** one line ([format](../coordinate/SKILL.md#records)).

## The clock

- **Reviews:** every 30 active minutes, and when progress stalls, run [`progress-review`](../progress-review/SKILL.md) or the `throughput-reviewer` agent, act on the top finding, log the verdict.
- **Roll-overs:** idle time never counts. **The main chat never rolls over.** A coordinator rolls over only at its context limits (tool calls or compactions), and prefers staying one long-lived coordinator. Nobody rolls over while the owner is steering: finish the exchange first. Steps in [`coordinate`](../coordinate/SKILL.md#rolling-over).
- **Host reminders** ("keep working"): when dispatched work is still running, answer once with one "In progress:" line; an identical repeat gets no new content. Never call the completion tool to silence one.

## Everywhere

- **Decide, don't ask.** Settle behaviour from the reference products or prior decisions and record the source. Ask the owner only about irreversible actions, licences, publishing, real accounts, private content or deleting their data.
- **Judgement over procedure.** Every gate names the risk it covers here, or it's skipped with one line. Do what the owner asks directly; their request beats a general rule.
- **Corrections stick.** When the owner corrects something, add the rule to the project's instructions in the same turn.
- **The owner's machine is theirs.** Never take their screen, mouse or focus; close every process and app you start.
- **Approved sources only** for packages and binaries.
- **No hangs.** A tool call silent for more than a few minutes is stopped, or moved to a worker.

## Which skill when

| Skill | When |
| --- | --- |
| `execution-modes` | Choosing or switching a mode; what each one allows. |
| `stage-validation` | Which checks to run, integrating tracks, merging, the review build, ready to show. |
| `progress-review` | Every 30 active minutes and when progress stalls. |
| `coordinate` | The registry, dispatch, messages, logs, handoffs and roll-overs. |

## Project facts

Read the project's paths, commands, limits and permissions from the Orchestration section of its `AGENTS.md`. A project rule there wins over a general rule here.
