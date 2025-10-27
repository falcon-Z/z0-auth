import { useState, useCallback } from "react";
import { UseFormReturn } from "react-hook-form";
import type { PasswordValidationResult } from "@z0/utils/password-validation";

export type SetupStep = "email" | "password" | "organization";

interface SetupFormValues {
  organization: string;
  name: string;
  email: string;
  password: string;
}

interface UseSetupFormProps {
  form: UseFormReturn<SetupFormValues>;
  passwordValidation: PasswordValidationResult | null;
  steps: readonly SetupStep[];
}

export function useSetupForm({
  form,
  passwordValidation,
  steps,
}: UseSetupFormProps) {
  const [currentStep, setCurrentStep] = useState<SetupStep>("email");

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

  const handleNextStep = useCallback(() => {
    if (!isStepValid(currentStep)) return;

    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  }, [currentStep, isStepValid, steps]);

  const handlePreviousStep = useCallback(() => {
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  }, [currentStep, steps]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent, onFinalSubmit: () => void) => {
      if (e.key === "Enter" && isStepValid(currentStep)) {
        e.preventDefault();
        if (currentStep === "organization") {
          onFinalSubmit();
        } else {
          handleNextStep();
        }
      }
    },
    [currentStep, isStepValid, handleNextStep]
  );

  return {
    currentStep,
    setCurrentStep,
    isStepValid,
    handleNextStep,
    handlePreviousStep,
    handleKeyPress,
  };
}
