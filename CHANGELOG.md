# Changelog

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
