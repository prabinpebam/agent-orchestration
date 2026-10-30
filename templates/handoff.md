# Handoff

Written at the end of every unattended stretch or session, and at every roll-over to a new session, so the owner (or the next agent) can act without asking anything.

```
Resume with: read this file, then <the registry/queue, unread messages, live workers, work plan and intent>; role <coordinator | worker>; mode <goal · attention>; bounds <…>; roll over again at the next session limit.

## Ownership and queue
- Registry/queue: <authoritative session-store location or ignored file accessible to the successor>
- Coordinator: <current ID>; successor: <exactly one ID, or not yet created>; ownership transfer: <pending | complete>; retired coordinators: <IDs; their messages are ignored>
- Unread messages and completion records: <where to read them; completion route>
- Messages to the main chat: only an owner decision, something new to try, or a safety blocker; at most 3 plain lines, no IDs or jargon. Everything else goes to the coordinator and the records.
- Clock: <session ID; last review; elapsed minutes, calls and compactions; unchanged limits>

| Task | Owner worker | Working copy | State | Trigger | Completion signal |
|---|---|---|---|---|---|
| <ID and objective> | <worker and continuation IDs> | <absolute path and branch> | <current state> | <task IDs it depends on and the event that releases it, or ready> | <route or record; task/attempt ID and evidence> |

Reconcile this snapshot with live state before dispatching. Adopt running workers; do not recreate them. Dispatch every ready item. One writer per working copy. Check pending messages and the live worker list before any continuation. The coordinator transfers its registry without waiting for workers; their clocks keep running. End the old coordinator turn, and explicitly mark its roll-over after transfer.

## Done (with evidence)
- <what a person can do now> — <tests, runs, commits>

## Review build
- <where it is: the address, or the app and how to open it> — shows <commit>; refresh with <command>; isolated from development (<its checkout, port or data folder>)

## In progress
- <what, how far, the branch>

## Waiting on you
- <decision / account / credential> — options: A (recommended) …, B …; working default in use: …

## Try first
1. <the one thing to open or run, and what you should see>

## Not checked
- <what was skipped deliberately, and why>

## Changes to the intent
- <assumptions proven or disproven, promises at risk, where the build differs from the spec>
```
