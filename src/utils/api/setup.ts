/**
 * Setup API Client
 * Provides typed client-side functions to interact with the setup API
 */

export interface SetupEligibilityResponse {
  eligible: boolean;
  configured: boolean;
  message: string;
  requestId?: string;
}

export interface EmailValidationResponse {
  success: boolean;
  available: boolean;
  email: string;
  message: string;
  requestId?: string;
}

export interface OrganizationValidationResponse {
  success: boolean;
  available: boolean;
  name: string;
  suggestedSlug?: string;
  message: string;
  requestId?: string;
}

export interface SetupCompleteResponse {
  success: boolean;
  message: string;
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    roleType: string;
    scopes: string[];
  };
  requestId?: string;
}

export interface ApiError {
  error: string;
  type?: string;
  code?: string;
  fieldErrors?: Array<{
    field: string;
    message: string;
    code?: string;
  }>;
  details?: any;
  requestId?: string;
}

/**
 * Check if system is eligible for setup
 */
export async function checkSetupEligibility(): Promise<SetupEligibilityResponse> {
  const response = await fetch("/api/setup/eligibility", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to check setup eligibility");
  }

  return data;
}

/**
 * Validate email availability
 */
export async function validateEmail(
  email: string
): Promise<EmailValidationResponse> {
  const response = await fetch("/api/setup/validate/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error: ApiError = {
      error: data.error || "Failed to validate email",
      ...data,
    };
    throw error;
  }

  return data;
}

/**
 * Validate organization name availability
 */
export async function validateOrganization(
  name: string,
  slug?: string
): Promise<OrganizationValidationResponse> {
  const response = await fetch("/api/setup/validate/organization", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, slug }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error: ApiError = {
      error: data.error || "Failed to validate organization",
      ...data,
    };
    throw error;
  }

  return data;
}

/**
 * Complete super admin setup
 */
export async function completeSetup(data: {
  email: string;
  password: string;
  name: string;
  organization: string;
}): Promise<SetupCompleteResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("/api/setup/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = await response.json();

    if (!response.ok) {
      const error: ApiError = {
        error: result.error || "Setup failed",
        ...result,
      };
      throw error;
    }

    return result;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw {
        error: "Request timed out",
        type: "network",
        code: "TIMEOUT",
      } as ApiError;
    }
    throw err;
  }
}
