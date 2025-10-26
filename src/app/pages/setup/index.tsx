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
import { validatePassword, type PasswordValidationResult } from "@z0/utils/password-validation";
import { storeTokens } from "@z0/utils/token-storage";
import { markSuperAdminConfigured } from "@z0/utils/config-state";
import { useNavigate } from "react-router";
import { Loader2, AlertCircle, CheckCircle2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Progress } from "@z0/components/ui/progress";

// Enhanced password validation schema with stronger requirements
const setupSchema = z.object({
  organization: z.string()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name must be less than 100 characters")
    .trim(),
  name: z.string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters")
    .trim(),
  email: z.string()
    .email("Please enter a valid email address")
    .max(255, "Email must be less than 255 characters")
    .toLowerCase()
    .trim(),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be less than 128 characters")
    .refine((password) => {
      const validation = validatePassword(password);
      return validation.isValid;
    }, {
      message: "Password must meet all security requirements: uppercase, lowercase, number, special character, and avoid common patterns",
    }),
});

type SetupFormValues = z.infer<typeof setupSchema>;

// Enhanced error types for better error handling
interface SetupError {
  message: string;
  type: 'network' | 'validation' | 'server' | 'security' | 'unknown';
  code?: string;
  fieldErrors?: Array<{ field: string; message: string; code: string }>;
  retryable: boolean;
  actionable?: string;
}

