import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { Progress } from "@z0/components/ui/progress";
import { CheckCircle2 } from "lucide-react";

interface SetupSuccessAlertProps {
  message: string;
  progress: number;
  isRedirecting: boolean;
}

export function SetupSuccessAlert({
  message,
  progress,
  isRedirecting,
}: SetupSuccessAlertProps) {
  return (
    <Alert className="mb-4">
      <CheckCircle2 className="h-4 w-4" />
      <AlertTitle>🎉 Setup Complete!</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{message}</p>
        {isRedirecting && (
          <div className="space-y-2">
            <p className="text-sm">Redirecting to main application...</p>
            <Progress value={progress} className="w-full" />
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
