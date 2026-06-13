import type { ReactNode } from "react";

type ListPageHeaderProps = {
  title: string;
  actions?: ReactNode;
};

export function ListPageHeader({ title, actions }: ListPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
