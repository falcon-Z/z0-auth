import { useMemo, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ChevronsUpDown, Check, Building2, Plus, Loader2, Shield } from "lucide-react";
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
import { authFetch } from "@z0/utils/api/client";

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
 * Extended org type for platform admin view (includes orgs they don't belong to)
 */
interface PlatformOrg {
  id: string;
  name: string;
  slug: string;
  status: string;
  isMember: boolean;
  roleType?: string;
  isDefault?: boolean;
}

/**
 * Organization switcher dropdown component
 * Replaces the logo in the header and allows switching between organizations
 * For platform admins, shows ALL organizations (not just their memberships)
 */
export function OrgSwitcher() {
  const navigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, isLoading, isPlatformAdmin, getDefaultOrg } = useAuth();
  const [allOrgs, setAllOrgs] = useState<PlatformOrg[]>([]);
  const [loadingAllOrgs, setLoadingAllOrgs] = useState(false);

  // Fetch all organizations for platform admins
  useEffect(() => {
    if (!isPlatformAdmin || isLoading) return;

    const fetchAllOrgs = async () => {
      setLoadingAllOrgs(true);
      try {
        const response = await authFetch("/api/v1/platform/organizations");
        if (response.ok) {
          const result = await response.json();
          const platformOrgs = (result.data || []).map((org: any) => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            status: org.status,
            isMember: user?.organizations?.some((o) => o.id === org.id) ?? false,
            roleType: user?.organizations?.find((o) => o.id === org.id)?.roleType,
            isDefault: user?.organizations?.find((o) => o.id === org.id)?.isDefault,
          }));
          setAllOrgs(platformOrgs);
        }
      } catch (error) {
        console.error("Failed to fetch all organizations:", error);
      } finally {
        setLoadingAllOrgs(false);
      }
    };

    fetchAllOrgs();
  }, [isPlatformAdmin, isLoading, user?.organizations]);

  const { currentOrg, organizations, effectiveOrgSlug } = useMemo(() => {
    // For platform admins, use all orgs; otherwise use user's memberships
    const orgs: PlatformOrg[] = isPlatformAdmin && allOrgs.length > 0
      ? allOrgs
      : (user?.organizations || []).map((org) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          status: "ACTIVE",
          isMember: true,
          roleType: org.roleType,
          isDefault: org.isDefault,
        }));

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
  }, [user, orgSlug, getDefaultOrg, isPlatformAdmin, allOrgs]);

  const handleOrgSelect = (org: PlatformOrg) => {
    if (org.slug !== orgSlug) {
      navigate(`/org/${org.slug}/dashboard`);
    }
  };

  // Show loading state
  if (isLoading || loadingAllOrgs || !currentOrg) {
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
                {org.isMember && org.roleType ? (
                  <Badge
                    variant={getRoleBadgeVariant(org.roleType)}
                    className="text-[10px] px-1 py-0 h-4 w-fit"
                  >
                    {getRoleLabel(org.roleType)}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1 py-0 h-4 w-fit text-muted-foreground"
                  >
                    <Shield className="h-2.5 w-2.5 mr-0.5" />
                    Platform Access
                  </Badge>
                )}
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
