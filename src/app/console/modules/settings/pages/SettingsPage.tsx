import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { SETTINGS_LINKS } from "../../../config/navigation";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <ListPageHeader title="Settings" />

      <section aria-label="Instance settings">
        <ul className="divide-y rounded-lg border">
          {SETTINGS_LINKS.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className="flex items-start justify-between gap-4 px-4 py-4 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                </div>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
