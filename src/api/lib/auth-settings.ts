import type {
  AppSignInSettingsResponse,
  InstanceSignInSettingsResponse,
  PutAppSignInSettingsRequest,
  PutInstanceSignInSettingsRequest,
  SignInMethod,
} from "@z0/contracts/auth-settings";
import { SIGN_IN_METHODS } from "@z0/contracts/auth-settings";
import { ErrorCodes } from "@z0/contracts/errors";

import { getDb, pgTextArray } from "./db";
import { problem } from "./http";
import { isSmtpReady } from "./smtp-settings";

const DEFAULT_METHODS: SignInMethod[] = ["password"];

type InstanceAuthRow = {
  sign_in_methods: string[];
  updated_at: Date | null;
};

type AppAuthRow = {
  sign_in_methods: string[];
  branding_name: string | null;
  branding_logo_url: string | null;
  branding_primary_color: string | null;
  updated_at: Date | null;
};

function normalizeMethods(methods: string[] | null | undefined): SignInMethod[] {
  if (!methods?.length) return [...DEFAULT_METHODS];
  const filtered = methods.filter((method): method is SignInMethod =>
    SIGN_IN_METHODS.includes(method as SignInMethod),
  );
  return filtered.length ? filtered : [...DEFAULT_METHODS];
}

function validateSignInMethods(methods: SignInMethod[] | undefined): { field: string; code: string; message: string }[] {
  if (!methods?.length) {
    return [{ field: "signInMethods", code: ErrorCodes.REQUIRED, message: "Choose at least one sign-in method" }];
  }
  const invalid = methods.filter((method) => !SIGN_IN_METHODS.includes(method));
  if (invalid.length) {
    return [{ field: "signInMethods", code: ErrorCodes.REQUIRED, message: "One or more sign-in methods are invalid" }];
  }
  return [];
}

function validatePrimaryColor(value: string | null | undefined): { field: string; code: string; message: string }[] {
  if (!value?.trim()) return [];
  if (!/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    return [{ field: "branding.primaryColor", code: ErrorCodes.REQUIRED, message: "Use a hex color like #2563eb" }];
  }
  return [];
}

function validateLogoUrl(value: string | null | undefined): { field: string; code: string; message: string }[] {
  if (!value?.trim()) return [];
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return [{ field: "branding.logoUrl", code: ErrorCodes.REQUIRED, message: "Logo URL must use http or https" }];
    }
  } catch {
    return [{ field: "branding.logoUrl", code: ErrorCodes.REQUIRED, message: "Enter a valid logo URL" }];
  }
  return [];
}

