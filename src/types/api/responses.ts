/**
 * Standard API response types
 * All API endpoints should use these response formats
 */

/**
 * Standard success response wrapper
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
  requestId: string;
  message?: string;
}

/**
 * Paginated list response
 */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  total: number;
  requestId: string;
  page?: number;
  pageSize?: number;
}

/**
 * Standard error response (matches ErrorResponseBuilder output)
 */
export interface ApiErrorResponse {
  error: string;
  type: string;
  code: string;
  details?: unknown;
  timestamp: string;
  requestId?: string;
}

/**
 * Generic list response (non-paginated)
 */
export interface ListResponse<T> {
  success: true;
  data: T[];
  total: number;
  requestId: string;
}

/**
 * Delete/action response
 */
export interface ActionResponse {
  success: true;
  message: string;
  requestId: string;
}

/**
 * Helper type to extract data from API response
 */
export type ExtractData<T> = T extends ApiResponse<infer D> ? D : never;

/**
 * Helper type for async API call result
 */
export type ApiResult<T> = Promise<ApiResponse<T>>;
export type ListResult<T> = Promise<ListResponse<T>>;
