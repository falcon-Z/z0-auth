import { ConsolePage } from "../../../components/layout/ConsolePage";
import { DashboardLinkCard } from "../../../components/dashboard/DashboardLinkCard";

const sections = [
  { title: "Password", to: "/profile/security" },
  { title: "Sessions", to: "/profile/sessions" },
] as const;

export function ProfileHomePage() {
  return (
    <ConsolePage title="Your account">
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <DashboardLinkCard key={section.to} title={section.title} to={section.to} />
        ))}
      </div>
    </ConsolePage>
  );
}
