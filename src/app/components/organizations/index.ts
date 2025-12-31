/**
 * Organizations components barrel export
 *
 * Usage:
 * import {
 *   OrganizationTable,
 *   OrganizationForm,
 *   MemberTable,
 *   CreateOrganizationDialog,
 * } from "@z0/components/organizations";
 */

// Tables
export { OrganizationTable } from "./organization-table";
export type { OrganizationTableProps } from "./organization-table";

export { MemberTable } from "./member-table";
export type { MemberTableProps } from "./member-table";

// Column definitions
export { getOrganizationColumns } from "./organization-columns";
export type { OrganizationColumnsOptions } from "./organization-columns";

export { getMemberColumns } from "./member-columns";
export type { MemberColumnsOptions } from "./member-columns";

// Forms
export { OrganizationForm } from "./organization-form";
export type { OrganizationFormProps } from "./organization-form";

export { MemberInviteForm } from "./member-invite-form";
export type { MemberInviteFormProps } from "./member-invite-form";

// Dialogs
export {
  CreateOrganizationDialog,
  EditOrganizationDialog,
  DeleteOrganizationDialog,
} from "./organization-dialogs";
export type {
  CreateOrganizationDialogProps,
  EditOrganizationDialogProps,
  DeleteOrganizationDialogProps,
} from "./organization-dialogs";

export {
  InviteMemberDialog,
  EditMemberRoleDialog,
  RemoveMemberDialog,
} from "./member-dialogs";
export type {
  InviteMemberDialogProps,
  EditMemberRoleDialogProps,
  RemoveMemberDialogProps,
} from "./member-dialogs";
