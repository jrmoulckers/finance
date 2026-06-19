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
  readonly errorFallback?: string;
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
          .replace(/["'`[\]]/g, '')
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
        .replace(/["'`[\]]/g, '')
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
    errorFallback = 'Failed to run live query.',
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

  // Keep the latest callbacks/values in refs so they do NOT destabilize
  // `runQuery`'s identity. Previously `runQuery` depended on `params`,
  // `initialData`, `select` and `queryFn` directly; callers commonly pass
  // fresh array/object/function literals every render (e.g. `useRealtimeTable`
  // passes `initialData: []` and a new params array), which recreated
  // `runQuery` on every render. The load effect (keyed on `runQuery`) then
  // re-ran every render and the hook never settled out of its loading state —
  // most visibly hanging detail pages opened from a list. We now read these
  // from refs and key re-runs on the param VALUES instead.
  const queryFnRef = useRef(queryFn);
  const selectRef = useRef(select);
  const initialDataRef = useRef(initialData);
  const paramsRef = useRef(params);
  useEffect(() => {
    queryFnRef.current = queryFn;
    selectRef.current = select;
    initialDataRef.current = initialData;
    paramsRef.current = params;
  });

  // Stable key derived from the param VALUES (not the array identity) so the
  // query re-runs when the bound values actually change, not on every render.
  const paramsKey = useMemo(() => {
    try {
      return JSON.stringify(params);
    } catch {
      return `len:${params.length}`;
    }
  }, [params]);

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
          if (queryFnRef.current) {
            return queryFnRef.current(db);
          }

          const rows = query<Row>(db, sql, [...paramsRef.current]).rows;
          return selectRef.current ? selectRef.current(rows, db) : (rows as TData);
        })();

        setData(nextData);
        setError(null);
      } catch (queryError) {
        setError(queryError instanceof Error ? queryError.message : errorFallback);
        if (initialDataRef.current !== undefined) {
          setData(initialDataRef.current);
        }
      } finally {
        setLoading(false);
      }
    },
    [db, enabled, errorFallback, sql],
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
    // Re-run when the query (sql/db/enabled via runQuery) or the bound param
    // values (paramsKey) change.
  }, [runQuery, paramsKey]);

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
