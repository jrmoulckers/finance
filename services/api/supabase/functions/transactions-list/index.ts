// SPDX-License-Identifier: BUSL-1.1

/**
 * Transactions List Edge Function with Cursor-Based Pagination (#1383)
 *
 * Provides efficient, cursor-based pagination for transaction queries.
 * Uses keyset pagination (not OFFSET) for consistent performance on
 * large datasets.
 *
 * Query Parameters:
 *   cursor     — Opaque cursor for the next page (base64-encoded)
 *   limit      — Page size (default: 50, max: 200)
 *   sort_by    — Column to sort by: 'date' | 'created_at' | 'amount_cents' (default: 'date')
 *   sort_order — Sort direction: 'asc' | 'desc' (default: 'desc')
 *   account_id — Filter by account (optional)
 *   category_id — Filter by category (optional)
 *   start_date — Filter transactions on or after this date (optional, ISO 8601)
 *   end_date   — Filter transactions on or before this date (optional, ISO 8601)
 *   type       — Filter by transaction type (optional)
 *
 * Response:
 *   {
 *     data: Transaction[],
 *     pagination: {
 *       has_more: boolean,
 *       next_cursor: string | null,
 *       page_size: number,
 *       total_count: number
 *     }
 *   }
 *
 * Environment Variables:
 *   SUPABASE_URL               — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — Service role key
 *   SUPABASE_ANON_KEY          — Anon key (for user-scoped queries via RLS)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { validateEnv } from '../_shared/env.ts';
import { checkRateLimit, getClientIp } from '../_shared/rate-limit.ts';
import { createAdminClient } from '../_shared/auth.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default number of records per page. */
const DEFAULT_PAGE_SIZE = 50;

/** Maximum allowed page size to prevent abuse. */
const MAX_PAGE_SIZE = 200;

/** Columns allowed for sorting. */
const ALLOWED_SORT_COLUMNS = ['date', 'created_at', 'amount_cents'] as const;
type SortColumn = (typeof ALLOWED_SORT_COLUMNS)[number];

/** Allowed sort directions. */
const ALLOWED_SORT_ORDERS = ['asc', 'desc'] as const;
type SortOrder = (typeof ALLOWED_SORT_ORDERS)[number];

// ---------------------------------------------------------------------------
// Cursor encoding / decoding
// ---------------------------------------------------------------------------

/** Cursor payload structure. */
export interface CursorPayload {
  /** Value of the sort column for the last record. */
  sort_value: string;
  /** ID of the last record (tiebreaker). */
  id: string;
}

/**
 * Encode a cursor payload to a URL-safe base64 string.
 *
 * @param payload The cursor data to encode.
 * @returns An opaque cursor string.
 */
export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return btoa(json);
}

/**
 * Decode a cursor string back to a payload.
 *
 * @param cursor The opaque cursor string.
 * @returns Decoded cursor payload or null if invalid.
 */
export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = atob(cursor);
    const payload = JSON.parse(json);
    if (typeof payload.sort_value !== 'string' || typeof payload.id !== 'string') {
      return null;
    }
    return payload as CursorPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pagination parameter parsing
// ---------------------------------------------------------------------------

/** Parsed and validated pagination parameters. */
export interface PaginationParams {
  cursor: CursorPayload | null;
  limit: number;
  sortBy: SortColumn;
  sortOrder: SortOrder;
  filters: {
    account_id?: string;
    category_id?: string;
    start_date?: string;
    end_date?: string;
    type?: string;
  };
}

/**
 * Parse and validate pagination parameters from URL search params.
 *
 * @param searchParams URL search parameters.
 * @returns Validated pagination params or an error message.
 */
export function parsePaginationParams(
  searchParams: URLSearchParams,
): { params: PaginationParams } | { error: string } {
  // Parse cursor
  let cursor: CursorPayload | null = null;
  const cursorStr = searchParams.get('cursor');
  if (cursorStr) {
    cursor = decodeCursor(cursorStr);
    if (!cursor) {
      return { error: 'Invalid cursor format' };
    }
  }

  // Parse limit
  const limitStr = searchParams.get('limit');
  let limit = DEFAULT_PAGE_SIZE;
  if (limitStr) {
    limit = parseInt(limitStr, 10);
    if (isNaN(limit) || limit < 1) {
      return { error: 'Limit must be a positive integer' };
    }
    if (limit > MAX_PAGE_SIZE) {
      limit = MAX_PAGE_SIZE;
    }
  }

  // Parse sort_by
  const sortByStr = searchParams.get('sort_by') as SortColumn | null;
  const sortBy: SortColumn =
    sortByStr && ALLOWED_SORT_COLUMNS.includes(sortByStr) ? sortByStr : 'date';

  // Parse sort_order
  const sortOrderStr = searchParams.get('sort_order') as SortOrder | null;
  const sortOrder: SortOrder =
    sortOrderStr && ALLOWED_SORT_ORDERS.includes(sortOrderStr) ? sortOrderStr : 'desc';

  // Parse filters
  const filters: PaginationParams['filters'] = {};
  const accountId = searchParams.get('account_id');
  if (accountId) filters.account_id = accountId;

  const categoryId = searchParams.get('category_id');
  if (categoryId) filters.category_id = categoryId;

  const startDate = searchParams.get('start_date');
  if (startDate) {
    if (isNaN(Date.parse(startDate))) {
      return { error: 'start_date must be a valid ISO 8601 date' };
    }
    filters.start_date = startDate;
  }

  const endDate = searchParams.get('end_date');
  if (endDate) {
    if (isNaN(Date.parse(endDate))) {
      return { error: 'end_date must be a valid ISO 8601 date' };
    }
    filters.end_date = endDate;
  }

  const type = searchParams.get('type');
  if (type) filters.type = type;

  return {
    params: { cursor, limit, sortBy, sortOrder, filters },
  };
}

