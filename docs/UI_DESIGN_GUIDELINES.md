# Z0 Auth UI Design Guidelines

## 1) Purpose and Scope

This document is the canonical design standard for all Z0 Auth frontend and UI-facing work.

- It defines the product design philosophy, visual system, interaction behavior, accessibility criteria, and copy standards.
- It aligns UI delivery with the roadmap in docs/PROJECT_PLAN_MILESTONES.md and scope boundaries in docs/FRONTEND_SCOPE.md.
- It is mandatory for all UI changes produced by humans or agents.

## 2) Product Design Philosophy

Z0 Auth is an operator control plane for self-hosted authentication infrastructure. The UI must optimize for correctness and trust under operational pressure.

### Core Principles

1. Operational clarity over decoration
   - Every screen should make system state, risk, and next action obvious.
2. Scope honesty by phase
   - Core GA remains minimal.
   - Full admin and developer surfaces land in Phase 1.x and Gate milestones.
3. Security-visible behavior
   - Destructive and policy-impacting actions require explicit confirmation and impact visibility.
4. Consistency as risk reduction
   - Shared patterns are reused across modules to reduce mistakes.
5. API is source of truth
   - UI does not invent server-owned state.
6. Tenant isolation awareness
   - Active tenant context is always visible where relevant.

## 3) Roadmap Alignment and Phase UX Contract

This design standard is coupled to the planning model in docs/PROJECT_PLAN_MILESTONES.md.

### Core GA (Q3 2026 target)

- Setup wizard
- Minimal operator console surfaces
- Thin OAuth/OIDC protocol UI surfaces

### Deferred Surfaces (Phase 1.x and gates)

- Tenant admin console (Phase 1.1)
- Platform admin console (Phase 1.2)
- Developer portal (Phase 1.3)
- Consent and broader OIDC UX (Gate A)
- Advanced auth UX such as passkeys/social flows (Gate B)

Agents must not silently expand Core GA UI scope beyond docs/FRONTEND_SCOPE.md.

## 4) Visual Language

### 4.1 Color System

The baseline palette is gray-neutral. Do not use zinc as the primary neutral palette for new work.

#### Light Mode Tokens

- --background: gray-50
- --foreground: gray-950
- --card: white
- --card-foreground: gray-900
- --border: gray-200
- --input: gray-200
- --muted: gray-100
- --muted-foreground: gray-600
- --primary: gray-900
- --primary-foreground: gray-50
- --ring: gray-400

#### Dark Mode Tokens

- --background: gray-950
- --foreground: gray-50
- --card: gray-900
- --card-foreground: gray-100
- --border: gray-800
- --input: gray-800
- --muted: gray-800
- --muted-foreground: gray-400
- --primary: gray-100
- --primary-foreground: gray-950
- --ring: gray-600

#### Semantic Tokens

- --success: green-600
- --warning: amber-500
- --destructive: red-600
- --info: blue-600

Color usage rules:

- Use neutral grays for structure and hierarchy.
- Use semantic colors only for meaning and status.
- Avoid decorative color accents in operator-heavy workflows.

### 4.2 Typography

- Preferred sans: IBM Plex Sans
- Preferred mono: IBM Plex Mono or JetBrains Mono

Scale:

- Page title: text-2xl font-semibold tracking-tight
- Section heading: text-lg font-medium
- Body: text-sm
- Caption/meta: text-xs text-muted-foreground
- IDs/secrets/code-like values: font-mono text-xs

### 4.3 Spacing and Surfaces

- Base spacing unit: 4px
- Common layout rhythm: 8, 12, 16, 24, 32
- Default page padding: 24px desktop, 16px mobile
- Use border contrast for separation before shadows

Surface hierarchy:

- Level 0: page background
- Level 1: cards, tables, panels
- Level 2: popovers, dropdowns
- Level 3: dialogs, sheets, blocking overlays

## 5) Interaction Guidelines

### 5.1 Form Design Standard (Adam Silver style)

All forms must follow these rules:

1. Ask only for what is needed now.
2. Keep labels persistent and explicit.
3. Use placeholders as examples, not labels.
4. Put helper text next to decisions.
5. Use progressive disclosure for advanced options.
6. Validate format early and business rules at submit.
7. Preserve user input on error.
8. Move focus to first invalid field after failed submit.
9. Use plain language for errors and recovery actions.
10. Show impact summaries for destructive or policy-changing submissions.

### 5.2 Data Surfaces and Actions

- Every data screen must define loading, empty, populated, error, and unauthorized states.
- Row and bulk actions must be predictable and role-aware.
- Hide unavailable role actions rather than rendering disabled controls for unavailable privileges.
- Use explicit confirmations for high-blast-radius actions.

### 5.3 Feedback Patterns

- Success messaging should be short and transient.
- Error messaging should include cause and next step.
- Long-running operations should show explicit progress state.
- Unsaved changes should trigger route-leave protection.

## 6) Accessibility and Responsiveness Criteria

### Accessibility

- Target WCAG 2.2 AA.
- Contrast minimum: 4.5:1 for body text.
- Every icon-only control must include an accessible label.
- Dialogs and overlays must trap and restore focus correctly.
- Use aria-live regions for async completion and error messaging.
- Keyboard navigation must support all critical actions.

### Responsive Behavior

- <768px: single-column layouts and drawer navigation where applicable
- 768-1024px: adaptive layouts with readability-first constraints
- >=1024px: persistent desktop shell patterns where approved by scope
- Keep touch targets at least 44x44 in pointer contexts

## 7) Content and Voice Guidelines

Voice style:

- Direct, calm, precise
- Operator-focused and action-oriented
- Avoid marketing language in control-plane surfaces

Message templates:

- Status: current state + implication + next action
- Error: what failed + likely reason + what to do next
- Destructive confirmation: what will be changed + what cannot be undone

## 8) Shared Component Contract

UI modules must reuse shared components for repeated patterns:

- Page shell and page header
- Action bar and search/filter controls
- Data table and empty states
- Status badges and toast notifications
- Confirm dialog for destructive actions
- Copy controls for IDs/secrets

Do not introduce module-specific component variants for standard patterns without updating this document.

## 9) UI Delivery and Validation Checklist

Every UI change should confirm:

- Phase scope compliance against docs/FRONTEND_SCOPE.md
- Gray-neutral token usage for new UI layers
- Form behavior compliance with section 5.1
- Accessibility acceptance criteria met
- Responsive behavior validated on mobile and desktop
- Tests updated for changed interaction behavior
- Documentation updated when UX behavior or flow changes

## 10) Agent Execution Requirements

When an agent performs UI work:

1. Load this file before proposing or implementing UI changes.
2. Validate phase scope against docs/FRONTEND_SCOPE.md.
3. Follow gray-neutral palette and form rules from this document.
4. Include compliance checks in the final report.
5. If a requested UI change conflicts with this standard, ask user for approval before diverging.

## 11) Change Control

To modify this design standard:

1. Update this file in a PR.
2. Include rationale and affected modules.
3. Update related instruction files under .github/instructions when enforcement rules change.
4. Call out migration impact if tokens or shared interaction patterns change.
