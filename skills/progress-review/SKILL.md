---
name: progress-review
description: Use about every 30 minutes of running work, at the end of each work interval, and whenever progress stalls (the same failure twice, no new evidence, scope growing, the owner waiting). Checks whether the work is producing useful, validated progress, finds waste, and decides to keep course, adjust or change course - switching mode, cutting scope or trying another approach.
---

# Progress review: keep course, adjust, or change course

About every 30 minutes of running work, stop briefly and ask whether this is still the fastest path to something the owner can use. The interval is a project fact; 30 minutes is the default. Review at the end of every work interval too, and at once when a stall signal appears.

## How

- **With sub-agents or custom agents:** run the `throughput-reviewer` agent (in this harness's `agents/`) and act on its top finding.
- **Without them:** answer the questions below yourself, as a separate pass, from the evidence (the progress log, the commits, what's running and for how long), not from memory.
- Either way, write the verdict as one progress log line. Read the registry/queue, unread messages and live worker list as evidence. A coordinator dispatches a longer review and ends its turn; it never waits on the reviewer in a loop.
- **Scheduled and required:** the session clock (`orchestrate`) says when a review is due and keeps saying so until one is done. A due review comes before the next increment, never after it. Running the `throughput-reviewer` agent or loading this skill counts as the review; a review done some other way is marked with `node .github/hooks/orchestration-clock.mjs mark review`. Where the tool has no hooks, keep time by hand on the same schedule.

## The questions

Answer each with evidence:

1. **Constraint:** what limits progress now? Is the work serving it?
2. **Mode:** is the goal mode still the most valuable one? Working with the owner, are they getting something they can see within about 15 minutes? Unattended, is the most valuable item moving, inside its bounds, with a handoff in view?
3. **Intervals:** is anything past its interval, or holding unmerged work older than about an hour?
4. **Checks at the right moment:** is anything running checks this stage doesn't need (a full suite for a style fix, hardening a prototype), or skipping checks it does need (security, data integrity, the live deploy)?
5. **Quality on the first try:** did the owner have to point out something basic that checking before showing would have caught?
6. **Feedback latency:** what has the owner waited longest for, and why? Is the coordinator free to read new prompts, or stuck in implementation, long commands or a blocking wait? Have unread messages, the live worker list and the registry/queue been reconciled, with one writer per working copy and explicit triggers?
7. **Traced to intent:** does the work trace to the product intent or the stated goal, or has it drifted into something nobody asked for?
8. **Waste:** what was done since the last review that didn't move the plan or the owner's experience?
9. **Session cost:** how long has this session run, how many tool calls and context compactions has it had, and is the editor or the agent slowing down? Is the session clock running, and was every reminder acted on? Past the session limit, roll over to a new session at the next safe point (`coordinate`); a coordinator transfers its registry to one successor without restarting workers or resetting their clocks. A missing clock or an ignored reminder is the top finding.

## Stall signals

Review at once, without waiting for the interval, when:

- the same failure, or the same kind of fix, has come back twice;
- there's been no new evidence (a passing check, a result, something shown) for a whole interval;
- the scope has grown past the increment that was planned;
- the owner has been waiting on something longer than the mode promises;
- the coordinator is holding a turn open, messages are unread, or two workers claim the same working copy;
- you're about to do foundational work that no current goal needs;
- the session is past its limit, or the editor or the agent is visibly slowing down.

## Changing course

| Finding | Change |
|---|---|
| The same approach failed twice | Try a different approach, not a third attempt at the same one; or prove the risky part on its own first |
| The goal's end condition is met | Switch goal mode, and log why |
| The increment keeps growing | Cut it to the smallest piece that still produces something usable, and queue the rest |
| Blocked on something only the owner can provide | Record it with options and a recommendation, and move to the next unblocked item |
| Checks don't match the stage | Drop what the stage doesn't need, or add what it does, and say so |
| The coordinator is blocked or ownership conflicts | Stop the blocking wait, read pending messages and live state, resolve duplicate writers, update the registry and end the turn |
| Drifted from the intent | Stop, return to the last traced item, and note what was set aside |
| The session is past its limit, or slowing down | Roll over to a new session at the next safe point (`coordinate`) |

The output is a verdict (keep course, adjust, or change course), the top three changes ranked by expected gain in validated progress per unit of time, each with a concrete action, and one line for the progress log.
