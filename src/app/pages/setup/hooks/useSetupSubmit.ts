import { useState, useCallback } from "react";
import { storeTokens } from "@z0/utils/token-storage";
import { markSuperAdminConfigured } from "@z0/utils/config-state";
import type { SetupError } from "../components/SetupErrorAlert";

export type LoadingState =
  | "idle"
  | "submitting"
  | "storing-tokens"
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

  const parseServerError = useCallback(
    (response: any, status: number): SetupError => {
      if (response.type && response.code) {
        const baseError: SetupError = {
          message: response.error || "An error occurred",
          type: response.type.toLowerCase() as SetupError["type"],
          code: response.code,
          fieldErrors: response.fieldErrors || [],
          retryable: response.details?.retryable || false,
        };

        switch (response.type) {
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

      if (status >= 400 && status < 500) {
        return {
          message: response.error || "Invalid request",
          type: "validation",
          retryable: false,
          actionable: "Please check your input and try again.",
        };
      }

      if (status >= 500) {
        return {
          message: response.error || "Server error",
          type: "server",
          retryable: true,
          actionable:
            "This appears to be a temporary server issue. Please try again in a moment.",
        };
      }

      return {
        message: response.error || "An unexpected error occurred",
        type: "unknown",
        retryable: true,
        actionable:
          "Please try again or contact support if the issue persists.",
      };
    },
    []
  );

  const retrySetup = useCallback(
    async (data: SetupFormValues, attempt: number = 1): Promise<void> => {
      const maxRetries = 3;
      const baseDelay = 1000;

      try {
        setLoadingState("submitting");
        setSetupProgress(20);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch("/api/setup/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        setSetupProgress(60);

        const result = await response.json();

        if (!response.ok) {
          const serverError = parseServerError(result, response.status);

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

        setSetupProgress(80);
        setLoadingState("storing-tokens");

        if (result.accessToken && result.refreshToken && result.user) {
          try {
            storeTokens({
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
              user: result.user,
            });
          } catch (tokenError) {
            throw {
              message:
                "Setup completed but failed to store authentication tokens",
              type: "system" as const,
              retryable: false,
              actionable:
                "Please refresh the page and try logging in manually.",
            };
          }
        }

        setSetupProgress(90);
        setLoadingState("updating-config");

        markSuperAdminConfigured();

        setSetupProgress(100);
        setLoadingState("redirecting");
        setRetryCount(0);

        return result;
      } catch (err: any) {
        if (err.name === "AbortError") {
          throw {
            message: "Request timed out",
            type: "network" as const,
            retryable: true,
            actionable:
              "The request took too long. Please check your connection and try again.",
          };
        }

        throw err;
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
