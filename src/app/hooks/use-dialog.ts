/**
 * useDialog hook
 * Manages dialog open/close state with optional associated data
 */

import { useReducer, useCallback } from "react";

// State type
interface DialogState<T> {
  isOpen: boolean;
  data: T | null;
}

// Action types
type DialogAction<T> =
  | { type: "OPEN"; payload?: T }
  | { type: "CLOSE" }
  | { type: "SET_DATA"; payload: T };

// Reducer
function createReducer<T>() {
  return function reducer(
    state: DialogState<T>,
    action: DialogAction<T>
  ): DialogState<T> {
    switch (action.type) {
      case "OPEN":
        return {
          isOpen: true,
          data: action.payload ?? null,
        };
      case "CLOSE":
        return {
          isOpen: false,
          data: null,
        };
      case "SET_DATA":
        return {
          ...state,
          data: action.payload,
        };
      default:
        return state;
    }
  };
}

// Initial state
const initialState: DialogState<unknown> = {
  isOpen: false,
  data: null,
};

// Return type
interface UseDialogReturn<T> {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Data associated with the dialog */
  data: T | null;
  /** Open the dialog, optionally with data */
  open: (data?: T) => void;
  /** Close the dialog and clear data */
  close: () => void;
  /** Update the data without changing open state */
  setData: (data: T) => void;
  /** Handler for Dialog's onOpenChange prop */
  onOpenChange: (open: boolean) => void;
}

/**
 * Hook for managing dialog state
 *
 * @example
 * // Simple dialog
 * const dialog = useDialog();
 * <Dialog open={dialog.isOpen} onOpenChange={dialog.onOpenChange}>
 *
 * @example
 * // Dialog with data (e.g., edit item)
 * const editDialog = useDialog<Organization>();
 * const handleEdit = (org: Organization) => editDialog.open(org);
 * // In dialog: editDialog.data contains the organization
 */
export function useDialog<T = undefined>(): UseDialogReturn<T> {
  const reducer = useCallback(createReducer<T>(), []);
  const [state, dispatch] = useReducer(
    reducer,
    initialState as DialogState<T>
  );

  const open = useCallback((data?: T) => {
    dispatch({ type: "OPEN", payload: data });
  }, []);

  const close = useCallback(() => {
    dispatch({ type: "CLOSE" });
  }, []);

  const setData = useCallback((data: T) => {
    dispatch({ type: "SET_DATA", payload: data });
  }, []);

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        dispatch({ type: "OPEN" });
      } else {
        dispatch({ type: "CLOSE" });
      }
    },
    []
  );

  return {
    isOpen: state.isOpen,
    data: state.data,
    open,
    close,
    setData,
    onOpenChange,
  };
}

/**
 * Hook for managing multiple named dialogs
 *
 * @example
 * const dialogs = useDialogs(['create', 'edit', 'delete'] as const);
 * dialogs.open('edit', item);
 * dialogs.isOpen('edit') // true
 * dialogs.data('edit') // item
 */
export function useDialogs<TName extends string, TData = unknown>(
  names: readonly TName[]
) {
  type DialogStates = Record<TName, DialogState<TData>>;
  type DialogActions =
    | { type: "OPEN"; name: TName; payload?: TData }
    | { type: "CLOSE"; name: TName }
    | { type: "CLOSE_ALL" };

  const initialStates = names.reduce((acc, name) => {
    acc[name] = { isOpen: false, data: null };
    return acc;
  }, {} as DialogStates);

  function reducer(state: DialogStates, action: DialogActions): DialogStates {
    switch (action.type) {
      case "OPEN":
        return {
          ...state,
          [action.name]: { isOpen: true, data: action.payload ?? null },
        };
      case "CLOSE":
        return {
          ...state,
          [action.name]: { isOpen: false, data: null },
        };
      case "CLOSE_ALL":
        return initialStates;
      default:
        return state;
    }
  }

  const [state, dispatch] = useReducer(reducer, initialStates);

  return {
    isOpen: (name: TName) => state[name].isOpen,
    data: (name: TName) => state[name].data,
    open: (name: TName, data?: TData) =>
      dispatch({ type: "OPEN", name, payload: data }),
    close: (name: TName) => dispatch({ type: "CLOSE", name }),
    closeAll: () => dispatch({ type: "CLOSE_ALL" }),
    onOpenChange: (name: TName) => (open: boolean) => {
      if (!open) dispatch({ type: "CLOSE", name });
    },
  };
}

export type { DialogState, UseDialogReturn };
