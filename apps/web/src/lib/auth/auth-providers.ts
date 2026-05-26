// SPDX-License-Identifier: BUSL-1.1

/**
 * Auth Provider Integration — Google & Apple Sign-In (#1241)
 *
 * Thin wrappers around Supabase Auth's `signInWithOAuth` for each provider.
 * These functions handle provider-specific options (scopes, query params)
 * and return the Supabase redirect URL the caller should navigate to.
 *
 * IMPORTANT: OAuth sign-in is delegated entirely to Supabase Auth.
 * This module does NOT exchange authorization codes or handle tokens —
 * Supabase manages the full PKCE flow server-side.
 *
 * Prerequisites:
 *   - Supabase project with Google and/or Apple providers enabled
 *   - Environment variables set (see `oauth-config.ts`)
 *   - Redirect URIs configured in provider consoles AND Supabase Dashboard
 */

import { googleProvider, appleProvider } from './oauth-config';
import type { OAuthProviderName } from './oauth-config';

// ────────────────────────────────────────────────────────────────────────────
// Redirect URI Configuration
// ────────────────────────────────────────────────────────────────────────────

/**
 * Redirect URIs that must be registered in each OAuth provider's console
 * AND in the Supabase Dashboard (Auth → URL Configuration → Redirect URLs).
 *
 * Format: `https://<supabase-project-ref>.supabase.co/auth/v1/callback`
 *
 * Per-platform redirect URIs:
 *
 * | Platform | Redirect URI                                                        |
 * |----------|---------------------------------------------------------------------|
 * | Web      | `https://<your-domain>/auth/callback`                               |
 * | Web      | `http://localhost:5173/auth/callback` (development)                 |
 * | Supabase | `https://<project-ref>.supabase.co/auth/v1/callback`                |
 * | Android  | `com.finance.android://auth/callback` (deep link)                   |
 * | iOS      | `com.finance.ios://auth/callback` (universal link)                  |
 * | Windows  | `finance://auth/callback` (protocol handler)                        |
 *
 * TODO(human): Replace placeholder domains with actual values after
 * configuring the Supabase project and deploying the web app.
 */
export const REDIRECT_URIS = {
  /** Web production — replace with actual deployed domain. */
  webProduction: 'https://YOUR_DOMAIN/auth/callback',

  /** Web development — Vite dev server default. */
  webDevelopment: 'http://localhost:5173/auth/callback',

  /** Supabase callback — replace <project-ref> with your Supabase project reference. */
  supabase: 'https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback',

  /** Android deep link — matches intent filter in AndroidManifest.xml. */
  android: 'com.finance.android://auth/callback',

  /** iOS universal link — matches Associated Domains entitlement. */
  ios: 'com.finance.ios://auth/callback',

  /** Windows protocol handler — matches finance:// registration in AppxManifest.xml. */
  windows: 'finance://auth/callback',
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Sign-In Options
// ────────────────────────────────────────────────────────────────────────────

/** Options passed to the Supabase `signInWithOAuth` call. */
export interface OAuthSignInOptions {
  /** Where to redirect after successful authentication. */
  redirectTo?: string;

  /** Additional OAuth query parameters. */
  queryParams?: Record<string, string>;

  /** If true, skip the Supabase redirect and return the provider URL. */
  skipBrowserRedirect?: boolean;
}

/**
 * Build Supabase-compatible sign-in options for Google.
 *
 * Google-specific extras:
 *   - `access_type=offline` — requests a refresh token
 *   - `prompt=consent` — forces consent screen (useful for re-auth)
 *   - `hd` — optional: restrict to a Google Workspace domain
 */
export function buildGoogleSignInOptions(overrides?: OAuthSignInOptions): OAuthSignInOptions {
  return {
    redirectTo: overrides?.redirectTo ?? REDIRECT_URIS.webProduction,
    queryParams: {
      access_type: 'offline',
      prompt: 'consent',
      ...overrides?.queryParams,
    },
    skipBrowserRedirect: overrides?.skipBrowserRedirect ?? false,
  };
}

/**
 * Build Supabase-compatible sign-in options for Apple.
 *
 * Apple-specific extras:
 *   - `response_mode=form_post` — Apple requires form_post for web
 *   - Apple only returns the user's name on the FIRST sign-in;
 *     store it immediately in the user profile.
 */
export function buildAppleSignInOptions(overrides?: OAuthSignInOptions): OAuthSignInOptions {
  return {
    redirectTo: overrides?.redirectTo ?? REDIRECT_URIS.webProduction,
    queryParams: {
      response_mode: 'form_post',
      ...overrides?.queryParams,
    },
    skipBrowserRedirect: overrides?.skipBrowserRedirect ?? false,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Provider Lookup
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns the sign-in options builder for a given provider name.
 *
 * Usage with Supabase client:
 * ```ts
 * const options = getSignInOptionsForProvider('google');
 * await supabase.auth.signInWithOAuth({
 *   provider: 'google',
 *   options,
 * });
 * ```
 */
export function getSignInOptionsForProvider(
  provider: OAuthProviderName,
  overrides?: OAuthSignInOptions,
): OAuthSignInOptions {
  switch (provider) {
    case 'google':
      return buildGoogleSignInOptions(overrides);
    case 'apple':
      return buildAppleSignInOptions(overrides);
    default: {
      // Exhaustive check — TypeScript will error if a provider is unhandled
      const _exhaustive: never = provider;
      throw new Error(`Unknown OAuth provider: ${_exhaustive}`);
    }
  }
}

// Re-export provider configs for convenience
export { googleProvider, appleProvider };
export type { OAuthProviderConfig, OAuthProviderName } from './oauth-config';
