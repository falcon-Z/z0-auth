import { LogOut } from "lucide-react";

import { Button } from "@z0/components/ui/button";
import { SidebarFooter } from "@z0/components/ui/sidebar";
import { useSession } from "../../context/session-context";

export function SidebarAccountFooter() {
  const { signOut } = useSession();

  return (
    <SidebarFooter className="border-t p-2">
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
