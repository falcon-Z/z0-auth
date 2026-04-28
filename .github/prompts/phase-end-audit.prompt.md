---
name: "Phase-End Audit"
description: "Run a thorough phase-end audit of code quality, standards compliance, docs parity, and test robustness with a strict report format."
argument-hint: "Phase scope, changed files/modules, standards to prioritize, and validation depth"
agent: "Phase Quality Inspector"
---
Perform a phase-end quality audit for this repository.

Required inputs to collect before evaluating:
- Phase scope and goals.
- Changed modules/files in scope.
- Standards and instruction files that govern this phase.
- API surfaces affected (if any).
- Test suites expected to validate this phase.

Audit requirements:
- Review implementation for defects, regressions, and failure points.
- Check compliance with repository standards and instructions.
- Verify docs/openapi and usage guides against actual behavior.
- Assess test quality: correctness, scenario breadth, determinism, edge cases, and missing coverage.
- Run relevant tests and include key results.

Output report format (mandatory):
1. Critical Findings
2. High Findings
3. Medium/Low Findings
4. Test Quality Assessment
5. Documentation and OpenAPI Parity
6. Standards Compliance Verdict
7. Top Priority Fix Plan

For each finding include:
- Title
- Why it matters
- Evidence (file + line references)
- Recommended fix

If no issues are found, state:
- No material findings found
- Residual risks / unverified areas
- Exactly what was inspected
