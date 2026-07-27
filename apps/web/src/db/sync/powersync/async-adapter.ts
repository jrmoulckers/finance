// SPDX-License-Identifier: BUSL-1.1

/**
 * PowerSync implementation of the {@link AsyncDb} abstraction.
 *
 * Thin pass-through over the real `PowerSyncDatabase`: the SDK's `DBAdapter`
 * surface (`getAll`, `getOptional`, `execute`, `onChangeWithCallback`, `close`)
 * maps one-to-one onto {@link AsyncDb}. Selected by the provider when
 * `VITE_POWERSYNC_ENABLED=true`.
 *
 * References: issues #3943, #3935
 */

import type { AbstractPowerSyncDatabase } from '@powersync/common';
import type { AsyncDb, Row } from '../../async-db';

/** Wrap a connected `PowerSyncDatabase` as an {@link AsyncDb}. */
export function createPowerSyncAsyncDb(db: AbstractPowerSyncDatabase): AsyncDb {
  return {
    backend: 'powersync',
    getAll<T = Row>(sql: string, params?: unknown[]): Promise<T[]> {
      return db.getAll<T>(sql, params as unknown[]);
    },
    getOptional<T = Row>(sql: string, params?: unknown[]): Promise<T | null> {
      return db.getOptional<T>(sql, params as unknown[]);
    },
    async execute(sql: string, params?: unknown[]): Promise<void> {
      await db.execute(sql, params as unknown[]);
    },
    onChange(tables: readonly string[], callback: () => void): () => void {
      return db.onChangeWithCallback(
        {
          onChange: () => {
            callback();
          },
        },
        { tables: tables.length > 0 ? [...tables] : undefined },
      );
    },
    close(): Promise<void> {
      return db.close();
    },
  };
}
