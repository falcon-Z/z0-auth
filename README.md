# z0-auth

z0-auth is a modern authentication service for multi-tenant SaaS platforms, built with [Hono](https://hono.dev/) and [Vite](https://vitejs.dev/). It enables organizations to create and manage apps, authentication keys, users, and resources, with robust support for SSO and fine-grained access control.

## Features

- **Multi-Tenant Architecture**: Supports multiple organizations, each with their own users, admins, and apps.
- **Super Admin**: A global super admin can manage all organizations, users, and resources.
- **Organization Management**: Organizations have admins and users. Org admins manage apps and users within their org.
- **App Management**: Each organization can create and manage multiple apps. Apps have unique API keys/secrets and can define allowed origins.
- **User Roles**: Supports roles like Super Admin, Org Admin, Org User, and App User, with customizable roles and permissions.
- **Single Sign-On (SSO)**: Apps can enable SSO using OAuth2, SAML, OIDC, LDAP, and more. SSO providers can be configured per organization.
- **Session & Device Management**: Tracks user sessions, devices, and supports 2FA.
- **API Key Management**: Secure API key rotation, status tracking, and usage analytics.
- **Audit Logging**: Comprehensive audit logs for all actions and events.
- **Extensible Metadata**: Organizations can define custom metadata schemas for users.

## Core Concepts

### Super Admin

- Has full access to all organizations, users, apps, and system settings.
- Manages global resources and oversees the entire platform.

### Organizations

- Each organization is isolated and can manage its own users, admins, apps, roles, and SSO providers.
- **Org Admins**: Can create/manage apps, invite/manage users, and configure SSO.
- **Org Users**: Regular users within the organization.

### Apps

- Created and managed by org admins.
- Each app has unique API keys/secrets, can define allowed origins, and supports SSO.
- Apps can have any number of users (app users).

### Users

- Belong to organizations and can have different roles (admin, user, app user).
- Can be assigned to multiple apps within their organization.
- Support for 2FA, password resets, and external identities (SSO).

### SSO (Single Sign-On)

- Organizations can enable SSO for their apps using providers like Google, GitHub, Microsoft, Okta, SAML, LDAP, and more.
- SSO configuration is flexible and can be managed per app or organization.

## Technology Stack

- **Backend**: [Hono](https://hono.dev/) (TypeScript), [Prisma ORM](https://www.prisma.io/)
- **Frontend**: [Vite](https://vitejs.dev/), React (for UI components)
- **Database**: PostgreSQL (schema managed via Prisma)
- **Other**: Audit logging, device tracking, API key management

## Project Structure

- `src/` — Application source code (API routes, pages, components)
- `prisma/schema.prisma` — Database schema (organizations, users, apps, roles, sessions, etc.)
- `generated/prisma/` — Generated Prisma client
- `public/` — Static assets

## Getting Started

1. **Install dependencies**:
   ```fish
   npm install
   ```
2. **Set up the database**:
   - Configure your `DATABASE_URL` in environment variables.
   - Run migrations:
     ```fish
     npm run prisma:migrate
     ```
3. **Start the development server**:
   ```fish
   npm run dev
   ```

## API Overview

- **RESTful API** under `/api/v1/` for managing organizations, users, apps, sessions, and SSO.
- **Pages** for authentication (`/auth`), dashboard, and more.

## Extending

- Add new SSO providers by extending the `ExternalProvider` and `ExternalProviderType` enums in `prisma/schema.prisma`.
- Customize roles and permissions per organization.
- Add new audit log events or metadata schemas as needed.

---

For more details, refer to the codebase and the Prisma schema for all available models and relationships.
