# Changelog

## 0.4.0 (1 November 2026)

- **Something reviewable every hour (MANDATORY).** The owner gets something they can open and judge at least every 60 active minutes, ideally several times an hour, so a rejection costs at most an hour of work. A running view, a review build link, a filled-in doc section, a standalone proof of concept or a decision packet counts; logs, "in progress" notes and invisible scaffolding don't.
  - `orchestrate`: the rule, and checklist item 8 (**Reviewable**); briefs name the reviewable result; the loop marks it.
  - `execution-modes`: what the owner reviews within the hour in every mode, strict design and production-ready included.
  - `coordinate`: items sized to a reviewable result within 60 minutes, deliveries staggered across the hour, a "Reviewable by" registry column, and a missed hour dispatching the smallest slice first.
  - `progress-review` and `throughput-reviewer`: the first question; a miss is the top finding, and the action is cutting scope, never starting more work.
  - `stage-validation`: checks never push a delivery past the hour.
- **The clock** tracks active time since the last reviewable delivery: `mark reviewable "<link>"` (recorded by the guard hook too, so it works when several clocks share a folder), a reminder at 40 active minutes, a required action every 5 minutes from 60, and one blocked turn end. `AO_DELIVER_MIN` and `AO_DELIVER_WARN_MIN` can only tighten it; the main chat is never asked. `status` shows it.
- The installed section states the rule and gains an **Owner review cadence** fact; templates gain "Reviewable by" and "Last reviewable".

## 0.3.0 (1 November 2026)

Stricter and much smaller. The skills, agent and templates went from 14,024 to about 4,000 words.

- **Pre-action checklist (MANDATORY)** at the top of `orchestrate`, `coordinate` and `throughput-reviewer`. It asks seven yes/no questions, each with its fix: role, mode, completion, docs, owner reports, ownership, ready to try.
- **Strict design mode** added as the first rung of an explicit ladder: strict design → show me the UX sooner → make this production-ready, with prove the risky assumption beside it. Each rung says what it allows, forbids and what ends it. The no-tests-on-unapproved-designs rule now lives in the ladder.
- **The guard** (`orchestration-guard.json`, preToolUse) denies:
  - shell, subagent, poll and wait tools in a session marked `main`;
  - builds, tests and waits in one marked `coordinator`;
  - test, end-to-end, benchmark and CI-wait commands in modes `design` and `ux-sooner`.
  Set the role and mode with `mark role` and `mark mode`, or in `.agent-orchestration/mode`.
- **The clock:**
  - counts active time only (gaps count at most 5 minutes);
  - never rolls over the main chat;
  - rolls over a coordinator only at context limits;
  - defers roll-overs while prompts are arriving.
- **Documentation diligence:** owner requirements, attachments and references go into the project's documentation system, and each increment updates it in the same commit. There are new facts for the documentation system and the owner's main chat.
- The throughput reviewer runs the progress-review questions instead of copying them. History, narrative and the long portability notes are gone.

## 0.2.0

The session clock, the review build, the coordinator registry, the mandatory rules on unapproved designs and on handing over.
