import type { ReactNode } from "react";

import { ListPageHeader } from "../crud/ListPageHeader";

type ConsolePageProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function ConsolePage({ title, description, actions, children }: ConsolePageProps) {
  return (
    <div className="space-y-6">
      <ListPageHeader title={title} actions={actions} />
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </div>
  );
}
