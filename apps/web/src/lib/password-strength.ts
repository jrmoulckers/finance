// SPDX-License-Identifier: BUSL-1.1

/**
 * Password Strength Scoring (NIST SP 800-63B aligned)
 *
 * Scores passwords on a 0–4 scale based on length, character variety,
 * and common password blocking. Does NOT enforce arbitrary complexity
 * rules (e.g. "must contain uppercase") — per NIST guidance, length and
 * avoiding common passwords are the primary strength indicators.
 *
 * @module password-strength
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Strength level from 0 (very weak) to 4 (very strong). */
export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrengthResult {
  /** Numeric score 0–4. */
  score: StrengthScore;
  /** Human-readable label. */
  label: string;
  /** Actionable feedback for the user. */
  feedback: string;
  /** CSS color token name for the strength bar. */
  color: string;
}

// ---------------------------------------------------------------------------
// Common Passwords Blocklist (top ~100)
// ---------------------------------------------------------------------------

const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'abc123',
  'password1',
  'password123',
  '111111',
  '123123',
  'admin',
  'letmein',
  'welcome',
  'monkey',
  'dragon',
  'master',
  'login',
  'princess',
  'football',
  'shadow',
  'sunshine',
  'trustno1',
  'iloveyou',
  'batman',
  'access',
  'hello',
  'charlie',
  'donald',
  '654321',
  'baseball',
  'michael',
  'jessica',
  'starwars',
  'harley',
  'pepper',
  'hunter',
  'jordan',
  'buster',
  'tigger',
  'summer',
  'george',
  'fuckyou',
  'andrew',
  'thomas',
  'qwerty123',
  'zxcvbn',
  'asdfgh',
  'soccer',
  'hockey',
  'ranger',
  'killer',
  'austin',
  'matthew',
  'amanda',
  'nicole',
  'daniel',
  'joshua',
  'passw0rd',
  'internet',
  'whatever',
  'nothing',
  'computer',
  'cheese',
  'ginger',
  'flower',
  'silver',
  'orange',
  'cookie',
  'robert',
  'taylor',
  'melissa',
  'phoenix',
  'secret',
  'freedom',
  'william',
  'jennifer',
  'diamond',
  'thunder',
  'chicken',
  'midnight',
  'maggie',
  'corvette',
  'merlin',
  'bailey',
  'sparky',
  'golfer',
  'yankees',
  'cowboys',
  'camaro',
  'anthony',
  'jackson',
  'arsenal',
  'mustang',
  'brandon',
  'compaq',
  'heather',
  'jasmine',
  'snoopy',
  'samantha',
]);

// ---------------------------------------------------------------------------
// Scoring Algorithm
// ---------------------------------------------------------------------------

/**
 * Calculate password strength score.
 *
 * Scoring breakdown:
 *   - Length contributes up to 2 points (12–15 chars = 1pt, 16+ = 2pts)
 *   - Character variety contributes up to 2 points (2–3 classes = 1pt, 4 = 2pts)
 *   - Penalties: common password = score capped at 0; <12 chars = score capped at 1
 *
 * @param password The password string to evaluate.
 * @returns A PasswordStrengthResult with score, label, feedback, and color.
 */
export function calculatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return { score: 0, label: 'Very weak', feedback: '', color: 'var(--semantic-status-negative)' };
  }

  // Block common passwords regardless of length
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return {
      score: 0,
      label: 'Very weak',
      feedback: 'This is a commonly used password. Choose something unique.',
      color: 'var(--semantic-status-negative)',
    };
  }

  // Too short — cap at 1
  if (password.length < 12) {
    return {
      score: 1,
      label: 'Weak',
      feedback: 'Try making it at least 12 characters.',
      color: 'var(--semantic-status-negative)',
    };
  }

  // Calculate character variety (number of character classes present)
  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/[0-9]/.test(password)) classes++;
  // Unicode symbols, punctuation, spaces — anything not alphanumeric
  if (/[^a-zA-Z0-9]/.test(password)) classes++;

  // Length score: 12-15 = 1pt, 16+ = 2pts
  let lengthScore = 1;
  if (password.length >= 16) lengthScore = 2;

  // Variety score: 1 class = 0, 2-3 = 1, 4 = 2
  let varietyScore = 0;
  if (classes >= 2) varietyScore = 1;
  if (classes >= 4) varietyScore = 2;

  const rawScore = lengthScore + varietyScore;
  const score = Math.min(4, Math.max(0, rawScore)) as StrengthScore;

  return {
    score,
    label: LABELS[score],
    feedback: FEEDBACK[score],
    color: COLORS[score],
  };
}

// ---------------------------------------------------------------------------
// Label / Feedback / Color Maps
// ---------------------------------------------------------------------------

const LABELS: Record<StrengthScore, string> = {
  0: 'Very weak',
  1: 'Weak',
  2: 'Fair',
  3: 'Strong',
  4: 'Very strong',
};

const FEEDBACK: Record<StrengthScore, string> = {
  0: 'This is a commonly used password. Choose something unique.',
  1: 'Try making it at least 12 characters.',
  2: 'Good start. Try making it longer or adding variety.',
  3: 'Strong password.',
  4: 'Excellent password strength.',
};

const COLORS: Record<StrengthScore, string> = {
  0: 'var(--semantic-status-negative)',
  1: 'var(--semantic-status-negative)',
  2: 'var(--semantic-status-warning, orange)',
  3: 'var(--semantic-status-positive)',
  4: 'var(--semantic-status-positive)',
};

/**
 * Check if a password is in the common passwords blocklist.
 *
 * @param password The password to check.
 * @returns `true` if the password is blocked.
 */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
