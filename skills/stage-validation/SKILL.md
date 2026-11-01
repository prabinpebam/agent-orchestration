---
name: stage-validation
description: Use when deciding which checks to run, what evidence a change or stage needs, integrating parallel tracks or a proof of concept, merging, refreshing the review build, or deciding whether something is ready to show. Checks scoped to the mode and the change's risk (tiers 0 to 3, the full suite only on its trigger), serial integration with the checks run again on the combined result, merging exactly what was tested, and a review build opened by the agent before anything is called ready.
---

# Stage validation

The mode sets the ceiling ([the ladder](../execution-modes/SKILL.md#the-ladder)); the change's risk sets what runs under it. Run the smallest check that covers the change, and name the risk each check covers.

## Tiers

| Tier | Runs | For |
| --- | --- | --- |
| 0 | The build and the type check of what changed, and the project's static checks | Every change, every mode except strict design (there: it renders) |
| 1 | The unit tests of the changed files | Logic, in production-ready |
| 2 | One related end-to-end test | A changed path a person walks, in production-ready |
| 3 | The full suites | Only on the trigger below |

**The full-suite trigger.** Every item must be true, or it doesn't run:

- The owner has explicitly signed off on the change's design.
- It touches runtime behaviour smaller checks can't cover: data, saving, sync, security, build or packaging.
- Tiers 0 to 2 already pass.
- It's going to the main branch or a release now, and no other change about to land would need a re-run.
- You can name the risk only the full suite covers.

## Integrating and merging

- Integrate parallel tracks one at a time; run the checks again on the combined result. When two touch the same files, rebase the second onto the first.
- A proof of concept is integrated as a deliberate step, never merged as is.
- Merge exactly the commit that was checked. Several ready branches go onto one merge candidate, checked once.
- A failure is never "the same as main" or "a flake": fix it, or quarantine it with a scope, an owner and an expiry, where the project records evidence.
- A problem found on the way, outside the task, is logged and queued, not fixed inside the task, unless it blocks landing.
- A blocked item is marked blocked with the reason and the trigger that frees it; work moves on.

## The review build

- Built from the last validated commit only, in its own checkout, with its own port or user-data folder and demo data, so development never disturbs it.
- Refreshed at each validated increment; named, with how to open it, in every report and handoff.
- **Before calling anything ready to try:** open that build yourself, reach the change through the normal UI (not behind a flag), and check it against the design rules. If it isn't there, it isn't ready.
- Downloads come only from approved sources.
