import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { ChevronsUpDown, Check, Building2, Plus, Loader2 } from "lucide-react";
import { cn } from "@z0/lib/utils";
import { Button } from "@z0/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import { Badge } from "@z0/components/ui/badge";
import { useAuth, type Organization } from "../../contexts/auth-context";

/**
 * Get role display label
 */
function getRoleLabel(roleType: string): string {
  switch (roleType) {
    case "ORG_OWNER":
      return "Owner";
    case "ORG_ADMIN":
      return "Admin";
    case "ORG_DEVELOPER":
      return "Developer";
    case "ORG_MEMBER":
      return "Member";
    default:
      return roleType;
  }
}

/**
 * Get role badge variant
 */
function getRoleBadgeVariant(
  roleType: string
): "default" | "secondary" | "outline" {
  switch (roleType) {
    case "ORG_OWNER":
      return "default";
    case "ORG_ADMIN":
      return "secondary";
    default:
      return "outline";
  }
}

/**
 * Organization switcher dropdown component
 * Replaces the logo in the header and allows switching between organizations
 */
export function OrgSwitcher() {
  const navigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, isLoading, isPlatformAdmin, getDefaultOrg } = useAuth();

  const { currentOrg, organizations, effectiveOrgSlug } = useMemo(() => {
    const orgs = user?.organizations || [];

    // Use orgSlug from URL, or fall back to default org for consistent display
    const defaultOrg = getDefaultOrg();
    const effectiveSlug = orgSlug || defaultOrg?.slug;

    const current = effectiveSlug
      ? orgs.find((org) => org.slug === effectiveSlug) || null
      : null;

    return {
      currentOrg: current,
      organizations: orgs,
      effectiveOrgSlug: effectiveSlug,
    };
  }, [user, orgSlug, getDefaultOrg]);

  const handleOrgSelect = (org: Organization) => {
    if (org.slug !== orgSlug) {
      navigate(`/org/${org.slug}/dashboard`);
    }
  };

  // Show loading state
  if (isLoading || !currentOrg) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-2 h-auto py-2 px-3 hover:bg-accent"
          aria-label="Switch organization"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded bg-primary/10 text-primary font-semibold">
            {currentOrg.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col items-start">
            <span className="font-semibold text-sm">{currentOrg.name}</span>
            <span className="text-xs text-muted-foreground">
              {getRoleLabel(currentOrg.roleType)}
            </span>
          </div>
          <ChevronsUpDown className="ml-1 h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Organizations
        </DropdownMenuLabel>
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleOrgSelect(org)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded bg-muted text-muted-foreground text-xs font-semibold">
                {org.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="text-sm">{org.name}</span>
                <Badge
                  variant={getRoleBadgeVariant(org.roleType)}
                  className="text-[10px] px-1 py-0 h-4 w-fit"
                >
                  {getRoleLabel(org.roleType)}
                </Badge>
              </div>
            </div>
            {org.slug === effectiveOrgSlug && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}

        {isPlatformAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigate("/admin/organizations")}
              className="cursor-pointer"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Organization
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
