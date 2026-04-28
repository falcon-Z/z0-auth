---
name: "Run Phase Agent Pipeline"
description: "Execute the chained phase workflow: implement, review, fix, re-review until clear, then request approval to progress; optionally run API-to-UI track with design gating."
argument-hint: "Phase goal, accepted scope, API/UI tracks, and known constraints"
agent: "Project Phase Orchestrator"
---
Run the project phase pipeline with human approval gates.

Inputs to collect first:
- Phase name and objective.
- In-scope modules/files.
- Acceptance criteria and non-goals.
- Whether API track, UI track, or both should run.
- Whether approved design guidelines already exist.

Execution rules:
1. Start with implementation.
2. Immediately run quality inspection.
3. If findings exist, run fix agent for prioritized issues.
4. Re-run review until clear for this phase.
5. Ask user for explicit approval before moving to next stage.
6. If API track is complete and UI is required:
   - If design guidelines are complete: run UI Integration Agent.
   - If not complete: run Design Philosophy Agent, request user approval, then run UI Integration Agent.

Reporting format each cycle:
1. Stage
2. Work Completed
3. Findings Summary
4. Fixes Applied
5. Decisions Needed from User
6. Next Action
