// SPDX-License-Identifier: BUSL-1.1

import { decodeEntitlement, type EntitlementEnvelope, type EntitlementResult } from './contract';

const CACHE_PREFIX = 'finance.entitlement-display.v1.';
export const LEGACY_SUBSCRIPTION_STORAGE_KEY = 'finance_subscription';

/**
 * Tab-scoped display cache. Session storage limits retention on a shared
 * browser, and the principal/scope tuple is SHA-256 hashed so account and
 * household identifiers are not written into origin storage.
 */
export class EntitlementDisplayCache {
  constructor(private readonly storage: Storage | null = safeSessionStorage()) {}

  async read(principalId: string, householdId?: string): Promise<EntitlementResult | null> {
    const key = await cacheKey(principalId, householdId);
    if (!key || !this.storage) return null;
    try {
      const raw = this.storage.getItem(key);
      if (!raw) return null;
      const decoded = decodeEntitlement(JSON.parse(raw));
      if (!decoded.available) this.storage.removeItem(key);
      return decoded;
    } catch {
      this.storage.removeItem(key);
      return { available: false, reason: 'malformed' };
    }
  }

  async write(
    principalId: string,
    householdId: string | undefined,
    envelope: EntitlementEnvelope,
  ): Promise<void> {
    const key = await cacheKey(principalId, householdId);
    if (!key || !this.storage) return;
    const validated = decodeEntitlement(envelope);
    if (!validated.available) return;
    try {
      // Persist only the minimized server envelope. No checkout/session data,
      // local timestamps, feature flags, or derived authorization state.
      this.storage.setItem(key, JSON.stringify(validated.envelope));
    } catch {
      // Display caching is best effort.
    }
  }

  async remove(principalId: string, householdId?: string): Promise<void> {
    const key = await cacheKey(principalId, householdId);
    if (!key || !this.storage) return;
    this.storage.removeItem(key);
  }
}

/** Remove the old writable local tier authority without migrating or trusting it. */
export function removeLegacySubscriptionAuthority(): void {
  try {
    localStorage.removeItem(LEGACY_SUBSCRIPTION_STORAGE_KEY);
  } catch {
    // Storage can be denied; the obsolete value is never read either way.
  }
}

async function cacheKey(principalId: string, householdId?: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle || principalId.length === 0) return null;
  const scope = householdId ? `household:${householdId}` : 'user';
  const bytes = new TextEncoder().encode(`${principalId}\u0000${scope}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return `${CACHE_PREFIX}${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}
