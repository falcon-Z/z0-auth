const API_BASE_URL = "/api";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  skipRefresh?: boolean; // Skip token refresh for this request
}

// Token refresh state to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * Attempt to refresh the access token using the refresh token cookie.
 * Returns true if refresh was successful, false otherwise.
 */
async function attemptTokenRefresh(): Promise<boolean> {
  // If already refreshing, wait for that to complete
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        return true;
      }

      // Refresh failed - user needs to log in again
      return false;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Authenticated fetch wrapper that handles token refresh on 401 errors.
 * Use this instead of raw fetch() for authenticated API calls.
 *
 * @example
 * const response = await authFetch('/api/v1/users/profile');
 * const data = await response.json();
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const fetchWithCredentials = async () => {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  };

  const response = await fetchWithCredentials();

  // Handle 401 - attempt token refresh and retry
  if (response.status === 401) {
    const refreshed = await attemptTokenRefresh();

    if (refreshed) {
      // Retry the original request with new token
      return fetchWithCredentials();
    }

    // Refresh failed - clear user data (redirect handled by caller or auth context)
    localStorage.removeItem("user");
  }

  return response;
}

async function apiCall<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { skipRefresh, ...fetchOptions } = options;
  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Authentication is handled via httpOnly cookies (access_token, refresh_token)
  // which are automatically sent with credentials: "include"
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    credentials: "include", // Important: Include cookies for authentication
    headers: {
      ...defaultHeaders,
      ...fetchOptions.headers,
    },
    body: fetchOptions.body ? JSON.stringify(fetchOptions.body) : undefined,
  });

  // Handle 401 Unauthorized - attempt token refresh and retry
  if (response.status === 401 && !skipRefresh) {
    const refreshed = await attemptTokenRefresh();

    if (refreshed) {
      // Retry the original request with the new token
      const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...fetchOptions,
        credentials: "include",
        headers: {
          ...defaultHeaders,
          ...fetchOptions.headers,
        },
        body: fetchOptions.body ? JSON.stringify(fetchOptions.body) : undefined,
      });

      const retryData = await retryResponse.json();

      if (!retryResponse.ok) {
        throw new ApiError(
          retryResponse.status,
          retryData.code || "UNKNOWN_ERROR",
          retryData.message || "An error occurred"
        );
      }

      return retryData;
    }

    // Refresh failed - redirect to login
    // Clear any stale user data and redirect
    localStorage.removeItem("user");
    window.location.href = "/login";
    throw new ApiError(401, "SESSION_EXPIRED", "Session expired. Please log in again.");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.code || "UNKNOWN_ERROR",
      data.message || "An error occurred"
    );
  }

  return data;
}

export const organizationsApi = {
  list: () => apiCall("/v1/orgs"),
  get: (id: string) => apiCall(`/v1/orgs/${id}`),
  create: (data: any) => apiCall("/v1/orgs", { method: "POST", body: data }),
  update: (id: string, data: any) =>
    apiCall(`/v1/orgs/${id}`, { method: "PUT", body: data }),
  delete: (id: string) => apiCall(`/v1/orgs/${id}`, { method: "DELETE" }),
};

export const appsApi = {
  list: (orgId: string) => apiCall(`/v1/orgs/${orgId}/apps`),
  get: (orgId: string, appId: string) =>
    apiCall(`/v1/orgs/${orgId}/apps/${appId}`),
  create: (orgId: string, data: any) =>
    apiCall(`/v1/orgs/${orgId}/apps`, { method: "POST", body: data }),
  update: (orgId: string, appId: string, data: any) =>
    apiCall(`/v1/orgs/${orgId}/apps/${appId}`, { method: "PUT", body: data }),
  delete: (orgId: string, appId: string) =>
    apiCall(`/v1/orgs/${orgId}/apps/${appId}`, { method: "DELETE" }),
  regenerateKey: (orgId: string, appId: string) =>
    apiCall(`/v1/orgs/${orgId}/apps/${appId}/regenerate-key`, {
      method: "POST",
    }),
};

export const orgMembersApi = {
  list: (orgId: string) => apiCall(`/v1/orgs/${orgId}/members`),
  invite: (orgId: string, data: any) =>
    apiCall(`/v1/orgs/${orgId}/members`, { method: "POST", body: data }),
  updateRole: (orgId: string, userId: string, role: string) =>
    apiCall(`/v1/orgs/${orgId}/members/${userId}`, {
      method: "PATCH",
      body: { role },
    }),
  remove: (orgId: string, userId: string) =>
    apiCall(`/v1/orgs/${orgId}/members/${userId}`, { method: "DELETE" }),
};

export const platformOrgsApi = {
  list: () => apiCall("/v1/platform/organizations"),
  get: (id: string) => apiCall(`/v1/platform/organizations/${id}`),
  create: (data: any) =>
    apiCall("/v1/platform/organizations", { method: "POST", body: data }),
  update: (id: string, data: any) =>
    apiCall(`/v1/platform/organizations/${id}`, { method: "PUT", body: data }),
  delete: (id: string) =>
    apiCall(`/v1/platform/organizations/${id}`, { method: "DELETE" }),
};

export const platformUsersApi = {
  list: () => apiCall("/v1/platform/users"),
  get: (id: string) => apiCall(`/v1/platform/users/${id}`),
  create: (data: any) =>
    apiCall("/v1/platform/users", { method: "POST", body: data }),
  update: (id: string, data: any) =>
    apiCall(`/v1/platform/users/${id}`, { method: "PUT", body: data }),
  delete: (id: string) =>
    apiCall(`/v1/platform/users/${id}`, { method: "DELETE" }),
};

export const usersApi = {
  getProfile: () => apiCall("/v1/users/profile"),
  updateProfile: (data: any) =>
    apiCall("/v1/users/profile", { method: "PUT", body: data }),
  changePassword: (data: any) =>
    apiCall("/v1/users/security/change-password", {
      method: "POST",
      body: data,
    }),
  getSessions: () => apiCall("/v1/users/sessions"),
  logoutSession: (sessionId: string) =>
    apiCall(`/v1/users/sessions/${sessionId}`, { method: "DELETE" }),
  logoutAllSessions: () => apiCall("/v1/users/sessions", { method: "DELETE" }),
};

export const authApi = {
  login: (email: string, password: string) =>
    apiCall("/auth/login", { method: "POST", body: { email, password } }),
  register: (data: any) =>
    apiCall("/auth/register", { method: "POST", body: data }),
  refresh: () => apiCall("/auth/refresh", { method: "POST" }),
  logout: () => apiCall("/auth/logout", { method: "POST" }),
};
