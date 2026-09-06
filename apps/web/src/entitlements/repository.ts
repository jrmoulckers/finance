// SPDX-License-Identifier: BUSL-1.1

import { getAccessToken } from '../auth/token-storage';
import {
  decodeEntitlement,
  type EntitlementResult,
  type EntitlementUnavailableReason,
} from './contract';

export interface EntitlementRepository {
  load(householdId?: string): Promise<EntitlementResult>;
}

interface EntitlementTransport {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
  readonly getAuthToken: () => Promise<string>;
}

export function createEntitlementRepository(
  overrides: Partial<EntitlementTransport> = {},
): EntitlementRepository {
  const transport: EntitlementTransport = {
    baseUrl: overrides.baseUrl ?? resolveFunctionsBaseUrl(),
    apiKey: overrides.apiKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '',
    fetch: overrides.fetch ?? ((input, init) => fetch(input, init)),
    getAuthToken:
      overrides.getAuthToken ??
      (async () => {
        return (await getAccessToken()) ?? '';
      }),
  };

  return {
    async load(householdId) {
      if (!transport.baseUrl) return unavailable('projection_unavailable');
      const token = await transport.getAuthToken();
      if (!token) return unavailable('unauthenticated');

      const query = householdId ? `?household_id=${encodeURIComponent(householdId)}` : '';
      let response: Response;
      try {
        response = await transport.fetch(`${transport.baseUrl}/entitlements-v1${query}`, {
          method: 'GET',
          headers: {
            Authorization: ['Bearer', token].join(' '),
            Accept: 'application/json',
            ...(transport.apiKey ? { apikey: transport.apiKey } : {}),
          },
          cache: 'no-store',
        });
      } catch {
        return unavailable('offline');
      }

      if (!response.ok) return unavailable(reasonForStatus(response.status));
      try {
        return decodeEntitlement(await response.json());
      } catch {
        return unavailable('malformed');
      }
    },
  };
}

function reasonForStatus(status: number): EntitlementUnavailableReason {
  switch (status) {
    case 400:
      return 'invalid_request';
    case 401:
      return 'unauthenticated';
    case 403:
      return 'forbidden';
    case 429:
      return 'rate_limited';
    default:
      return status >= 500 ? 'projection_unavailable' : 'malformed';
  }
}

function unavailable(reason: EntitlementUnavailableReason): EntitlementResult {
  return { available: false, reason };
}

function resolveFunctionsBaseUrl(): string {
  const explicit = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  return supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/functions/v1` : '';
}
