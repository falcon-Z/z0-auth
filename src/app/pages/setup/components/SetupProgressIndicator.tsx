import { Progress } from "@z0/components/ui/progress";
import { Loader2 } from "lucide-react";

interface SetupProgressIndicatorProps {
  progress: number;
  message: string;
}

export function SetupProgressIndicator({
  progress,
  message,
}: SetupProgressIndicatorProps) {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {message}
      </div>
      <Progress value={progress} className="w-full" />
    </div>
  );
}
