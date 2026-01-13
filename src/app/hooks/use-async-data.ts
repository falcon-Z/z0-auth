/**
 * useAsyncData hook
 * Handles data fetching with loading, error, and refetch states using useReducer
 */

import { useReducer, useCallback, useEffect, useRef } from "react";

// State type
interface AsyncDataState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  isRefetching: boolean;
}

// Action types
type AsyncDataAction<T> =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; payload: T }
  | { type: "FETCH_ERROR"; payload: string }
  | { type: "REFETCH_START" }
  | { type: "RESET" };

// Reducer
function createReducer<T>() {
  return function reducer(
    state: AsyncDataState<T>,
    action: AsyncDataAction<T>
  ): AsyncDataState<T> {
    switch (action.type) {
      case "FETCH_START":
        return {
          ...state,
          isLoading: true,
          error: null,
        };
      case "FETCH_SUCCESS":
        return {
          ...state,
          isLoading: false,
          isRefetching: false,
          data: action.payload,
          error: null,
        };
      case "FETCH_ERROR":
        return {
          ...state,
          isLoading: false,
          isRefetching: false,
          error: action.payload,
        };
      case "REFETCH_START":
        return {
          ...state,
          isRefetching: true,
          error: null,
        };
      case "RESET":
        return {
          data: null,
          isLoading: true,
          isRefetching: false,
          error: null,
        };
      default:
        return state;
    }
  };
}

// Initial state factory
function createInitialState<T>(initialData?: T): AsyncDataState<T> {
  return {
    data: initialData ?? null,
    isLoading: !initialData,
    isRefetching: false,
    error: null,
  };
}

// Hook options
interface UseAsyncDataOptions<T> {
  /** Async function that fetches the data */
  fetchFn: () => Promise<T>;
  /** Dependencies that trigger refetch when changed */
  deps?: unknown[];
  /** Whether to fetch on mount (default: true) */
  enabled?: boolean;
  /** Initial data to use before fetch */
  initialData?: T;
  /** Callback on successful fetch */
  onSuccess?: (data: T) => void;
  /** Callback on error */
  onError?: (error: string) => void;
}

// Return type
interface UseAsyncDataReturn<T> {
  /** The fetched data */
  data: T | null;
  /** True during initial load */
  isLoading: boolean;
  /** True during refetch (data still available) */
  isRefetching: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Manually trigger refetch */
  refetch: () => Promise<void>;
  /** Reset state to initial */
  reset: () => void;
}

/**
 * Hook for fetching async data with loading and error states
 *
 * @example
 * const { data: orgs, isLoading, error, refetch } = useAsyncData({
 *   fetchFn: () => fetchOrganizations(),
 *   deps: [orgId],
 * });
 */
export function useAsyncData<T>({
  fetchFn,
  deps = [],
  enabled = true,
  initialData,
  onSuccess,
  onError,
}: UseAsyncDataOptions<T>): UseAsyncDataReturn<T> {
  const reducer = useCallback(createReducer<T>(), []);
  const [state, dispatch] = useReducer(reducer, initialData, createInitialState);

  // Track if component is mounted
  const isMountedRef = useRef(true);
  // Track current fetch to prevent race conditions
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(
    async (isRefetch = false) => {
      if (!enabled) return;

      const fetchId = ++fetchIdRef.current;
      dispatch({ type: isRefetch ? "REFETCH_START" : "FETCH_START" });

      try {
        const result = await fetchFn();

        // Only update if this is the latest fetch and component is mounted
        if (fetchId === fetchIdRef.current && isMountedRef.current) {
          dispatch({ type: "FETCH_SUCCESS", payload: result });
          onSuccess?.(result);
        }
      } catch (err) {
        if (fetchId === fetchIdRef.current && isMountedRef.current) {
          const errorMessage =
            err instanceof Error ? err.message : "An error occurred";
          dispatch({ type: "FETCH_ERROR", payload: errorMessage });
          onError?.(errorMessage);
        }
      }
    },
    [fetchFn, enabled, onSuccess, onError]
  );

  // Initial fetch and refetch on deps change
  useEffect(() => {
    fetchData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  return {
    data: state.data,
    isLoading: state.isLoading,
    isRefetching: state.isRefetching,
    error: state.error,
    refetch,
    reset,
  };
}

export type { UseAsyncDataOptions, UseAsyncDataReturn, AsyncDataState };
