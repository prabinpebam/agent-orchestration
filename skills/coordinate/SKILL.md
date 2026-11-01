---
name: coordinate
description: Use when keeping the coordinator registry and dependency map, dispatching ready items to workers, routing messages between chats, preventing duplicate writers, reporting to the owner, keeping the progress log, writing handoffs, or rolling a coordinator or worker over. Short event-driven coordinator turns, one long-lived coordinator, a quiet main chat, bounded workers and durable records.
---

# Coordinate

## Pre-action checklist (MANDATORY)

1. Am I about to build, test, wait or poll in this turn? → Dispatch it to a worker and end the turn.
2. Does another worker or a successor already own this item or working copy? → Route to it; never start a second writer.
3. Is the chat I'm routing to stale (no action in 30 minutes, no acknowledgement)? → Mark it stale in the registry and start a fresh one.
4. Am I about to tell the owner something that isn't a decision, something to try or a safety blocker? → Put it in the records instead.
5. Is a worker's "done" unverified (no commit seen, no build opened)? → It's "in progress" until verified.

## Records

| Record | Holds | Size |
| --- | --- | --- |
| Registry (one, owned by the coordinator) | One row per task, and the dependency map | Current rows only; archive closed ones |
| Work plan | What's next, in order, with triggers | The project's own |
| Progress log | One line per step | Append only |
| Handoff | What a successor needs to resume | One page |

Registry row: `| Task | Owner worker | Working copy | State | Trigger | Completion signal |`. The first lines name the current coordinator and the owner's main chat.

Log line: `2026-01-31 14:05 [mode · attention] <item>: <what happened, in words> (<commit or evidence>)`. More words than codes. Workers end with `done:` or `blocked:` and the checks they ran.

## The coordinator's turn

1. Read unread messages, completion records and live workers.
2. Update the registry: states, stale chats, the dependency map.
3. Verify each reported completion: the commit is on the remote, the review build shows it.
4. Dispatch every ready item, each with its own worker, working copy and brief ([the loop](../orchestrate/SKILL.md#the-loop)). Check for an existing owner first.
5. End the turn. No sleeps, polling loops or watchers; completions arrive as messages.

## Messages

- **To the owner's main chat only**, and only: a decision only the owner can make, something new ready to try, or a safety blocker. At most 3 plain lines, no IDs, codes or jargon.
- Everything else (acknowledgements, milestones, dispatch and transfer notes) goes to the coordinator and the records. Every brief and handoff carries this rule.
- New direction from the owner goes to the current coordinator named in the registry; never create a second one.

## Rolling over

- **The owner's main chat never rolls over.** Its conversation stays in one place; reports always go back to it.
- **One long-lived coordinator.** It hands over only at its context limits (tool calls or compactions), never on elapsed time alone, and never while the owner is steering. Handing over: write the handoff, transfer the registry to one fresh coordinator, record the new owner in the registry, then mark the roll-over. Workers keep running; their clocks aren't reset.
- **Workers** roll over at the next safe point: commit the verified work, write the handoff with where the review build is, log a line, start the successor with the same role, mode and bounds, then mark the roll-over.
- Before creating any successor, check for one already created. A worker launch is not a roll-over.

## Handoff

The goal and mode · what's done, with commits · what's running, with its owner · what's next · blockers and owner decisions pending · the review build and how to open it · the clock's state. Plain words, one page.
