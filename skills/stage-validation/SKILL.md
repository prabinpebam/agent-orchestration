---
name: stage-validation
description: Use when deciding which checks to run, what evidence a stage or change needs, running a build-check-fix loop, merging, or deciding whether something is ready to show. Evidence matched to the goal mode, validation tiers scoped to the change, blocked items, found-on-the-way issues, and merging exactly what was tested.
---

# Stage validation: the right checks at the right time

Check what a change can affect, at the depth its stage needs. A prototype needs proof that it can be tried; a release needs proof that nothing broke. Evidence is observable: a test and its count, a command and its output, a measurement, a screenshot looked at. Never "should work".

## Evidence by goal

| Goal mode | Evidence that counts | Not needed yet |
|---|---|---|
| Show me the UX sooner | It runs; the main flow works by hand; a screenshot or recording of each key screen, looked at; a Try it | Broad tests, full accessibility audits, benchmarks |
| Prove the risky assumption | The result against the stated criterion, with the run, the numbers or the observation | Tests beyond what makes the result trustworthy |
| Make this production-ready | Every Definition of Done row or done-when line with its proof, and the tiers below up to what the change needs | Nothing that the change can affect |

When the project has Definitions of Done, they say what must be proven; this skill says when and how deeply to check it. Their stages and rows (1.1, PD1) say what a person must be able to do and what proves it. Increments deliver them, cite their IDs, and don't redefine them; the work plan owns the order, the checks, the exact Try it for the current build, and the state.

## Validation tiers

Pick the lowest tier that covers the change; escalate only for the reasons in tier 3. (This is test impact analysis: run what a change can affect, and keep the full suite for milestones.)

| Tier | When | What |
|---|---|---|
| 0 | Docs, comments, copy-only changes, renames a tool made | Nothing. Proofread the diff |
| 1 | Any code change | The unit tests related to the changed files (follow the import graph), plus the type check if types or signatures changed. Write or update the unit test for the logic touched |
| 2 | A change a unit test can't see: rendering, input, styles, timing, integration | Only the affected end-to-end tests, by title or group. For visual changes, one screenshot of the affected view, looked at |
| 3 | Only on a trigger below | The full unit suite, the type check, the production build with its budgets, the full end-to-end suite |

Tier 3 triggers: several features since the last full run, or before a release or milestone; a behaviour change to shared infrastructure that the import graph can't bound; dependency or build changes (always the production build with budgets); the production or security path; a targeted run that failed for a reason you don't understand. The triggers hold in every attention mode; working with the owner changes when the broad checks run (before merge or release, not before showing), not whether.

**Performance checks:** run the project's benchmark against its baseline after a change to what a person waits on (the server, data loading, media handling, a layout or a page's loading), before a release, and for any claim that something is faster; the budgets run with every production build. Copy and docs changes need neither.

Rules: run long suites in the background while doing other work, when the tool allows it; never run two heavy suites at once; rerun a single timeout before investigating; say in the summary what you ran, what you skipped, and why.

## The build-check-fix loop

For each increment:

1. **Build** the next smallest part.
2. **Check** it against its done-when lines with the narrowest command that covers the change.
3. **Fix** what fails and check again until the lines pass. After two failed fixes of the same kind, stop retrying and change approach (`progress-review`).
4. **Review** independently before merging something risky (`coordinate`).
5. **Record** the evidence beside each line it proves: which test, how many passed, which run.
6. **Merge** what's proven, as far as the bounds allow, and hand over with its Try it.

### Blocked

A line that can't pass for a reason outside the code (an account, a credential, a person's decision, a third party) is **blocked**: record why, exactly what unblocks it, and who can. Keep working on everything else. Never fake evidence or weaken a check to get past it.

### Found on the way

Bugs and gaps found while building go in the work plan under "Found on the way": fixed (with the test that holds the fix), or queued with a reason. A finding that changes the product intent (a promise that can't be kept, an assumption proven wrong) goes back to whoever owns the intent.

## Ready to show

Before showing the owner anything visual, check the basics for what's being shown, so they never have to point them out:

- **Show me the UX sooner:** the flow is reachable, the words are real, nothing is broken or blank, and it works at the size they'll view it.
- **Make this production-ready:** the component's whole anatomy, in light and dark, at rest, hover, active, focus and disabled (plus error, empty and loading where they exist), on a small screen and with the keyboard, with one enlarged capture looked at. Add a test so the same flaw can't come back.

## Branches, merges, deploys

- Work in a separate branch (or worktree) so the owner's working copy is never disturbed. Keep branches short-lived: an hour at most.
- **Merge exactly what was tested** (fast-forward).
- Merging into the main branch, pushing and deploying are separate permissions, each a project fact or a bound; none is assumed. Where they're allowed, do them and watch the deploy and its checks until they pass. What's live must never break; if it does, fix forward or revert at once.
- Where they aren't allowed, or the project has no remote or deploy (a library, a local tool), stop at "validated and ready to merge" or "ready to release", and put the exact owner action in the handoff: which branch or commit, the command, and what to watch.
- Experiments stay on their own branches; they reach the product only after being rebuilt to the production bar.
- Never take the owner's focus: launch apps and tests in the background, never restart their running app or server without asking, and keep tests away from their real data, accounts and remotes (use fixtures and fakes).
