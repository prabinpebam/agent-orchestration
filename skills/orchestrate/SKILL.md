---
name: orchestrate
description: Use at the start of any multi-step task, when triaging new prompts against running workers and queued work, and always when the owner is away or says "unattended". The entry point to agent-orchestration - keeps the main chat free for triage only, separates coordinator and worker roles, triages every owner prompt into the plan, runs independent items as parallel tracks, picks an execution mode, sets bounds, runs the plan-act-check-record-review loop under the mandatory session clock, and routes to modes, stage validation, progress reviews and coordination.
---

# Orchestrate: run the work, watch it, adapt

How an agent carries out work: which mode, which checks, how progress is recorded and reviewed, and when to change course. It doesn't decide what's worth building. It takes that from the project's product intent when there is some, and from the task when there isn't.

## The measure

**Useful, validated outcomes per unit of time.** Not tasks completed, not checklists ticked, not foundations laid before anything needs them. The owner's time and attention are the constraint: never make them wait on checks a change doesn't need, and never make them catch basic mistakes.

## Keep the main chat free

The **main chat** is where the owner talks to the agent. It's used only for triage; everything else is delegated. **If the main chat isn't ready for the owner's next input, that's a failure**, however well the rest is going.

Three roles:

- **Main chat:** reads each owner prompt and live state, triages it (below), routes it and ends its turn with a one- to three-line reply.
- **Coordinator:** owns the registry/queue and its dependency map, launches, steers and stops workers, verifies their deliveries and keeps the records (`coordinate`). For short work the main chat can be the coordinator too. For long-running or multi-track work, the coordinator runs in its own chat: **main chat (triage only) → one delivery coordinator → bounded workers.**
- **Workers** do implementation, builds, test suites and long commands in bounded sessions.

The rules:

- **Short turns.** The coordinator never does implementation, builds, test suites or long commands itself, and neither does the main chat. No sleeps, polling loops, blocking waits or watchers that hold its turn open, even when called "background". End each turn after routing and recording, so the next owner prompt or worker message can be read.
- **The failure to avoid.** In long-running work the agent starts implementing in the main chat itself. Messages from other chats then queue behind its turn and get stuck, and the owner can't steer. When you notice it, stop at a safe point, hand the work to a worker, and return to triage.
- **Live state first.** At the start of every turn, read unread messages and completion records, the live worker list and the durable registry/queue (`coordinate`). Reconcile them before acting on a new prompt or creating any worker or continuation.
- **One writer per working copy, always.** Steer its worker or queue a follow-up; independent writers need isolated working copies and branches. A branch name alone does not isolate a shared folder.
- **Event-driven completion.** Workers report by message, a completion record, or both. Read reports at turn boundaries, never wait for them in a loop. The coordinator owns verification: a cheap delivery check reads evidence, and a build or test needed to verify it goes to a worker. With a delivery coordinator, the main chat doesn't re-verify routine deliveries or run watchers.
- **A quiet main chat.** Sub-chats message the main chat only for a decision only the owner can make, something new ready to try, or a safety blocker: at most 3 plain lines, no IDs or jargon. Routine acknowledgements, milestones, dispatch notes and transfer notices go to the coordinator and the records. The main chat doesn't acknowledge stale or routine notes, and ignores messages from a retired coordinator (`coordinate`).
- **One coordinator at a time.** The main chat routes new owner direction to the current coordinator, found from the registry. It never creates a second coordinator.
- **Yielding is not finishing.** Ending a coordinator turn returns control to the owner; it doesn't complete the owner's task. While dispatched or queued work remains, never call a task-completion action or report done just to silence automated keep-working reminders. Answer each reminder in one line: what's running and how it will report. If the host can't idle with work pending, state that limitation and use its supported continuation; don't promise behavior it lacks.
- **The role survives the session.** The coordinator has the same clock limits as workers. At its limit, transfer the registry to one fresh coordinator, which adopts running workers and keeps orchestrating. Don't wait for workers to finish, recreate them, or reset their clocks.

These are role boundaries, not an instruction for every worker to spawn more workers. A bounded worker carries out its own assignment.

## Triage every owner prompt

Each new input is weighed against the work that's running and queued, and the plan changes to include it. For every owner prompt:

