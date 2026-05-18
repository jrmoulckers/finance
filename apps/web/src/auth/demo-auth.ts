// SPDX-License-Identifier: BUSL-1.1

/**
 * Demo Auth Module (#1436)
 *
 * Provides an in-memory + localStorage-backed auth implementation for local
 * development when no Supabase backend is configured.
 *
 * Activates automatically when the Supabase URL contains "placeholder".
 *
 * SECURITY:
 *   - This module is for LOCAL DEVELOPMENT ONLY.
 *   - Passwords are hashed with SHA-256 before localStorage storage.
 *   - The generated JWT is a structurally valid but unsigned token.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DemoUser {
  email: string;
  /** SHA-256 hex digest of the password. */
  passwordHash: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'finance_demo_users';

/** Token lifetime in seconds (1 hour). */
const TOKEN_LIFETIME_SECONDS = 3600;

// ---------------------------------------------------------------------------
// Hashing Helper
// ---------------------------------------------------------------------------

/** Hash a password string using SHA-256 via the Web Crypto API. */
async function hashPassword(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Storage Helpers
// ---------------------------------------------------------------------------

/** Load demo users from localStorage. */
function loadUsers(): DemoUser[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DemoUser[];
  } catch {
    return [];
  }
}

/** Save demo users to localStorage. */
function saveUsers(users: DemoUser[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

// ---------------------------------------------------------------------------
// JWT Helper
// ---------------------------------------------------------------------------

/**
 * Generate a structurally valid (but unsigned) JWT for demo mode.
 *
 * The token has the correct three-part structure so that
 * `parseTokenPayload` in `auth-context.tsx` and `decodeJwtPayload` in
 * `token-storage.ts` can extract `sub`, `email`, and `exp` claims.
 */
function generateDemoToken(email: string): string {
  const header = { alg: 'none', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: `demo-${email.replace(/[^a-zA-Z0-9]/g, '-')}`,
    email,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
    iss: 'finance-demo',
  };

  const encode = (obj: object): string =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${encode(header)}.${encode(payload)}.demo-signature`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the app should run in demo auth mode.
 *
 * @param supabaseUrl The configured Supabase URL.
 * @returns `true` if the URL is missing or contains "placeholder".
 */
export function isDemoMode(supabaseUrl: string): boolean {
  return !supabaseUrl || supabaseUrl.includes('placeholder');
}

/**
 * Register a new demo user.
 *
 * @throws {Error} If the email is already registered.
 */
export async function demoSignup(email: string, password: string): Promise<void> {
  const users = loadUsers();
  const normalizedEmail = email.toLowerCase().trim();

  if (users.some((u) => u.email === normalizedEmail)) {
    throw new Error('An account with this email already exists.');
  }

  const passwordHash = await hashPassword(password);
  users.push({ email: normalizedEmail, passwordHash });
  saveUsers(users);
}

/**
 * Authenticate a demo user and return a fake JWT + user info.
 *
 * In demo mode we provide specific error messages to help users understand
 * what went wrong. This is safe because demo mode is local-only — no
 * account enumeration risk exists.
 *
 * @throws {Error} If credentials are invalid (with a specific message).
 */
export async function demoLogin(
  email: string,
  password: string,
): Promise<{ accessToken: string; user: { id: string; email: string } }> {
  const users = loadUsers();
  const normalizedEmail = email.toLowerCase().trim();

  // Check if the email exists first — specific error for demo UX
  const userByEmail = users.find((u) => u.email === normalizedEmail);
  if (!userByEmail) {
    throw new Error('No account found for that email.');
  }

  // Check password — specific error for demo UX
  const passwordHash = await hashPassword(password);
  if (userByEmail.passwordHash !== passwordHash) {
    throw new Error('Incorrect password.');
  }

  const token = generateDemoToken(userByEmail.email);
  const sub = `demo-${userByEmail.email.replace(/[^a-zA-Z0-9]/g, '-')}`;

  return {
    accessToken: token,
    user: { id: sub, email: userByEmail.email },
  };
}

/**
 * Refresh a demo token — generates a fresh token for the given email.
 *
 * @returns A new demo JWT, or `null` if no email is provided.
 */
export function demoRefreshToken(email: string | null): string | null {
  if (!email) return null;
  return generateDemoToken(email);
}

/**
 * Delete a demo user account from localStorage.
 *
 * Removes the user entry from the stored demo users list.
 *
 * @param email The email of the account to delete.
 * @returns `true` if the user was found and removed, `false` otherwise.
 */
export function demoDeleteAccount(email: string): boolean {
  const users = loadUsers();
  const normalizedEmail = email.toLowerCase().trim();
  const filtered = users.filter((u) => u.email !== normalizedEmail);

  if (filtered.length === users.length) {
    return false; // User not found
  }

  saveUsers(filtered);
  return true;
}
