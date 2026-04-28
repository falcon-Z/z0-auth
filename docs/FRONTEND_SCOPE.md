# Z0 Auth Frontend Scope Boundary - Core GA

## Overview

The Z0 Auth frontend is **intentionally minimal in Core GA** to maintain focus on backend-first authentication infrastructure. This document defines what IS and IS NOT part of the Core GA frontend, and where full admin/tenant management UI will be deferred.

## Core GA Frontend Surfaces (Shipped)

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
- Offline recovery UI (deferred to Phase 3.x)

### 2. Minimal Operator Console
**Location**: `/console` (to be built in Phase 3)
**Purpose**: Essential platform and tenant operator surfaces
**Scope**:
- Bootstrap verification display (platform initialized, super admin exists, default tenant ready)
- Health status and dependency checks (database, SMTP, etc.)
- SMTP configuration state visualization (unconfigured/configured/misconfigured with warning banner if disabled)
- Audit event log viewer (read-only, platform-level events only)
- Basic session/identity querying tools (for debugging)
- API documentation quick link to `/` or `/.well-known/openapi.json`

**Not Included**:
- Tenant creation/management UI (API-first only; use CLI or API tools)
- App registration UI (API-first only; use CLI or API tools)
- User/identity management UI (API-first only; use CLI or API tools)
- Role/policy assignment UI (API-first only; use CLI or API tools)
- Detailed admin dashboards, analytics, or reporting

### 3. OAuth2 / OIDC User-Facing Surfaces
**Location**: Thin protocol endpoints (no rich UI)
**Purpose**: Support OAuth2/OIDC flows for end users
**Scope** (Core GA):
- Authorization endpoint (`/oauth2/authorize`) returns HTML with:
  - Login form (email/password or magic link request)
  - TOTP verification form (if MFA required)
  - **No consent screen** (deferred to Gate A)
- Token endpoint (`/oauth2/token`) returns JSON
- Discovery endpoint (`/.well-known/openid-configuration`) returns JSON
- Userinfo endpoint (`/oauth2/userinfo`) returns JSON

**Not Included**:
- Consent/scope grant UI (Gate A feature)
- Account linking UI (Gate A+)
- Social login UI (Gate B feature)
- Device flow UIs (deferred)
- Pushed authorization request UX (deferred)

---

## Deferred: Full Admin Console (Phase 1.x+)

The following are **explicitly out of Core GA scope** and will be built as a separate admin/management console after the core IAM platform stabilizes:

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
- **Styling**: TailwindCSS 4.1
- **UI Components**: shadcn/ui (6 base components pre-built: button, card, input, label, select, textarea)
- **Build**: Bun (native bundler via `bun build`)
- **Development**: HMR enabled for fast iteration

### Code Structure
```
src/
  App.tsx              — Entry point; SetupWizard for bootstrap, redirects to /console when ready
  frontend.tsx         — React DOM mount point
  components/
    ui/                — shadcn/ui component library
      button.tsx
      card.tsx
      input.tsx
      label.tsx
      select.tsx
      textarea.tsx
      # More components added as needed (modal, tabs, etc.)
  lib/                 — Shared frontend utilities (will add: auth context, API client, form hooks)
  index.css            — Global TailwindCSS styles
```

### Bootstrap Flow
1. User navigates to `/` or `/bootstrap`
2. React loads `SetupWizard` component
3. Component checks `/health` endpoint for bootstrap state
4. If not bootstrapped: show form
5. On success: POST to `/bootstrap` endpoint (Phase 3 backend)
6. Redirect to `/console` (stub for now, full impl in Phase 1.x)

---

## API Contract for Frontend

### Bootstrap Status Endpoint
```
GET /health
200 OK: {"status": "ok", "bootstrapped": true}
200 OK: {"status": "ok", "bootstrapped": false}
```

### Bootstrap Initialization Endpoint
```
POST /bootstrap
Content-Type: application/json
{
  "platform_name": "My Company",
  "admin_email": "admin@example.com",
  "admin_password": "SecurePassword123!"
}

200 OK: {
  "success": true,
  "platform_id": "uuid",
  "admin_id": "uuid",
  "message": "Platform initialized"
}

400 Bad Request: {
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Platform name is required"
  }
}

409 Conflict: {
  "error": {
    "code": "ALREADY_BOOTSTRAPPED",
    "message": "Platform is already initialized"
  }
}
```

---

## Phase 1.x Admin Console Roadmap

When Core GA ships and is stable, Phase 1.x will begin implementation of the full admin console. Current plan:

1. **Phase 1.1**: Tenant admin console foundation
   - App/client management UI
   - Identity search and inspection
   - Role/policy management
   - Tenant settings

2. **Phase 1.2**: Platform admin console
   - Tenant creation and lifecycle
   - Platform settings and limits
   - System audit logs

3. **Phase 1.3**: Developer portal
   - API key management
   - Documentation portal
   - API test client

---

## Design Rationale

**Why minimal Core GA frontend?**

1. **Focus**: Backend-first architecture ensures authentication logic is rock-solid before building management UX
2. **Maintainability**: Fewer frontend surfaces = less to maintain for solo operator
3. **API-first**: All operations can be performed via REST API; UI is convenience layer, not blocker
4. **Separation of concerns**: Core GA backend is stable; admin console can iterate independently
5. **Release gates**: Core GA backend can ship without waiting for full admin UI completion

**Why OAuth2/OIDC user flows in Core GA?**

End users need to log in to applications immediately, so OAuth2 redirect flows (authorize, login, MFA, token exchange) must be in Core GA. However, these are thin protocol surfaces; rich UX (consent screens, account linking, etc.) is deferred to phases where they're needed.

---

## Testing Scope for Frontend

**Included in Core GA testing**:
- Setup wizard form validation
- Bootstrap API integration
- OAuth2/OIDC login and token flows
- MFA (TOTP) input validation
- Error handling and display

**Deferred to Phase 1.x**:
- Admin console feature testing
- Tenant/app management UI tests
- Identity/user management UI tests

---

## Known Limitations & Future Work

1. **No consent UI in Core GA**: Consent/scope grant decisions are handled by API (automatic approval); interactive consent UI is Gate A
2. **No account linking**: Social login linking deferred to Gate B
3. **Single tenant on frontend**: Multi-tenant admin experience deferred to Phase 1.x
4. **No branding/customization**: Custom branding on auth flows deferred to Phase 1.x
5. **No analytics dashboard**: Usage analytics and reporting deferred to Phase 1.x

---

## Compliance & Security

All frontend surfaces follow these policies:

1. **HTTPS in production**: Enforced by deployment layer (reverse proxy, load balancer, etc.)
2. **CSRF protection**: Bun middleware enforces `SameSite=Strict` cookies and CSRF token validation for state-changing operations
3. **Input validation**: All form inputs validated both client-side (UX feedback) and server-side (security boundary)
4. **Password handling**: Never logged; TLS-only transmission; hashed at rest via Argon2id
5. **Session tokens**: HttpOnly, Secure cookies; no localStorage for sensitive data
6. **Rate limiting**: Protected via Bun middleware layer (Phase 7)
7. **Audit logging**: All user actions logged server-side; no sensitive data in logs

