import type { ReactNode } from "react";

type ListPageHeaderProps = {
  title: string;
  actions?: ReactNode;
};

export function ListPageHeader({ title, actions }: ListPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
