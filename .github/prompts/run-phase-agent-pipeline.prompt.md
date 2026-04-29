---
name: "Run Phase Agent Pipeline"
description: "Execute the standard chained workflow: discovery, planning, implementation loop, review/remediation loop, then UI integration loop with UI testing and review."
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
1. Start with Phase Codebase Discovery Agent.
2. Run Phase Task Planner Agent.
3. Execute implementation loop for each approved task slice:
   - Phase Implementation Agent
   - Phase API Test Agent
   - Phase OpenAPI Spec Agent when API behavior changes
   - Phase Documentation Agent when behavior/docs change
4. Repeat implementation loop until phase scope is complete.
5. Run Phase Quality Inspector.
6. If findings exist, run Phase Fix Implementer and then Phase Quality Inspector again.
7. Repeat remediation and review until clear for this phase.
8. Ask user for explicit approval before moving to UI integration stage.
9. If UI track is required:
   - If design guidelines are incomplete: run Design Philosophy Agent and request approval.
   - Run UI Integration Agent.
   - Run Phase UI Test Agent.
   - Run Phase Quality Inspector for UI/integration scope.
   - Repeat UI integration plus UI tests plus review until clear.
10. Ask user for explicit approval before closing phase.

Reporting format each cycle:
1. Stage
2. Work Completed
3. Findings Summary
4. Fixes Applied
5. Decisions Needed from User
6. Next Action
