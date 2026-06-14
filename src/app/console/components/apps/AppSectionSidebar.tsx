import { appSidebarItems } from "../../config/navigation";
import { SectionSidebar } from "../layout/SectionSidebar";

type AppSectionSidebarProps = {
  appId: string;
};

export function AppSectionSidebar({ appId }: AppSectionSidebarProps) {
  return <SectionSidebar items={appSidebarItems(appId)} ariaLabel="App sections" />;
}
