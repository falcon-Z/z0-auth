/**
 * Token storage utilities for managing authentication tokens in the browser
 * Uses localStorage for persistence across browser sessions
 */

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string; // optional in secure cookie approach
  user: {
    id: string;
    email: string;
    name: string;
    roleType: string;
    scopes: string[];
  };
}

const ACCESS_TOKEN_KEY = "auth_access_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";
const USER_DATA_KEY = "auth_user_data";

/**
 * Store authentication tokens and user data in localStorage
 * @param tokens - Authentication tokens and user data to store
 */
export function storeTokens(tokens: StoredTokens): void {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    if (tokens.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(tokens.user));
  } catch (error) {
    console.error("Failed to store authentication tokens:", error);
    throw new Error("Failed to store authentication tokens");
  }
}

/**
 * Retrieve stored authentication tokens and user data
 * @returns StoredTokens | null - Stored tokens or null if not found
 */
export function getStoredTokens(): StoredTokens | null {
  try {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY) || undefined;
    const userDataStr = localStorage.getItem(USER_DATA_KEY);

    if (!accessToken || !userDataStr) {
      return null;
    }

    const user = JSON.parse(userDataStr);
    return {
      accessToken,
      refreshToken,
      user,
    };
  } catch (error) {
    console.error("Failed to retrieve stored tokens:", error);
    return null;
  }
}

/**
 * Get only the access token
 * @returns string | null - Access token or null if not found
 */
export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch (error) {
    console.error("Failed to retrieve access token:", error);
    return null;
  }
}

/**
 * Get only the refresh token
 * @returns string | null - Refresh token or null if not found
 */
export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error("Failed to retrieve refresh token:", error);
    return null;
  }
}

/**
 * Get stored user data
 * @returns object | null - User data or null if not found
 */
export function getStoredUser(): StoredTokens["user"] | null {
  try {
    const userDataStr = localStorage.getItem(USER_DATA_KEY);
    if (!userDataStr) {
      return null;
    }
    return JSON.parse(userDataStr);
  } catch (error) {
    console.error("Failed to retrieve user data:", error);
    return null;
  }
}

/**
 * Clear all stored authentication data
 */
export function clearStoredTokens(): void {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_DATA_KEY);
  } catch (error) {
    console.error("Failed to clear stored tokens:", error);
  }
}

/**
 * Check if user is authenticated (has valid tokens)
 * @returns boolean - True if tokens exist, false otherwise
 */
export function isAuthenticated(): boolean {
  const tokens = getStoredTokens();
  return tokens !== null;
}

/**
 * Update only the access token (useful for token refresh)
 * @param accessToken - New access token
 */
export function updateAccessToken(accessToken: string): void {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  } catch (error) {
    console.error("Failed to update access token:", error);
    throw new Error("Failed to update access token");
  }
}
