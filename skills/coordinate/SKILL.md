---
name: coordinate
description: Use when triaging owner prompts against live workers, maintaining the coordinator registry and queue, delegating, preventing duplicate writers, reporting status, keeping progress records, handing over or rolling over. Event-driven completion, short coordinator turns, bounded workers, durable handoffs and reports that say where the review build is.
---

# Coordinate: records, reviews, delegation and handoffs

Work that isn't written down can't be resumed, reviewed or trusted. Keep the records current as you go rather than reconstructing them at the end. The main conversation is the coordinator, not a worker (`orchestrate`).

## The records

| Record | What it holds | Where |
|---|---|---|
| **Work plan** | The intent (or its IDs), the mode and bounds, the increments in order with their checks and state, decisions taken as working defaults, shortcuts, found on the way | A project fact; start from `templates/work-plan.md` of this harness |
| **Progress log** | One timestamped line per meaningful step | Outside the repository, so it never lands in a commit (a project fact). When the agent can't write outside the workspace: an ignored folder inside it, such as `.agent-orchestration/`, listed in `.gitignore`, recorded as the fact |
| **Handoff** | What's done with evidence, what's in progress, what waits on the owner, what to try first, what wasn't checked | At the end of every unattended stretch or session; from `templates/handoff.md` |
| **Registry/queue** | Each task's owner worker, working copy, state, trigger and completion signal; the current coordinator and its successor | The session's own durable store, accessible to a successor, or an ignored file; record the location as a project fact and in the handoff |

Read all four before starting work in a new session. They are the memory. Keep one authoritative registry, not competing copies in plans and chats.

## Every coordinator turn

First read **unread messages and completion records, the live worker list, and the registry/queue**. Reconcile ownership and state, including any successor already created, before routing every new owner prompt:

| Prompt | Action |
|---|---|
| Same area as a running writer | Steer that worker, or queue a follow-up for it |
| Independent of running work | Start a parallel worker in an isolated worktree or other working copy, with its own branch |
| Depends on running work | Queue it with an explicit trigger, such as a named task's validated commit |
| Correction | Steer or stop the worker; wait for its stop acknowledgement by event before reassigning its working copy |

**One writer per working copy, always.** Before creating any worker or continuation, check pending messages and the live worker list again if state may have changed. Record a launch as pending before dispatch, then record its worker ID. An uncertain launch or missing reply is not permission to retry: reconcile it first. If duplicates exist, steer or stop the extra worker and record the sole owner before more writes.

Each registry row has:

| Task | Owner worker | Working copy | State | Trigger | Completion signal |
|---|---|---|---|---|---|
| <stable task ID and bounded objective> | <worker ID; predecessor/successor when handed over> | <absolute path and branch> | <queued, launching, running, stopping, blocked, done> | <exact prerequisite or "ready"> | <message route and/or record path, task/attempt ID, evidence required> |

Workers report completion or a blocker by **message, a completion record, or both**, with task/attempt ID, state, commit or artifact, checks and limitations. Only the coordinator updates its registry; workers own their completion records. Match a report to the current owner/attempt before marking done or releasing dependent work; a stale or duplicate report cannot release the queue twice.

The coordinator reads reports at the start of each turn, verifies deliveries cheaply, updates the queue and ends the turn. **Never wait in a loop**, sleep, poll or run a watcher to hold the conversation open. If messaging is absent, workers write records and the coordinator checks them at the start of each turn. If nothing can wake the coordinator, ask the owner to re-prompt; use `orchestrate`'s single-threaded fallback rather than pretending the chat remains responsive during long work.

**Ending a turn is not completion.** The owner's task is done only when every dispatched part has verified evidence. While workers or queued items remain, never call a task-completion action, or claim done, to silence automated keep-working reminders; report the running work and its completion route instead. Where the host can't idle with work pending, state that limitation and use its supported continuation.

### Progress log lines

`YYYY-MM-DD HH:MM [goal · attention] <item>: <what happened>; <evidence>; <next>`

Goal tags: `ux-sooner`, `prove-assumption`, `production-ready`. Attention tags: `with-me`, `unattended`. Items are the work plan's IDs (I1 increments, H1 hypotheses, W1 working defaults), with the product IDs they serve in brackets when there's product intent.

```
2026-01-31 14:05 [production-ready · unattended] I3 (3.2) setup flow: builds; unit 42 pass, e2e "first run" 3/3; merging
2026-01-31 14:30 [production-ready · unattended] review: adjust; full suite queued twice for copy fixes, back to tier 1
```

### Status

