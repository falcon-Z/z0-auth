/**
 * useCrudPage hook
 * Complete CRUD page state management using useReducer
 * Replaces 6-10 useState calls with a single, coherent state machine
 */

import { useReducer, useCallback, useEffect, useRef } from "react";

// Dialog types that can be open
type DialogType = "create" | "edit" | "delete" | "view" | null;

// State type
interface CrudPageState<T> {
  /** List of items */
  items: T[];
  /** Loading state for initial fetch */
  isLoading: boolean;
  /** Loading state for refetch (items still visible) */
  isRefetching: boolean;
  /** Error message */
  error: string | null;
  /** Currently selected item (for edit/delete/view) */
  selectedItem: T | null;
  /** Which dialog is currently open */
  activeDialog: DialogType;
  /** Whether a mutation is in progress */
  isSubmitting: boolean;
  /** Search/filter query */
  searchQuery: string;
}

// Action types
type CrudPageAction<T> =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; payload: T[] }
  | { type: "FETCH_ERROR"; payload: string }
  | { type: "REFETCH_START" }
  | { type: "OPEN_DIALOG"; dialog: Exclude<DialogType, null>; item?: T }
  | { type: "CLOSE_DIALOG" }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS" }
  | { type: "SUBMIT_ERROR"; payload: string }
  | { type: "SET_SEARCH"; payload: string }
  | { type: "ADD_ITEM"; payload: T }
  | { type: "UPDATE_ITEM"; payload: T; id: string }
  | { type: "REMOVE_ITEM"; id: string }
  | { type: "RESET" };

// Reducer factory
function createReducer<T extends { id: string }>() {
  return function reducer(
    state: CrudPageState<T>,
    action: CrudPageAction<T>
  ): CrudPageState<T> {
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
          items: action.payload,
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

      case "OPEN_DIALOG":
        return {
          ...state,
          activeDialog: action.dialog,
          selectedItem: action.item ?? null,
        };

      case "CLOSE_DIALOG":
        return {
          ...state,
          activeDialog: null,
          selectedItem: null,
          isSubmitting: false,
          error: null,
        };

      case "SUBMIT_START":
        return {
          ...state,
          isSubmitting: true,
          error: null,
        };

      case "SUBMIT_SUCCESS":
        return {
          ...state,
          isSubmitting: false,
          activeDialog: null,
          selectedItem: null,
        };

      case "SUBMIT_ERROR":
        return {
          ...state,
          isSubmitting: false,
          error: action.payload,
        };

      case "SET_SEARCH":
        return {
          ...state,
          searchQuery: action.payload,
        };

      case "ADD_ITEM":
        return {
          ...state,
          items: [action.payload, ...state.items],
        };

      case "UPDATE_ITEM":
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.id ? action.payload : item
          ),
        };

      case "REMOVE_ITEM":
        return {
          ...state,
          items: state.items.filter((item) => item.id !== action.id),
        };

      case "RESET":
        return createInitialState();

      default:
        return state;
    }
  };
}

// Initial state factory
function createInitialState<T>(): CrudPageState<T> {
  return {
    items: [],
    isLoading: true,
    isRefetching: false,
    error: null,
    selectedItem: null,
    activeDialog: null,
    isSubmitting: false,
    searchQuery: "",
  };
}

// Hook options
interface UseCrudPageOptions<T, TCreate, TUpdate> {
  /** Function to fetch all items */
  fetchItems: () => Promise<T[]>;
  /** Function to create an item (optional) */
  createItem?: (data: TCreate) => Promise<T>;
  /** Function to update an item (optional) */
  updateItem?: (id: string, data: TUpdate) => Promise<T>;
  /** Function to delete an item (optional) */
  deleteItem?: (id: string) => Promise<void>;
  /** Dependencies that trigger refetch */
  deps?: unknown[];
  /** Callback on successful create */
  onCreateSuccess?: (item: T) => void;
  /** Callback on successful update */
  onUpdateSuccess?: (item: T) => void;
  /** Callback on successful delete */
  onDeleteSuccess?: (id: string) => void;
  /** Callback on any error */
  onError?: (error: string) => void;
}

