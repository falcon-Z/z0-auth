# Documentation guide

This guide defines how Z0Auth documentation is organized and what a documentation page should do for its reader.

## Write for a reader with a task

Start with the reader's question.

A reader may be evaluating Z0Auth, integrating an application, operating an instance, administering identity and access, or contributing to the project. Organize information around that task instead of around source-code modules.

Assume the technical background appropriate to the audience. Do not explain general HTTP, PostgreSQL, containers, OAuth, or OpenID Connect unless a Z0Auth-specific rule depends on that explanation.

## Use the right page type

Z0Auth uses six reader-facing documentation types.

### Overview

Overview pages represent the project to someone encountering it for the first time. They should answer, in this order where practical: what the project is, why someone would use it, what useful capabilities it provides, what they can build or accomplish with it, and where to go next.

An overview may summarize features because feature discovery is part of evaluating a project. Describe those features in terms a prospective user recognizes. Do not use the page to preserve requirement facts, internal invariants, domain relationships, protocol edge cases, architecture decisions, or implementation constraints merely because they are important elsewhere.

The overview must stand on its own. A reader should understand the project without first reading the requirements, roadmap, domain model, or architecture.

Keep it concise enough to scan. Link to deeper documentation for design, detailed scope, configuration, protocols, and operational behavior.

### Getting started

Getting-started pages teach a small, complete path to a working result.

A getting-started sequence should minimize choices. Introduce only the concepts and configuration required to finish the path, then link to deeper material.

### Guides

Guides answer how to complete one specific task.

State prerequisites before the steps. Put steps in execution order. Describe the expected result. Add failure or recovery information when it is part of the task.

Do not turn a guide into a general explanation of the underlying model. Link to a concept page instead.

### Concepts

Concept pages explain how Z0Auth works and why a product boundary exists.

Explain Z0Auth-specific behavior such as Account Domains, Applications and Clients, SSO, sessions, assurance, grants, or token lifecycles. Do not reproduce a general identity-management textbook.

### Operations

Operations pages tell a self-hosting operator how to deploy, configure, maintain, recover, and troubleshoot Z0Auth.

State which responsibility belongs to Z0Auth and which belongs to the operator. Security-sensitive procedures must include the conditions, effects, and recovery implications that matter to the operation.

### Reference

Reference pages record exact contracts.

They should be easy to search and should assume the reader already understands the surrounding concept. Prefer tables and compact definitions when the information is genuinely tabular. Use OpenAPI for endpoint and schema contracts where it is the better source.

## Keep one primary purpose per page

A page can link to other documentation types, but it should have one primary job.

If a page contains a tutorial, conceptual essay, API catalogue, and troubleshooting manual at the same level, split it.

## Use stable terminology

Use the terms defined by the Alpha domain model.

Do not use several names for the same domain concept. In particular, keep distinctions such as Account, Application Subject, Membership, Application, OAuth Client, Resource, Account Domain, and SSO Group precise.

When a term has a protocol meaning and a Z0Auth product meaning, state which meaning the page uses.

## Write direct technical prose

Use neutral, plain English.

Prefer present tense for behavior that exists. Name the actor when it helps the reader understand responsibility. State what the system does, what the reader must do, and what happens next.

Do not call a task easy, simple, obvious, or trivial. Do not use promotional claims in technical instructions.

Use sentence-case headings. A reader should be able to scan the headings and understand the page before reading the paragraphs.

Keep paragraphs focused. Avoid repeating the same conclusion in an introduction, a list, and a closing paragraph.

## Separate shipped behavior from target behavior

User guides, operations pages, and reference pages describe behavior that is implemented and tested.

The Alpha roadmap and files under `design/` may describe the approved target before every part is implemented. They must identify themselves as roadmap or design material.

Do not document planned behavior in a task guide as though a user can perform it today.

## Structure task documentation around execution

For a task-oriented page, use this order when applicable:

1. Purpose and expected outcome.
2. Prerequisites.
3. Configuration or inputs.
4. Steps.
5. Verification.
6. Security or operational consequences.
7. Recovery or troubleshooting.
8. Links to relevant concepts and reference material.

Do not add sections that have nothing useful to say.

## Make examples usable

Commands and code examples should be runnable when possible.

Use obvious placeholders for values a reader must replace. Never use real credentials. Do not place secrets in URLs, source files, container images, or examples that encourage unsafe shell history.

Keep examples focused on the behavior being documented. Move large or maintained integrations into the `examples/` directory and link to them.

## Link instead of duplicating

A rule or explanation should have one natural home.

A guide may summarize a concept in a sentence and link to the concept page. Reference pages should not copy whole tutorials. Operations pages should link to exact configuration reference instead of maintaining a second list of defaults.

Duplication is acceptable only when the reader needs the information at the point of action and the repeated text is short.

## Document security boundaries precisely

Authentication, authorization, sessions, tokens, credentials, recovery, and operator authority require exact language.

State which principal acts, which boundary applies, what credential or authority is involved, and what state changes. Distinguish application responsibilities from Z0Auth responsibilities and operator responsibilities.

Do not weaken a security rule to make an example shorter.

## Keep documentation accessible

Use descriptive headings and link text. Do not rely on color, visual position, or screenshots as the only way to convey information.

Use tables for tabular information, not layout. Give images useful alternative text when an image adds information. Commands and code must remain understandable without syntax highlighting.

## Keep documentation current with the product

A behavior change is incomplete until the affected documentation is updated.

When reviewing documentation changes, check the relevant Alpha design document, the current implementation, and the tests that prove the behavior. Verify commands, file paths, route names, configuration names, examples, and internal links.

When replacing an older page, archive or remove the old source so readers do not find two conflicting contracts.

## Review checklist

Before merging a documentation page, check that:

- the intended reader and task are clear;
- the page has one primary documentation type;
- terminology matches the domain model;
- claims about available behavior match code and tests;
- roadmap or design material is clearly distinguished from shipped behavior;
- examples are safe and usable;
- headings form a useful outline;
- links point to the current documentation tree;
- the page does not duplicate a better source;
- security and operator responsibilities are stated where they affect the reader.
