import { LogOut } from "lucide-react";

import { Button } from "@z0/components/ui/button";
import { SidebarFooter } from "@z0/components/ui/sidebar";
import { useSession } from "../../context/session-context";
import { SidebarIdentity } from "./SidebarIdentity";

export function SidebarAccountFooter() {
  const { signOut } = useSession();

  return (
    <SidebarFooter className="gap-2 border-t p-2">
      <SidebarIdentity />
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-start text-muted-foreground"
        onClick={() => void signOut()}
      >
        <LogOut className="size-4" />
        Sign out
      </Button>
    </SidebarFooter>
  );
}