// Return type
interface UseCrudPageReturn<T, TCreate, TUpdate> {
  // Data
  items: T[];
  filteredItems: T[];
  selectedItem: T | null;

  // Loading states
  isLoading: boolean;
  isRefetching: boolean;
  isSubmitting: boolean;

  // Error
  error: string | null;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Dialog state
  activeDialog: DialogType;
  isDialogOpen: (dialog: Exclude<DialogType, null>) => boolean;

  // Dialog actions
  openCreateDialog: () => void;
  openEditDialog: (item: T) => void;
  openDeleteDialog: (item: T) => void;
  openViewDialog: (item: T) => void;
  closeDialog: () => void;

  // CRUD actions
  refetch: () => Promise<void>;
  handleCreate: (data: TCreate) => Promise<void>;
  handleUpdate: (id: string, data: TUpdate) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;

  // Direct state manipulation (for optimistic updates)
  addItem: (item: T) => void;
  updateItemInList: (id: string, item: T) => void;
  removeItem: (id: string) => void;
}

/**
 * Hook for managing CRUD page state
 *
 * @example
 * const {
 *   items,
 *   isLoading,
 *   openCreateDialog,
 *   openEditDialog,
 *   handleCreate,
 *   handleDelete,
 * } = useCrudPage({
 *   fetchItems: () => fetchOrganizations(orgId),
 *   createItem: (data) => createOrganization(data),
 *   deleteItem: (id) => deleteOrganization(id),
 *   deps: [orgId],
 * });
 */
export function useCrudPage<
  T extends { id: string },
  TCreate = Partial<T>,
  TUpdate = Partial<T>
>({
  fetchItems,
  createItem,
  updateItem,
  deleteItem,
  deps = [],
  onCreateSuccess,
  onUpdateSuccess,
  onDeleteSuccess,
  onError,
}: UseCrudPageOptions<T, TCreate, TUpdate>): UseCrudPageReturn<
  T,
  TCreate,
  TUpdate
