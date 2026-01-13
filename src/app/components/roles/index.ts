/**
 * Roles components barrel export
 *
 * Usage:
 * import {
 *   RoleTable,
 *   CreateRoleDialog,
 *   EditRoleDialog,
 *   DeleteRoleDialog,
 * } from "@z0/app/components/roles";
 */

// Tables
export { RoleTable } from "./role-table";
export type { RoleTableProps } from "./role-table";

// Column definitions
export { getRoleColumns } from "./role-columns";
export type { RoleColumnsOptions, Role } from "./role-columns";

// Dialogs
export { CreateRoleDialog, EditRoleDialog, DeleteRoleDialog } from "./role-dialogs";
export type {
  CreateRoleDialogProps,
  EditRoleDialogProps,
  DeleteRoleDialogProps,
  RoleInput,
} from "./role-dialogs";
