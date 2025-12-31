/**
 * Shared components barrel export
 *
 * Usage:
 * import { PageHeader, FormDialog, ConfirmDialog } from "@z0/app/components/shared";
 */

export { PageHeader } from "./page-header";
export type { PageHeaderProps } from "./page-header";

export { FormDialog } from "./form-dialog";
export type { FormDialogProps } from "./form-dialog";

export { ConfirmDialog, DeleteConfirmDialog } from "./confirm-dialog";
export type { ConfirmDialogProps, DeleteConfirmDialogProps } from "./confirm-dialog";

export { SecretDialog, SingleSecretDialog } from "./secret-dialog";
export type { SecretDialogProps, SecretField, SingleSecretDialogProps } from "./secret-dialog";

export { StatusBadge } from "./status-badge";
export type { StatusType, StatusInput } from "./status-badge";

export { EmptyState } from "./empty-state";
export { LoadingSkeleton } from "./loading-skeleton";
export { ErrorBoundary } from "./error-boundary";
