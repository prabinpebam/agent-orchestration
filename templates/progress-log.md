# Progress log

A file outside the repository (so it never lands in a commit), one line per meaningful step, so the owner can follow the work without asking. Its path is a project fact in `AGENTS.md`. When the agent can't write outside the workspace, keep it in an ignored folder inside it (for example `.agent-orchestration/progress.log`, with the folder in `.gitignore`) and record that path as the fact.

```
YYYY-MM-DD HH:MM [goal · attention] <item>: <what happened>; <evidence>; <next>
goal: ux-sooner | prove-assumption | production-ready   attention: with-me | unattended

2026-01-31 13:40 [ux-sooner · with-me] I1 setup flow: clickable on fixtures; screenshots looked at; owner trying it
2026-01-31 14:05 [production-ready · unattended] I3 (3.2) setup flow: builds; unit 42 pass, e2e "first run" 3/3; merging
2026-01-31 14:20 [production-ready · unattended] I3: merged a1b2c3d, deploy green; starting I4 (3.4)
2026-01-31 14:35 [production-ready · unattended] review: adjust; full suite queued twice for copy fixes, back to tier 1
```

Items are the work plan's own IDs (I1 increments, H1 hypotheses, W1 working defaults), with the product IDs they serve in brackets when there's product intent (3.2, A2).

Mark mode switches, escalations and blocked items on their own lines, so they stand out:

```
2026-01-31 15:10 [prove-assumption · unattended] switch: import speed unproven (A2); 45-minute benchmark spike
2026-01-31 15:55 [prove-assumption · unattended] A2 confirmed: 10k items in 1.8 s (target 3 s); back to production-ready
2026-01-31 16:05 [production-ready · unattended] blocked I5 (3.5): needs the payment sandbox key; working default W2: fake gateway; continuing with I6
2026-01-31 16:40 [production-ready · unattended] I6 ready to release: validated, push not within bounds; owner action in the handoff
```
