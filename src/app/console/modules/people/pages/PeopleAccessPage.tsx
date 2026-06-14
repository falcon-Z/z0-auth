import { Link } from "react-router-dom";

import { StubPage } from "../../../components/layout/StubPage";
import { Button } from "@z0/components/ui/button";

export function PeopleAccessPage() {
  return (
    <div className="space-y-6">
      <StubPage
        title="Manage access"
        message="Roles and permissions are not ready yet. For now, everyone on your team has full access."
      />
      <Button variant="outline" size="sm" asChild>
        <Link to="/team">Back to team</Link>
      </Button>
    </div>
  );
}
