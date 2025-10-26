/**
 * Password Input Component with Strength Validation
 * Provides real-time password validation and visual feedback
 */

import React, { useState, useCallback } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@z0/lib/utils';
import { Input } from '@z0/components/ui/input';
import { Button } from '@z0/components/ui/button';
import { PasswordStrengthIndicator } from '@z0/components/ui/password-strength-indicator';
import { validatePassword, type PasswordValidationResult } from '@z0/utils/password-validation';

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  showStrengthIndicator?: boolean;
  showToggleVisibility?: boolean;
  onValidationChange?: (validation: PasswordValidationResult) => void;
  className?: string;
}

export function PasswordInput({
  value,
  onChange,
  showStrengthIndicator = true,
  showToggleVisibility = true,
  onValidationChange,
  className,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [validation, setValidation] = useState<PasswordValidationResult>(
    validatePassword('')
  );

  const handlePasswordChange = useCallback((newValue: string) => {
    onChange(newValue);
    
    const newValidation = validatePassword(newValue);
    setValidation(newValidation);
    
    if (onValidationChange) {
      onValidationChange(newValidation);
    }
  }, [onChange, onValidationChange]);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  React.useEffect(() => {
    const newValidation = validatePassword(value);
    setValidation(newValidation);
    
    if (onValidationChange) {
      onValidationChange(newValidation);
    }
  }, [value, onValidationChange]);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="relative">
        <Input
          {...props}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => handlePasswordChange(e.target.value)}
          className={cn(
            'pr-10',
            value && !validation.isValid && 'border-red-300 focus:border-red-500',
            value && validation.isValid && 'border-green-300 focus:border-green-500'
          )}
        />
        
        {showToggleVisibility && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
            onClick={togglePasswordVisibility}
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 text-gray-400" />
            ) : (
              <Eye className="h-4 w-4 text-gray-400" />
            )}
            <span className="sr-only">
              {showPassword ? 'Hide password' : 'Show password'}
            </span>
          </Button>
        )}
      </div>

      {showStrengthIndicator && value && (
        <PasswordStrengthIndicator
          validation={validation}
          showDetails={true}
        />
      )}
    </div>
  );
}