> {
  const reducer = useCallback(createReducer<T>(), []);
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  const isMountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  // Fetch data
  const fetchData = useCallback(
    async (isRefetch = false) => {
      const fetchId = ++fetchIdRef.current;
      dispatch({ type: isRefetch ? "REFETCH_START" : "FETCH_START" });

      try {
        const result = await fetchItems();
        if (fetchId === fetchIdRef.current && isMountedRef.current) {
          dispatch({ type: "FETCH_SUCCESS", payload: result });
        }
      } catch (err) {
        if (fetchId === fetchIdRef.current && isMountedRef.current) {
          const errorMessage =
            err instanceof Error ? err.message : "Failed to fetch data";
          dispatch({ type: "FETCH_ERROR", payload: errorMessage });
          onError?.(errorMessage);
        }
      }
    },
    [fetchItems, onError]
  );

  // Initial fetch and refetch on deps change
  useEffect(() => {
    fetchData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Dialog actions
  const openCreateDialog = useCallback(() => {
    dispatch({ type: "OPEN_DIALOG", dialog: "create" });
  }, []);

  const openEditDialog = useCallback((item: T) => {
    dispatch({ type: "OPEN_DIALOG", dialog: "edit", item });
  }, []);

  const openDeleteDialog = useCallback((item: T) => {
    dispatch({ type: "OPEN_DIALOG", dialog: "delete", item });
  }, []);

  const openViewDialog = useCallback((item: T) => {
    dispatch({ type: "OPEN_DIALOG", dialog: "view", item });
  }, []);

  const closeDialog = useCallback(() => {
    dispatch({ type: "CLOSE_DIALOG" });
  }, []);

  // CRUD actions
  const refetch = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  const handleCreate = useCallback(
    async (data: TCreate) => {
      if (!createItem) {
        throw new Error("createItem function not provided");
      }

      dispatch({ type: "SUBMIT_START" });

      try {
        const newItem = await createItem(data);
        if (isMountedRef.current) {
          dispatch({ type: "SUBMIT_SUCCESS" });
          dispatch({ type: "ADD_ITEM", payload: newItem });
          onCreateSuccess?.(newItem);
        }
      } catch (err) {
        if (isMountedRef.current) {
          const errorMessage =
            err instanceof Error ? err.message : "Failed to create";
          dispatch({ type: "SUBMIT_ERROR", payload: errorMessage });
          onError?.(errorMessage);
          throw err;
        }
      }
    },
    [createItem, onCreateSuccess, onError]
  );

  const handleUpdate = useCallback(
    async (id: string, data: TUpdate) => {
      if (!updateItem) {
        throw new Error("updateItem function not provided");
      }

      dispatch({ type: "SUBMIT_START" });

      try {
        const updatedItem = await updateItem(id, data);
        if (isMountedRef.current) {
          dispatch({ type: "SUBMIT_SUCCESS" });
          dispatch({ type: "UPDATE_ITEM", payload: updatedItem, id });
          onUpdateSuccess?.(updatedItem);
        }
      } catch (err) {
        if (isMountedRef.current) {
          const errorMessage =
            err instanceof Error ? err.message : "Failed to update";
          dispatch({ type: "SUBMIT_ERROR", payload: errorMessage });
          onError?.(errorMessage);
          throw err;
        }
      }
    },
    [updateItem, onUpdateSuccess, onError]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!deleteItem) {
        throw new Error("deleteItem function not provided");
      }

      dispatch({ type: "SUBMIT_START" });

      try {
        await deleteItem(id);
        if (isMountedRef.current) {
          dispatch({ type: "SUBMIT_SUCCESS" });
          dispatch({ type: "REMOVE_ITEM", id });
          onDeleteSuccess?.(id);
        }
      } catch (err) {
        if (isMountedRef.current) {
          const errorMessage =
            err instanceof Error ? err.message : "Failed to delete";
          dispatch({ type: "SUBMIT_ERROR", payload: errorMessage });
          onError?.(errorMessage);
          throw err;
        }
      }
    },
    [deleteItem, onDeleteSuccess, onError]
  );

  // Search
  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: "SET_SEARCH", payload: query });
  }, []);

  // Direct state manipulation
  const addItem = useCallback((item: T) => {
    dispatch({ type: "ADD_ITEM", payload: item });
  }, []);

  const updateItemInList = useCallback((id: string, item: T) => {
    dispatch({ type: "UPDATE_ITEM", payload: item, id });
  }, []);

  const removeItem = useCallback((id: string) => {
    dispatch({ type: "REMOVE_ITEM", id });
  }, []);

  // Filter items by search query (simple name/email search)
  const filteredItems = state.items.filter((item) => {
    if (!state.searchQuery) return true;
    const query = state.searchQuery.toLowerCase();
    const itemAny = item as Record<string, unknown>;
    return (
      (typeof itemAny.name === "string" &&
        itemAny.name.toLowerCase().includes(query)) ||
      (typeof itemAny.email === "string" &&
        itemAny.email.toLowerCase().includes(query)) ||
      (typeof itemAny.slug === "string" &&
        itemAny.slug.toLowerCase().includes(query))
    );
  });

  return {
    // Data
    items: state.items,
    filteredItems,
    selectedItem: state.selectedItem,

    // Loading states
    isLoading: state.isLoading,
    isRefetching: state.isRefetching,
    isSubmitting: state.isSubmitting,

    // Error
    error: state.error,

    // Search
    searchQuery: state.searchQuery,
    setSearchQuery,

    // Dialog state
    activeDialog: state.activeDialog,
    isDialogOpen: (dialog) => state.activeDialog === dialog,

    // Dialog actions
    openCreateDialog,
    openEditDialog,
    openDeleteDialog,
    openViewDialog,
    closeDialog,

    // CRUD actions
    refetch,
    handleCreate,
    handleUpdate,
    handleDelete,

    // Direct manipulation
    addItem,
    updateItemInList,
    removeItem,
  };
}

export type { CrudPageState, UseCrudPageOptions, UseCrudPageReturn, DialogType };