// ---------------------------------------------------------------------------
// Pagination response builder
// ---------------------------------------------------------------------------

/** Pagination metadata included in every response. */
export interface PaginationMeta {
  has_more: boolean;
  next_cursor: string | null;
  page_size: number;
  total_count: number;
}

/**
 * Build the pagination response from query results.
 *
 * @param records The fetched records (limit + 1 to detect has_more).
 * @param limit The requested page size.
 * @param sortBy The sort column used.
 * @param totalCount Total matching records (from a separate count query).
 * @returns Paginated data with metadata.
 */
export function buildPaginatedResponse(
  records: Array<Record<string, unknown>>,
  limit: number,
  sortBy: SortColumn,
  totalCount: number,
): { data: Array<Record<string, unknown>>; pagination: PaginationMeta } {
  const hasMore = records.length > limit;
  const pageRecords = hasMore ? records.slice(0, limit) : records;

  let nextCursor: string | null = null;
  if (hasMore && pageRecords.length > 0) {
    const lastRecord = pageRecords[pageRecords.length - 1];
    nextCursor = encodeCursor({
      sort_value: String(lastRecord[sortBy] ?? ''),
      id: String(lastRecord['id'] ?? ''),
    });
  }

  return {
    data: pageRecords,
    pagination: {
      has_more: hasMore,
      next_cursor: nextCursor,
      page_size: pageRecords.length,
      total_count: totalCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Edge Function handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  const logger = createLogger('transactions-list');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  // Only accept GET
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // Validate environment
  const envError = validateEnv('transactions-list', req);
  if (envError) return envError;

  // Rate limiting
  try {
    const rateLimitClient = createAdminClient();
    const clientIp = getClientIp(req) ?? 'unknown';
    const rateLimitResult = await checkRateLimit(rateLimitClient, clientIp, {
      maxRequests: 60,
      windowSeconds: 60,
      action: 'transactions-list',
    });
    if (!rateLimitResult.allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimitResult.retryAfterSeconds ?? 0),
        },
      });
    }
  } catch {
    // Rate limiting failure must not block request
  }

  // Authenticate user
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    // Parse pagination parameters
    const url = new URL(req.url);
    const parseResult = parsePaginationParams(url.searchParams);
    if ('error' in parseResult) {
      return new Response(JSON.stringify({ error: parseResult.error }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { params } = parseResult;

    // Create user-scoped Supabase client (RLS enforced via JWT)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Build query — fetch limit + 1 to detect has_more
    let query = supabase
      .from('transactions')
      .select(
        'id, household_id, account_id, category_id, amount_cents, currency_code, type, payee, note, date, status, created_at, updated_at',
      )
      .is('deleted_at', null)
      .order(params.sortBy, { ascending: params.sortOrder === 'asc' })
      .order('id', { ascending: params.sortOrder === 'asc' }) // tiebreaker
      .limit(params.limit + 1);

    // Apply cursor (keyset pagination)
    if (params.cursor) {
      if (params.sortOrder === 'desc') {
        query = query.or(
          `${params.sortBy}.lt.${params.cursor.sort_value},and(${params.sortBy}.eq.${params.cursor.sort_value},id.lt.${params.cursor.id})`,
        );
      } else {
        query = query.or(
          `${params.sortBy}.gt.${params.cursor.sort_value},and(${params.sortBy}.eq.${params.cursor.sort_value},id.gt.${params.cursor.id})`,
        );
      }
    }

    // Apply filters
    if (params.filters.account_id) {
      query = query.eq('account_id', params.filters.account_id);
    }
    if (params.filters.category_id) {
      query = query.eq('category_id', params.filters.category_id);
    }
    if (params.filters.start_date) {
      query = query.gte('date', params.filters.start_date);
    }
    if (params.filters.end_date) {
      query = query.lte('date', params.filters.end_date);
    }
    if (params.filters.type) {
      query = query.eq('type', params.filters.type);
    }

    // Execute data query
    const { data, error } = await query;

    if (error) {
      logger.error('Query failed', { errorMessage: error.message });
      return new Response(JSON.stringify({ error: 'Failed to fetch transactions' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Count query (separate, for total_count)
    let countQuery = supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);

    if (params.filters.account_id) {
      countQuery = countQuery.eq('account_id', params.filters.account_id);
    }
    if (params.filters.category_id) {
      countQuery = countQuery.eq('category_id', params.filters.category_id);
    }
    if (params.filters.start_date) {
      countQuery = countQuery.gte('date', params.filters.start_date);
    }
    if (params.filters.end_date) {
      countQuery = countQuery.lte('date', params.filters.end_date);
    }
    if (params.filters.type) {
      countQuery = countQuery.eq('type', params.filters.type);
    }

    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      logger.warn('Count query failed, returning 0', { errorMessage: countError.message });
    }

    const records = (data ?? []) as Array<Record<string, unknown>>;
    const response = buildPaginatedResponse(records, params.limit, params.sortBy, totalCount ?? 0);

    logger.info('Transactions listed', { pageSize: response.pagination.page_size });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error('Unexpected error', { errorMessage: (err as Error).message });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
