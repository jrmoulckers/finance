// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import { query, type Row, type SqliteDb } from '../db/sqlite-wasm';
import { onPowerSyncStatusChange } from '../db/sync/powersync-client';
import { extractTablesFromSql, subscribeToDataChanges } from '../lib/sync/crossTab';

export interface UseLiveQueryOptions<TData> {
  readonly initialData?: TData;
  readonly select?: (rows: Row[], db: SqliteDb) => TData;
  readonly queryFn?: (db: SqliteDb) => TData;
  readonly tables?: readonly string[];
  readonly enabled?: boolean;
  readonly debounceMs?: number;
}

export interface UseLiveQueryResult<TData> {
  readonly data: TData;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
}

const DEFAULT_DEBOUNCE_MS = 16;

function normalizeTables(tables: readonly string[]): string[] {
  return Array.from(
    new Set(
      tables.map((table) =>
        table
          .replace(/["'`\[\]]/g, '')
          .trim()
          .toLowerCase(),
      ),
    ),
  ).filter((table) => table.length > 0);
}

function intersects(watchedTables: ReadonlySet<string>, changedTables: readonly string[]): boolean {
  if (watchedTables.size === 0 || changedTables.length === 0) {
    return true;
  }

  return changedTables.some((table) =>
    watchedTables.has(
      table
        .replace(/["'`\[\]]/g, '')
        .trim()
        .toLowerCase(),
    ),
  );
}

export function useLiveQuery<TData = Row[]>(
  sql: string,
  params: readonly unknown[] = [],
  options: UseLiveQueryOptions<TData> = {},
): UseLiveQueryResult<TData> {
  const db = useDatabase();
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    enabled = true,
    initialData,
    queryFn,
    select,
    tables,
  } = options;

  const watchedTables = useMemo(
    () => new Set(normalizeTables(tables ?? extractTablesFromSql(sql))),
    [sql, tables],
  );
  const [data, setData] = useState<TData>(initialData as TData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runQuery = useCallback(
    (showLoading: boolean) => {
      if (!enabled) {
        setLoading(false);
        return;
      }

      if (showLoading) {
        setLoading(true);
      }

      try {
        const nextData = (() => {
          if (queryFn) {
            return queryFn(db);
          }

          const rows = query<Row>(db, sql, [...params]).rows;
          return select ? select(rows, db) : (rows as TData);
        })();

        setData(nextData);
        setError(null);
      } catch (queryError) {
        setError(queryError instanceof Error ? queryError.message : 'Failed to run live query.');
        if (initialData !== undefined) {
          setData(initialData);
        }
      } finally {
        setLoading(false);
      }
    },
    [db, enabled, initialData, params, queryFn, select, sql],
  );

  const scheduleQuery = useCallback(
    (showLoading: boolean) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        runQuery(showLoading);
      }, debounceMs);
    },
    [debounceMs, runQuery],
  );

  const refresh = useCallback(() => {
    scheduleQuery(true);
  }, [scheduleQuery]);

  useEffect(() => {
    runQuery(true);
  }, [runQuery]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const unsubscribeDataChanges = subscribeToDataChanges((event) => {
      if (intersects(watchedTables, event.tables)) {
        scheduleQuery(false);
      }
    });
    const unsubscribePowerSync = onPowerSyncStatusChange(() => {
      scheduleQuery(false);
    });

    return () => {
      unsubscribeDataChanges();
      unsubscribePowerSync();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, scheduleQuery, watchedTables]);

  return { data, loading, error, refresh };
}
