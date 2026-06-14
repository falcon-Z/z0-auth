import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@z0/components/ui/tabs";

import type { PageTab } from "./PageTabBar";

export type ResourceTab = PageTab;

const tabListClassName =
  "h-auto w-full justify-start rounded-none border-b bg-transparent p-0";

const tabTriggerClassName =
  "flex-none rounded-none px-4 py-2 shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent";

type ResourceTabsProps = {
  tabs: ResourceTab[];
  activeId: string;
  onChange: (id: string) => void;
  /** When set, tab panels render inside shadcn `TabsContent`. */
  panels?: Record<string, ReactNode>;
};

export function ResourceTabs({ tabs, activeId, onChange, panels }: ResourceTabsProps) {
  return (
    <Tabs value={activeId} onValueChange={onChange}>
      <TabsList variant="line" className={tabListClassName}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className={tabTriggerClassName}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {panels
        ? tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-6">
              {panels[tab.id]}
            </TabsContent>
          ))
        : null}
    </Tabs>
  );
}
