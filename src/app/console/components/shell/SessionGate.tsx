import { Skeleton } from "@z0/components/ui/skeleton";

export function SessionGate() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="flex h-14 items-center gap-3 border-b bg-card px-4">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-4 w-40" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="size-8 rounded-full" />
        </div>
      </div>
      <div className="flex flex-1">
        <div className="hidden w-64 shrink-0 border-r bg-sidebar p-4 md:block">
          <Skeleton className="mb-4 h-10 w-full rounded-lg" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
