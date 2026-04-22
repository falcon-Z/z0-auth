-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PlatformRoleType" AS ENUM ('SUPER_ADMIN', 'ORG_MANAGER', 'SECURITY_MANAGER', 'AUDITOR', 'SUPPORT_MANAGER');

-- CreateEnum
CREATE TYPE "OrgRoleType" AS ENUM ('ORG_OWNER', 'ORG_ADMIN', 'ORG_DEVELOPER', 'ORG_MEMBER');

-- CreateEnum
CREATE TYPE "AppRoleType" AS ENUM ('APP_OWNER', 'APP_MANAGER', 'APP_USER');

-- CreateEnum
CREATE TYPE "AppStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'ROTATING', 'DEPRECATED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'SUSPICIOUS');

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('SYSTEM', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BuiltInRole" AS ENUM ('SUPER_ADMIN', 'ORG_ADMIN', 'ORG_DEVELOPER', 'ORG_USER', 'APP_USER');

-- CreateEnum
CREATE TYPE "ExternalProviderType" AS ENUM ('OAUTH2', 'SAML', 'OIDC', 'LDAP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ExternalProvider" AS ENUM ('GOOGLE', 'GITHUB', 'MICROSOFT', 'FACEBOOK', 'LINKEDIN', 'TWITTER', 'DISCORD', 'SLACK', 'OKTA', 'AUTH0', 'KEYCLOAK', 'AZURE_AD', 'SAML_GENERIC', 'LDAP_GENERIC', 'CUSTOM_OAUTH2');

-- CreateEnum
CREATE TYPE "WebhookScope" AS ENUM ('PLATFORM', 'ORGANIZATION', 'APP');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'PASSWORD_CHANGED', 'EMAIL_VERIFIED', 'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED', 'TWO_FACTOR_VERIFIED', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_SUSPENDED', 'USER_ACTIVATED', 'USER_ROLE_CHANGED', 'PLATFORM_MEMBERSHIP_GRANTED', 'PLATFORM_MEMBERSHIP_REVOKED', 'ORG_MEMBERSHIP_GRANTED', 'ORG_MEMBERSHIP_REVOKED', 'ORG_MEMBERSHIP_UPDATED', 'APP_MEMBERSHIP_GRANTED', 'APP_MEMBERSHIP_REVOKED', 'APP_MEMBERSHIP_UPDATED', 'ORGANIZATION_CREATED', 'ORGANIZATION_UPDATED', 'ORGANIZATION_DELETED', 'ORGANIZATION_SUSPENDED', 'ORGANIZATION_ACTIVATED', 'APP_CREATED', 'APP_UPDATED', 'APP_DELETED', 'APP_SUSPENDED', 'APP_ACTIVATED', 'API_KEY_CREATED', 'API_KEY_ROTATED', 'API_KEY_REVOKED', 'API_KEY_ACCESSED', 'USER_API_KEY_CREATED', 'USER_API_KEY_REVOKED', 'ROLE_CREATED', 'ROLE_UPDATED', 'ROLE_DELETED', 'ROLE_ASSIGNED', 'ROLE_REVOKED', 'SCOPE_CREATED', 'SCOPE_UPDATED', 'SCOPE_DELETED', 'SCOPE_ASSIGNED', 'SCOPE_REVOKED', 'PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'SESSION_CREATED', 'SESSION_REVOKED', 'SESSION_EXPIRED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED', 'SUSPICIOUS_ACTIVITY', 'UNAUTHORIZED_ACCESS', 'RATE_LIMIT_EXCEEDED', 'ADMIN_ACCESS', 'SETTINGS_CHANGED', 'SMTP_CONFIGURED', 'WEBHOOK_CREATED', 'WEBHOOK_UPDATED', 'WEBHOOK_DELETED', 'DATA_EXPORTED', 'DATA_IMPORTED', 'SENSITIVE_DATA_ACCESSED');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorBackupCodes" TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "isPermanentlyDeleted" BOOLEAN NOT NULL DEFAULT false,
    "requiresPasswordChange" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleType" "PlatformRoleType" NOT NULL,
    "platformOrgId" TEXT,
    "scopes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "roleType" "OrgRoleType" NOT NULL,
    "roleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "roleType" "AppRoleType" NOT NULL,
    "externalId" TEXT,
    "metadata" JSONB,
    "customScopes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "isPlatformOrg" BOOLEAN NOT NULL DEFAULT false,
    "maxUsers" INTEGER,
    "maxApps" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleType" "OrgRoleType" NOT NULL DEFAULT 'ORG_MEMBER',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apps" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "AppStatus" NOT NULL DEFAULT 'ACTIVE',
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "ssoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ssoProvider" TEXT,
    "ssoConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "allowPublicRegistration" BOOLEAN NOT NULL DEFAULT false,
    "loginPageConfig" JSONB,
    "enabledAuthMethods" TEXT[] DEFAULT ARRAY['password']::TEXT[],

    CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "rotationId" TEXT,
    "isCurrentKey" BOOLEAN NOT NULL DEFAULT true,
    "lastRotated" TIMESTAMP(3),
    "rotationCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "gracePeriodEnd" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "rateLimit" INTEGER,
    "createdByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "rateLimit" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,

    CONSTRAINT "user_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_scopes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scopes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_scopes" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,

    CONSTRAINT "app_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_scopes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "appId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "user_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "roleType" "RoleType" NOT NULL DEFAULT 'CUSTOM',
    "builtInRole" "BuiltInRole",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "level" INTEGER NOT NULL DEFAULT 0,
    "inheritsFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_scopes" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canManage" BOOLEAN NOT NULL DEFAULT false,
    "conditions" JSONB,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "role_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "deviceId" TEXT,
    "token" TEXT NOT NULL,
    "refreshToken" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_lockouts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttempt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_lockouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ExternalProvider" NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerType" "ExternalProviderType" NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenType" TEXT,
    "expiresAt" TIMESTAMP(3),
    "profileData" JSONB,
    "scopes" TEXT[],
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identity_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "location" TEXT,
    "metadata" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_identity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_external_providers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "ExternalProvider" NOT NULL,
    "providerType" "ExternalProviderType" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "redirectUri" TEXT,
    "samlEntityId" TEXT,
    "samlSsoUrl" TEXT,
    "samlCertificate" TEXT,
    "ldapUrl" TEXT,
    "ldapBindDn" TEXT,
    "ldapBindPassword" TEXT,
    "ldapBaseDn" TEXT,
    "scopes" TEXT[],
    "mappings" JSONB,
    "restrictions" JSONB,
    "autoProvision" BOOLEAN NOT NULL DEFAULT false,
    "defaultRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "organization_external_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'UNKNOWN',
    "deviceName" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "userAgent" TEXT NOT NULL,
    "browserName" TEXT,
    "browserVersion" TEXT,
    "osName" TEXT,
    "osVersion" TEXT,
    "screenResolution" TEXT,
    "timezone" TEXT,
    "language" TEXT,
    "ipAddress" TEXT,
    "location" JSONB,
    "isTrusted" BOOLEAN NOT NULL DEFAULT false,
    "fingerprintData" JSONB,
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_events" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "ipAddress" TEXT,
    "location" JSONB,
    "userAgent" TEXT,
    "riskScore" INTEGER,
    "riskFactors" TEXT[],
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_metadata_schemas" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schema" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "requiredRole" "OrgRoleType" NOT NULL DEFAULT 'ORG_ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "user_metadata_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_metadata_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "changeType" TEXT NOT NULL,
    "changedBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_metadata_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "appId" TEXT,
    "scope" "WebhookScope" NOT NULL DEFAULT 'ORGANIZATION',
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "eventTypes" TEXT[],
    "headers" JSONB,
    "timeout" INTEGER NOT NULL DEFAULT 5000,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "statusCode" INTEGER,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allowed_origins" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "environment" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowCredentials" BOOLEAN NOT NULL DEFAULT true,
    "maxAge" INTEGER,
    "allowedMethods" TEXT[] DEFAULT ARRAY['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']::TEXT[],
    "allowedHeaders" TEXT[] DEFAULT ARRAY['Content-Type', 'Authorization']::TEXT[],
    "exposedHeaders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "tags" TEXT[],
    "isWildcard" BOOLEAN NOT NULL DEFAULT false,
    "pattern" TEXT,
    "lastUsed" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "allowed_origins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_traces" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "query" TEXT,
    "userId" TEXT,
    "appId" TEXT,
    "sessionId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "contentType" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "duration" INTEGER,
    "statusCode" INTEGER,
    "responseSize" INTEGER,
    "traceId" TEXT,
    "parentSpanId" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "auditLogCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "request_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'MEDIUM',
    "actorId" TEXT,
    "actorType" TEXT,
    "actorEmail" TEXT,
    "targetId" TEXT,
    "targetType" TEXT,
    "targetEmail" TEXT,
    "organizationId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "errorMessage" TEXT,
    "metadata" JSONB,
    "requestId" TEXT,
    "sessionId" TEXT,
    "deviceId" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_status_idx" ON "users"("email", "status");

-- CreateIndex
CREATE INDEX "users_status_emailVerified_idx" ON "users"("status", "emailVerified");

-- CreateIndex
CREATE INDEX "users_lastLoginAt_idx" ON "users"("lastLoginAt");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "users_isPermanentlyDeleted_deletedAt_idx" ON "users"("isPermanentlyDeleted", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_memberships_userId_key" ON "platform_memberships"("userId");

-- CreateIndex
CREATE INDEX "platform_memberships_roleType_isActive_idx" ON "platform_memberships"("roleType", "isActive");

-- CreateIndex
CREATE INDEX "platform_memberships_platformOrgId_idx" ON "platform_memberships"("platformOrgId");

-- CreateIndex
CREATE INDEX "organization_memberships_organizationId_roleType_idx" ON "organization_memberships"("organizationId", "roleType");

-- CreateIndex
CREATE INDEX "organization_memberships_organizationId_isActive_idx" ON "organization_memberships"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "organization_memberships_userId_isDefault_idx" ON "organization_memberships"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_userId_organizationId_key" ON "organization_memberships"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "app_memberships_appId_roleType_idx" ON "app_memberships"("appId", "roleType");

-- CreateIndex
CREATE INDEX "app_memberships_appId_isActive_idx" ON "app_memberships"("appId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "app_memberships_userId_appId_key" ON "app_memberships"("userId", "appId");

-- CreateIndex
CREATE UNIQUE INDEX "app_memberships_appId_externalId_key" ON "app_memberships"("appId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_isPlatformOrg_idx" ON "organizations"("isPlatformOrg");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_token_idx" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_organizationId_email_idx" ON "invitations"("organizationId", "email");

-- CreateIndex
CREATE INDEX "invitations_expiresAt_idx" ON "invitations"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_organizationId_email_key" ON "invitations"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "apps_apiKey_key" ON "apps"("apiKey");

-- CreateIndex
CREATE INDEX "apps_organizationId_status_idx" ON "apps"("organizationId", "status");

-- CreateIndex
CREATE INDEX "apps_status_ssoEnabled_idx" ON "apps"("status", "ssoEnabled");

-- CreateIndex
CREATE INDEX "apps_organizationId_createdAt_idx" ON "apps"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "apps_webhookUrl_idx" ON "apps"("webhookUrl");

-- CreateIndex
CREATE UNIQUE INDEX "apps_organizationId_slug_key" ON "apps"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "apps_organizationId_name_key" ON "apps"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_appId_status_idx" ON "api_keys"("appId", "status");

-- CreateIndex
CREATE INDEX "api_keys_appId_isCurrentKey_idx" ON "api_keys"("appId", "isCurrentKey");

-- CreateIndex
CREATE INDEX "api_keys_rotationId_idx" ON "api_keys"("rotationId");

-- CreateIndex
CREATE INDEX "api_keys_expiresAt_idx" ON "api_keys"("expiresAt");

-- CreateIndex
CREATE INDEX "api_keys_status_expiresAt_idx" ON "api_keys"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "api_keys_lastUsedAt_idx" ON "api_keys"("lastUsedAt");

-- CreateIndex
CREATE INDEX "api_keys_createdByUserId_createdAt_idx" ON "api_keys"("createdByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_appId_name_key" ON "api_keys"("appId", "name");

-- CreateIndex
CREATE INDEX "user_api_keys_userId_status_idx" ON "user_api_keys"("userId", "status");

-- CreateIndex
CREATE INDEX "user_api_keys_appId_status_idx" ON "user_api_keys"("appId", "status");

-- CreateIndex
CREATE INDEX "user_api_keys_keyPrefix_idx" ON "user_api_keys"("keyPrefix");

-- CreateIndex
CREATE INDEX "user_api_keys_expiresAt_status_idx" ON "user_api_keys"("expiresAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_api_keys_userId_appId_name_key" ON "user_api_keys"("userId", "appId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "system_scopes_name_key" ON "system_scopes"("name");

-- CreateIndex
CREATE INDEX "system_scopes_category_idx" ON "system_scopes"("category");

-- CreateIndex
CREATE INDEX "system_scopes_category_resource_idx" ON "system_scopes"("category", "resource");

-- CreateIndex
CREATE INDEX "scopes_organizationId_category_idx" ON "scopes"("organizationId", "category");

-- CreateIndex
CREATE INDEX "scopes_category_name_idx" ON "scopes"("category", "name");

-- CreateIndex
CREATE INDEX "scopes_organizationId_createdAt_idx" ON "scopes"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "scopes_organizationId_name_key" ON "scopes"("organizationId", "name");

-- CreateIndex
CREATE INDEX "app_scopes_scopeId_appId_idx" ON "app_scopes"("scopeId", "appId");

-- CreateIndex
CREATE UNIQUE INDEX "app_scopes_appId_scopeId_key" ON "app_scopes"("appId", "scopeId");

-- CreateIndex
CREATE INDEX "user_scopes_userId_appId_idx" ON "user_scopes"("userId", "appId");

-- CreateIndex
CREATE INDEX "user_scopes_scopeId_appId_idx" ON "user_scopes"("scopeId", "appId");

-- CreateIndex
CREATE INDEX "user_scopes_userId_grantedAt_idx" ON "user_scopes"("userId", "grantedAt");

-- CreateIndex
CREATE INDEX "user_scopes_expiresAt_idx" ON "user_scopes"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_scopes_userId_scopeId_appId_key" ON "user_scopes"("userId", "scopeId", "appId");

-- CreateIndex
CREATE INDEX "roles_organizationId_isActive_idx" ON "roles"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "roles_roleType_builtInRole_idx" ON "roles"("roleType", "builtInRole");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organizationId_name_key" ON "roles"("organizationId", "name");

-- CreateIndex
CREATE INDEX "role_scopes_scopeId_roleId_idx" ON "role_scopes"("scopeId", "roleId");

-- CreateIndex
CREATE INDEX "role_scopes_roleId_canManage_idx" ON "role_scopes"("roleId", "canManage");

-- CreateIndex
CREATE INDEX "role_scopes_grantedBy_grantedAt_idx" ON "role_scopes"("grantedBy", "grantedAt");

-- CreateIndex
CREATE UNIQUE INDEX "role_scopes_roleId_scopeId_key" ON "role_scopes"("roleId", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshToken_key" ON "sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "sessions_userId_appId_idx" ON "sessions"("userId", "appId");

-- CreateIndex
CREATE INDEX "sessions_userId_status_idx" ON "sessions"("userId", "status");

-- CreateIndex
CREATE INDEX "sessions_appId_status_idx" ON "sessions"("appId", "status");

-- CreateIndex
CREATE INDEX "sessions_deviceId_status_idx" ON "sessions"("deviceId", "status");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "sessions_lastUsedAt_idx" ON "sessions"("lastUsedAt");

-- CreateIndex
CREATE INDEX "sessions_userId_appId_status_idx" ON "sessions"("userId", "appId", "status");

-- CreateIndex
CREATE INDEX "sessions_status_expiresAt_idx" ON "sessions"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "sessions_deviceId_userId_idx" ON "sessions"("deviceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_key" ON "password_resets"("token");

-- CreateIndex
CREATE INDEX "password_resets_userId_used_idx" ON "password_resets"("userId", "used");

-- CreateIndex
CREATE INDEX "password_resets_expiresAt_used_idx" ON "password_resets"("expiresAt", "used");

-- CreateIndex
CREATE INDEX "password_resets_token_used_idx" ON "password_resets"("token", "used");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_used_idx" ON "email_verification_tokens"("userId", "used");

-- CreateIndex
CREATE INDEX "email_verification_tokens_expiresAt_used_idx" ON "email_verification_tokens"("expiresAt", "used");

-- CreateIndex
CREATE INDEX "email_verification_tokens_token_used_idx" ON "email_verification_tokens"("token", "used");

-- CreateIndex
CREATE UNIQUE INDEX "account_lockouts_email_key" ON "account_lockouts"("email");

-- CreateIndex
CREATE INDEX "account_lockouts_lockedUntil_idx" ON "account_lockouts"("lockedUntil");

-- CreateIndex
CREATE INDEX "external_identities_userId_isPrimary_idx" ON "external_identities"("userId", "isPrimary");

-- CreateIndex
CREATE INDEX "external_identities_provider_email_idx" ON "external_identities"("provider", "email");

-- CreateIndex
CREATE INDEX "external_identities_isVerified_isPrimary_idx" ON "external_identities"("isVerified", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "external_identities_provider_providerId_key" ON "external_identities"("provider", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "external_identities_userId_provider_key" ON "external_identities"("userId", "provider");

-- CreateIndex
CREATE INDEX "external_identity_events_userId_eventType_idx" ON "external_identity_events"("userId", "eventType");

-- CreateIndex
CREATE INDEX "external_identity_events_identityId_eventType_idx" ON "external_identity_events"("identityId", "eventType");

-- CreateIndex
CREATE INDEX "external_identity_events_createdAt_idx" ON "external_identity_events"("createdAt");

-- CreateIndex
CREATE INDEX "organization_external_providers_organizationId_isEnabled_idx" ON "organization_external_providers"("organizationId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "organization_external_providers_organizationId_provider_key" ON "organization_external_providers"("organizationId", "provider");

-- CreateIndex
CREATE INDEX "devices_userId_status_idx" ON "devices"("userId", "status");

-- CreateIndex
CREATE INDEX "devices_fingerprint_idx" ON "devices"("fingerprint");

-- CreateIndex
CREATE INDEX "devices_userId_lastUsedAt_idx" ON "devices"("userId", "lastUsedAt");

-- CreateIndex
CREATE INDEX "devices_status_isBlocked_idx" ON "devices"("status", "isBlocked");

-- CreateIndex
CREATE INDEX "devices_deviceType_osName_idx" ON "devices"("deviceType", "osName");

-- CreateIndex
CREATE INDEX "devices_isTrusted_userId_idx" ON "devices"("isTrusted", "userId");

-- CreateIndex
CREATE INDEX "devices_lastLoginAt_idx" ON "devices"("lastLoginAt");

-- CreateIndex
CREATE UNIQUE INDEX "devices_userId_fingerprint_key" ON "devices"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "device_events_deviceId_eventType_idx" ON "device_events"("deviceId", "eventType");

-- CreateIndex
CREATE INDEX "device_events_userId_eventType_idx" ON "device_events"("userId", "eventType");

-- CreateIndex
CREATE INDEX "device_events_eventType_createdAt_idx" ON "device_events"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "device_events_riskScore_createdAt_idx" ON "device_events"("riskScore", "createdAt");

-- CreateIndex
CREATE INDEX "device_events_userId_createdAt_idx" ON "device_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_metadata_schemas_organizationId_isActive_idx" ON "user_metadata_schemas"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "user_metadata_schemas_organizationId_name_version_key" ON "user_metadata_schemas"("organizationId", "name", "version");

-- CreateIndex
CREATE INDEX "user_metadata_history_userId_createdAt_idx" ON "user_metadata_history"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_metadata_history_fieldName_createdAt_idx" ON "user_metadata_history"("fieldName", "createdAt");

-- CreateIndex
CREATE INDEX "webhooks_organizationId_isActive_idx" ON "webhooks"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "webhooks_appId_isActive_idx" ON "webhooks"("appId", "isActive");

-- CreateIndex
CREATE INDEX "webhooks_scope_isActive_idx" ON "webhooks"("scope", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "webhooks_organizationId_url_key" ON "webhooks"("organizationId", "url");

-- CreateIndex
CREATE INDEX "webhook_events_webhookId_status_idx" ON "webhook_events"("webhookId", "status");

-- CreateIndex
CREATE INDEX "webhook_events_webhookId_createdAt_idx" ON "webhook_events"("webhookId", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_events_status_createdAt_idx" ON "webhook_events"("status", "createdAt");

-- CreateIndex
CREATE INDEX "allowed_origins_appId_isActive_idx" ON "allowed_origins"("appId", "isActive");

-- CreateIndex
CREATE INDEX "allowed_origins_appId_environment_idx" ON "allowed_origins"("appId", "environment");

-- CreateIndex
CREATE INDEX "allowed_origins_origin_isActive_idx" ON "allowed_origins"("origin", "isActive");

-- CreateIndex
CREATE INDEX "allowed_origins_isWildcard_isActive_idx" ON "allowed_origins"("isWildcard", "isActive");

-- CreateIndex
CREATE INDEX "allowed_origins_lastUsed_idx" ON "allowed_origins"("lastUsed");

-- CreateIndex
CREATE INDEX "allowed_origins_createdBy_createdAt_idx" ON "allowed_origins"("createdBy", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "allowed_origins_appId_origin_environment_key" ON "allowed_origins"("appId", "origin", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "request_traces_requestId_key" ON "request_traces"("requestId");

-- CreateIndex
CREATE INDEX "request_traces_requestId_idx" ON "request_traces"("requestId");

-- CreateIndex
CREATE INDEX "request_traces_userId_startTime_idx" ON "request_traces"("userId", "startTime");

-- CreateIndex
CREATE INDEX "request_traces_appId_startTime_idx" ON "request_traces"("appId", "startTime");

-- CreateIndex
CREATE INDEX "request_traces_traceId_idx" ON "request_traces"("traceId");

-- CreateIndex
CREATE INDEX "request_traces_success_statusCode_idx" ON "request_traces"("success", "statusCode");

-- CreateIndex
CREATE INDEX "request_traces_startTime_idx" ON "request_traces"("startTime");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_action_idx" ON "audit_logs"("actorId", "action");

-- CreateIndex
CREATE INDEX "audit_logs_targetId_action_idx" ON "audit_logs"("targetId", "action");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_severity_createdAt_idx" ON "audit_logs"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorType_actorId_idx" ON "audit_logs"("actorType", "actorId");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "audit_logs_status_createdAt_idx" ON "audit_logs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_requestId_idx" ON "audit_logs"("requestId");

-- CreateIndex
CREATE INDEX "audit_logs_sessionId_idx" ON "audit_logs"("sessionId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "platform_memberships" ADD CONSTRAINT "platform_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_memberships" ADD CONSTRAINT "platform_memberships_platformOrgId_fkey" FOREIGN KEY ("platformOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_memberships" ADD CONSTRAINT "app_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_memberships" ADD CONSTRAINT "app_memberships_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apps" ADD CONSTRAINT "apps_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_scopes" ADD CONSTRAINT "app_scopes_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_scopes" ADD CONSTRAINT "app_scopes_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_scopes" ADD CONSTRAINT "user_scopes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_scopes" ADD CONSTRAINT "user_scopes_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_inheritsFrom_fkey" FOREIGN KEY ("inheritsFrom") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identity_events" ADD CONSTRAINT "external_identity_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identity_events" ADD CONSTRAINT "external_identity_events_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "external_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_external_providers" ADD CONSTRAINT "organization_external_providers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_events" ADD CONSTRAINT "device_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_events" ADD CONSTRAINT "device_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_metadata_schemas" ADD CONSTRAINT "user_metadata_schemas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_metadata_history" ADD CONSTRAINT "user_metadata_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowed_origins" ADD CONSTRAINT "allowed_origins_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
