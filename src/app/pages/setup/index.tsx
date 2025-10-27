import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@z0/components/ui/form";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardDescription,
} from "@z0/components/ui/card";

import { Input } from "@z0/components/ui/input";
import { Button } from "@z0/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { PasswordInput } from "@z0/components/ui/password-input";
import {
  validatePassword,
  type PasswordValidationResult,
} from "@z0/utils/password-validation";
import { storeTokens } from "@z0/utils/token-storage";
import { markSuperAdminConfigured } from "@z0/utils/config-state";
import { useNavigate } from "react-router";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Wifi,
  WifiOff,
  ArrowRight,
  ArrowLeft,
  Check,
} from "lucide-react";
import { Progress } from "@z0/components/ui/progress";
import { cn } from "@z0/lib/utils";

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

// Enhanced error types for better error handling
interface SetupError {
  message: string;
  type: "network" | "validation" | "server" | "security" | "unknown";
  code?: string;
  fieldErrors?: Array<{ field: string; message: string; code: string }>;
  retryable: boolean;
  actionable?: string;
}

// Loading states for better UX
type LoadingState =
  | "idle"
  | "submitting"
  | "storing-tokens"
  | "updating-config"
  | "redirecting";

// Step type for multi-step form
type SetupStep = "email" | "password" | "organization";

const STEPS: SetupStep[] = ["email", "password", "organization"];

