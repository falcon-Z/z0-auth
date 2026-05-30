import { cn } from "../../lib/utils";

export type ResourceTab = {
  id: string;
  label: string;
};

type ResourceTabsProps = {
  tabs: ResourceTab[];
  activeId: string;
  onChange: (id: string) => void;
};

export function ResourceTabs({ tabs, activeId, onChange }: ResourceTabsProps) {
  return (
    <div className="flex gap-1 border-b">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={cn(
            "border-b-2 px-4 py-2 text-sm font-medium transition-colors -mb-px",
            activeId === tab.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
