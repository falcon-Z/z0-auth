import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";

import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent } from "@z0/components/ui/card";
import { EntityDetailLayout } from "../../../components/layout/EntityDetailLayout";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { useMembersData } from "../../../hooks/use-members-data";
import { useSession } from "../../../context/session-context";
import { removeMember } from "../../../lib/members-api";

export function MemberDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { session } = useSession();

  const { members, loading } = useMembersData();
  const [removing, setRemoving] = useState(false);

  const member = members.find((m) => m.userId === userId);
  const isSelf = userId === session.user?.id;

  usePageBreadcrumbs(
    member
      ? [
          { label: "Team", to: "/team" },
          { label: member.name },
        ]
      : null,
    [member?.name, userId],
  );

  if (loading) return <ListPageSkeleton />;

  if (!member) {
    return (
      <EntityDetailLayout name="Member" tabs={[]}>
        <PageError title="Not found" message="Member not found.">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/team">Back to team</Link>
          </Button>
        </PageError>
      </EntityDetailLayout>
    );
  }

  async function handleRemove() {
    const ok = await confirm({
      title: "Remove member",
      description: `Remove ${member!.name} from the console?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok || !userId) return;

    setRemoving(true);
    try {
      await removeMember(userId);
      navigate("/team");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <EntityDetailLayout
      name={member.name}
      subtitle={member.email}
      badges={
        <>
          {isSelf ? <Badge variant="outline">You</Badge> : null}
          {member.isBootstrap ? <Badge variant="secondary">Owner</Badge> : <Badge variant="outline">Member</Badge>}
        </>
      }
      actions={
        !isSelf && !member.isBootstrap ? (
          <Button variant="destructive" disabled={removing} onClick={() => void handleRemove()}>
            Remove
          </Button>
        ) : undefined
      }
    >
      <Card className="py-0 shadow-xs">
        <CardContent className="px-5 py-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{member.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Joined</dt>
              <dd>{new Date(member.joinedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </EntityDetailLayout>
  );
}
