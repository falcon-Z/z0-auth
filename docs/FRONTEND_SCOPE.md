# Z0 Auth Frontend Scope Boundary

## Overview

The Z0 Auth frontend is **intentionally minimal in the initial release** to maintain focus on backend-first authentication infrastructure. This document defines what IS and IS NOT part of the shipped frontend, and where full admin/tenant management UI will be deferred.

Canonical UI design standard: see `docs/UI_DESIGN_GUIDELINES.md`.

## Shipped Frontend Surfaces

### 1. Setup Wizard
**Location**: `/src/App.tsx` (SetupWizard component)
**Purpose**: One-time platform initialization UI
**Scope**:
- Platform name entry
- Super admin email and password capture
- Password strength validation (12+ chars, upper/lower, number, special char)
- Form submission and loading state
- Success confirmation and redirect to console

**Not Included**:
- SMTP configuration during setup (deferred; SMTP can be configured post-bootstrap via API)
- Multi-platform support (single platform only in v1)
- Offline recovery UI (deferred)

### 2. Minimal Operator Console
**Location**: `/src/App.tsx` (OperatorConsole component, routed at `/console`)
**Purpose**: Essential deployment verification surface for operators
**Scope** (currently shipped):
- Bootstrap verification display (platform initialized, super admin exists, default tenant ready)
- Service readiness check (database connectivity and migration state via `GET /health/ready`)
- Service liveness check (process uptime via `GET /health/live`)
- API documentation quick link (`/.well-known/openapi.json`)

**Not Included**:
- SMTP configuration state visualization (deferred)
- Audit event log viewer (deferred)
- Basic session/identity querying tools (deferred)
- Tenant creation/management UI (API-first only)

### 3. OAuth2 / OIDC User-Facing Surfaces
**Location**: Thin protocol endpoints (no rich UI)
**Purpose**: Support OAuth2/OIDC flows for end users
**Scope** (shipped):
- Authorization endpoint (`/oauth2/authorize`) returns HTML with:
  - Login form (email/password or magic link request)
  - TOTP verification form (if MFA required)
  - **No consent screen** (deferred to Gate A)
- Token endpoint (`/oauth2/token`) returns JSON
- Discovery endpoint (`/.well-known/openid-configuration`) returns JSON
- Userinfo endpoint (`/oauth2/userinfo`) returns JSON

**Not Included**:
- Consent/scope grant UI (deferred)
- Account linking UI (deferred)
- Social login UI (deferred)
- Device flow UIs (deferred)
- Pushed authorization request UX (deferred)

---

## Deferred: Full Admin Console

The following are **explicitly out of scope for the initial release** and will be built as a separate admin/management console after the core IAM platform stabilizes:

### Tenant Admin Console
- Tenant dashboard and analytics
- App/client management UI
- Identity/user management UI
- Role and policy management
- Tenant settings and branding
- Audit log exploration
- SMTP configuration per tenant

### Platform Admin Console
- Multi-tenant platform dashboard
- Tenant creation and lifecycle management
- Platform settings and resource limits
- Compliance and data export tooling
- System-wide audit logs and monitoring

### Developer Portal
- App credentials and API key management UI
- Documentation and integration guides
- Test/sandbox environment management

---

## Frontend Architecture

### Technology Stack
- **Framework**: React 19
- **Routing**: React Router (BrowserRouter with guarded route modules)
- **Styling**: TailwindCSS 4.1
- **UI Components**: shadcn/ui (6 base components pre-built: button, card, input, label, select, textarea)
- **Build**: Bun (native bundler via `bun build`)
- **Development**: HMR enabled for fast iteration

### Code Structure
```
src/
  App.tsx              — App composition and shared frontend helpers
  frontend.tsx         — React DOM mount point
  app/
    index.tsx          — App entry guard for root path behavior
    types.ts           — Shared app-level route/auth state types
    auth/
      signin.tsx       — Auth module sign-in route guard
    setup/
      setup.tsx        — Setup module route guard
    console/
      console.tsx      — Console module route guard
  components/
    auth/              — Auth module components (for example login-button.tsx)
    setup/             — Setup module components
    console/           — Console module components
    ui/                — shadcn/ui component library
      button.tsx
      card.tsx
      input.tsx
      label.tsx
      select.tsx
      textarea.tsx
      # Shared cross-module primitives only
  lib/                 — Shared frontend utilities (will add: auth context, API client, form hooks)
  index.css            — Global TailwindCSS styles
```

### Naming Conventions

