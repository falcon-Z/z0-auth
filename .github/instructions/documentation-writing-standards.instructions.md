---
applyTo: "**/*"
description: "Standards for writing user-facing documentation, READMEs, and API guides. Defines what belongs in docs/ vs .github/, tone, structure, and content boundaries."
---

# Documentation Writing Standards

These rules apply whenever documentation is created or updated in this repository.

## 1) Two Documentation Domains

This project has two distinct documentation domains. Keep them separate and do not mix their content.

**User and developer documentation** lives in `docs/` and `README.md`:
- The project README at the root
- API reference and usage guides under `docs/openapi/docs/`
- Feature and schema reference under `docs/`
- Anything a user, operator, or external contributor would read to understand or use the project

**Agent and build-process documentation** lives in `.github/`:
- Workflow governance and phase rules
- Engineering standards and conventions
- Instructions on how agents should build, review, or test the project
- Anything that describes the development process rather than the product itself

Do not place agent instructions in `docs/`. Do not place user guides in `.github/`.

## 2) What User Documentation Must Not Contain

User-facing documentation — including `README.md` and everything under `docs/` — must not contain:

- Internal development phase labels or numbers (Phase 1, Phase 3, Core GA, GA, milestone names)
- Sprint or iteration references
- References to how the project is structured internally for agent or AI workflows
- Comparisons to how something was previously built or why a prior approach was abandoned
- Aspirational or speculative capability descriptions for things that are not yet implemented
- Mentions of `.github/` contents, agent instructions, or workflow governance
- Build pipeline or CI details unless they are directly relevant to an operator deploying the software

If a decision was made, document the decision and its rationale. Do not document the process that led to it.

## 3) Writing Tone and Style

Documentation is not a product announcement and is not written to impress. Write as if explaining to a competent developer who has not seen this codebase before.

**State what something does, why it is done that way, and how to use it. Nothing more.**

Avoid:
- Excited or superlative framing: "powerful", "seamlessly", "robust", "cutting-edge", "best-in-class"
- Hedging filler: "it's worth noting that", "as you can see", "of course"
- Justification that compares against alternatives: "we use X instead of Y because..."
- Over-explaining decisions with excessive background context

Prefer:
- Direct statements of behavior: "The server binds to `0.0.0.0` and displays `localhost` in startup output."
- Concrete examples over abstract descriptions
- Short paragraphs and tight sentences
- Code blocks for commands, configuration, and request/response examples

When a document reads awkwardly without some context, provide the minimum context needed to make the statement clear. Do not pad.

## 4) README Structure

The project README (`README.md`) introduces the project to someone seeing it for the first time. It must cover:

1. **What this is** — one or two sentences, no marketing language
2. **What it does** — the key capabilities, stated plainly
3. **How to run it** — prerequisites, installation, start command
4. **How to configure it** — environment variables or config files that an operator must set
5. **API overview** — link to or briefly describe the API surface
6. **License**

The README must not contain:
- Roadmaps, milestones, or planned features
- Internal architecture diagrams that describe development phases
- References to agent instructions or AI workflow tooling

## 5) API Documentation Structure

Each API guide under `docs/openapi/docs/` must cover:

1. **When to use** — what problem this endpoint solves
2. **Authentication and context** — what credentials or state are required
3. **Request format** — required and optional fields with types
4. **Response format** — success and error shapes
5. **Examples** — copy-pastable `curl` commands for common flows and for failure cases

Do not describe internal implementation details (database queries, middleware internals) in API guides unless they directly affect observable behavior.

## 6) Schema and Reference Documentation

Documents like `database/SCHEMA.md` describe the data model as it exists, not how it was designed over time.

- Describe each table's purpose and the role of key columns
- Note constraints, indexes, and relationships that affect how data must be written or queried
- Do not include historical migration notes or references to when a table was introduced

## 7) Completeness and Honesty

Document what is implemented. Do not document what is planned or deferred.

If a feature is not yet available, omit it from user documentation entirely. Do not mention it with a "coming soon" qualifier. A user reading the docs should be able to trust that everything described is functional.

If an API endpoint or behavior exists but has known limitations, state the limitation plainly. Do not soften it.

## 8) Checklist Before Publishing Documentation

Before considering a documentation change complete:

- Is this going in the correct domain (`docs/` for users, `.github/` for agents)?
- Does it contain any internal planning language, phase references, or development process notes?
- Does it use inflated tone or filler phrases?
- Does it describe only what is implemented, not what is planned?
- Would a developer who has never seen this project understand it without prior context?
- Are `curl` examples present and accurate for all API guides?
