// SPDX-License-Identifier: BUSL-1.1

import { useMemo } from 'react';
import type { Row } from '../db/sqlite-wasm';
import { useLiveQuery } from './useLiveQuery';

export interface UseRealtimeTableOptions {
  readonly columns?: readonly string[] | string;
  readonly where?: string;
  readonly params?: readonly unknown[];
  readonly orderBy?: string;
  readonly limit?: number;
  readonly includeDeleted?: boolean;
  readonly tables?: readonly string[];
  readonly enabled?: boolean;
  readonly debounceMs?: number;
}

export interface UseRealtimeTableResult<TRow extends Row> {
  readonly rows: TRow[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function useRealtimeTable<TRow extends Row = Row>(
  table: string,
  options: UseRealtimeTableOptions = {},
): UseRealtimeTableResult<TRow> {
  const {
    columns = '*',
    debounceMs,
    enabled,
    includeDeleted = false,
    limit,
    orderBy,
    params = [],
    tables = [],
    where,
  } = options;

  const sql = useMemo(() => {
    const selectedColumns = Array.isArray(columns) ? columns.join(', ') : columns;
    const clauses: string[] = [];

    if (!includeDeleted) {
      clauses.push('deleted_at IS NULL');
    }

    if (where?.trim()) {
      clauses.push(`(${where.trim()})`);
    }

    let statement = `SELECT ${selectedColumns} FROM ${quoteIdentifier(table)}`;
    if (clauses.length > 0) {
      statement += ` WHERE ${clauses.join(' AND ')}`;
    }
    if (orderBy?.trim()) {
      statement += ` ORDER BY ${orderBy.trim()}`;
    }
    if (typeof limit === 'number') {
      statement += ' LIMIT ?';
    }

    return statement;
  }, [columns, includeDeleted, limit, orderBy, table, where]);

  const queryParams = useMemo(
    () => (typeof limit === 'number' ? [...params, Math.max(1, Math.trunc(limit))] : [...params]),
    [limit, params],
  );

  const { data, error, loading, refresh } = useLiveQuery<TRow[]>(sql, queryParams, {
    initialData: [],
    tables: [table, ...tables],
    enabled,
    debounceMs,
  });

  return {
    rows: data,
    loading,
    error,
    refresh,
  };
}
