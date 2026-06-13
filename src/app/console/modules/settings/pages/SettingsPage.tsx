import { Link } from "react-router-dom";
import { ChevronRight, Mail } from "lucide-react";

import { ListPageHeader } from "../../../components/crud/ListPageHeader";

const SETTINGS_LINKS = [
  { title: "Email & SMTP", to: "/communications/email", icon: Mail },
] as const;

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <ListPageHeader title="Settings" />

      <ul className="grid gap-2">
        {SETTINGS_LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs transition-colors hover:border-foreground/20"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 font-medium">{item.title}</span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
