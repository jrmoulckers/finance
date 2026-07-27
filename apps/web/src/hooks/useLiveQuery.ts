// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import { query, type AsyncDb, type Row } from '../db/async-db';
import { onPowerSyncStatusChange } from '../db/sync/powersync-client';
import { extractTablesFromSql } from '../lib/sync/crossTab';

export interface UseLiveQueryOptions<TData> {
  readonly initialData?: TData;
  readonly select?: (rows: Row[], db: AsyncDb) => TData | Promise<TData>;
  readonly queryFn?: (db: AsyncDb) => TData | Promise<TData>;
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
  const runIdRef = useRef(0);

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

      // Latest-wins guard: with an async backend, several runs can be in flight
      // at once (rapid data-change notifications). Only the most recent run is
      // allowed to publish its result, preventing a stale query from clobbering
      // newer data.
      const runId = ++runIdRef.current;

      void (async () => {
        try {
          const nextData = await (async (): Promise<TData> => {
            if (queryFnRef.current) {
              return queryFnRef.current(db);
            }

            const { rows } = await query<Row>(db, sql, [...paramsRef.current]);
            return selectRef.current ? selectRef.current(rows, db) : (rows as TData);
          })();

          if (runId !== runIdRef.current) {
            return;
          }
          setData(nextData);
          setError(null);
        } catch (queryError) {
          if (runId !== runIdRef.current) {
            return;
          }
          setError(queryError instanceof Error ? queryError.message : errorFallback);
          if (initialDataRef.current !== undefined) {
            setData(initialDataRef.current);
          }
        } finally {
          if (runId === runIdRef.current) {
            setLoading(false);
          }
        }
      })();
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

    const unsubscribeDataChanges = db.onChange([...watchedTables], () => {
      scheduleQuery(false);
    });
    // Also refetch when the PowerSync connection status changes so freshly
    // synced remote data is reflected even if no table-change event fires.
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
  }, [db, enabled, scheduleQuery, watchedTables]);

  return { data, loading, error, refresh };
}
