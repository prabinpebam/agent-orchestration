---
name: execution-modes
description: Use when choosing, switching or explaining how to run a piece of work. The mode ladder - strict design (screens before any implementation), show me the UX sooner, make this production-ready, and the side mode prove the risky assumption - with what each produces, allows, forbids and what ends it, plus the attention modes work with me and keep going unattended. Holds the mandatory rule - no tests on unapproved designs and never the full suite in show me the UX sooner.
---

# Execution modes

Pick the mode from what the owner needs next, name it in every brief, and tell the guard ([`orchestrate`](../orchestrate/SKILL.md#modes)). When unsure, go one rung lower: the owner seeing something sooner is rarely wrong.

## The ladder

| Mode (guard value) | When | Produces | Checks allowed | Forbidden | Ends when |
| --- | --- | --- | --- | --- | --- |
| **Strict design** (`design`) | Exploring; the owner hasn't approved the design | Screens the owner can open: static or clickable, built from the real design system where there is one, otherwise mockups. Several variants when the direction is open. | It renders, and the owner can open it | Implementation, wiring, data, persistence, tests of any kind, CI, hardening | The owner approves the design → show me the UX sooner, or production-ready |
| **Show me the UX sooner** (`ux-sooner`) | The design is approved, or the change is small; the owner hasn't used it yet | The working feature in the review build, reached through the normal UI, behind no flag | The build, the type check, the project's static checks | The full suite, end-to-end runs, captures, benchmarks, CI waits, hardening, any unnecessary test | The owner signs off on how it looks and works → production-ready |
| **Make this production-ready** (`production-ready`) | The owner has signed off | The change done to the project's Definition of Done | Tiers 0 to 3 by risk; the full suite only on its trigger ([`stage-validation`](../stage-validation/SKILL.md)) | Checks that name no risk here | The Definition of Done holds, with evidence |
| **Prove the risky assumption** (`assumption`) | A named risk could sink the plan | The smallest spike, with a pass or fail criterion set first | What the criterion needs | Product polish, merging the spike as product code | The criterion is answered and the decision recorded |

**MANDATORY: no tests on unapproved designs.** Never run the full suite or any unnecessary test on a design the owner hasn't explicitly approved, and never run the full suite in show me the UX sooner. Silence, green checks, a merge or a reviewer's score isn't approval. The owner's look at the build is the test.

## Strict design

- Show before building: the first deliverable is something the owner can open within minutes, never code behind it.
- Use the real design system's components and tokens where they exist, so an approved screen carries straight into the product. Fake the data in the screen.
- Iterate on the owner's feedback in small, fast rounds; each round is a new build the owner can open.
- Record each approved design and its decisions in the project's documentation system.

## Moving up and down

- **Up** only on the owner's explicit approval. Record it with the date.
- **Down** when the owner reopens the design, or a production-ready change turns out to need a new design.
- An approved prototype's next increment is "wire it into the main app", never "rebuild it".

## Attention

| | Work with me | Keep going unattended |
| --- | --- | --- |
| When | The owner is here, testing and giving feedback | The owner is away, or says "unattended" |
| Rhythm | Their queue first, one item at a time, about 15 minutes from a request to something they can see | 45-minute time-boxes on the critical path |
| Builders | One by default; two only on separate files, each visible within 15 minutes | At most two, on areas that don't overlap |
| Ends with | Each fix in the review build | A handoff for the owner's return, naming the review build |

Never widen a running task with new feedback: queue it.
