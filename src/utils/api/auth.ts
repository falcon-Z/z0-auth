/**
 * Auth API Client
 */

export interface RefreshResponse {
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
  requestId?: string;
}

/**
 * Refresh access token using HttpOnly refresh cookie
 */
export async function refreshAccessToken(): Promise<RefreshResponse> {
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  const data = await response.json();

  if (!response.ok) {
    const err: ApiError = {
      error: data.error || "Failed to refresh token",
      ...data,
    };
    throw err;
  }

  return data;
}
