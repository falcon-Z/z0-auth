import { Tabs, TabsList, TabsTrigger } from "@z0/components/ui/tabs";

export type PageTab = {
  id: string;
  label: string;
};

type PageTabBarProps = {
  tabs: PageTab[];
  value: string;
  onValueChange: (id: string) => void;
};

const tabListClassName =
  "h-auto w-full justify-start rounded-none border-b bg-transparent p-0";

const tabTriggerClassName =
  "flex-none rounded-none px-4 py-2 shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent";

export function PageTabBar({ tabs, value, onValueChange }: PageTabBarProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList variant="line" className={tabListClassName}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className={tabTriggerClassName}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
