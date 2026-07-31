// SPDX-License-Identifier: BUSL-1.1

/**
 * Supabase Edge Function transport for aggregator providers (#3854).
 *
 * Provides the concrete {@link EdgeTransport} that
 * {@link BaseAggregatorProvider} uses to reach the banking edge functions
 * (`bank-connection`, `aggregator-health`). It resolves the functions base URL
 * from the Vite environment and the caller's bearer token from the shared auth
 * token store — no secrets or provider credentials are ever handled client-side.
 *
 * @module lib/banking/aggregator-transport
 */

import { getAccessToken } from '../../auth/token-storage';
import type { EdgeTransport } from './base-aggregator-provider';

/**
 * Coerce a raw Vite env value to a non-empty string, or `undefined`.
 *
 * IMPORTANT: callers MUST read `import.meta.env.VITE_*` via **static** member
 * access. Dynamic access (`import.meta.env[key]`) is not inlined by the
 * production bundler (rolldown-vite) and resolves to `undefined` at runtime —
 * which silently emptied this base URL and sent bank-connection requests to the
 * SPA origin without the `/functions/v1` prefix (Caddy answered 405). @internal
 */
function nonEmpty(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Resolve the Supabase Edge Functions base URL (`<project>/functions/v1`).
 *
 * Prefers an explicit `VITE_SUPABASE_FUNCTIONS_URL`; otherwise derives it from
 * `VITE_SUPABASE_URL`. Returns an empty string when neither is configured (e.g.
 * demo mode) — provider requests will then fail fast with a categorized error
 * rather than hitting an unintended origin.
 *
 * @returns The trimmed functions base URL, or `''` when unconfigured.
 */
export function resolveEdgeFunctionsBaseUrl(): string {
  const explicit = nonEmpty(import.meta.env.VITE_SUPABASE_FUNCTIONS_URL);
  if (explicit) return explicit.replace(/\/+$/, '');

  const supabaseUrl = nonEmpty(import.meta.env.VITE_SUPABASE_URL);
  if (!supabaseUrl) return '';
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`;
}

/**
 * Build the concrete {@link EdgeTransport} for aggregator providers.
 *
 * The transport is stateless: it reads the current base URL once at
 * construction and resolves a fresh bearer token on every request via
 * {@link getAccessToken} (which transparently refreshes near-expiry tokens).
 *
 * @param overrides - Optional seams for tests (custom `fetch`/base URL/token).
 * @returns An {@link EdgeTransport} bound to the Supabase Edge Functions.
 */
export function createSupabaseEdgeTransport(overrides?: {
  baseUrl?: string;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  getAuthToken?: () => Promise<string>;
}): EdgeTransport {
  const baseUrl = overrides?.baseUrl ?? resolveEdgeFunctionsBaseUrl();
  const fetchImpl = overrides?.fetch ?? ((input: string, init?: RequestInit) => fetch(input, init));

  return {
    baseUrl,
    fetch: fetchImpl,
    getAuthToken:
      overrides?.getAuthToken ??
      (async () => {
        const token = await getAccessToken();
        return token ?? '';
      }),
  };
}
