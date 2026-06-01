import { Link } from "react-router-dom";
import { ChevronRight, KeyRound, MonitorSmartphone } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@z0/components/ui/card";
import { ConsolePage } from "../../../components/layout/ConsolePage";
import { useSession } from "../../../context/session-context";

const sections = [
  {
    title: "Password",
    description: "Change the password you use to sign in to the console.",
    to: "/profile/security",
    icon: KeyRound,
  },
  {
    title: "Sessions",
    description: "See where you are signed in and revoke access you do not recognize.",
    to: "/profile/sessions",
    icon: MonitorSmartphone,
  },
] as const;

export function ProfileHomePage() {
  const { session } = useSession();

  return (
    <ConsolePage
      title="Your account"
      description={`Signed in as ${session.user.email}. Security settings here apply to you, not to a tenant or the whole platform.`}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.to} className="transition-colors hover:bg-muted/20">
              <Link to={section.to} className="block h-full">
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{section.title}</CardTitle>
                    <CardDescription>{section.description}</CardDescription>
                  </div>
                  <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                </CardHeader>
                <CardContent>
                  <span className="text-primary inline-flex items-center gap-1 text-sm font-medium">
                    Manage
                    <ChevronRight className="size-4" />
                  </span>
                </CardContent>
              </Link>
            </Card>
          );
        })}
      </div>
    </ConsolePage>
  );
}
