/**
 * Setup Form Validation Hook
 * Provides real-time validation for email and organization fields
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { validateEmail, validateOrganization } from "@z0/utils/api/setup";

interface ValidationState {
  isValidating: boolean;
  isValid: boolean | null;
  message: string | null;
  error: string | null;
}

export function useEmailValidation(email: string, enabled: boolean = true) {
  const [state, setState] = useState<ValidationState>({
    isValidating: false,
    isValid: null,
    message: null,
    error: null,
  });

  const debounceTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastEmail = useRef<string>("");

  const validate = useCallback(async (emailToValidate: string, force = false) => {
    if (!emailToValidate || (!force && emailToValidate === lastEmail.current)) {
      return;
    }

    lastEmail.current = emailToValidate;
    setState({
      isValidating: true,
      isValid: null,
      message: null,
      error: null,
    });

    try {
      const result = await validateEmail(emailToValidate);
      setState({
        isValidating: false,
        isValid: result.available,
        message: result.message,
        error: null,
      });
    } catch (err: any) {
      setState({
        isValidating: false,
        isValid: false,
        message: null,
        error: err.error || "Failed to validate email",
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled || !email || email.length < 5 || !email.includes("@")) {
      setState({
        isValidating: false,
        isValid: null,
        message: null,
        error: null,
      });
      return;
    }

    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Debounce validation
    debounceTimer.current = setTimeout(() => {
      validate(email);
    }, 500);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [email, enabled, validate]);

  const reset = useCallback(() => {
    lastEmail.current = "";
    setState({
      isValidating: false,
      isValid: null,
      message: null,
      error: null,
    });
  }, []);

  // Force validation - useful for autofill scenarios
  const forceValidate = useCallback(
    (emailToValidate: string) => {
      if (emailToValidate && emailToValidate.length >= 5 && emailToValidate.includes("@")) {
        validate(emailToValidate, true);
      }
    },
    [validate]
  );

  return { ...state, reset, forceValidate };
}

export function useOrganizationValidation(
  name: string,
  enabled: boolean = true
) {
  const [state, setState] = useState<ValidationState>({
    isValidating: false,
    isValid: null,
    message: null,
    error: null,
  });

  const debounceTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastName = useRef<string>("");

  const validate = useCallback(async (nameToValidate: string) => {
    if (!nameToValidate || nameToValidate === lastName.current) {
      return;
    }

    lastName.current = nameToValidate;
    setState({
      isValidating: true,
      isValid: null,
      message: null,
      error: null,
    });

    try {
      const result = await validateOrganization(nameToValidate);
      setState({
        isValidating: false,
        isValid: result.available,
        message: result.message,
        error: null,
      });
    } catch (err: any) {
      setState({
        isValidating: false,
        isValid: false,
        message: null,
        error: err.error || "Failed to validate organization",
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled || !name || name.length < 2) {
      setState({
        isValidating: false,
        isValid: null,
        message: null,
        error: null,
      });
      return;
    }

    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Debounce validation
    debounceTimer.current = setTimeout(() => {
      validate(name);
    }, 500);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [name, enabled, validate]);

  const reset = useCallback(() => {
    lastName.current = "";
    setState({
      isValidating: false,
      isValid: null,
      message: null,
      error: null,
    });
  }, []);

  return { ...state, reset };
}
