---
name: coordinate
description: Use when keeping a progress log, reporting status, writing a handoff at the end of a work stretch, rolling over to a new session, delegating to sub-agents, or getting an independent review before a risky merge. Durable progress records, status tables, handoffs another session can resume from, bounded delegation, and reports that lead with what a person can do now.
---

# Coordinate: records, reviews, delegation and handoffs

Work that isn't written down can't be resumed, reviewed or trusted. Keep three records, and keep them current as you go rather than reconstructing them at the end.

## The three records

| Record | What it holds | Where |
|---|---|---|
| **Work plan** | The intent (or its IDs), the mode and bounds, the increments in order with their checks and state, decisions taken as working defaults, shortcuts, found on the way | A project fact; start from `templates/work-plan.md` of this harness |
| **Progress log** | One timestamped line per meaningful step | Outside the repository, so it never lands in a commit (a project fact). When the agent can't write outside the workspace: an ignored folder inside it, such as `.agent-orchestration/`, listed in `.gitignore`, recorded as the fact |
| **Handoff** | What's done with evidence, what's in progress, what waits on the owner, what to try first, what wasn't checked | At the end of every unattended stretch or session; from `templates/handoff.md` |

Read all three before starting work in a new session. They are the memory.

### Progress log lines

`YYYY-MM-DD HH:MM [goal · attention] <item>: <what happened>; <evidence>; <next>`

Goal tags: `ux-sooner`, `prove-assumption`, `production-ready`. Attention tags: `with-me`, `unattended`. Items are the work plan's IDs (I1 increments, H1 hypotheses, W1 working defaults), with the product IDs they serve in brackets when there's product intent.

```
2026-01-31 14:05 [production-ready · unattended] I3 (3.2) setup flow: builds; unit 42 pass, e2e "first run" 3/3; merging
2026-01-31 14:30 [production-ready · unattended] review: adjust; full suite queued twice for copy fixes, back to tier 1
```

### Status

The work plan ends with a status table, one row per increment: state (not started, in progress, done, blocked) and the evidence in a sentence or two: the commands run, the counts, the run IDs, what was skipped and why.

## Reporting

Lead with what a person can do now that they couldn't before, then the evidence, then what's blocked and on whom, then what's next. Say what wasn't checked. Keep it short enough to read in a minute.

## Delegation

- Delegate only work that needs its own context: a broad exploration, an independent review, a long command whose output only matters if it fails, research with sources.
- Give a sub-agent a bounded objective, the context it needs, and exactly what to return. Don't redo its work. Run independent ones in parallel and keep working meanwhile.
- Never delegate a single continuous trace you can follow with a few searches.
- Without sub-agents, do the same work as a separate, bounded pass, and write its result down before continuing.

## Independent review

Before merging something risky (shared infrastructure, security, data, anything hard to undo), get an independent review of the diff against the hard requirements and the done-when lines: a reviewer sub-agent where the tool has one, otherwise a fresh pass that reads only the diff and the requirements. Fix what it finds, with tests.

## The handoff

End every unattended stretch with a handoff another person or agent can act on without asking anything:

- **Done:** what a person can do now, with the evidence (tests, runs, commits).
- **In progress:** what, how far, which branch.
- **Waiting on you:** each decision, account or credential, with the options, a recommendation, and the working default in use; and each merge, push or release that's ready but outside the agent's bounds, with the exact command and what to watch.
- **Try first:** the one thing to open or run, and what they should see.
- **Not checked:** what was skipped deliberately, and why.
- **Changes to the intent:** assumptions proven or disproven, promises at risk, differences between what was built and what was specified, for whoever owns the product intent.

## Rolling over to a new session

A session that runs for hours slows down (the editor holds the whole conversation) and forgets (each compaction loses detail). Hand over to a new session instead of letting it run on.

**When:** at the session limit, by default 90 minutes, 300 tool calls or 2 context compactions, whichever comes first (a project fact); whenever the session clock says so, which is mandatory (`orchestrate`); or sooner, when the editor or the agent is slowing down. Roll over at the next safe point: once the current step is checked, never mid-edit or with a check still running. Never start another increment first.

**How:**

1. Commit the verified work, within the bounds. Work that isn't verified goes in the handoff as in progress, never committed as done.
2. Write the handoff (`templates/handoff.md`), starting with the line to resume with.
3. Add a log line: `rollover: <why>; handoff written; <commit>`.
4. Start the new session with a short first prompt: read the handoff and resume, with the same mode and bounds, and roll over again at the next session limit. Where the tool can start a session, start it; otherwise give the owner that line to start it with, and with the session clock run its `mark rollover`.
5. Stop working in the old session. One session at a time works in a project; two would edit the same files.
