import { Outlet } from "react-router-dom";

import { Avatar, AvatarFallback } from "@z0/components/ui/avatar";
import { Badge } from "@z0/components/ui/badge";
import { SectionSidebar, type SectionSidebarItem } from "../../../components/layout/SectionSidebar";
import { initialsFromName } from "../../../lib/initials";
import { useSession } from "../../../context/session-context";

const PROFILE_SECTIONS: SectionSidebarItem[] = [
  { id: "overview", label: "Overview", path: "/profile", exact: true },
  { id: "security", label: "Security", path: "/profile/security" },
  { id: "sessions", label: "Sessions", path: "/profile/sessions" },
];

export function ProfileLayout() {
  const { session } = useSession();
  const user = session.user!;

  return (
    <div className="space-y-6">
      <div className="flex min-w-0 items-start gap-4">
        <Avatar className="size-16 shrink-0 rounded-xl text-lg sm:size-20 sm:text-xl">
          <AvatarFallback className="rounded-xl bg-muted font-medium text-foreground">
            {initialsFromName(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-1 pt-1">
          <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          {session.isInstanceMember ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {session.isBootstrap ? (
                <Badge variant="secondary">Owner</Badge>
              ) : (
                <Badge variant="outline">Member</Badge>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <SectionSidebar items={PROFILE_SECTIONS} ariaLabel="Account sections" />
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
