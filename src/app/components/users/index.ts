/**
 * Users components barrel export
 *
 * Usage:
 * import {
 *   UserTable,
 *   GrantAccessDialog,
 *   EditUserRoleDialog,
 * } from "@z0/app/components/users";
 */

// Tables
export { UserTable } from "./user-table";
export type { UserTableProps } from "./user-table";

// Column definitions
export { getUserColumns } from "./user-columns";
export type { UserColumnsOptions, PlatformUser } from "./user-columns";

// Dialogs
export {
  GrantAccessDialog,
  EditUserRoleDialog,
  RevokeAccessDialog,
} from "./user-dialogs";
export type {
  GrantAccessDialogProps,
  EditUserRoleDialogProps,
  RevokeAccessDialogProps,
} from "./user-dialogs";
