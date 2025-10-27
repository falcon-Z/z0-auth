import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { Button } from "@z0/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export interface SetupError {
  message: string;
  type: "network" | "validation" | "server" | "security" | "unknown";
  code?: string;
  fieldErrors?: Array<{ field: string; message: string; code: string }>;
  retryable: boolean;
  actionable?: string;
}

interface SetupErrorAlertProps {
  error: SetupError;
  retryCount: number;
  onRetry: () => void;
  isRetrying: boolean;
}

export function SetupErrorAlert({
  error,
  retryCount,
  onRetry,
  isRetrying,
}: SetupErrorAlertProps) {
  const getErrorTitle = () => {
    switch (error.type) {
      case "network":
        return "Connection Error";
      case "validation":
        return "Validation Error";
      case "security":
        return "Security Error";
      default:
        return "Something went wrong";
    }
  };

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        {getErrorTitle()}
        {error.retryable && retryCount > 0 && (
          <span className="text-sm font-normal">(Attempt {retryCount})</span>
        )}
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{error.message}</p>
        {error.actionable && (
          <p className="text-sm opacity-90">{error.actionable}</p>
        )}
        {error.retryable && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="mt-2"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Try Again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
