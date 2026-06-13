import { PageTabBar, type PageTab } from "./PageTabBar";

export type ResourceTab = PageTab;

type ResourceTabsProps = {
  tabs: ResourceTab[];
  activeId: string;
  onChange: (id: string) => void;
};

export function ResourceTabs({ tabs, activeId, onChange }: ResourceTabsProps) {
  return <PageTabBar tabs={tabs} value={activeId} onValueChange={onChange} />;
}
