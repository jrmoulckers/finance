// SPDX-License-Identifier: BUSL-1.1

/**
 * Supabase backend connector for the live PowerSync client.
 *
 * Bridges PowerSync to the self-hosted Supabase backend:
 *
 *   - `fetchCredentials()` returns the PowerSync sync-service endpoint plus the
 *     current Supabase access token. The token is read from the in-memory
 *     token store (`auth/token-storage.ts`) — the app authenticates against
 *     GoTrue with a custom, cookie-backed flow rather than `@supabase/supabase-js`,
 *     so there is no Supabase session object to read from.
 *
 *   - `uploadData()` drains PowerSync's local write queue one transaction at a
 *     time and applies each change to Supabase PostgREST. Deletes in the app are
 *     modelled as soft-deletes (`UPDATE ... SET deleted_at = ...`), which reach
 *     PowerSync as PATCH ops; a genuine DELETE op is mapped to a PostgREST
 *     row delete for completeness.
 *
 * References: sync-rules.yaml, issues #3941 / #3935.
 */

import {
  UpdateType,
  type CommonPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from '@powersync/common';

import { getAccessToken } from '../../../auth/token-storage';
import { postgrestBaseUrl, type PowerSyncClientConfig } from './config';

/** Injectable collaborators (overridable in tests). */
export interface SupabaseConnectorOptions {
  /** Fetch implementation (defaults to the global `fetch`). */
  readonly fetchFn?: typeof fetch;
  /** Access-token accessor (defaults to the auth token store). */
  readonly getToken?: () => Promise<string | null>;
}

/** Best-effort read of a response body for error diagnostics. */
async function safeReadText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}

/**
 * Connector that authenticates PowerSync with the Supabase JWT and writes local
 * changes back through PostgREST.
 */
export class SupabaseConnector implements PowerSyncBackendConnector {
  private readonly config: PowerSyncClientConfig;
  private readonly fetchFn: typeof fetch;
  private readonly getToken: () => Promise<string | null>;

  constructor(config: PowerSyncClientConfig, options: SupabaseConnectorOptions = {}) {
    this.config = config;
    // Wrap rather than reference `fetch` directly so construction never throws
    // in environments where the global is absent until call time.
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.getToken = options.getToken ?? getAccessToken;
  }

  /**
   * Return fresh credentials for the PowerSync sync service, or `null` when the
   * user is not authenticated (PowerSync then stays disconnected).
   */
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const token = await this.getToken();
    if (!token) {
      return null;
    }
    return { endpoint: this.config.powersyncUrl, token };
  }

  /**
   * Upload the next queued local transaction to Supabase. Throwing on failure
   * leaves the batch queued so PowerSync retries after its backoff period.
   */
  async uploadData(database: CommonPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) {
      return;
    }

    const token = await this.getToken();
    if (!token) {
      // Leave the batch queued; a reconnect with a valid token will retry it.
      throw new Error('PowerSync upload deferred: no access token available.');
    }

    for (const op of transaction.crud) {
      await this.applyOp(op, token);
    }

    await transaction.complete();
  }

  /** Apply a single CRUD op to Supabase PostgREST. */
  private async applyOp(op: CrudEntry, token: string): Promise<void> {
    const base = postgrestBaseUrl(this.config);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: this.config.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    };
    const rowFilter = `${base}/${op.table}?id=eq.${encodeURIComponent(op.id)}`;

    let response: Response;
    switch (op.op) {
      case UpdateType.PUT:
        response = await this.fetchFn(`${base}/${op.table}`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ id: op.id, ...(op.opData ?? {}) }),
        });
        break;
      case UpdateType.PATCH:
        response = await this.fetchFn(rowFilter, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(op.opData ?? {}),
        });
        break;
      case UpdateType.DELETE:
        response = await this.fetchFn(rowFilter, { method: 'DELETE', headers });
        break;
      default:
        return;
    }

    if (
      !response.ok &&
      response.status === 409 &&
      op.op === UpdateType.PUT &&
      op.table === 'household_members' &&
      (await this.hasMatchingActiveMembership(op, headers, base))
    ) {
      return;
    }

    if (!response.ok) {
      const detail = await safeReadText(response);
      throw new Error(
        `PowerSync upload failed (${op.op} ${op.table} ${op.id}): HTTP ${response.status} ${detail}`.trim(),
      );
    }
  }

  /**
   * A server-provisioned owner membership can have a different id from the
   * queued local row. Accept the unique-pair conflict only after PostgREST
   * confirms the exact active household/user pair is visible to this JWT.
   */
  private async hasMatchingActiveMembership(
    op: CrudEntry,
    headers: Record<string, string>,
    base: string,
  ): Promise<boolean> {
    const householdId = op.opData?.household_id;
    const userId = op.opData?.user_id;
    if (typeof householdId !== 'string' || typeof userId !== 'string') return false;

    const query =
      `${base}/household_members?household_id=eq.${encodeURIComponent(householdId)}` +
      `&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null` +
      '&select=id,household_id,user_id,role';
    const response = await this.fetchFn(query, { method: 'GET', headers });
    if (!response.ok) return false;

    try {
      const rows = (await response.json()) as unknown;
      return (
        Array.isArray(rows) &&
        rows.some(
          (row) =>
            row !== null &&
            typeof row === 'object' &&
            (row as Record<string, unknown>).household_id === householdId &&
            (row as Record<string, unknown>).user_id === userId &&
            ['owner', 'admin'].includes((row as Record<string, unknown>).role as string),
        )
      );
    } catch {
      return false;
    }
  }
}
