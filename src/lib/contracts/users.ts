export type UserStatus = "active" | "disabled";

export type PlatformUserSummary = {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  createdAt: string;
  platformRoles: string[];
};

export type PatchPlatformUserRequest = {
  status: UserStatus;
};
