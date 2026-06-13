import { Mail } from "lucide-react";

import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { SettingsCategoryCard } from "../components/SettingsCategoryCard";

const SETTINGS_CATEGORIES = [
  {
    title: "Email & SMTP",
    description: "SMTP connection, test send, and password reset email.",
    to: "/communications/email",
    icon: Mail,
  },
] as const;

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <ListPageHeader title="Settings" />

      <section aria-label="Platform configuration">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SETTINGS_CATEGORIES.map((item) => (
            <SettingsCategoryCard key={item.to} {...item} />
          ))}
        </div>
      </section>
    </div>
  );
}