1. **Read live state:** unread messages, completion records, the registry/queue and the live workers.
2. **Classify the input:** a new item, a change of direction for a running item, a priority change, a rule change, or a question.
3. **Find the affected tracks:** the running and queued items it touches, and what depends on them.
4. **Steer, queue or launch** (`coordinate` has the table): steer the owner of a running item it changes; queue what depends on running work, with its trigger; launch what's independent, in parallel (below). A rule change reaches every live coordinator and worker it affects, and the records. A question is answered from the records or the reference products (rule 4 below).
5. **Update the execution plan:** the work plan and the registry show the new direction, order and dependencies.
6. **Reply and end the turn,** in one to three plain lines: what changed and where it's running.

With a delivery coordinator, the main chat reads state, classifies and routes the prompt to the current coordinator in one message (steps 1, 2 and 6); the coordinator does steps 3 to 5.

## Parallel tracks

Items that don't depend on each other don't wait in one queue. Running them as separate tracks is faster, and keeps the code modular: each piece is built and checked on its own, then integrated deliberately. Whenever triage or a review finds independent items, orchestrate them in parallel.

- **Dispatch every ready item.** The coordinator keeps a dependency map in the registry/queue (`coordinate`); every item whose prerequisites are met is dispatched, not just the next in line.
- **Isolate each track:** its own working copy and branch (for example a git worktree), its own worker and its own completion record.
- **Prove it on its own first.** When a piece's architecture or approach is uncertain, build it as an independent proof of concept and validate it in isolation before it touches the main app.
- **Integrate one at a time.** Tracks land serially, and the checks run again on the combined result. When two tracks touch the same files, the second to land is rebased onto the first and the combined result is validated (`stage-validation`).
- **Clean up safely.** Before deleting a worktree, remove any shared dependency folder in it (such as a `node_modules` junction or link into another copy) non-recursively, so the deletion can't reach the copy it points to.
- **Keep in sequence** what depends on another item's result, or what would rewrite the same code at the same time; parallel tracks need independence, not just urgency.

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
4. **Clock (required).** Before the first increment, confirm the session clock is running: its "Session clock on" notice is in the session's context, or `node .github/hooks/orchestration-clock.mjs status` shows this session. If it isn't, follow "The clock" below before doing any other work. Add "clock on" (or "clock by hand", for a tool without hooks) to the mode line.
5. **Review build.** Before the first increment, make sure the owner's review build is running (below): assign a worker to start it from the last validated commit if it isn't, check that it answers, and say where it is in the first status line. The project fact says how to start and refresh it; when there's none, assign its setup and propose the fact.

## The loop

Workers run the loop below. The coordinator dispatches increments, reads their evidence and routes the next work in short turns; it never stays busy waiting for the loop. Independent increments run as parallel tracks, each with its own loop.

```
plan the next increment → act → check (the smallest check that covers it) → record → refresh the review build → review about every 30 minutes → adapt
                                                                    → roll over to a new session at the session limit
```

- **Plan:** the next increment is the smallest piece that produces something usable or something learned. Write it in the work plan (`templates/work-plan.md` of this harness) with how it will be checked.
- **Act and check:** `stage-validation` says which checks fit the stage and the change.
- **Record:** a progress log line per meaningful step, and the evidence beside what it proves (`coordinate`).
- **Refresh:** when an increment is validated and committed, or a stage closes, bring the review build up to that commit (`stage-validation`), unless the owner is using it.
- **Review:** about every 30 minutes of running work, ask whether this is still the fastest path to validated progress (`progress-review`).
- **Adapt:** keep course, adjust, or change course: switch mode, cut scope, try another approach, or park the item and take the next most valuable one.
- **Roll over:** a long session gets slow and forgetful, for the agent and for the editor showing it. At the session limit (by default 90 minutes, 300 tool calls or 2 context compactions, whichever comes first), hand over to a new session at the next safe point (`coordinate`).

## The clock: required, scheduled, not remembered

**Using this kit means running the session clock.** It isn't optional, and no mode, deadline or instruction to keep going turns it off. Reviews and roll-overs are the steps most easily forgotten in a long run, so they never depend on the agent remembering.

Where the tool runs hooks, the installer adds the **session clock** (`tools/clock.mjs`; for GitHub Copilot `.github/hooks/orchestration-clock.json`). It counts each session's minutes, tool calls and compactions, and adds a reminder after the next tool result when a review is due or the session should roll over. The reminder repeats every 5 minutes until the step is done. At the end of a turn with a roll-over due, it asks for one more turn to do it. The limits are in the hook configuration (`AO_REVIEW_MIN`, `AO_ROLLOVER_MIN`, `AO_ROLLOVER_TOOLS`, `AO_ROLLOVER_COMPACTIONS`), and `node .github/hooks/orchestration-clock.mjs status` shows the clock.

