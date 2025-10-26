/**
 * Comprehensive password validation utility
 * Provides multiple criteria checks, strength indication, and visual feedback
 */

export interface PasswordValidationCriteria {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumbers: boolean;
  hasSpecialChars: boolean;
  noCommonPatterns: boolean;
}

export interface PasswordValidationResult {
  isValid: boolean;
  strength: 'weak' | 'medium' | 'strong';
  score: number; // 0-100
  criteria: PasswordValidationCriteria;
  feedback: string[];
  hints: string[];
}

/**
 * Configuration constants
 */
const MIN_PASSWORD_LENGTH = 8;
const STRONG_PASSWORD_LENGTH = 12;

/**
 * Common weak password patterns to avoid
 */
const COMMON_PATTERNS = [
  /^password/i,
  /^123456/,
  /^qwerty/i,
  /^admin/i,
  /^letmein/i,
  /^welcome/i,
  /^monkey/i,
  /^dragon/i,
  /^master/i,
  /^login/i,
  /(.)\1{2,}/,
  /^(.*)(012|123|234|345|456|567|678|789|890)(.*)$/,
  /^(.*)(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)(.*)$/i,
];

/**
 * Check if password meets minimum length requirement
 */
function checkMinLength(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

/**
 * Check if password contains uppercase letters
 */
function checkUppercase(password: string): boolean {
  return /[A-Z]/.test(password);
}

/**
 * Check if password contains lowercase letters
 */
function checkLowercase(password: string): boolean {
  return /[a-z]/.test(password);
}

/**
 * Check if password contains numbers
 */
function checkNumbers(password: string): boolean {
  return /\d/.test(password);
}

/**
 * Check if password contains special characters
 */
function checkSpecialChars(password: string): boolean {
  return /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);
}

/**
 * Check if password avoids common weak patterns
 */
function checkCommonPatterns(password: string): boolean {
  return !COMMON_PATTERNS.some(pattern => pattern.test(password));
}

/**
 * Calculate password strength score (0-100)
 */
function calculateStrengthScore(password: string, criteria: PasswordValidationCriteria): number {
  let score = 0;
  
  if (password.length >= MIN_PASSWORD_LENGTH) {
    score += 15;
  }
  if (password.length >= STRONG_PASSWORD_LENGTH) {
    score += 10;
  }
  if (password.length >= 16) {
    score += 5;
  }
  
  if (criteria.hasUppercase) score += 10;
  if (criteria.hasLowercase) score += 10;
  if (criteria.hasNumbers) score += 10;
  if (criteria.hasSpecialChars) score += 10;
  
  if (criteria.noCommonPatterns) score += 20;
  
  const uniqueChars = new Set(password).size;
  const diversityRatio = uniqueChars / password.length;
  if (diversityRatio > 0.7) score += 10;
  else if (diversityRatio > 0.5) score += 5;
  
  return Math.min(100, score);
}

/**
 * Determine password strength category based on score
 */
function getStrengthCategory(score: number): 'weak' | 'medium' | 'strong' {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'medium';
  return 'weak';
}

/**
 * Generate feedback messages for password improvement
 */
function generateFeedback(criteria: PasswordValidationCriteria, password: string): string[] {
  const feedback: string[] = [];
  
  if (!criteria.minLength) {
    feedback.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
  
  if (!criteria.hasUppercase) {
    feedback.push('Add at least one uppercase letter (A-Z)');
  }
  
  if (!criteria.hasLowercase) {
    feedback.push('Add at least one lowercase letter (a-z)');
  }
  
  if (!criteria.hasNumbers) {
    feedback.push('Add at least one number (0-9)');
  }
  
  if (!criteria.hasSpecialChars) {
    feedback.push('Add at least one special character (!@#$%^&*...)');
  }
  
  if (!criteria.noCommonPatterns) {
    feedback.push('Avoid common patterns and dictionary words');
  }
  
  return feedback;
}

/**
 * Generate helpful hints for creating strong passwords
 */
function generateHints(criteria: PasswordValidationCriteria, score: number): string[] {
  const hints: string[] = [];
  
  if (score < 80) {
    hints.push('Consider using a longer password for better security');
  }
  
  if (criteria.minLength && criteria.hasUppercase && criteria.hasLowercase && criteria.hasNumbers) {
    hints.push('Great! Your password meets the basic requirements');
  }
  
  if (score >= 60 && score < 80) {
    hints.push('Good password! Consider adding more character variety for maximum security');
  }
  
  if (score >= 80) {
    hints.push('Excellent! Your password is strong and secure');
  }
  
  return hints;
}

/**
 * Main password validation function
 * @param password - The password to validate
 * @returns PasswordValidationResult - Comprehensive validation result
 */
export function validatePassword(password: string): PasswordValidationResult {
  const criteria: PasswordValidationCriteria = {
    minLength: checkMinLength(password),
    hasUppercase: checkUppercase(password),
    hasLowercase: checkLowercase(password),
    hasNumbers: checkNumbers(password),
    hasSpecialChars: checkSpecialChars(password),
    noCommonPatterns: checkCommonPatterns(password),
  };
  
  const score = calculateStrengthScore(password, criteria);
  const strength = getStrengthCategory(score);
  
  const feedback = generateFeedback(criteria, password);
  const hints = generateHints(criteria, score);
  
  const isValid = criteria.minLength && 
                  criteria.hasUppercase && 
                  criteria.hasLowercase && 
                  criteria.hasNumbers && 
                  criteria.hasSpecialChars &&
                  criteria.noCommonPatterns;
  
  return {
    isValid,
    strength,
    score,
    criteria,
    feedback,
    hints,
  };
}

/**
 * Get password strength color for UI display
 */
export function getStrengthColor(strength: 'weak' | 'medium' | 'strong'): string {
  switch (strength) {
    case 'weak':
      return 'text-red-500';
    case 'medium':
      return 'text-yellow-500';
    case 'strong':
      return 'text-green-500';
    default:
      return 'text-gray-500';
  }
}

/**
 * Get password strength background color for progress bars
 */
export function getStrengthBgColor(strength: 'weak' | 'medium' | 'strong'): string {
  switch (strength) {
    case 'weak':
      return 'bg-red-500';
    case 'medium':
      return 'bg-yellow-500';
    case 'strong':
      return 'bg-green-500';
    default:
      return 'bg-gray-300';
  }
}

/**
 * Get progress bar width percentage based on strength score
 */
export function getProgressWidth(score: number): number {
  if (typeof score !== 'number' || isNaN(score) || score === null || score === undefined) {
    return 10;
  }
  return Math.max(10, Math.min(100, score));
}