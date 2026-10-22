---
name: execution-modes
description: Use when choosing, switching or explaining how to run a piece of work. Defines the goal modes (show me the UX sooner, prove the risky assumption, make this production-ready) and the attention modes (work with me, keep going unattended) - what each produces first, what it defers, what evidence ends it, and when to switch.
---

# Execution modes

A mode is a **goal** plus an **attention** level. The goal says what kind of result comes next; the attention says how the owner is involved. "Show me the UX sooner, keep going unattended" is a mode; so is "make this production-ready, work with me".

## Goal modes

### Show me the UX sooner

Produce something the owner can play with or review early, so they can judge the concept before anything is hardened.

- **First:** the main flow, end to end, on real screens with realistic content. Fixtures, fakes and stubs behind it are fine.
- **Keep:** whatever affects the judgement: the real words, the real layout at real sizes, the waits a person would feel, the states the flow can reach.
- **Defer:** persistence, rare edge cases, full accessibility and performance work, refactoring, broad tests. Write every shortcut on the work plan's **shortcuts** list so production work can find them.
- **Evidence:** the owner can reach it (a link, a command, a build) with a **Try it** that says what to look at; you've looked at a screenshot or recording of each key screen first.
- **Ends when:** the owner gives a verdict (keep, change, drop), or the questions it was built to answer are answered. Then switch: production-ready for what's kept, or another round.

### Prove the risky assumption

Run the smallest experiment that settles one uncertainty, product or technical, before more is built on it.

- **Before starting:** state the belief, the result that would confirm or refute it, and what changes in the plan for each outcome. If no result would change anything, it isn't worth testing.
- **First:** the cheapest experiment that could give that result: a spike, a prototype, a benchmark, a call to the real service, or a short script for watching a person try it.
- **Bound it:** usually one 45-minute interval, on a throwaway branch. Experiment code isn't merged into the product unless it's rebuilt to the production bar.
- **Evidence:** the result against the criterion, with the run, the numbers or the observation, recorded against the assumption's ID where the product intent tracks it (A1), or against a hypothesis in the work plan (H1) when there's no product intent.
- **Ends when:** the result is in, or the time is up (record "inconclusive", what was learned and the next cheapest test). Then return to the plan with the decision it changes.

### Make this production-ready

Bring validated work up to the project's quality bar: correct, tested, accessible, fast enough, secure, maintainable, documented.

- **When:** after the concept or direction is validated, or for routine changes in an established product, scaled to the size of the change.
- **First:** replace what's on the shortcuts list, cover the failure branches, then apply the project's quality standards (its design system, copy rules, accessibility, performance budgets and security requirements).
- **Evidence:** the checks the change needs (`stage-validation`, up to tier 3 before a release), and every Definition of Done row or done-when line with its proof.
- **Ends when:** every row passes or is blocked with its reason, and the change is merged and released as far as the bounds allow, without breaking anything live. When merging, pushing or deploying isn't within the bounds, or the project doesn't deploy, it ends at "validated and ready to release", with the exact owner action in the handoff.

### Choosing and switching

- One goal at a time. When a request mixes them ("show me, and make it solid"), do them in order: show, then harden.
- Don't harden what isn't validated: no production work on a concept the owner hasn't seen, unless they ask for it.
- Don't build on an unproven belief that could sink the plan; prove it first.
- Recheck the goal at every progress review. Switch when its end condition is met, or when evidence says another goal is worth more now. Log the switch and why.

## Attention modes

### Work with me

The owner is collaborating: trying things, giving feedback, deciding.

- About **15 minutes from report to something they can see.** Focused increments, one change at a time.
- Before showing each increment, only the fast checks, 5 minutes or less: the unit tests the change touches and the one end-to-end test that covers it. No full suite or benchmark between the owner and the next thing they'll see.
- Tier-3 triggers (`stage-validation`) still hold: when the change touches a release, dependencies, shared infrastructure, or the production or security path, run those broad checks before it's merged or released, in the background while the owner reviews when the tool allows, otherwise at the end of the session.
- Ship where they'll see it, and say exactly what to reopen or reload.
- Queue new feedback rather than widening the running change. Ask only what can't be decided; offer choices with a recommendation first.

### Keep going unattended

The owner is away. Continue within explicit bounds.

- **Bounds first:** time (when to stop), scope (which goal, which items), what never to touch, what to escalate. Use theirs; otherwise write reasonable ones at the top of the work plan.
- **Intervals:** work in **45-minute intervals**, each ending in what works merged into the work branch, or a recorded checkpoint.
- **Decide, don't ask.** Resolve ambiguity with the most reasonable option, write it in the work plan's decisions as a working default (W1), and keep going. W1 records execution choices; a product question the intent already lists (O1) is cited with the working default used, not copied, and a new product question goes in the handoff's changes to the intent.
- **Escalate only when needed:** something only the owner can provide (an account, a credential, a decision with lasting consequences), or something irreversible, public or costly. Record it with the options and a recommendation, then continue with everything that isn't blocked.
- Run the broad checks before merging risky changes, review progress about every 30 minutes, and keep the log current.
- **End with a handoff** (`coordinate`).
