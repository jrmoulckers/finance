// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';
import { UpdateType, type CommonPowerSyncDatabase, type CrudEntry } from '@powersync/common';

import { SupabaseConnector } from '../connector';
import type { PowerSyncClientConfig } from '../config';

const CONFIG: PowerSyncClientConfig = {
  powersyncUrl: 'https://finance.jrmoulckers.com/sync',
  supabaseUrl: 'https://finance.jrmoulckers.com',
  supabaseAnonKey: 'anon-key',
  enabled: true,
};

/** Build an OK fetch mock returning a minimal `Response`. */
function okFetch() {
  return vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() =>
    Promise.resolve({ ok: true, status: 200, text: async () => '' } as unknown as Response),
  );
}

/** Wrap CRUD entries in a fake transaction with a spied `complete`. */
function fakeDatabase(crud: CrudEntry[]) {
  const complete = vi.fn(async () => {});
  const database = {
    getNextCrudTransaction: async () => (crud.length > 0 ? { crud, complete } : null),
  } as unknown as CommonPowerSyncDatabase;
  return { database, complete };
}

function entry(partial: Pick<CrudEntry, 'op' | 'id' | 'table'> & Partial<CrudEntry>): CrudEntry {
  return partial as CrudEntry;
}

describe('SupabaseConnector', () => {
  describe('fetchCredentials', () => {
    it('returns the sync endpoint and the current access token', async () => {
      const connector = new SupabaseConnector(CONFIG, { getToken: async () => 'jwt-token' });

      await expect(connector.fetchCredentials()).resolves.toEqual({
        endpoint: 'https://finance.jrmoulckers.com/sync',
        token: 'jwt-token',
      });
    });

    it('returns null when the user is not authenticated', async () => {
      const connector = new SupabaseConnector(CONFIG, { getToken: async () => null });

      await expect(connector.fetchCredentials()).resolves.toBeNull();
    });
  });

  describe('uploadData', () => {
    it('maps PUT/PATCH/DELETE ops to the correct PostgREST requests', async () => {
      const fetchFn = okFetch();
      const { database, complete } = fakeDatabase([
        entry({ op: UpdateType.PUT, id: '1', table: 'accounts', opData: { name: 'Checking' } }),
        entry({
          op: UpdateType.PATCH,
          id: '2',
          table: 'transactions',
          opData: { amount_cents: 500 },
        }),
        entry({ op: UpdateType.DELETE, id: '3', table: 'goals' }),
      ]);
      const connector = new SupabaseConnector(CONFIG, {
        fetchFn: fetchFn as unknown as typeof fetch,
        getToken: async () => 'jwt-token',
      });

      await connector.uploadData(database);

      expect(fetchFn).toHaveBeenCalledTimes(3);

      const [putUrl, putInit] = fetchFn.mock.calls[0];
      expect(putUrl).toBe('https://finance.jrmoulckers.com/rest/v1/accounts');
      expect(putInit?.method).toBe('POST');
      expect(putInit?.body).toBe(JSON.stringify({ id: '1', name: 'Checking' }));
      const putHeaders = putInit?.headers as Record<string, string>;
      expect(putHeaders.apikey).toBe('anon-key');
      expect(putHeaders.Authorization).toBe('Bearer jwt-token');
      expect(putHeaders.Prefer).toBe('resolution=merge-duplicates');

      const [patchUrl, patchInit] = fetchFn.mock.calls[1];
      expect(patchUrl).toBe('https://finance.jrmoulckers.com/rest/v1/transactions?id=eq.2');
      expect(patchInit?.method).toBe('PATCH');
      expect(patchInit?.body).toBe(JSON.stringify({ amount_cents: 500 }));

      const [deleteUrl, deleteInit] = fetchFn.mock.calls[2];
      expect(deleteUrl).toBe('https://finance.jrmoulckers.com/rest/v1/goals?id=eq.3');
      expect(deleteInit?.method).toBe('DELETE');

      expect(complete).toHaveBeenCalledTimes(1);
    });

    it('does nothing when there is no queued transaction', async () => {
      const fetchFn = okFetch();
      const { database } = fakeDatabase([]);
      const connector = new SupabaseConnector(CONFIG, {
        fetchFn: fetchFn as unknown as typeof fetch,
        getToken: async () => 'jwt-token',
      });

      await connector.uploadData(database);

      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('throws without completing when no access token is available', async () => {
      const fetchFn = okFetch();
      const { database, complete } = fakeDatabase([
        entry({ op: UpdateType.PUT, id: '1', table: 'accounts', opData: { name: 'Checking' } }),
      ]);
      const connector = new SupabaseConnector(CONFIG, {
        fetchFn: fetchFn as unknown as typeof fetch,
        getToken: async () => null,
      });

      await expect(connector.uploadData(database)).rejects.toThrow(/no access token/i);
      expect(fetchFn).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
    });

    it('throws (for retry) when PostgREST rejects the write', async () => {
      const fetchFn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
        () =>
          Promise.resolve({
            ok: false,
            status: 409,
            text: async () => 'conflict',
          } as unknown as Response),
      );
      const { database, complete } = fakeDatabase([
        entry({ op: UpdateType.PUT, id: '1', table: 'accounts', opData: { name: 'Checking' } }),
      ]);
      const connector = new SupabaseConnector(CONFIG, {
        fetchFn: fetchFn as unknown as typeof fetch,
        getToken: async () => 'jwt-token',
      });

      await expect(connector.uploadData(database)).rejects.toThrow(/HTTP 409/);
      expect(complete).not.toHaveBeenCalled();
    });
  });
});
