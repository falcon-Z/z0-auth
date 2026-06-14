export type PlatformResource = {
  key: string;
  parentKey: string | null;
  label: string;
  scopes: PlatformScope[];
};

export type PlatformScope = {
  key: string;
  resourceKey: string;
  action: string;
  label: string;
  description: string;
};

export type InstanceRoleSummary = {
  id: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  scopeCount: number;
  memberCount: number;
};

export type InstanceRoleDetail = InstanceRoleSummary & {
  scopeKeys: string[];
};

export type CreateRoleRequest = {
  name: string;
  description?: string;
  scopeKeys: string[];
};

export type PatchRoleRequest = {
  name?: string;
  description?: string;
  scopeKeys?: string[];
};

export type MemberRolesResponse = {
  userId: string;
  roles: InstanceRoleSummary[];
};

export type SetMemberRolesRequest = {
  roleIds: string[];
};

export type TransferOwnershipRequest = {
  targetUserId: string;
  /** Role assigned to the previous owner after transfer. Defaults to admin. */
  previousOwnerRoleId?: string;
};
