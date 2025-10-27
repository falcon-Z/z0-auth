import { Check } from "lucide-react";
import { cn } from "@z0/lib/utils";

export type SetupStep = "email" | "password" | "organization";

interface SetupIllustrationProps {
  currentStep: SetupStep;
  steps: readonly SetupStep[];
}

const STEP_CONFIG = [
  {
    step: "email",
    label: "Email Address",
    icon: "📧",
    illustration: "/assets/illustrations/undraw_email-consent_j36b.svg",
    title: "Let's Get Started",
    description:
      "Enter your admin email to begin setting up your authentication system",
  },
  {
    step: "password",
    label: "Secure Password",
    icon: "🔐",
    illustration:
      "/assets/illustrations/undraw_two-factor-authentication_8tds.svg",
    title: "Secure Your Account",
    description:
      "Create a strong password that meets our security requirements",
  },
  {
    step: "organization",
    label: "Organization Details",
    icon: "🏢",
    illustration: "/assets/illustrations/undraw_shared-workspace_6y9d.svg",
    title: "Almost There!",
    description: "Tell us about your organization to complete the setup",
  },
] as const;

export function SetupIllustration({
  currentStep,
  steps,
}: SetupIllustrationProps) {
  const currentConfig = STEP_CONFIG.find(
    (config) => config.step === currentStep
  );

  return (
    <div className="hidden lg:flex flex-col justify-between p-8 space-y-8">
      {/* Main Illustration */}
      <div className="flex-1 flex flex-col justify-center items-center space-y-6">
        <div className="w-full max-w-lg">
          <img
            src={currentConfig?.illustration}
            alt={currentConfig?.label}
            className="w-full h-auto animate-in fade-in zoom-in duration-500"
          />
        </div>

        <div className="text-center space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            {currentConfig?.title}
          </h2>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            {currentConfig?.description}
          </p>
        </div>
      </div>

      {/* Step Progress Indicators */}
      <div className="space-y-3">
        {STEP_CONFIG.map((item, index) => {
          const isCompleted = steps.indexOf(currentStep) > index;
          const isCurrent = currentStep === item.step;

          return (
            <div
              key={item.step}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg transition-all duration-300",
                isCurrent && "bg-primary/10 border border-primary/20 shadow-sm",
                isCompleted && "opacity-70"
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 flex-shrink-0",
                  isCompleted
                    ? "bg-primary text-primary-foreground shadow-md"
                    : isCurrent
                    ? "bg-primary/20 text-primary ring-2 ring-primary/30"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <span className="text-lg">{item.icon}</span>
                )}
              </div>
              <div className="flex-1">
                <div
                  className={cn(
                    "font-medium transition-colors duration-300",
                    isCurrent && "text-primary",
                    isCompleted && "text-muted-foreground"
                  )}
                >
                  {item.label}
                </div>
                {isCurrent && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    In progress
                  </div>
                )}
                {isCompleted && (
                  <div className="text-xs text-green-600 mt-0.5">Completed</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
