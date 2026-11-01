---
name: progress-review
description: Use about every 30 active minutes of running work (the session clock asks), at the end of each time-box, and whenever progress stalls - the same failure twice, no new evidence, scope growing, the owner waiting. Checks whether the owner got something reviewable within the last 60 active minutes (a miss is the top finding), whether the work is producing useful, validated progress the owner can see, finds waste and rule breaks, and decides to keep course, adjust or change course.
---

# Progress review

A separate pass, by the `throughput-reviewer` agent where there is one, or by you, answering the questions below from evidence (the log, the registry, commits, the review build), not memory.

## Questions

1. **Reviewable:** When did the owner last get something they could open and judge, and when is the next due? 60 active minutes or more with nothing is a miss and the top finding, ahead of every other: the action is cutting scope and shipping the smallest reviewable slice, never starting more work ([the rule](../orchestrate/SKILL.md#reviewable-every-hour-mandatory)).
2. **Visible:** What can the owner see or try now that they couldn't at the last review? If nothing, why?
3. **Mode:** Does the work match its mode? Any test, CI wait or hardening before the owner approved the design is the top finding.
4. **Main chat:** Has the main chat run a command, waited, or gone unanswered? Has any report gone elsewhere, or claimed "done" for unverified work?
5. **Records:** Is every owner requirement, attachment and reference in the project's documentation system, and did each increment update it?
6. **Waste:** What ran that didn't move the goal: checks naming no risk, repeated runs, scaffolding nobody can see, rebuilding what was approved?
7. **Stall:** The same failure twice, no new evidence, scope grown past the increment, or the owner waiting longer than the mode promises?
8. **Ownership:** One writer per working copy, one coordinator, no stale chat holding work?
9. **Clock:** Was every reminder acted on, and are the hooks on? A missing clock or an ignored reminder is the top finding.
10. **Next:** What's the fastest path to the next thing the owner can use?

## Verdict

**Keep course**, **adjust** (one named change) or **change course** (switch mode, cut scope, try another approach, or escalate). Act on the top finding before the next increment, and log one line: the verdict, the top finding and the action.
