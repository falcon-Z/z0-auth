import { CardFooter } from "@z0/components/ui/card";
import { Button } from "@z0/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

export type SetupStep = "email" | "password" | "organization";

interface SetupFooterProps {
  currentStep: SetupStep;
  isStepValid: boolean;
  disabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
  submitIcon?: React.ReactNode;
  submitLabel: string;
}

export function SetupFooter({
  currentStep,
  isStepValid,
  disabled,
  onPrevious,
  onNext,
  onSubmit,
  submitIcon,
  submitLabel,
}: SetupFooterProps) {
  const isFirstStep = currentStep === "email";
  const isLastStep = currentStep === "organization";

  return (
    <CardFooter className="flex justify-between gap-3">
      <Button
        type="button"
        variant="outline"
        onClick={onPrevious}
        disabled={isFirstStep || disabled}
        className="h-11"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>

      {!isLastStep ? (
        <Button
          type="button"
          onClick={onNext}
          disabled={!isStepValid || disabled}
          className="h-11 flex-1"
        >
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      ) : (
        <Button
          type="button"
          onClick={onSubmit}
          disabled={!isStepValid || disabled}
          className="h-11 flex-1"
        >
          {submitIcon}
          <span className="ml-2">{submitLabel}</span>
        </Button>
      )}
    </CardFooter>
  );
}