export async function getInstanceSignInSettingsForApi(): Promise<InstanceSignInSettingsResponse> {
  const [row] = await getDb()`
    SELECT sign_in_methods, updated_at
    FROM instance_auth_settings
    WHERE id = 1
  `;
  if (!row) {
    return { signInMethods: [...DEFAULT_METHODS], updatedAt: null };
  }
  const r = row as InstanceAuthRow;
  return {
    signInMethods: normalizeMethods(r.sign_in_methods),
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
}

export async function putInstanceSignInSettings(
  body: PutInstanceSignInSettingsRequest,
): Promise<{ ok: true; settings: InstanceSignInSettingsResponse } | { ok: false; response: Response }> {
  const errors = validateSignInMethods(body.signInMethods);
  if (errors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid sign-in settings.", { errors }) };
  }

  if (body.signInMethods.includes("magic_link") && !(await isSmtpReady())) {
    return {
      ok: false,
      response: problem(409, "Conflict", "Configure and verify email before enabling magic link sign-in.", {
        errors: [
          {
            field: "signInMethods",
            code: ErrorCodes.PASSWORD_RESET_UNAVAILABLE,
            message: "Email must be configured and verified before magic link sign-in",
          },
        ],
      }),
    };
  }

  await getDb()`
    INSERT INTO instance_auth_settings (id, sign_in_methods, updated_at)
    VALUES (1, ${pgTextArray(body.signInMethods)}, NOW())
    ON CONFLICT (id) DO UPDATE
    SET sign_in_methods = EXCLUDED.sign_in_methods, updated_at = NOW()
  `;

  return { ok: true, settings: await getInstanceSignInSettingsForApi() };
}

export async function getAppSignInSettingsForApi(appId: string): Promise<AppSignInSettingsResponse | null> {
  const [row] = await getDb()`
    SELECT
      sign_in_methods,
      branding_name,
      branding_logo_url,
      branding_primary_color,
      updated_at
    FROM app_auth_settings
    WHERE app_id = ${appId}
  `;
  if (!row) {
    return {
      appId,
      signInMethods: [...DEFAULT_METHODS],
      branding: { name: null, logoUrl: null, primaryColor: null },
      updatedAt: null,
    };
  }
  const r = row as AppAuthRow;
  return {
    appId,
    signInMethods: normalizeMethods(r.sign_in_methods),
    branding: {
      name: r.branding_name,
      logoUrl: r.branding_logo_url,
      primaryColor: r.branding_primary_color,
    },
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
}

export async function putAppSignInSettings(
  appId: string,
  body: PutAppSignInSettingsRequest,
): Promise<{ ok: true; settings: AppSignInSettingsResponse } | { ok: false; response: Response }> {
  const errors = [
    ...validateSignInMethods(body.signInMethods),
    ...validatePrimaryColor(body.branding?.primaryColor),
    ...validateLogoUrl(body.branding?.logoUrl),
  ];
  if (errors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid sign-in settings.", { errors }) };
  }

  if (body.signInMethods.includes("magic_link") && !(await isSmtpReady())) {
    return {
      ok: false,
      response: problem(409, "Conflict", "Configure and verify email before enabling magic link sign-in.", {
        errors: [
          {
            field: "signInMethods",
            code: ErrorCodes.PASSWORD_RESET_UNAVAILABLE,
            message: "Email must be configured and verified before magic link sign-in",
          },
        ],
      }),
    };
  }

  const branding = body.branding ?? {};
  await getDb()`
    INSERT INTO app_auth_settings (
      app_id,
      sign_in_methods,
      branding_name,
      branding_logo_url,
      branding_primary_color,
      updated_at
    )
    VALUES (
      ${appId},
      ${pgTextArray(body.signInMethods)},
      ${branding.name?.trim() || null},
      ${branding.logoUrl?.trim() || null},
      ${branding.primaryColor?.trim() || null},
      NOW()
    )
    ON CONFLICT (app_id) DO UPDATE
    SET
      sign_in_methods = EXCLUDED.sign_in_methods,
      branding_name = EXCLUDED.branding_name,
      branding_logo_url = EXCLUDED.branding_logo_url,
      branding_primary_color = EXCLUDED.branding_primary_color,
      updated_at = NOW()
  `;

  const settings = await getAppSignInSettingsForApi(appId);
  if (!settings) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Application not found.", {
        errors: [{ field: "appId", code: ErrorCodes.APP_NOT_FOUND, message: "Application not found" }],
      }),
    };
  }
  return { ok: true, settings };
}

export type ResolvedAuthConfig = {
  signInMethods: SignInMethod[];
  branding: {
    name: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
  };
};

export async function resolveAuthConfigForApp(appId: string, appName: string): Promise<ResolvedAuthConfig> {
  const settings = await getAppSignInSettingsForApi(appId);
  if (!settings) {
    return {
      signInMethods: [...DEFAULT_METHODS],
      branding: { name: appName, logoUrl: null, primaryColor: null },
    };
  }
  return {
    signInMethods: settings.signInMethods,
    branding: {
      name: settings.branding.name ?? appName,
      logoUrl: settings.branding.logoUrl,
      primaryColor: settings.branding.primaryColor,
    },
  };
}

export async function resolveAuthConfigForConsole(): Promise<ResolvedAuthConfig> {
  const settings = await getInstanceSignInSettingsForApi();
  return {
    signInMethods: settings.signInMethods,
    branding: { name: null, logoUrl: null, primaryColor: null },
  };
}

/** Configured sign-in methods available on hosted pages (magic link only when SMTP is ready). */
export async function resolveHostedSignInMethods(options: {
  realm: "console" | "app";
  appId?: string;
  appName?: string;
  smtpReady: boolean;
}): Promise<SignInMethod[]> {
  const configured =
    options.realm === "app" && options.appId
      ? (await resolveAuthConfigForApp(options.appId, options.appName ?? "App")).signInMethods
      : (await resolveAuthConfigForConsole()).signInMethods;
  return configured.filter((method) => method !== "magic_link" || options.smtpReady);
}
