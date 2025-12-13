import { useState, useCallback } from "react";
import { markSuperAdminConfigured } from "@z0/utils/config-state";
import { completeSetup, type ApiError } from "@z0/utils/api/setup";
import type { SetupError } from "../components/SetupErrorAlert";

export type LoadingState =
  | "idle"
  | "submitting"
  | "updating-config"
  | "redirecting";

interface SetupFormValues {
  organization: string;
  name: string;
  email: string;
  password: string;
}

export function useSetupSubmit() {
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [setupProgress, setSetupProgress] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  const parseServerError = useCallback((error: ApiError): SetupError => {
    if (error.type && error.code) {
      const baseError: SetupError = {
        message: error.error || "An error occurred",
        type: error.type.toLowerCase() as SetupError["type"],
        code: error.code,
        fieldErrors: error.fieldErrors || [],
        retryable: error.details?.retryable || false,
      };

      switch (error.type) {
        case "VALIDATION":
          baseError.actionable =
            "Please check the highlighted fields and try again.";
          break;
        case "DATABASE":
          baseError.actionable = baseError.retryable
            ? "This appears to be a temporary issue. Please try again in a moment."
            : "Please contact support if this issue persists.";
          break;
        case "SECURITY":
          baseError.actionable =
            "Please ensure you're accessing this page from the correct URL and try again.";
          break;
        case "SYSTEM":
          baseError.actionable =
            "This appears to be a server issue. Please try again or contact support.";
          break;
        default:
          baseError.actionable =
            "Please try again or contact support if the issue persists.";
      }

      return baseError;
    }

    // Network or timeout errors
    if (error.code === "TIMEOUT") {
      return {
        message: "Request timed out",
        type: "network",
        retryable: true,
        actionable:
          "The request took too long. Please check your connection and try again.",
      };
    }

    return {
      message: error.error || "An unexpected error occurred",
      type: "unknown",
      retryable: true,
      actionable: "Please try again or contact support if the issue persists.",
    };
  }, []);

  const retrySetup = useCallback(
    async (data: SetupFormValues, attempt: number = 1): Promise<any> => {
      const maxRetries = 3;
      const baseDelay = 1000;

      try {
        setLoadingState("submitting");
        setSetupProgress(20);

        const result = await completeSetup(data);

        setSetupProgress(60);

        setSetupProgress(80);
        setLoadingState("updating-config");

        // Mark super admin as configured and ensure state persistence
        markSuperAdminConfigured();
        
        // Small delay to ensure config state is properly updated
        await new Promise(resolve => setTimeout(resolve, 100));

        setSetupProgress(100);
        setLoadingState("redirecting");
        setRetryCount(0);

        return result;
      } catch (err: any) {
        const serverError = parseServerError(err);

        if (serverError.retryable && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          throw {
            ...serverError,
            message: `${serverError.message} (Attempt ${attempt}/${maxRetries})`,
            actionable: `Retrying in ${delay / 1000} seconds...`,
          };
        }

        throw serverError;
      }
    },
    [parseServerError]
  );

  const getLoadingMessage = () => {
    switch (loadingState) {
      case "submitting":
        return "Creating account...";
      case "storing-tokens":
        return "Setting up authentication...";
      case "updating-config":
        return "Finalizing setup...";
      case "redirecting":
        return "Redirecting...";
      default:
        return "Create Admin Account";
    }
  };

  return {
    loadingState,
    setupProgress,
    retryCount,
    setRetryCount,
    retrySetup,
    getLoadingMessage,
    setLoadingState,
    setSetupProgress,
  };
}