export default function Setup() {
  const navigate = useNavigate();
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
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [passwordValidation, setPasswordValidation] =
    useState<PasswordValidationResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [setupProgress, setSetupProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<SetupStep>("email");

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
          navigate("/", { replace: true });
        }
      }, 200);

      return () => clearInterval(progressInterval);
    }
  }, [success, loadingState, navigate]);

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
      hasAllFields && hasValidPassword && loadingState === "idle" && isOnline
    );
  }, [form, passwordValidation, loadingState, isOnline]);

  // Enhanced error parsing from server response
  const parseServerError = useCallback(
    (response: any, status: number): SetupError => {
      // Handle structured error responses from server
      if (response.type && response.code) {
        const baseError: SetupError = {
          message: response.error || "An error occurred",
          type: response.type.toLowerCase() as SetupError["type"],
          code: response.code,
          fieldErrors: response.fieldErrors || [],
          retryable: response.details?.retryable || false,
        };

        // Add actionable messages based on error type
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

      // Handle legacy error responses
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

  // Retry mechanism with exponential backoff
  const retrySetup = useCallback(
    async (data: SetupFormValues, attempt: number = 1): Promise<void> => {
      const maxRetries = 3;
      const baseDelay = 1000; // 1 second

      try {
        setLoadingState("submitting");
        setSetupProgress(20);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

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

          // Retry logic for retryable errors
          if (serverError.retryable && attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
            setError({
              ...serverError,
              message: `${serverError.message} (Attempt ${attempt}/${maxRetries})`,
              actionable: `Retrying in ${delay / 1000} seconds...`,
            });

            await new Promise((resolve) => setTimeout(resolve, delay));
            return retrySetup(data, attempt + 1);
          }

          throw serverError;
        }

        // Success - handle token storage and config update
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

        // Update configuration state
        markSuperAdminConfigured();

        setSetupProgress(100);
        setLoadingState("redirecting");
        setSuccess(result.message || "Setup complete!");
        setRetryCount(0);
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

  // Main submit handler with enhanced error handling
  const onSubmit = useCallback(
    async (data: SetupFormValues) => {
      if (!canSubmit()) return;

      setError(null);
      setSuccess(null);
      setSetupProgress(0);

      try {
        await retrySetup(data);
      } catch (err: any) {
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
          // Structured error from our parsing
          setError(err);
        } else {
          // Unknown error
          setError({
            message: err.message || "An unexpected error occurred",
            type: "unknown",
            retryable: true,
            actionable:
              "Please try again or contact support if the issue persists.",
          });
        }

        setRetryCount((prev) => prev + 1);
      } finally {
        if (loadingState !== "redirecting") {
          setLoadingState("idle");
          setSetupProgress(0);
        }
      }
    },
    [canSubmit, retrySetup, loadingState]
  );

  // Manual retry function
  const handleRetry = useCallback(() => {
    const formData = form.getValues();
    onSubmit(formData);
  }, [form, onSubmit]);

  // Get loading message based on current state
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

  // Get appropriate icon for current state
  const getStateIcon = () => {
    if (!isOnline) return <WifiOff className="h-4 w-4" />;
    if (loadingState !== "idle")
      return <Loader2 className="h-4 w-4 animate-spin" />;
    if (success) return <CheckCircle2 className="h-4 w-4" />;
    if (error) return <AlertCircle className="h-4 w-4" />;
    return null;
  };

  // Check if current step is valid
  const isStepValid = useCallback(
    (step: SetupStep): boolean => {
      const values = form.getValues();
      const errors = form.formState.errors;

      switch (step) {
        case "email":
          return !!values.email && !errors.email && values.email.includes("@");
        case "password":
          return (
            !!values.password &&
            !errors.password &&
            (passwordValidation?.isValid || false)
          );
        case "organization":
          return (
            !!values.organization &&
            !errors.organization &&
            !!values.name &&
            !errors.name
          );
        default:
          return false;
      }
    },
    [form, passwordValidation]
  );

  // Navigate to next step
  const handleNextStep = useCallback(() => {
    if (!isStepValid(currentStep)) return;

    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1]);
      setError(null);
    }
  }, [currentStep, isStepValid]);

  // Navigate to previous step
  const handlePreviousStep = useCallback(() => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1]);
      setError(null);
    }
  }, [currentStep]);

  // Handle Enter key for next step
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && isStepValid(currentStep)) {
        e.preventDefault();
        if (currentStep === "organization") {
          form.handleSubmit(onSubmit)();
        } else {
          handleNextStep();
        }
      }
    },
    [currentStep, isStepValid, handleNextStep, form]
  );

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center">
        {/* Left side - Illustration */}
        <div className="hidden lg:flex flex-col justify-center items-center p-8 space-y-6">
          <div className="w-full max-w-md aspect-square bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-3xl flex items-center justify-center border border-primary/10">
            <div className="text-center space-y-4 p-8">
              <div className="text-6xl mb-4">🚀</div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Welcome to Z0 Auth
              </h2>
              <p className="text-muted-foreground text-lg">
                Let's set up your authentication system in just a few steps
              </p>

              {/* Step indicators */}
              <div className="pt-8 space-y-3">
                {[
                  { step: "email", label: "Email Address", icon: "📧" },
                  { step: "password", label: "Secure Password", icon: "🔐" },
                  {
                    step: "organization",
                    label: "Organization Details",
                    icon: "🏢",
                  },
                ].map((item, index) => (
                  <div
                    key={item.step}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg transition-all",
                      currentStep === item.step &&
                        "bg-primary/10 border border-primary/20",
                      STEPS.indexOf(currentStep) > index && "opacity-60"
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                        STEPS.indexOf(currentStep) > index
                          ? "bg-primary text-primary-foreground"
                          : currentStep === item.step
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {STEPS.indexOf(currentStep) > index ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        item.icon
                      )}
                    </div>
                    <span
                      className={cn(
                        "font-medium transition-colors",
                        currentStep === item.step && "text-primary"
                      )}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Form */}
        <Card className="w-full border-2 shadow-xl">
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                  {STEPS.indexOf(currentStep) + 1}
                </div>
                <span className="text-sm text-muted-foreground">
                  Step {STEPS.indexOf(currentStep) + 1} of {STEPS.length}
                </span>
              </div>
              {getStateIcon()}
            </div>
            <CardTitle className="text-2xl">
              {currentStep === "email" && "Enter Your Email"}
              {currentStep === "password" && "Create a Password"}
              {currentStep === "organization" && "Organization Details"}
            </CardTitle>
            <CardDescription>
              {currentStep === "email" &&
                "This will be your admin email address"}
              {currentStep === "password" &&
                "Choose a strong password to protect your account"}
              {currentStep === "organization" &&
                "Tell us about your organization"}
              {!isOnline && (
                <span className="text-destructive block mt-1">
                  ⚠️ No internet connection detected
                </span>
              )}
            </CardDescription>

            {/* Progress bar */}
            <Progress
              value={(STEPS.indexOf(currentStep) / (STEPS.length - 1)) * 100}
              className="mt-4"
            />
          </CardHeader>

          <CardContent>
            {/* Enhanced Error Display */}
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="flex items-center justify-between">
                  {error.type === "network"
                    ? "Connection Error"
                    : error.type === "validation"
                    ? "Validation Error"
                    : error.type === "security"
                    ? "Security Error"
                    : "Something went wrong"}
                  {error.retryable && retryCount > 0 && (
                    <span className="text-sm font-normal">
                      (Attempt {retryCount})
                    </span>
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
                      onClick={handleRetry}
                      disabled={loadingState !== "idle"}
                      className="mt-2"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Try Again
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Enhanced Success Display */}
            {success && (
              <Alert className="mb-4">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>🎉 Setup Complete!</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{success}</p>
                  {loadingState === "redirecting" && (
                    <div className="space-y-2">
                      <p className="text-sm">
                        Redirecting to main application...
                      </p>
                      <Progress value={setupProgress} className="w-full" />
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Progress Indicator for Setup Process */}
            {loadingState !== "idle" && !success && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {getLoadingMessage()}
                </div>
                <Progress value={setupProgress} className="w-full" />
              </div>
            )}

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                {/* Email Step */}
                {currentStep === "email" && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-5 duration-300">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">
                            Admin Email Address
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="you@company.com"
                              autoComplete="email"
                              autoFocus
                              disabled={loadingState !== "idle"}
                              onKeyPress={handleKeyPress}
                              className="h-12 text-lg"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* Password Step */}
                {currentStep === "password" && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-5 duration-300">
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">
                            Create Password
                          </FormLabel>
                          <FormControl>
                            <PasswordInput
                              value={field.value}
                              onChange={field.onChange}
                              onValidationChange={
                                handlePasswordValidationChange
                              }
                              placeholder="Create a strong password"
                              autoComplete="new-password"
                              autoFocus
                              showStrengthIndicator={true}
                              showToggleVisibility={true}
                              disabled={loadingState !== "idle"}
                              onKeyPress={handleKeyPress}
                              className="h-12 text-lg"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* Organization Step */}
                {currentStep === "organization" && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-5 duration-300">
                    <FormField
                      control={form.control}
                      name="organization"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">
                            Organization Name
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="e.g., Acme Corp"
                              autoFocus
                              disabled={loadingState !== "idle"}
                              className="h-12 text-lg"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">Your Name</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="e.g., Jane Doe"
                              disabled={loadingState !== "idle"}
                              onKeyPress={handleKeyPress}
                              className="h-12 text-lg"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </form>
            </Form>
          </CardContent>

          <CardFooter className="flex justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreviousStep}
              disabled={currentStep === "email" || loadingState !== "idle"}
              className="h-11"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            {currentStep !== "organization" ? (
              <Button
                type="button"
                onClick={handleNextStep}
                disabled={!isStepValid(currentStep) || loadingState !== "idle"}
                className="h-11 flex-1"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={form.handleSubmit(onSubmit)}
                disabled={!isStepValid(currentStep) || !canSubmit()}
                className="h-11 flex-1"
              >
                {getStateIcon()}
                <span className="ml-2">{getLoadingMessage()}</span>
              </Button>
            )}
          </CardFooter>

          {/* Connection Status Indicator */}
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
  );
}
