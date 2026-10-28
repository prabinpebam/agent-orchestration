---
name: orchestrate
description: Use at the start of any multi-step task, when deciding how to carry out work, and always when the owner is away or says "unattended". The entry point to agent-orchestration - picks an execution mode (show me the UX sooner, prove the risky assumption, make this production-ready; work with me or keep going unattended), sets bounds, runs the plan-act-check-record-review loop, and routes to modes, stage validation, progress reviews and coordination.
---

# Orchestrate: run the work, watch it, adapt

How an agent carries out work: which mode, which checks, how progress is recorded and reviewed, and when to change course. It doesn't decide what's worth building. It takes that from the project's product intent when there is some, and from the task when there isn't.

## The measure

**Useful, validated outcomes per unit of time.** Not tasks completed, not checklists ticked, not foundations laid before anything needs them. The owner's time and attention are the constraint: never make them wait on checks a change doesn't need, and never make them catch basic mistakes.

## Start: intent, mode, bounds

1. **Intent.** When the project has product intent (a spec, user-can statements, Definitions of Done, a list of assumptions; where it lives is a project fact in `AGENTS.md`), work from it and cite its IDs (P1, U3, A2, 1.2). When it doesn't, write three lines in the work plan and start: **goal** (what's true when this is finished), **done when** (what can be observed), **limits** (what not to touch), and use the plan's own IDs (I1 increments, H1 hypotheses, W1 working defaults). Never stop a code task to ask for a formal spec.
2. **Mode.** Pick one goal and one attention level (`execution-modes`):

   | Goal | Pick it when |
   |---|---|
   | **Show me the UX sooner** | The concept or the experience isn't validated yet, and seeing it would change decisions |
   | **Prove the risky assumption** | One unknown, product or technical, could sink the plan, and a small experiment can settle it |
   | **Make this production-ready** | The direction is validated, or the change is routine work in an established product |

   | Attention | Pick it when |
   |---|---|
   | **Work with me** | The owner wrote in the last 30 minutes, or is testing and giving feedback |
   | **Keep going unattended** | They said they're away or "unattended", or haven't written for 30 minutes |

   Say the mode in one line before starting ("Mode: show me the UX sooner, work with me"). The owner can change it with a word.
3. **Bounds.** Unattended work always has explicit bounds: time, scope, what never to touch, whether the agent may merge, push or deploy, and what to escalate. Use the owner's; propose them when there are none, and never assume publishing is allowed.

## The loop

```
plan the next increment → act → check (the smallest check that covers it) → record → review about every 30 minutes → adapt
                                                                    → roll over to a new session at the session limit
```

- **Plan:** the next increment is the smallest piece that produces something usable or something learned. Write it in the work plan (`templates/work-plan.md` of this harness) with how it will be checked.
- **Act and check:** `stage-validation` says which checks fit the stage and the change.
- **Record:** a progress log line per meaningful step, and the evidence beside what it proves (`coordinate`).
- **Review:** about every 30 minutes of running work, ask whether this is still the fastest path to validated progress (`progress-review`).
- **Adapt:** keep course, adjust, or change course: switch mode, cut scope, try another approach, or park the item and take the next most valuable one.
- **Roll over:** a long session gets slow and forgetful, for the agent and for the editor showing it. At the session limit (by default 90 minutes, 300 tool calls or 2 context compactions, whichever comes first), hand over to a new session at the next safe point (`coordinate`).

## The clock: scheduled, not remembered

Reviews and roll-overs are the steps most easily forgotten in a long run, so they shouldn't depend on the agent remembering. Where the tool runs hooks, the installer adds the **session clock** (`tools/clock.mjs`; for GitHub Copilot `.github/hooks/orchestration-clock.json`). It counts each session's minutes, tool calls and compactions, and puts a reminder after the next tool result when a review is due or the session should roll over, repeated every 5 minutes until it's done; at the end of a turn with a roll-over due it asks for one more turn to do it. Act on its reminders before starting the next increment. The limits are in the hook configuration (`AO_REVIEW_MIN`, `AO_ROLLOVER_MIN`, `AO_ROLLOVER_TOOLS`, `AO_ROLLOVER_COMPACTIONS`; 0 turns one off), and `node .github/hooks/orchestration-clock.mjs status` shows the clock.

Without hooks, be the clock: at every progress log line, compare the time with the last review line and with the session's first line, and act when either is past its limit.

## Which skill, when

| You're about to… | Load |
|---|---|
| Choose or switch a mode; decide what to produce first and what to defer | `execution-modes` |
| Decide which checks to run or what evidence a stage needs; run a build-check-fix loop; merge | `stage-validation` |
| Pause after about 30 minutes of work, finish an interval, or notice progress stalling | `progress-review` |
| Keep the progress log, report status, delegate, get an independent review, hand over, or roll over to a new session | `coordinate` |

## Rules that hold everywhere

1. **Validated outcomes, not activity.** Each increment ends in something the owner can use, or something learned that changes a decision.
2. **No premature foundations.** Build infrastructure, abstractions and hardening when the current goal needs them, not before the direction is validated.
3. **Smallest check that covers the change.** Scope checks to what the change can affect; escalate for stated reasons.
4. **Decide, don't ask, when you can.** Ask only what can't be decided from context. Otherwise choose the most reasonable option, write the assumption down, and keep going.
5. **Evidence or it didn't happen.** Report what was checked and how, and say what wasn't.
6. **Durable records.** Anything another session or agent needs is written down: the work plan, the progress log, the handoff. Memory doesn't survive.
7. **Never take the owner's focus or data.** No focus-stealing windows, no restarting their running app or server without asking, no tests against their real data, accounts or remotes.
8. **Escalate the irreversible.** Anything destructive, public, costly or outside the bounds waits for the owner, with the options laid out, while other work continues.
9. **Short sessions.** Hand over to a new session at the session limit rather than letting one run until it slows down; the records carry the work across, so nothing is lost.

## When tools differ

Coding agents and editors don't offer the same capabilities, and none is complete. Use what's there; fall back when it isn't:

| Capability | When it's missing |
|---|---|
| Sub-agents or custom agents | Do the review or exploration yourself, as a separate pass with the same questions |
| A clock or timer | Read the time at each step boundary (the shell's date command) and from the log's timestamps |
| Hooks (the session clock) | At every log line, compare the time with the last review and the session's start, and act on what's past its limit |
| Starting a new session | Write the handoff, give the owner the one line to start the next session with, and stop |
| Background commands | Run long checks at the end of an interval, not in the middle of an edit |
| Memory between sessions | The work plan, the progress log and the handoff are the memory; read them first |
| Writing outside the workspace | Keep the progress log in an ignored folder inside it (`.agent-orchestration/`, listed in `.gitignore`), and record that path as the project fact |
| Permission to push or deploy | Stop at "validated and ready", and put the exact owner action in the handoff |
| Skill loading | Follow the summary in `AGENTS.md` and read the skill files directly |

## Project facts

The installer adds an **Orchestration** section to the project's `AGENTS.md` with the facts these skills read: where product intent lives, the commands for each validation tier, the progress log's path, the work plan, branch and merge rules and what the agent may merge, push or deploy, what must never break, the review interval and the session limits. Each is optional; a skill proposes one when it's missing.
