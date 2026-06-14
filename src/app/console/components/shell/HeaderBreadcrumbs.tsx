import { Link } from "react-router-dom";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@z0/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import type { BreadcrumbSegment } from "../../lib/breadcrumbs";
import { cn } from "../../lib/utils";

type HeaderBreadcrumbsProps = {
  trail: BreadcrumbSegment[];
};

function BreadcrumbSegmentNodes({
  segment,
  isLast,
  className,
}: {
  segment: BreadcrumbSegment;
  isLast: boolean;
  className?: string;
}) {
  return (
    <>
      <BreadcrumbSeparator className="shrink-0" />
      <BreadcrumbItem className={cn("min-w-0 shrink", className)}>
        {isLast || !segment.to ? (
          <BreadcrumbPage className="truncate">{segment.label}</BreadcrumbPage>
        ) : (
          <BreadcrumbLink asChild>
            <Link to={segment.to} className="block truncate">
              {segment.label}
            </Link>
          </BreadcrumbLink>
        )}
      </BreadcrumbItem>
    </>
  );
}

function CollapsedBreadcrumbMenu({ hidden }: { hidden: BreadcrumbSegment[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-accent"
        aria-label="Show path"
      >
        <BreadcrumbEllipsis className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {hidden.map((segment, index) => (
          <DropdownMenuItem key={`${segment.label}-${index}`} asChild={Boolean(segment.to)}>
            {segment.to ? (
              <Link to={segment.to}>{segment.label}</Link>
            ) : (
              <span>{segment.label}</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HeaderBreadcrumbs({ trail }: HeaderBreadcrumbsProps) {
  if (trail.length === 0) return null;

  const mobileCollapsed = trail.length > 2;
  const mobileHidden = mobileCollapsed ? trail.slice(0, -1) : [];
  const mobileVisible = mobileCollapsed ? [trail[trail.length - 1]!] : trail;

  const desktopCollapsed = trail.length > 3;
  const desktopHidden = desktopCollapsed ? trail.slice(1, -2) : [];
  const desktopLeading = desktopCollapsed ? [trail[0]!] : [];
  const desktopTail = desktopCollapsed ? trail.slice(-2) : trail;

  return (
    <Breadcrumb className="min-w-0 flex-1 overflow-hidden md:ml-1">
      <BreadcrumbList className="flex-nowrap">
        <span className="contents md:hidden">
          {mobileCollapsed ? (
            <>
              <BreadcrumbSeparator className="shrink-0" />
              <BreadcrumbItem className="shrink-0">
                <CollapsedBreadcrumbMenu hidden={mobileHidden} />
              </BreadcrumbItem>
              <BreadcrumbSegmentNodes
                segment={mobileVisible[0]!}
                isLast
                className="max-w-[8rem]"
              />
            </>
          ) : (
            mobileVisible.map((segment, index) => (
              <span key={`${segment.label}-${index}`} className="contents">
                <BreadcrumbSegmentNodes
                  segment={segment}
                  isLast={index === mobileVisible.length - 1}
                  className={index === mobileVisible.length - 1 ? "max-w-[8rem]" : "max-w-[5rem]"}
                />
              </span>
            ))
          )}
        </span>

        <span className="hidden md:contents">
          {desktopCollapsed ? (
            <>
              <BreadcrumbSegmentNodes segment={desktopLeading[0]!} isLast={false} className="max-w-[7rem]" />
              <BreadcrumbSeparator className="shrink-0" />
              <BreadcrumbItem className="shrink-0">
                <CollapsedBreadcrumbMenu hidden={desktopHidden} />
              </BreadcrumbItem>
              {desktopTail.map((segment, index) => (
                <span key={`${segment.label}-${index}`} className="contents">
                  <BreadcrumbSegmentNodes
                    segment={segment}
                    isLast={index === desktopTail.length - 1}
                    className={cn(
                      index === desktopTail.length - 1 ? "max-w-[9rem] lg:max-w-xs" : "max-w-[7rem] lg:max-w-[8rem]",
                    )}
                  />
                </span>
              ))}
            </>
          ) : (
            trail.map((segment, index) => (
              <span key={`${segment.label}-${index}`} className="contents">
                <BreadcrumbSegmentNodes
                  segment={segment}
                  isLast={index === trail.length - 1}
                  className={cn(
                    index === trail.length - 1 ? "max-w-[9rem] lg:max-w-xs" : "max-w-[7rem] lg:max-w-[8rem]",
                  )}
                />
              </span>
            ))
          )}
        </span>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
