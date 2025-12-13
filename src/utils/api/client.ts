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
}

async function apiCall<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const token = localStorage.getItem("accessToken");
  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    defaultHeaders["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

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