What's mandatory:

- **Its reminders are instructions.** When one says a review is due, run the review before the next increment. When one says roll over, finish the current step, check it, then roll over (`coordinate`). Never start another increment first. When the clock asks for one more turn, use that turn to roll over; don't just end it again.
- **Never weaken it.** Don't delete or edit the hooks, raise a limit or set one to 0 (which turns it off) to get more done. Only the owner changes the limits, and the change goes in the project facts in `AGENTS.md`.
- **Missing or broken means fix it first.** No "Session clock on" notice, or a `status` that doesn't show this session, in a tool that has hooks: run the kit's installer (`node <kit>/tools/install.mjs`), or tell the owner in one line that the hooks aren't loading. Then be the clock by hand until it's back.
- **Without hooks, be the clock by hand.** At every progress log line, compare the time with the last review line and with the session's first line, count the compactions you've seen, and act as soon as any limit is reached. Same limits, same obligations.
- **Every role keeps its clock.** Launching a worker is not a roll-over. After transferring ownership to a recorded successor (or giving the owner the resume prompt), explicitly run `node .github/hooks/orchestration-clock.mjs mark rollover`. When clocks share a folder, use `--session <id>` with `status` and `mark` to target your own clock; without a reliable session ID, report the limitation and keep time by hand. Never mark another session's clock.
- **A skipped or late review or roll-over is a finding.** The next review reports it (`progress-review`, question 9).

## The review build: always ready to try

The owner reviews when they choose, not when the agent stops. So a **review build** is always built, running and ready: a local site, or a stable build of the app, that they can open at any moment to try the work, give early input and change course. It's isolated from development, so trying it never disturbs the work and the work never breaks it.

- **Validated commits only.** It shows the last commit whose checks passed. Never the working copy, never uncommitted or failing work, never the dev server with hot reload.
- **Isolated.** Its own checkout (for example a separate git worktree, detached at the validated commit), its own build output, its own port or user-data folder, and its own demo or temporary data. Never the files being edited, never the owner's real data, accounts or remotes.
- **Always running.** Start it at the start of work and keep it running across increments and sessions. Check that it answers (the page loads, the process is alive and shows its window or responds) after every start and refresh.
- **Refreshed at each validated increment or stage close,** without taking the owner's focus: build in the review checkout, and swap only when it's ready. If the owner may be using it, don't restart it without their agreement: ask in one line, or start the new one beside it (another port or data folder) and say so.
- **Named everywhere.** Every status report and handoff says where it is, which commit it shows, and how to open and refresh it (`coordinate`).

Without a tool that can keep a process running, build the review checkout and give the owner the one command that starts it; without git worktrees, use a second clone or a copy of the build output at the validated commit.

## Which skill, when

| You're about to… | Load |
|---|---|
| Choose or switch a mode; decide what to produce first and what to defer | `execution-modes` |
| Decide which checks to run or what evidence a stage needs; run a build-check-fix loop; merge | `stage-validation` |
| Refresh the review build after a validated increment or a stage close | `stage-validation` |
| Pause after about 30 minutes of work, finish an interval, or notice progress stalling | `progress-review` |
| Triage prompts, maintain the registry/queue and its dependency map, route messages, delegate, report, review, hand over or roll over | `coordinate` |
| Integrate parallel tracks or a proof of concept, and check the combined result | `stage-validation` |

## Rules that hold everywhere

