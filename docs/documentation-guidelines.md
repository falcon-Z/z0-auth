# Documentation style guide

This project keeps documentation practical, accurate, and easy to follow for operators, app developers, console members, and contributors.

## Audience

Documentation is organized around the reader's task.

| Audience | Documentation should cover |
|----------|----------------------------|
| Operators | Deployment, setup, configuration, backups, upgrades, and troubleshooting. |
| App developers | Integration flows, endpoint names, required parameters, token behavior, and examples. |
| Console members | Product behavior, permissions, and outcomes visible in the management console. |
| Contributors | Project structure, development workflow, testing, and API documentation requirements. |

When a topic serves more than one audience, the document should separate those concerns clearly.

## Voice and style

Project documentation uses plain, professional English.

- Prefer short paragraphs and task-oriented headings.
- Use exact route names, command names, environment variable names, and file paths.
- Keep examples copyable, with placeholders such as `YOUR_CLIENT_ID` and `https://auth.example.com`.
- Keep claims specific and verifiable.
- Include implementation details only when they help readers set up, integrate, operate, secure, or maintain the project.
- State alpha limitations directly.

## Structure

Most user-facing guides should move from context to action:

1. What the feature or workflow is.
2. Who should use it.
3. Prerequisites.
4. Step-by-step workflow.
5. API or command reference.
6. Security, operational, or limitation notes.
7. Links to deeper reference material.

The README is the main entry point. It should orient readers and link to deeper documentation instead of duplicating every reference detail. OpenAPI files remain the source of truth for endpoint contracts.

## Accuracy

Documentation should describe shipped behavior unless a section is clearly labeled as planned or not yet shipped.

For API changes, the related documentation set includes:

- `docs/api/references/`
- `docs/api/validation-matrix.md`
- `docs/api/security-contract.md` when authentication, sessions, CSRF, secrets, or tokens are involved
- Any relevant operator or developer guide

## Security-sensitive topics

Authentication, authorization, secrets, sessions, and tokens need precise wording.

- Explain what operators or developers must protect.
- Do not recommend storing secrets in source control, container images, browser code, or public issue trackers.
- Describe one-time secrets as one-time.
- Mention CSRF, exact redirect URI matching, PKCE, key stability, and backup requirements when they affect setup or integration.
