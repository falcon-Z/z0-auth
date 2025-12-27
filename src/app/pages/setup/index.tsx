import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form } from "@z0/components/ui/form";
import { Card, CardContent } from "@z0/components/ui/card";
import { useState, useEffect, useCallback } from "react";
import {
  validatePassword,
  type PasswordValidationResult,
} from "@z0/utils/password-validation";
import { Loader2, AlertCircle, CheckCircle2, WifiOff } from "lucide-react";
import { isSuperAdminConfigured } from "@z0/utils/config-state";

// Components
import { SetupIllustration } from "./components/SetupIllustration";
import { SetupErrorAlert, type SetupError } from "./components/SetupErrorAlert";
import { SetupSuccessAlert } from "./components/SetupSuccessAlert";
import { SetupProgressIndicator } from "./components/SetupProgressIndicator";
import { SetupCardHeader } from "./components/SetupCardHeader";
import { SetupEmailStep } from "./components/steps/SetupEmailStep";
import { SetupPasswordStep } from "./components/steps/SetupPasswordStep";
import { SetupOrganizationStep } from "./components/steps/SetupOrganizationStep";
import { SetupFooter } from "./components/SetupFooter";

// Hooks
import { useSetupForm } from "./hooks/useSetupForm";
import { useSetupSubmit } from "./hooks/useSetupSubmit";
import { useEmailValidation } from "./hooks/useSetupValidation";

// Enhanced password validation schema with stronger requirements
const setupSchema = z.object({
  organization: z
    .string()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name must be less than 100 characters")
    .trim(),
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters")
    .trim(),
  email: z
    .string()
    .email("Please enter a valid email address")
    .max(255, "Email must be less than 255 characters")
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be less than 128 characters")
    .refine(
      (password) => {
        const validation = validatePassword(password);
        return validation.isValid;
      },
      {
        message:
          "Password must meet all security requirements: uppercase, lowercase, number, special character, and avoid common patterns",
      }
    ),
});

type SetupFormValues = z.infer<typeof setupSchema>;

const STEPS = ["email", "password", "organization"] as const;