// Loading states for better UX
type LoadingState = 'idle' | 'submitting' | 'storing-tokens' | 'updating-config' | 'redirecting';

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
  });

  const [error, setError] = useState<SetupError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [passwordValidation, setPasswordValidation] = useState<PasswordValidationResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [setupProgress, setSetupProgress] = useState(0);

  // Monitor online status for better network error handling
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handle automatic redirect after successful setup with progress indication
  useEffect(() => {
    if (success && loadingState === 'redirecting') {
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
  const handlePasswordValidationChange = useCallback((validation: PasswordValidationResult) => {
    setPasswordValidation(validation);
  }, []);

  // Check if form can be submitted
  const canSubmit = useCallback(() => {
    const formValues = form.getValues();
    const hasAllFields = formValues.organization && formValues.name && formValues.email && formValues.password;
    const hasValidPassword = passwordValidation?.isValid || false;
    return hasAllFields && hasValidPassword && loadingState === 'idle' && isOnline;
  }, [form, passwordValidation, loadingState, isOnline]);

  // Enhanced error parsing from server response
  const parseServerError = useCallback((response: any, status: number): SetupError => {
    // Handle structured error responses from server
    if (response.type && response.code) {
      const baseError: SetupError = {
        message: response.error || 'An error occurred',
        type: response.type.toLowerCase() as SetupError['type'],
        code: response.code,
        fieldErrors: response.fieldErrors || [],
        retryable: response.details?.retryable || false,
      };

      // Add actionable messages based on error type
      switch (response.type) {
        case 'VALIDATION':
          baseError.actionable = 'Please check the highlighted fields and try again.';
          break;
        case 'DATABASE':
          baseError.actionable = baseError.retryable 
            ? 'This appears to be a temporary issue. Please try again in a moment.'
            : 'Please contact support if this issue persists.';
          break;
        case 'SECURITY':
          baseError.actionable = 'Please ensure you\'re accessing this page from the correct URL and try again.';
          break;
        case 'SYSTEM':
          baseError.actionable = 'This appears to be a server issue. Please try again or contact support.';
          break;
        default:
          baseError.actionable = 'Please try again or contact support if the issue persists.';
      }

      return baseError;
    }

    // Handle legacy error responses
    if (status >= 400 && status < 500) {
      return {
        message: response.error || 'Invalid request',
        type: 'validation',
        retryable: false,
        actionable: 'Please check your input and try again.',
      };
    }

    if (status >= 500) {
      return {
        message: response.error || 'Server error',
        type: 'server',
        retryable: true,
        actionable: 'This appears to be a temporary server issue. Please try again in a moment.',
      };
    }

    return {
      message: response.error || 'An unexpected error occurred',
      type: 'unknown',
      retryable: true,
      actionable: 'Please try again or contact support if the issue persists.',
    };
  }, []);

  // Retry mechanism with exponential backoff
  const retrySetup = useCallback(async (data: SetupFormValues, attempt: number = 1): Promise<void> => {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    try {
      setLoadingState('submitting');
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
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return retrySetup(data, attempt + 1);
        }
        
        throw serverError;
      }

      // Success - handle token storage and config update
      setSetupProgress(80);
      setLoadingState('storing-tokens');

      if (result.accessToken && result.refreshToken && result.user) {
        try {
          storeTokens({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            user: result.user,
          });
        } catch (tokenError) {
          throw {
            message: "Setup completed but failed to store authentication tokens",
            type: 'system' as const,
            retryable: false,
            actionable: "Please refresh the page and try logging in manually.",
          };
        }
      }

      setSetupProgress(90);
      setLoadingState('updating-config');

      // Update configuration state
      markSuperAdminConfigured();

      setSetupProgress(100);
      setLoadingState('redirecting');
      setSuccess(result.message || "Setup complete!");
      setRetryCount(0);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw {
          message: "Request timed out",
          type: 'network' as const,
          retryable: true,
          actionable: "The request took too long. Please check your connection and try again.",
        };
      }
      
      throw err;
    }
  }, [parseServerError]);

  // Main submit handler with enhanced error handling
  const onSubmit = useCallback(async (data: SetupFormValues) => {
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
          type: 'network',
          retryable: true,
          actionable: "Please check your internet connection and try again.",
        });
      } else if (err.message?.includes('fetch')) {
        setError({
          message: "Network error",
          type: 'network',
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
          type: 'unknown',
          retryable: true,
          actionable: "Please try again or contact support if the issue persists.",
        });
      }
      
      setRetryCount(prev => prev + 1);
    } finally {
      if (loadingState !== 'redirecting') {
        setLoadingState('idle');
        setSetupProgress(0);
      }
    }
  }, [canSubmit, retrySetup, loadingState]);

  // Manual retry function
  const handleRetry = useCallback(() => {
    const formData = form.getValues();
    onSubmit(formData);
  }, [form, onSubmit]);

  // Get loading message based on current state
  const getLoadingMessage = () => {
    switch (loadingState) {
      case 'submitting':
        return 'Creating account...';
      case 'storing-tokens':
        return 'Setting up authentication...';
      case 'updating-config':
        return 'Finalizing setup...';
      case 'redirecting':
        return 'Redirecting...';
      default:
        return 'Create Admin Account';
    }
  };

  // Get appropriate icon for current state
  const getStateIcon = () => {
    if (!isOnline) return <WifiOff className="h-4 w-4" />;
    if (loadingState !== 'idle') return <Loader2 className="h-4 w-4 animate-spin" />;
    if (success) return <CheckCircle2 className="h-4 w-4" />;
    if (error) return <AlertCircle className="h-4 w-4" />;
    return null;
  };

  return (
    <Card className="max-w-lg w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Set Up Your Admin Account
          {getStateIcon()}
        </CardTitle>
        <CardDescription>
          Create your first organization and admin user to get started.
          {!isOnline && (
            <span className="text-destructive block mt-1">
              ⚠️ No internet connection detected
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Enhanced Error Display */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="flex items-center justify-between">
              {error.type === 'network' ? 'Connection Error' : 
               error.type === 'validation' ? 'Validation Error' :
               error.type === 'security' ? 'Security Error' :
               'Something went wrong'}
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
                  disabled={loadingState !== 'idle'}
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
              {loadingState === 'redirecting' && (
                <div className="space-y-2">
                  <p className="text-sm">Redirecting to main application...</p>
                  <Progress value={setupProgress} className="w-full" />
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Progress Indicator for Setup Process */}
        {loadingState !== 'idle' && !success && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {getLoadingMessage()}
            </div>
            <Progress value={setupProgress} className="w-full" />
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="organization"
                render={({ field }) => (
                  <FormItem className="grid gap-3">
                    <FormLabel>Organization Name</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="e.g., Acme Corp"
                        disabled={loadingState !== 'idle'}
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
                  <FormItem className="grid gap-3">
                    <FormLabel>Your Name</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="e.g., Jane Doe"
                        disabled={loadingState !== 'idle'}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="grid gap-3">
                    <FormLabel>Admin Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@company.com"
                        autoComplete="email"
                        disabled={loadingState !== 'idle'}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="grid gap-3">
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <PasswordInput
                        value={field.value}
                        onChange={field.onChange}
                        onValidationChange={handlePasswordValidationChange}
                        placeholder="Create a strong password"
                        autoComplete="new-password"
                        showStrengthIndicator={true}
                        showToggleVisibility={true}
                        disabled={loadingState !== 'idle'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="pt-4">
              <Button 
                type="submit" 
                className="w-full" 
                disabled={!canSubmit()}
              >
                {getStateIcon()}
                <span className="ml-2">{getLoadingMessage()}</span>
              </Button>
              
              {/* Connection Status Indicator */}
              {!isOnline && (
                <p className="text-center text-sm text-muted-foreground mt-2 flex items-center justify-center gap-1">
                  <WifiOff className="h-3 w-3" />
                  Waiting for internet connection...
                </p>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