The work plan ends with a status table, one row per increment: state (not started, in progress, done, blocked) and the evidence in a sentence or two: the commands run, the counts, the run IDs, what was skipped and why. Under it, one line for the review build: where it is and the commit it shows.

## Reporting

Lead with what a person can do now that they couldn't before, then the evidence, then what's blocked and on whom, then what's next. Say what wasn't checked. Name the review build in every status report: where it is (the address, or the app and how to open it), which commit it shows, and whether it's current. Keep it short enough to read in a minute.

## Delegation

- **Coordinator:** dispatch implementation, builds, test suites and long commands to bounded workers. Do only short routing, record-keeping and evidence checks yourself; do not redo worker execution.
- Give each worker an objective, scope and stop condition, working copy, mode and bounds, completion signal and exactly what to return. Run independent work in parallel, then end the coordinator turn.
- **Worker:** carry out the assignment directly. Subdivide only work needing substantial separate context; never delegate a single continuous trace just to create more workers. Any additional writer needs the coordinator's ownership assignment.
- Without parallel conversations, use the short-turn fallback in `orchestrate`; a coordinator never hides a blocking wait behind a "background" label.

## Independent review

Before merging something risky (shared infrastructure, security, data, anything hard to undo), get an independent review of the diff against the hard requirements and the done-when lines: a reviewer sub-agent where the tool has one, otherwise a fresh pass that reads only the diff and the requirements. Fix what it finds, with tests.

## The handoff

End every unattended stretch with a handoff another person or agent can act on without asking anything:

- **Done:** what a person can do now, with the evidence (tests, runs, commits).
- **Review build:** where it is, the commit it shows, how to open it and how to refresh it, so the owner can try the work straight away and the next session keeps it running.
- **In progress:** what, how far, which branch.
- **Coordinator state:** the authoritative registry/queue location, unread message and completion-record locations, live worker IDs and working copies, queued triggers, and the one recorded successor. A new coordinator adopts them; it does not recreate workers.
- **Waiting on you:** each decision, account or credential, with the options, a recommendation, and the working default in use; and each merge, push or release that's ready but outside the agent's bounds, with the exact command and what to watch.
- **Try first:** the one thing to open or run, and what they should see.
- **Not checked:** what was skipped deliberately, and why.
- **Changes to the intent:** assumptions proven or disproven, promises at risk, differences between what was built and what was specified, for whoever owns the product intent.

## Rolling over to a new session

A session that runs for hours slows down (the editor holds the whole conversation) and forgets (each compaction loses detail). Hand over to a new session instead of letting it run on.

**When:** at the session limit, by default 90 minutes, 300 tool calls or 2 context compactions, whichever comes first (a project fact); whenever the session clock says so, which is mandatory (`orchestrate`); or sooner, when the editor or the agent is slowing down. Workers roll over once their current step is checked, never mid-edit or with their check still running. The coordinator rolls over at a routing boundary, without waiting for workers or stopping their work. Never start another increment first.

**Coordinator handover:** reconcile unread messages, completion records and the live worker list first. Write the registry location, queue, routing and bounds in the handoff. Check for an existing successor before creating exactly one fresh coordinator, record its ID and transfer registry ownership, then end the old coordinator's turn. The successor reads live state before dispatching and keeps orchestrating the existing workers. Worker clocks and limits are unchanged; no mass restarts, duplicate workers or blocking acknowledgement loops.

**Worker handover:**

1. Commit the verified work, within the bounds. Work that isn't verified goes in the handoff as in progress, never committed as done. Refresh the review build to the last validated commit, and leave it running for the next session.
2. Write the handoff (`templates/handoff.md`), starting with the line to resume with, and saying where the review build is.
3. Add a log line: `rollover: <why>; handoff written; <commit>`.
4. Arrange exactly one continuation with the coordinator: check pending messages and the live worker list before either creates it. Start it with a short first prompt: read the handoff and resume, with the same mode, bounds and completion route, and roll over again at the next limit. Record the successor and send its ID to the coordinator. If creation is uncertain, reconcile instead of launching again.
5. Stop writing in the old session before the successor writes. One writer per working copy, not one session per project; independent workers can continue in isolated copies.

**Both roles:** after ownership is handed over, explicitly mark the old clock's roll-over with `node .github/hooks/orchestration-clock.mjs mark rollover` (`--session <id>` when clocks share a folder). Launching a worker or continuation does not by itself mark a roll-over. Without a session tool, write the handoff, give the owner the resume prompt, mark the old clock and stop; never loosen the limits to stay alive.
