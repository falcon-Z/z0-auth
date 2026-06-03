export type UserStatus = "active" | "disabled";

export type PlatformUserSummary = {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  createdAt: string;
  isInstanceMember: boolean;
};

export type PlatformUserDetail = PlatformUserSummary & {
  activeSessionCount: number;
  isBootstrap: boolean;
};

export type PatchPlatformUserRequest = {
  status: UserStatus;
};
