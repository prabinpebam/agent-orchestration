# <Work>: work plan

How this work is carried out: the mode, the bounds, the increments and their evidence. What's worth building and what proves it comes from the product intent when there is some; this plan cites it rather than repeating it.

> **TL;DR.**
> - **Intent:** <link to the spec or Definitions of Done, with the IDs this work serves (P1, U3, A2, 1.2)> — or the three lines below.
> - **Mode:** <show me the UX sooner | prove the risky assumption | make this production-ready> · <work with me | keep going unattended>
> - **Status:** see §6.

## 1. Intent

<With product intent: the links and IDs. Without it, three lines:>

- **Goal:** <what's true when this is finished>
- **Done when:** <what can be observed>
- **Limits:** <what not to touch>

**Hypotheses** (only when there's no product intent to track them; otherwise cite its A1, A2):

| # | Belief | Confirmed if | Changes the plan how | Result |
|---|---|---|---|---|
| H1 | | | | |

IDs: product IDs (P1, U1, A1, O1, PD1, 1.1) are cited only when the product intent exists. This plan's own IDs are I1 increments, H1 hypotheses and W1 working defaults.

## 2. Mode and bounds

| | |
|---|---|
| Goal mode | <…, and why> |
| Attention | <work with me | keep going unattended> |
| Time | <when to stop, or the number of intervals> |
| Scope | <which items, in order> |
| Never touch | <the live product, a public API, the owner's data, …> |
| May merge, push, deploy | <which of them the agent may do; the rest are the owner's actions, named in the handoff> |
| Escalate when | <a credential, a decision with lasting consequences, anything irreversible, public or costly> |
| Review interval | <30 minutes unless a project fact says otherwise> |
| Session limits | <90 minutes, 300 tool calls or 2 compactions, whichever comes first; coordinator and workers each keep their clock> |
| Main chat | <its ID; triage only: reads live state, routes each prompt, updates this plan, replies in one to three lines> |
| Coordinator | <the current coordinator's ID (the main chat for short work, its own chat for long or multi-track work); registry, dependency map, routing and verification; short turns, no implementation or blocking waits> |
| Registry/queue | <authoritative session-store location or ignored file; readable by a successor> |
| Reference products | <the products whose current behaviour settles how something should work, in order; or the project fact> |
| Review build | <where the owner tries the work: its own checkout at the last validated commit, its port or data folder, how to refresh it> |

### Live ownership and queue

Keep the live registry at the location above, not in a second competing copy of this plan. Use these fields there:

| Task | Owner worker | Working copy | State | Trigger | Completion signal |
|---|---|---|---|---|---|
| <ID and objective; the files or areas it touches> | <worker ID; predecessor/successor> | <absolute path and branch> | <queued, launching, running, stopping, blocked, done> | <the task IDs it depends on and the event that releases it, or ready> | <message route or record path; task/attempt ID and evidence> |

At every coordinator turn, read unread messages, completion records, the live worker list and this queue before dispatch. The Trigger column is the dependency map: dispatch every ready item as a parallel track, each with its own working copy, branch, worker and completion record, not just the next in line. One writer per working copy. Record launches before dispatch; check for an existing worker or successor before creating one. Report by event, never by a blocking completion-file poll. Sub-chats message the main chat only for an owner decision, something to try, or a safety blocker, in at most 3 plain lines.

## 3. Increments

Each increment ends in something usable or something learned. When the product intent has stages and Definition of Done rows, increments deliver them: cite their IDs, and don't restate or redefine them.

| # | Produces | Serves (product IDs, H1, or done-when) | Checks (tier) | State |
|---|---|---|---|---|
| I1 | <what the owner can try, or the result learned> | <1.1, 1.2> | <tier 1 + e2e "…"> | Not started |

**Try it** (per increment): <exact steps or commands for this build, and what you should see>.

## 4. Decisions taken as working defaults

Execution choices only. A product question the intent already lists (O1) is cited with the working default used, not copied here; a new product question goes in the handoff's changes to the intent.

| # | Question | Chosen | Why | Owner to confirm? |
|---|---|---|---|---|
| W1 | | | | |

## 5. Shortcuts and found on the way

- **Shortcuts** (fakes, stubs and deferred work to replace before production): <…>
- **Found on the way:** <bug or gap> — fixed (test) | queued (reason)

## 6. Status

| Increment | State | Evidence |
|---|---|---|
| I1 | Not started | |

**Review build:** <where it is> — shows <commit>.

**Not checked:** <what was skipped deliberately, and why>.
