import { CardFooter } from "@z0/components/ui/card";
import { Button } from "@z0/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRef, useState, useCallback } from "react";
import { cn } from "@z0/lib/utils";

export type SetupStep = "email" | "password" | "organization";

interface SetupFooterProps {
  currentStep: SetupStep;
  isStepValid: boolean;
  disabled: boolean;
  isSubmitting: boolean;
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
  isSubmitting,
  onPrevious,
  onNext,
  onSubmit,
  submitIcon,
  submitLabel,
}: SetupFooterProps) {
  const isFirstStep = currentStep === "email";
  const isLastStep = currentStep === "organization";
  const lastSubmitTime = useRef<number>(0);
  const [isThrottled, setIsThrottled] = useState(false);

  // Debounced submit handler to prevent double submission
  const handleDebouncedSubmit = useCallback(() => {
    const now = Date.now();
    const timeSinceLastSubmit = now - lastSubmitTime.current;

    // Prevent double submission if less than 1 second has passed
    if (timeSinceLastSubmit < 1000) {
      // Show visual feedback that submission is throttled
      setIsThrottled(true);
      setTimeout(() => setIsThrottled(false), 300);
      return;
    }

    lastSubmitTime.current = now;
    onSubmit();
  }, [onSubmit]);

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
          disabled={disabled}
          className="h-11 flex-1"
        >
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      ) : (
        <Button
          type="button"
          onClick={handleDebouncedSubmit}
          disabled={disabled}
          className={cn(
            "h-11 flex-1 transition-all",
            isThrottled && "animate-pulse"
          )}
        >
          {submitIcon}
          <span className="ml-2">{submitLabel}</span>
        </Button>
      )}
    </CardFooter>
  );
}