export default function Setup() {
  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      organization: "",
      name: "",
      email: "",
      password: "",
    },
    mode: "onChange",
  });

  const [error, setError] = useState<SetupError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [passwordValidation, setPasswordValidation] =
    useState<PasswordValidationResult | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Custom hooks
  const {
    loadingState,
    setupProgress,
    retryCount,
    setRetryCount,
    retrySetup,
    getLoadingMessage,
    setLoadingState,
    setSetupProgress,
  } = useSetupSubmit();

  // Email validation for display feedback
  const email = form.watch("email");
  const emailValidation = useEmailValidation(email, loadingState === "idle");

  const {
    currentStep,
    setCurrentStep,
    isStepValid,
    handleNextStep: baseHandleNextStep,
    handlePreviousStep,
    handleKeyPress: baseHandleKeyPress,
  } = useSetupForm({
    form,
    passwordValidation,
    steps: STEPS,
  });

  // Wrapper for keypress to use baseHandleNextStep
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent, onFinalSubmit: () => void) => {
      if (e.key === "Enter" && isStepValid(currentStep)) {
        e.preventDefault();
        if (currentStep === "organization") {
          onFinalSubmit();
        } else {
          baseHandleNextStep();
        }
      }
    },
    [currentStep, isStepValid, baseHandleNextStep]
  );

  useEffect(() => {
    const checkInitialState = async () => {
      if (isSuperAdminConfigured()) {
        if (!success && loadingState === "idle") {
          window.location.href = "/login";
          return;
        }
      }
      setIsCheckingEligibility(false);
    };

    checkInitialState();
  }, [success, loadingState]);

  // Monitor online status for better network error handling
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Handle automatic redirect after successful setup with progress indication
  useEffect(() => {
    if (success && loadingState === "redirecting") {
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += 10;
        setSetupProgress(progress);
        if (progress >= 100) {
          clearInterval(progressInterval);
          setTimeout(() => {
            window.location.href = "/login";
          }, 300);
        }
      }, 150);

      return () => clearInterval(progressInterval);
    }
  }, [success, loadingState, setSetupProgress]);

  // Handle password validation changes
  const handlePasswordValidationChange = useCallback(
    (validation: PasswordValidationResult) => {
      setPasswordValidation(validation);
    },
    []
  );

  // Check if form can be submitted
  const canSubmit = useCallback(() => {
    const formValues = form.getValues();
    const hasAllFields =
      formValues.organization &&
      formValues.name &&
      formValues.email &&
      formValues.password;
    const hasValidPassword = passwordValidation?.isValid || false;
    return (
      hasAllFields &&
      hasValidPassword &&
      loadingState === "idle" &&
      isOnline &&
      !isSubmitting
    );
  }, [form, passwordValidation, loadingState, isOnline, isSubmitting]);

  // Main submit handler with enhanced error handling
  const onSubmit = useCallback(
    async (data: SetupFormValues) => {
      // Prevent double submission
      if (isSubmitting || loadingState !== "idle") return;

      // Validate all fields before submitting
      if (!canSubmit()) {
        return;
      }

      setIsSubmitting(true);
      setError(null);
      setSuccess(null);
      setSetupProgress(0);

      try {
        await retrySetup(data);
        setSuccess("Setup complete! Redirecting to login...");
        setRetryCount(0);
      } catch (err: any) {
        setIsSubmitting(false);

        // Handle network errors
        if (!navigator.onLine) {
          setError({
            message: "No internet connection",
            type: "network",
            retryable: true,
            actionable: "Please check your internet connection and try again.",
          });
        } else if (err.message?.includes("fetch")) {
          setError({
            message: "Network error",
            type: "network",
            retryable: true,
            actionable: "Please check your connection and try again.",
          });
        } else if (err.type) {
          setError(err);
        } else {
          setError({
            message: err.message || "An unexpected error occurred",
            type: "unknown",
            retryable: true,
            actionable:
              "Please try again or contact support if the issue persists.",
          });
        }

        setRetryCount((prev) => prev + 1);
        setLoadingState("idle");
        setSetupProgress(0);
      }
    },
    [
      canSubmit,
      isSubmitting,
      loadingState,
      retrySetup,
      setLoadingState,
      setSetupProgress,
      setRetryCount,
    ]
  );

  // Manual retry function
  const handleRetry = useCallback(() => {
    const formData = form.getValues();
    onSubmit(formData);
  }, [form, onSubmit]);

  // Get appropriate icon for current state
  const getStateIcon = () => {
    if (!isOnline) return <WifiOff className="h-4 w-4" />;
    if (loadingState !== "idle")
      return <Loader2 className="h-4 w-4 animate-spin" />;
    if (success) return <CheckCircle2 className="h-4 w-4" />;
    if (error) return <AlertCircle className="h-4 w-4" />;
    return null;
  };

  // Wrapper for handleKeyPress with onSubmit
  const handleKeyPressWithSubmit = useCallback(
    (e: React.KeyboardEvent) => {
      handleKeyPress(e, () => form.handleSubmit(onSubmit)());
    },
    [handleKeyPress, form, onSubmit]
  );

  // Clear error when navigating between steps
  useEffect(() => {
    setError(null);
  }, [currentStep]);

  // Show loading state while checking eligibility
  if (isCheckingEligibility) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-linear-to-br from-background via-background to-muted/20">
        <Card className="w-full max-w-md border-2 shadow-xl">
          <CardContent className="p-8">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-lg font-medium">Checking setup status...</p>
              <p className="text-sm text-muted-foreground text-center">
                Please wait while we verify the system configuration
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-linear-to-br from-background via-background to-muted/20 p-4 md:p-8">
      <div className="w-full max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(400px,1fr)_minmax(500px,1.3fr)] gap-8 lg:gap-12">
          {/* Left side - Illustration */}
          <SetupIllustration currentStep={currentStep} steps={STEPS} />

          {/* Right side - Form */}
          <div className="flex items-center w-full">
            <Card className="w-full border-2 shadow-xl">
              <SetupCardHeader
                currentStep={currentStep}
                steps={STEPS}
                stateIcon={getStateIcon()}
                isOnline={isOnline}
              />

              <CardContent className="pb-6">
                {error && (
                  <SetupErrorAlert
                    error={error}
                    retryCount={retryCount}
                    onRetry={handleRetry}
                    isRetrying={loadingState !== "idle"}
                  />
                )}

                {success && (
                  <SetupSuccessAlert
                    message={success}
                    progress={setupProgress}
                    isRedirecting={loadingState === "redirecting"}
                  />
                )}

                {loadingState !== "idle" && !success && (
                  <SetupProgressIndicator
                    progress={setupProgress}
                    message={getLoadingMessage()}
                  />
                )}

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6">
                    {currentStep === "email" && (
                      <SetupEmailStep
                        form={form}
                        disabled={loadingState !== "idle"}
                        onKeyPress={handleKeyPressWithSubmit}
                        emailValidation={emailValidation}
                      />
                    )}

                    {currentStep === "password" && (
                      <SetupPasswordStep
                        form={form}
                        disabled={loadingState !== "idle"}
                        onKeyPress={handleKeyPressWithSubmit}
                        onValidationChange={handlePasswordValidationChange}
                      />
                    )}

                    {currentStep === "organization" && (
                      <SetupOrganizationStep
                        form={form}
                        disabled={loadingState !== "idle"}
                        onKeyPress={handleKeyPressWithSubmit}
                      />
                    )}
                  </form>
                </Form>
              </CardContent>

              <SetupFooter
                currentStep={currentStep}
                isStepValid={isStepValid(currentStep)}
                disabled={loadingState !== "idle"}
                isSubmitting={isSubmitting}
                onPrevious={handlePreviousStep}
                onNext={baseHandleNextStep}
                onSubmit={form.handleSubmit(onSubmit)}
                submitIcon={getStateIcon()}
                submitLabel={getLoadingMessage()}
              />

              {!isOnline && (
                <div className="px-6 pb-6">
                  <p className="text-center text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <WifiOff className="h-3 w-3" />
                    Waiting for internet connection...
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
