import type { ReactNode } from "react";

import { usePermissions } from "../../hooks/use-permissions";
import { ListPageHeader } from "../crud/ListPageHeader";
import { SectionSidebar, type SectionSidebarItem } from "../layout/SectionSidebar";

type TeamWorkspaceLayoutProps = {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function TeamWorkspaceLayout({ title, actions, children }: TeamWorkspaceLayoutProps) {
  const { hasScope } = usePermissions();
  const sidebarItems: SectionSidebarItem[] = [
    { id: "people", label: "People", path: "/team", exact: true },
    ...(hasScope("roles:read") ? [{ id: "roles", label: "Roles", path: "/team/roles" }] : []),
  ];

  return (
    <div className="space-y-6">
      <ListPageHeader title={title} actions={actions} />
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <SectionSidebar items={sidebarItems} ariaLabel="Team sections" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