1. **Validated outcomes, not activity.** Each increment ends in something the owner can use, or something learned that changes a decision.
2. **No premature foundations.** Build infrastructure, abstractions and hardening when the current goal needs them, not before the direction is validated.
3. **Smallest check that covers the change.** Scope checks to what the change can affect; escalate for stated reasons.
4. **Decide, don't ask, when you can.** Ask only what can't be decided from context. Settle how something should behave from the project's declared **reference products** (a project fact; for example "the current Figma behaviour first, then Microsoft Word's") or its prior decisions: check their current official docs or the product itself, and record the source beside the decision. Ask the owner only for decisions that are theirs: irreversible actions, licences, publishing, real accounts, deleting their data. Otherwise choose the most reasonable option, write the assumption down, and keep going.
5. **Evidence or it didn't happen.** Report what was checked and how, and say what wasn't.
6. **Durable records.** Anything another session or agent needs is written down: the work plan, the progress log, the handoff. Memory doesn't survive.
7. **Never take the owner's focus or data.** No focus-stealing windows, no restarting their running app or server without asking, no tests against their real data, accounts or remotes.
8. **Escalate the irreversible.** Anything destructive, public, costly or outside the bounds waits for the owner, with the options laid out, while other work continues.
9. **Short sessions.** Hand over to a new session at the session limit rather than letting one run until it slows down; the records carry the work across, so nothing is lost.
10. **The clock is mandatory.** Every session runs with the session clock, or keeps time by hand where the tool has no hooks. Act on every reminder, and never weaken the clock to keep working.
11. **The owner can always try it.** A review build at the last validated commit is running and isolated from development, and every report says where it is.
12. **Keep the main chat free.** It triages: read live state, route work, update the plan and end the turn. Coordinators route and verify, workers execute; the main chat never blocks on them, and hears from them only for owner decisions, something to try, or safety.
13. **Parallel when independent.** Every ready item is dispatched to its own isolated track; tracks are integrated one at a time and checked again together.

## When tools differ

This rule was learned in **VS Code agent sessions**: a chat running a tool did not process queued owner prompts or sub-chat messages until its turn ended, and hooks fired between turns. Long completion-file polls hid a successor's message and led to a duplicate writer. Hooks could not rescue the busy turn.

Later sessions added more: coordinators and workers sent the main chat routine acknowledgements, milestones, dispatch and transfer notes in dense jargon until the owner said it was clogged; the main chat re-verified every delivery and ran watchers, which kept its turns busy; and a coordinator asked the owner how a behaviour should work when the reference products already answered it. What worked was the layered setup (main chat for triage only, one delivery coordinator, bounded workers), the quiet main chat, and independent items run as parallel tracks in their own worktrees.

Other tools and versions may behave differently. The principle is portable: keep the owner-facing conversation available, with durable ownership and no blocking waits. Establish the tool's mechanism rather than assuming live input can interrupt a running turn:

- Can it run parallel conversations or agents?
- How do messages reach a busy conversation?
- Does it notify on completion?
- Where can the registry persist so a successor can read it?
- What happens to input that arrives mid-turn?
- Can a turn end with work still pending, without marking the task complete?

**Single-threaded fallback:** keep turns short, keep the queue in a file, check status and completion records at the start of each turn, and ask the owner to re-prompt to resume queued work. If execution must share the chat, explicitly separate a bounded worker turn from coordinator triage and return to triage before another step. Put long checks in an external worker or give the owner the command; never simulate availability with sleeps or polling. Say plainly that concurrent input handling is unavailable; don't promise automatic wake-up where the tool has none.

Use what's there; fall back when it isn't:

| Capability | When it's missing |
|---|---|
| Sub-agents or custom agents | Use a separate worker conversation when possible; otherwise use the single-threaded fallback above |
| Worker messaging or completion notifications | Workers write completion records; the coordinator checks them at the start of each turn and asks the owner to re-prompt if nothing can wake it |
| A clock or timer | Read the time at each step boundary (the shell's date command) and from the log's timestamps |
| Hooks (the session clock) | Still required: keep time by hand. At every log line, compare the time with the last review and the session's start, and act on any limit that's been reached |
| Starting a new session | Write the handoff, give the owner the one line to start the next session with, and stop |
| Background commands | A worker runs long checks, not the coordinator; without workers, give the owner the command and return to triage |
| Git worktrees | Keep the review build in a second clone, or a copy of the build output, at the validated commit |
| Memory between sessions | The work plan, progress log, handoff and registry/queue are the memory; read them first |
| Writing outside the workspace | Keep the progress log in an ignored folder inside it (`.agent-orchestration/`, listed in `.gitignore`), and record that path as the project fact |
| Permission to push or deploy | Stop at "validated and ready", and put the exact owner action in the handoff |
| Skill loading | Follow the summary in `AGENTS.md` and read the skill files directly |

## Project facts

The installer adds an **Orchestration** section to the project's `AGENTS.md` with the facts these skills read: where product intent lives, the reference products that settle how something should behave, the commands for each validation tier, the progress log's path, the work plan, the coordinator registry/queue and completion signals, branch and merge rules and what the agent may merge, push or deploy, what must never break, the review build (how to start and refresh it, and where it is), the review interval and the session limits. Each is optional; a skill proposes one when it's missing.
