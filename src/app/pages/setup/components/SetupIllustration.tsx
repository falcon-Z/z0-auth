import { Check } from "lucide-react";
import { cn } from "@z0/lib/utils";

export type SetupStep = "email" | "password" | "organization";

interface SetupIllustrationProps {
  currentStep: SetupStep;
  steps: readonly SetupStep[];
}

const STEP_CONFIG = [
  { step: "email", label: "Email Address", icon: "📧" },
  { step: "password", label: "Secure Password", icon: "🔐" },
  { step: "organization", label: "Organization Details", icon: "🏢" },
] as const;

export function SetupIllustration({
  currentStep,
  steps,
}: SetupIllustrationProps) {
  return (
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

          <div className="pt-8 space-y-3">
            {STEP_CONFIG.map((item, index) => (
              <div
                key={item.step}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg transition-all",
                  currentStep === item.step &&
                    "bg-primary/10 border border-primary/20",
                  steps.indexOf(currentStep) > index && "opacity-60"
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                    steps.indexOf(currentStep) > index
                      ? "bg-primary text-primary-foreground"
                      : currentStep === item.step
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {steps.indexOf(currentStep) > index ? (
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
  );
}
