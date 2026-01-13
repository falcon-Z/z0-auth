import { CardHeader, CardTitle, CardDescription } from "@z0/components/ui/card";
import { Progress } from "@z0/components/ui/progress";

export type SetupStep = "email" | "password" | "organization";

interface SetupCardHeaderProps {
  currentStep: SetupStep;
  steps: readonly SetupStep[];
  stateIcon?: React.ReactNode;
  isOnline: boolean;
}

const STEP_TITLES: Record<SetupStep, string> = {
  email: "Enter Your Email",
  password: "Create a Password",
  organization: "Organization Details",
};

const STEP_DESCRIPTIONS: Record<SetupStep, string> = {
  email: "This will be your admin email address",
  password: "Choose a strong password to protect your account",
  organization: "Tell us about your organization",
};

export function SetupCardHeader({
  currentStep,
  steps,
  stateIcon,
  isOnline,
}: SetupCardHeaderProps) {
  const currentStepIndex = steps.indexOf(currentStep);
  const progressValue = (currentStepIndex / (steps.length - 1)) * 100;

  return (
    <CardHeader>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
            {currentStepIndex + 1}
          </div>
          <span className="text-sm text-muted-foreground">
            Step {currentStepIndex + 1} of {steps.length}
          </span>
        </div>
        {stateIcon}
      </div>
      <CardTitle className="text-2xl">{STEP_TITLES[currentStep]}</CardTitle>
      <CardDescription>
        {STEP_DESCRIPTIONS[currentStep]}
        {!isOnline && (
          <span className="text-destructive block mt-1">
            ⚠️ No internet connection detected
          </span>
        )}
      </CardDescription>

      <Progress value={progressValue} className="mt-4" />
    </CardHeader>
  );
}