- Use module-first organization for app surfaces and components.
- Keep filenames simple and descriptive.
- Do not append generic filename suffixes like `-route`, `-component`, or `-page` unless a tool requires it.
- For module-owned components under `src/components/`, use `src/components/<module>/<name>.tsx` (for example `src/components/auth/login-button.tsx`).

### Bootstrap Flow
1. User navigates to `/`, `/setup`, or `/console`
2. Route guards check `GET /api/v1/bootstrap/status`
3. If setup is required, the app routes to setup flow (`/` or `/setup`)
4. If setup is complete and user authentication is required but missing, the app routes to `/sign-in`
5. On setup submit, app calls `POST /api/v1/bootstrap/initialize`
6. After successful setup, app redirects to `/console` (minimal operator console, shipped)

---

## API Contract for Frontend

### Bootstrap Status Endpoint
```
GET /api/v1/bootstrap/status
200 OK: {
  "bootstrapped": true,
  "requires_setup": false,
  "timestamp": "2026-04-28T12:34:56.000Z"
}

200 OK: {
  "bootstrapped": false,
  "requires_setup": true,
  "timestamp": "2026-04-28T12:34:56.000Z"
}
```

### Bootstrap Initialization Endpoint
```
POST /api/v1/bootstrap/initialize
Content-Type: application/json
{
  "platform_name": "My Company",
  "admin_email": "admin@example.com",
  "admin_password": "SecurePassword123!",
  "confirm_password": "SecurePassword123!"
}

201 Created: {
  "platform_id": "uuid",
  "bootstrap_token": "bootstrap_token_value",
  "admin_email": "admin@example.com",
  "setup_complete": true,
  "timestamp": "2026-04-28T12:34:56.000Z"
}

400 Bad Request: {
  "error": "Validation failed",
  "details": {
    "confirm_password": "Passwords do not match"
  }
}

409 Conflict: {
  "error": "Platform is already initialized"
}
```

---

## Deferred: Admin Console

When the initial release is stable, the full admin console will be built as a follow-on effort:

- **Tenant admin console**: App/client management UI, identity search and inspection, role/policy management, tenant settings
- **Platform admin console**: Tenant creation and lifecycle, platform settings and limits, system audit logs
- **Developer portal**: API key management, documentation portal, API test client

---

## Design Rationale

**Why minimal initial release frontend?**

1. **Focus**: Backend-first architecture ensures authentication logic is rock-solid before building management UX
2. **Maintainability**: Fewer frontend surfaces = less to maintain for solo operator
3. **API-first**: All operations can be performed via REST API; UI is convenience layer, not blocker
4. **Separation of concerns**: Core backend is stable; admin console can iterate independently
5. **Incremental delivery**: Core backend can ship without waiting for full admin UI completion

**Why OAuth2/OIDC user flows in the initial release?**

End users need to log in to applications immediately, so OAuth2 redirect flows (authorize, login, MFA, token exchange) must be in the initial release. However, these are thin protocol surfaces; rich UX (consent screens, account linking, etc.) is deferred.

---

## Testing Scope for Frontend

**Included in testing**:
- Setup wizard form validation
- Bootstrap API integration
- OAuth2/OIDC login and token flows
- MFA (TOTP) input validation
- Error handling and display

**Deferred**:
- Admin console feature testing
- Tenant/app management UI tests
- Identity/user management UI tests

---

## Known Limitations & Future Work

1. **No consent UI in initial release**: Consent/scope grant decisions are handled by API (automatic approval); interactive consent UI is Gate A
2. **No account linking**: Social login linking deferred to Gate B
3. **Single tenant on frontend**: Multi-tenant admin experience deferred
4. **No branding/customization**: Custom branding on auth flows deferred
5. **No analytics dashboard**: Usage analytics and reporting deferred

---

## Compliance & Security

All frontend surfaces follow these policies:

1. **HTTPS in production**: Enforced by deployment layer (reverse proxy, load balancer, etc.)
2. **CSRF protection**: Bun middleware enforces `SameSite=Strict` cookies and CSRF token validation for state-changing operations
3. **Input validation**: All form inputs validated both client-side (UX feedback) and server-side (security boundary)
4. **Password handling**: Never logged; TLS-only transmission; hashed at rest via Argon2id
5. **Session tokens**: HttpOnly, Secure cookies; no localStorage for sensitive data
6. **Rate limiting**: Protected via Bun middleware layer (rate-limit middleware)
7. **Audit logging**: All user actions logged server-side; no sensitive data in logs

