/**
 * Custom hooks barrel export
 *
 * Usage:
 * import { useAsyncData, useDialog, useCrudPage } from "@z0/app/hooks";
 */

export { useAsyncData } from "./use-async-data";
export type {
  UseAsyncDataOptions,
  UseAsyncDataReturn,
  AsyncDataState,
} from "./use-async-data";

export { useDialog, useDialogs } from "./use-dialog";
export type { DialogState, UseDialogReturn } from "./use-dialog";

export { useCrudPage } from "./use-crud-page";
export type {
  CrudPageState,
  UseCrudPageOptions,
  UseCrudPageReturn,
  DialogType,
} from "./use-crud-page";
