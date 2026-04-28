/**
 * Z0 Auth - Domain Services Layer
 * 
 * This directory contains business logic orchestration and domain entities.
 * Services are called by HTTP handlers and coordinate with the data access layer (PostgreSQL).
 * 
 * Each service manages its domain:
 * - IdentityService — User lifecycle, profile management, deletion requests
 * - SessionService — Session and device management, revocation, device tracking
 * - AuthService — Authentication methods, token generation, auth state machines
 * - CredentialService — Credential storage (password, TOTP, API keys), hashing
 * - AuthorizationService — RBAC checks, privilege guards, policy enforcement
 * - AuditService — Event emission, logging, compliance tracking
 * - TenantService — Tenant lifecycle, isolation checks, membership
 * - NotificationService — Email delivery (magic links, etc.) [Phase 5]
 * 
 * ## Architecture
 * 
 * HTTP Handler → API Module → Domain Service → Data Access → PostgreSQL
 * 
 * Example:
 * ```
 * POST /api/v1/identities → IdentityHandler → IdentityService.create()
 *                                           → CredentialService.hash()
 *                                           → IdentityRepository.save()
 *                                           → AuditService.log()
 * ```
 * 
 * ## Design Principles
 * 
 * 1. **Single Responsibility**: Each service owns one domain entity type
 * 2. **Dependency Injection**: Services receive dependencies (db, logger, cache) on construction
 * 3. **Error Handling**: Services throw domain exceptions; handlers map to HTTP responses
 * 4. **Audit First**: All mutations emit audit events; no silent failures
 * 5. **Tenant Context**: Services accept tenant context; all queries are tenant-scoped
 * 6. **Immutability**: Entities are immutable; modifications return new instances
 * 7. **Type Safety**: Strong typing for all entities and operations
 * 
 * ## Service Interfaces
 * 
 * Each service exposes a well-defined interface used by handlers:
 * 
 * ### IdentityService
 * ```typescript
 * class IdentityService {
 *   create(tenant: Tenant, email: string, name?: string): Promise<Identity>;
 *   getById(tenant: Tenant, id: string): Promise<Identity | null>;
 *   getByEmail(tenant: Tenant, email: string): Promise<Identity | null>;
 *   list(tenant: Tenant, opts: ListOptions): Promise<Identity[]>;
 *   update(tenant: Tenant, id: string, updates: Partial<Identity>): Promise<Identity>;
 *   deactivate(tenant: Tenant, id: string): Promise<void>;
 *   verifyEmail(tenant: Tenant, id: string): Promise<void>;
 *   requestDeletion(tenant: Tenant, id: string): Promise<DeletionRequest>;
 * }
 * ```
 * 
 * ### SessionService
 * ```typescript
 * class SessionService {
 *   create(app: App, identity: Identity, metadata: SessionMetadata): Promise<Session>;
 *   getActive(identity: Identity, app: App): Promise<Session[]>;
 *   revoke(tenant: Tenant, session: Session): Promise<void>;
 *   revokeAll(tenant: Tenant, identity: Identity): Promise<void>;
 * }
 * ```
 * 
 * ### AuthService
 * ```typescript
 * class AuthService {
 *   authenticatePassword(tenant: Tenant, email: string, password: string): Promise<Session>;
 *   initiatePasswordReset(tenant: Tenant, email: string): Promise<MagicLink>;
 *   verifyPasswordReset(tenant: Tenant, token: string): Promise<Session>;
 *   setupTOTP(identity: Identity): Promise<TOTPSetup>;
 *   verifyTOTP(identity: Identity, code: string): Promise<boolean>;
 * }
 * ```
 * 
 * ### CredentialService
 * ```typescript
 * class CredentialService {
 *   createPassword(identity: Identity, password: string): Promise<Credential>;
 *   verifyPassword(identity: Identity, password: string): Promise<boolean>;
 *   rotatePassword(identity: Identity, password: string): Promise<Credential>;
 *   revokePassword(identity: Identity): Promise<void>;
 * }
 * ```
 * 
 * ### AuthorizationService
 * ```typescript
 * class AuthorizationService {
 *   checkActorLevel(actor: Actor, required: AuthLevel): Promise<void>;
 *   checkTenantAccess(actor: Actor, tenant: Tenant): Promise<void>;
 *   checkAppAccess(actor: Actor, app: App): Promise<void>;
 *   checkIdentityAccess(actor: Actor, identity: Identity): Promise<void>;
 * }
 * ```
 * 
 * ### AuditService
 * ```typescript
 * class AuditService {
 *   log(event: AuditEvent): Promise<void>;
 *   query(tenant: Tenant, filters: AuditFilters): Promise<AuditEvent[]>;
 *   export(tenant: Tenant, format: 'json' | 'csv'): Promise<Buffer>;
 * }
 * ```
 * 
 * ## Phase Implementation Order
 * 
 * Phase 4: IdentityService, CredentialService, TenantService, AuthorizationService, AuditService
 * Phase 5: AuthService, SessionService, NotificationService
 * Phase 6: ConsentService (OIDC Gate A)
 * 
 * IMPLEMENTATION SHOULD NOT BEGIN UNTIL Phase 3 (Bootstrap API) is complete.
 * 
 * ## Testing Strategy
 * 
 * Each service has corresponding unit tests:
 * - tests/unit/services/IdentityService.test.ts
 * - tests/unit/services/SessionService.test.ts
 * - tests/unit/services/AuthService.test.ts
 * - etc.
 * 
 * Integration tests verify services working together:
 * - tests/integration/auth-flow.test.ts
 * - tests/integration/session-lifecycle.test.ts
 * - etc.
 * 
 * Authorization tests verify privilege enforcement:
 * - tests/security/authorization-matrix.test.ts
 * 
 * ## Example: Adding a Service
 * 
 * ```typescript
 * // src/app/MyService.ts
 * import { logger } from '../lib';
 * import type { Tenant, Actor } from '../lib';
 * 
 * export interface MyEntity {
 *   id: string;
 *   tenant_id: string;
 *   name: string;
 *   created_at: Date;
 * }
 * 
 * export class MyService {
 *   constructor(
 *     private db: Database,
 *     private auditService: AuditService,
 *     private authzService: AuthorizationService
 *   ) {}
 *   
 *   async create(
 *     tenant: Tenant,
 *     actor: Actor,
 *     name: string
 *   ): Promise<MyEntity> {
 *     // Check authorization
 *     await this.authzService.checkTenantAccess(actor, tenant);
 *     
 *     // Create entity
 *     const entity: MyEntity = {
 *       id: generateId(),
 *       tenant_id: tenant.id,
 *       name,
 *       created_at: new Date(),
 *     };
 *     
 *     // Persist
 *     await this.db.query(
 *       'INSERT INTO my_entities (id, tenant_id, name, created_at) VALUES ($1, $2, $3, $4)',
 *       [entity.id, entity.tenant_id, entity.name, entity.created_at]
 *     );
 *     
 *     // Audit
 *     await this.auditService.log({
 *       tenant_id: tenant.id,
 *       actor_id: actor.id,
 *       action: 'my_entity_created',
 *       resource_type: 'my_entity',
 *       resource_id: entity.id,
 *       status: 'success',
 *     });
 *     
 *     logger.info('My entity created', { id: entity.id, name }, actor.id);
 *     return entity;
 *   }
 * }
 * ```
 */

// TODO: Phase 4 - Identity service
// export { IdentityService } from './IdentityService';

// TODO: Phase 5 - Session service
// export { SessionService } from './SessionService';

// TODO: Phase 5 - Authentication service
// export { AuthService } from './AuthService';

// TODO: Phase 4 - Credential service
// export { CredentialService } from './CredentialService';

// TODO: Phase 4 - Authorization service
// export { AuthorizationService } from './AuthorizationService';

// TODO: Phase 4 - Audit service
// export { AuditService } from './AuditService';

// TODO: Phase 4 - Tenant service
// export { TenantService } from './TenantService';

// TODO: Phase 5 - Notification service (email)
// export { NotificationService } from './NotificationService';

// TODO: Phase 6 - Consent service (OIDC)
// export { ConsentService } from './ConsentService';
