/**
 * Password Strength Indicator Component
 * Provides real-time visual feedback for password strength
 */

import React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@z0/lib/utils';
import {
  type PasswordValidationResult,
  getStrengthColor,
  getStrengthBgColor,
  getProgressWidth,
} from '@z0/utils/password-validation';

interface PasswordStrengthIndicatorProps {
  validation: PasswordValidationResult;
  showDetails?: boolean;
  className?: string;
}

export function PasswordStrengthIndicator({
  validation,
  showDetails = true,
  className,
}: PasswordStrengthIndicatorProps) {
  const { strength, score, criteria, feedback, hints } = validation;
  const progressWidth = getProgressWidth(score);
  const strengthColor = getStrengthColor(strength);
  const strengthBgColor = getStrengthBgColor(strength);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Strength Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">
            Password Strength
          </span>
          <span className={cn('text-sm font-semibold capitalize', strengthColor)}>
            {strength} ({score}/100)
          </span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={cn('h-2 rounded-full transition-all duration-300', strengthBgColor)}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>

      {showDetails && (
        <>
          {/* Requirements Checklist */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Requirements:</h4>
            <div className="grid grid-cols-1 gap-1 text-sm">
              <RequirementItem
                met={criteria.minLength}
                text="At least 8 characters long"
              />
              <RequirementItem
                met={criteria.hasUppercase}
                text="Contains uppercase letter (A-Z)"
              />
              <RequirementItem
                met={criteria.hasLowercase}
                text="Contains lowercase letter (a-z)"
              />
              <RequirementItem
                met={criteria.hasNumbers}
                text="Contains number (0-9)"
              />
              <RequirementItem
                met={criteria.hasSpecialChars}
                text="Contains special character (!@#$%...)"
              />
              <RequirementItem
                met={criteria.noCommonPatterns}
                text="Avoids common patterns"
              />
            </div>
          </div>

          {/* Feedback Messages */}
          {feedback.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-red-600">Improvements needed:</h4>
              <ul className="text-sm text-red-600 space-y-1">
                {feedback.map((message, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>{message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Helpful Hints */}
          {hints.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-blue-600">Tips:</h4>
              <ul className="text-sm text-blue-600 space-y-1">
                {hints.map((hint, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">💡</span>
                    <span>{hint}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface RequirementItemProps {
  met: boolean;
  text: string;
}

function RequirementItem({ met, text }: RequirementItemProps) {
  return (
    <div className="flex items-center gap-2">
      {met ? (
        <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
      ) : (
        <X className="h-4 w-4 text-red-500 flex-shrink-0" />
      )}
      <span className={cn(
        'text-sm',
        met ? 'text-green-700' : 'text-gray-600'
      )}>
        {text}
      </span>
    </div>
  );
}