// SPDX-License-Identifier: BUSL-1.1

/**
 * OAuth Provider Configuration Types & Templates (#1241)
 *
 * Defines the OAuthProvider type and per-provider configuration objects.
 * All client IDs and secrets are sourced from environment variables —
 * NEVER hardcode real credentials in this file.
 *
 * After creating OAuth credentials in each provider's developer console,
 * set the corresponding VITE_* environment variables in `.env.local`.
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/** Supported OAuth identity providers. */
export type OAuthProviderName = 'google' | 'apple';

/** Configuration for a single OAuth provider. */
export interface OAuthProviderConfig {
  /** Provider identifier. */
  readonly name: OAuthProviderName;

  /** Human-readable label for UI buttons (e.g. "Sign in with Google"). */
  readonly displayName: string;

  /** OAuth 2.0 client ID — sourced from environment variable. */
  readonly clientId: string;

  /**
   * OAuth 2.0 client secret — only used server-side (Supabase Auth).
   * Web client code should NEVER access this value directly.
   * Listed here for documentation; actual secret lives in Supabase Dashboard.
   */
  readonly clientSecretEnvVar: string;

  /** OAuth 2.0 scopes requested during authorization. */
  readonly scopes: readonly string[];

  /** Provider's authorization endpoint (for reference). */
  readonly authorizationUrl: string;

  /** Provider's token endpoint (for reference). */
  readonly tokenUrl: string;

  /** Whether this provider is currently enabled. */
  readonly enabled: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Provider Configurations
// ────────────────────────────────────────────────────────────────────────────

/**
 * Google Sign-In configuration.
 *
 * Setup steps:
 *   1. Go to https://console.cloud.google.com/apis/credentials
 *   2. Create an OAuth 2.0 Client ID (Web application type)
 *   3. Add authorized redirect URIs (see `REDIRECT_URIS` below)
 *   4. Copy Client ID → set `VITE_GOOGLE_CLIENT_ID` in `.env.local`
 *   5. Copy Client Secret → set in Supabase Dashboard (Auth → Providers → Google)
 */
export const googleProvider: OAuthProviderConfig = {
  name: 'google',
  displayName: 'Sign in with Google',
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? 'YOUR_GOOGLE_CLIENT_ID',
  clientSecretEnvVar: 'SUPABASE_AUTH_GOOGLE_SECRET',
  scopes: ['openid', 'email', 'profile'],
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  enabled: !!import.meta.env.VITE_GOOGLE_CLIENT_ID,
};

/**
 * Apple Sign-In configuration.
 *
 * Setup steps:
 *   1. Go to https://developer.apple.com/account/resources/identifiers
 *   2. Register an App ID with "Sign in with Apple" capability
 *   3. Create a Services ID for web authentication
 *   4. Configure domains and redirect URIs (see `REDIRECT_URIS` below)
 *   5. Generate a client secret (private key + key ID + team ID)
 *   6. Set `VITE_APPLE_CLIENT_ID` in `.env.local` (= Services ID)
 *   7. Set client secret in Supabase Dashboard (Auth → Providers → Apple)
 */
export const appleProvider: OAuthProviderConfig = {
  name: 'apple',
  displayName: 'Sign in with Apple',
  clientId: import.meta.env.VITE_APPLE_CLIENT_ID ?? 'YOUR_APPLE_CLIENT_ID',
  clientSecretEnvVar: 'SUPABASE_AUTH_APPLE_SECRET',
  scopes: ['name', 'email'],
  authorizationUrl: 'https://appleid.apple.com/auth/authorize',
  tokenUrl: 'https://appleid.apple.com/auth/token',
  enabled: !!import.meta.env.VITE_APPLE_CLIENT_ID,
};

// ────────────────────────────────────────────────────────────────────────────
// Provider Registry
// ────────────────────────────────────────────────────────────────────────────

/** All configured OAuth providers, keyed by name. */
export const oauthProviders: Record<OAuthProviderName, OAuthProviderConfig> = {
  google: googleProvider,
  apple: appleProvider,
};

/** Returns only the providers that are enabled (have a client ID set). */
export function getEnabledProviders(): OAuthProviderConfig[] {
  return Object.values(oauthProviders).filter((p) => p.enabled);
}
