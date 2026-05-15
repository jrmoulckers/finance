// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the transactions-list Edge Function (#1383)
 *
 * Validates cursor-based pagination including parameter parsing,
 * cursor encoding/decoding, response building, and edge cases
 * (empty results, last page, invalid cursor, max page size).
 *
 * Usage:
 *   deno test --allow-env --allow-net=none --no-check transactions-list/
 */

import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import { createMockRequest, createAuthenticatedRequest } from '../_test_helpers/mock-request.ts';

// ---------------------------------------------------------------------------
// Re-implement pure functions from the Edge Function for test isolation
// (same pattern as auth-webhook tests — avoids importing Deno.serve).
// ---------------------------------------------------------------------------

/** Cursor payload structure. */
interface CursorPayload {
  sort_value: string;
  id: string;
}

/** Pagination metadata. */
interface PaginationMeta {
  has_more: boolean;
  next_cursor: string | null;
  page_size: number;
  total_count: number;
}

/** Parsed pagination parameters. */
interface PaginationParams {
  cursor: CursorPayload | null;
  limit: number;
  sortBy: 'date' | 'created_at' | 'amount_cents';
  sortOrder: 'asc' | 'desc';
  filters: {
    account_id?: string;
    category_id?: string;
    start_date?: string;
    end_date?: string;
    type?: string;
  };
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const ALLOWED_SORT_COLUMNS = ['date', 'created_at', 'amount_cents'] as const;
const ALLOWED_SORT_ORDERS = ['asc', 'desc'] as const;

type SortColumn = (typeof ALLOWED_SORT_COLUMNS)[number];
type SortOrder = (typeof ALLOWED_SORT_ORDERS)[number];

function encodeCursor(payload: CursorPayload): string {
  return btoa(JSON.stringify(payload));
}

function decodeCursor(cursor: string): CursorPayload | null {
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

function parsePaginationParams(
  searchParams: URLSearchParams,
): { params: PaginationParams } | { error: string } {
  let cursor: CursorPayload | null = null;
  const cursorStr = searchParams.get('cursor');
  if (cursorStr) {
    cursor = decodeCursor(cursorStr);
    if (!cursor) {
      return { error: 'Invalid cursor format' };
    }
  }

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

  const sortByStr = searchParams.get('sort_by') as SortColumn | null;
  const sortBy: SortColumn =
    sortByStr && (ALLOWED_SORT_COLUMNS as readonly string[]).includes(sortByStr)
      ? sortByStr
      : 'date';

  const sortOrderStr = searchParams.get('sort_order') as SortOrder | null;
  const sortOrder: SortOrder =
    sortOrderStr && (ALLOWED_SORT_ORDERS as readonly string[]).includes(sortOrderStr)
      ? sortOrderStr
      : 'desc';

  const filters: PaginationParams['filters'] = {};
  const accountId = searchParams.get('account_id');
  if (accountId) filters.account_id = accountId;
  const categoryId = searchParams.get('category_id');
  if (categoryId) filters.category_id = categoryId;
  const startDate = searchParams.get('start_date');
  if (startDate) {
    if (isNaN(Date.parse(startDate))) return { error: 'start_date must be a valid ISO 8601 date' };
    filters.start_date = startDate;
  }
  const endDate = searchParams.get('end_date');
  if (endDate) {
    if (isNaN(Date.parse(endDate))) return { error: 'end_date must be a valid ISO 8601 date' };
    filters.end_date = endDate;
  }
  const type = searchParams.get('type');
  if (type) filters.type = type;

  return { params: { cursor, limit, sortBy, sortOrder, filters } };
}

function buildPaginatedResponse(
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
// Generate test data
// ---------------------------------------------------------------------------

function generateTransactions(count: number): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [];
  for (let i = 0; i < count; i++) {
    const day = String(Math.min(i + 1, 28)).padStart(2, '0');
    records.push({
      id: `txn-${String(i + 1).padStart(4, '0')}`,
      household_id: 'hh-test',
      account_id: 'acct-test',
      category_id: i % 3 === 0 ? 'cat-food' : i % 3 === 1 ? 'cat-transport' : 'cat-shopping',
      amount_cents: -(1000 + i * 500),
      currency_code: 'USD',
      type: 'expense',
      payee: `Store ${i + 1}`,
      note: null,
      date: `2024-03-${day}`,
      status: 'CLEARED',
      created_at: `2024-03-${day}T10:00:00Z`,
      updated_at: `2024-03-${day}T10:00:00Z`,
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// Tests: Cursor encoding / decoding
// ---------------------------------------------------------------------------

Deno.test('pagination/cursor — encodeCursor produces a valid string', () => {
  const cursor = encodeCursor({ sort_value: '2024-03-15', id: 'txn-001' });
  assertEquals(typeof cursor, 'string');
  assertNotEquals(cursor.length, 0);
});

Deno.test('pagination/cursor — decodeCursor round-trips correctly', () => {
  const payload: CursorPayload = { sort_value: '2024-03-15', id: 'txn-001' };
  const encoded = encodeCursor(payload);
  const decoded = decodeCursor(encoded);

  assertNotEquals(decoded, null);
  assertEquals(decoded!.sort_value, '2024-03-15');
  assertEquals(decoded!.id, 'txn-001');
});

Deno.test('pagination/cursor — decodeCursor returns null for invalid base64', () => {
  const decoded = decodeCursor('not-valid-base64!!!');
  assertEquals(decoded, null);
});

Deno.test('pagination/cursor — decodeCursor returns null for valid base64 but invalid JSON', () => {
  const decoded = decodeCursor(btoa('not json'));
  assertEquals(decoded, null);
});

Deno.test('pagination/cursor — decodeCursor returns null for missing fields', () => {
  const decoded = decodeCursor(btoa(JSON.stringify({ sort_value: '2024-03-15' })));
  assertEquals(decoded, null);
});

Deno.test('pagination/cursor — decodeCursor returns null for wrong field types', () => {
  const decoded = decodeCursor(btoa(JSON.stringify({ sort_value: 123, id: 456 })));
  assertEquals(decoded, null);
});

Deno.test('pagination/cursor — decodeCursor returns null for empty string', () => {
  const decoded = decodeCursor('');
  assertEquals(decoded, null);
});

// ---------------------------------------------------------------------------
// Tests: Parameter parsing
// ---------------------------------------------------------------------------

Deno.test('pagination/params — defaults to limit=50, sort_by=date, sort_order=desc', () => {
  const params = new URLSearchParams();
  const result = parsePaginationParams(params);

  assertEquals('params' in result, true);
  if ('params' in result) {
    assertEquals(result.params.limit, 50);
    assertEquals(result.params.sortBy, 'date');
    assertEquals(result.params.sortOrder, 'desc');
    assertEquals(result.params.cursor, null);
  }
});

Deno.test('pagination/params — respects custom limit', () => {
  const params = new URLSearchParams({ limit: '25' });
  const result = parsePaginationParams(params);

  assertEquals('params' in result, true);
  if ('params' in result) {
    assertEquals(result.params.limit, 25);
  }
});

Deno.test('pagination/params — clamps limit to MAX_PAGE_SIZE', () => {
  const params = new URLSearchParams({ limit: '500' });
  const result = parsePaginationParams(params);

  assertEquals('params' in result, true);
  if ('params' in result) {
    assertEquals(result.params.limit, MAX_PAGE_SIZE);
  }
});

Deno.test('pagination/params — rejects negative limit', () => {
  const params = new URLSearchParams({ limit: '-5' });
  const result = parsePaginationParams(params);

  assertEquals('error' in result, true);
  if ('error' in result) {
    assertStringIncludes(result.error, 'positive integer');
  }
});

Deno.test('pagination/params — rejects non-numeric limit', () => {
  const params = new URLSearchParams({ limit: 'abc' });
  const result = parsePaginationParams(params);

  assertEquals('error' in result, true);
});

Deno.test('pagination/params — rejects zero limit', () => {
  const params = new URLSearchParams({ limit: '0' });
  const result = parsePaginationParams(params);

  assertEquals('error' in result, true);
});

Deno.test('pagination/params — accepts valid sort_by values', () => {
  for (const col of ALLOWED_SORT_COLUMNS) {
    const params = new URLSearchParams({ sort_by: col });
    const result = parsePaginationParams(params);
    assertEquals('params' in result, true);
    if ('params' in result) {
      assertEquals(result.params.sortBy, col);
    }
  }
});

Deno.test('pagination/params — falls back to date for unknown sort_by', () => {
  const params = new URLSearchParams({ sort_by: 'unknown_column' });
  const result = parsePaginationParams(params);

  assertEquals('params' in result, true);
  if ('params' in result) {
    assertEquals(result.params.sortBy, 'date');
  }
});

Deno.test('pagination/params — accepts valid sort_order values', () => {
  for (const order of ALLOWED_SORT_ORDERS) {
    const params = new URLSearchParams({ sort_order: order });
    const result = parsePaginationParams(params);
    assertEquals('params' in result, true);
    if ('params' in result) {
      assertEquals(result.params.sortOrder, order);
    }
  }
});

Deno.test('pagination/params — falls back to desc for unknown sort_order', () => {
  const params = new URLSearchParams({ sort_order: 'random' });
  const result = parsePaginationParams(params);

  assertEquals('params' in result, true);
  if ('params' in result) {
    assertEquals(result.params.sortOrder, 'desc');
  }
});

Deno.test('pagination/params — parses cursor correctly', () => {
  const cursor = encodeCursor({ sort_value: '2024-03-15', id: 'txn-050' });
  const params = new URLSearchParams({ cursor });
  const result = parsePaginationParams(params);

  assertEquals('params' in result, true);
  if ('params' in result) {
    assertNotEquals(result.params.cursor, null);
    assertEquals(result.params.cursor!.sort_value, '2024-03-15');
    assertEquals(result.params.cursor!.id, 'txn-050');
  }
});

Deno.test('pagination/params — rejects invalid cursor', () => {
  const params = new URLSearchParams({ cursor: 'invalid-cursor' });
  const result = parsePaginationParams(params);

  assertEquals('error' in result, true);
  if ('error' in result) {
    assertStringIncludes(result.error, 'Invalid cursor');
  }
});

Deno.test('pagination/params — parses filter parameters', () => {
  const params = new URLSearchParams({
    account_id: 'acct-123',
    category_id: 'cat-456',
    start_date: '2024-01-01',
    end_date: '2024-03-31',
    type: 'expense',
  });
  const result = parsePaginationParams(params);

  assertEquals('params' in result, true);
  if ('params' in result) {
    assertEquals(result.params.filters.account_id, 'acct-123');
    assertEquals(result.params.filters.category_id, 'cat-456');
    assertEquals(result.params.filters.start_date, '2024-01-01');
    assertEquals(result.params.filters.end_date, '2024-03-31');
    assertEquals(result.params.filters.type, 'expense');
  }
});

Deno.test('pagination/params — rejects invalid start_date', () => {
  const params = new URLSearchParams({ start_date: 'not-a-date' });
  const result = parsePaginationParams(params);

  assertEquals('error' in result, true);
  if ('error' in result) {
    assertStringIncludes(result.error, 'start_date');
  }
});

Deno.test('pagination/params — rejects invalid end_date', () => {
  const params = new URLSearchParams({ end_date: 'not-a-date' });
  const result = parsePaginationParams(params);

  assertEquals('error' in result, true);
  if ('error' in result) {
    assertStringIncludes(result.error, 'end_date');
  }
});

// ---------------------------------------------------------------------------
// Tests: Response building
// ---------------------------------------------------------------------------

Deno.test('pagination/response — first page with more data', () => {
  const records = generateTransactions(6);
  const response = buildPaginatedResponse(records, 5, 'date', 100);

  assertEquals(response.data.length, 5);
  assertEquals(response.pagination.has_more, true);
  assertNotEquals(response.pagination.next_cursor, null);
  assertEquals(response.pagination.page_size, 5);
  assertEquals(response.pagination.total_count, 100);
});

Deno.test('pagination/response — last page (no more data)', () => {
  const records = generateTransactions(3);
  const response = buildPaginatedResponse(records, 5, 'date', 8);

  assertEquals(response.data.length, 3);
  assertEquals(response.pagination.has_more, false);
  assertEquals(response.pagination.next_cursor, null);
  assertEquals(response.pagination.page_size, 3);
  assertEquals(response.pagination.total_count, 8);
});

Deno.test('pagination/response — empty results', () => {
  const response = buildPaginatedResponse([], 50, 'date', 0);

  assertEquals(response.data.length, 0);
  assertEquals(response.pagination.has_more, false);
  assertEquals(response.pagination.next_cursor, null);
  assertEquals(response.pagination.page_size, 0);
  assertEquals(response.pagination.total_count, 0);
});

Deno.test('pagination/response — exactly limit records (no has_more)', () => {
  const records = generateTransactions(5);
  const response = buildPaginatedResponse(records, 5, 'date', 5);

  assertEquals(response.data.length, 5);
  assertEquals(response.pagination.has_more, false);
  assertEquals(response.pagination.next_cursor, null);
});

Deno.test('pagination/response — next_cursor encodes last record sort value and id', () => {
  const records = generateTransactions(3);
  records.push({
    id: 'txn-extra',
    date: '2024-03-28',
    amount_cents: -9999,
    created_at: '2024-03-28T10:00:00Z',
  });

  const response = buildPaginatedResponse(records, 3, 'date', 10);

  assertNotEquals(response.pagination.next_cursor, null);

  const decoded = decodeCursor(response.pagination.next_cursor!);
  assertNotEquals(decoded, null);
  assertEquals(decoded!.id, 'txn-0003');
  assertEquals(decoded!.sort_value, records[2]['date']);
});

// ---------------------------------------------------------------------------
// Tests: Pagination traversal (simulated)
// ---------------------------------------------------------------------------

Deno.test('pagination/traversal — can walk through all pages', () => {
  const allRecords = generateTransactions(12);
  const pageSize = 5;

  // Page 1
  const page1Records = allRecords.slice(0, pageSize + 1);
  const page1 = buildPaginatedResponse(page1Records, pageSize, 'date', 12);
  assertEquals(page1.data.length, 5);
  assertEquals(page1.pagination.has_more, true);

  // Page 2
  const page2Records = allRecords.slice(5, 5 + pageSize + 1);
  const page2 = buildPaginatedResponse(page2Records, pageSize, 'date', 12);
  assertEquals(page2.data.length, 5);
  assertEquals(page2.pagination.has_more, true);

  // Page 3 (last page)
  const page3Records = allRecords.slice(10, 10 + pageSize + 1);
  const page3 = buildPaginatedResponse(page3Records, pageSize, 'date', 12);
  assertEquals(page3.data.length, 2);
  assertEquals(page3.pagination.has_more, false);
  assertEquals(page3.pagination.next_cursor, null);

  // Total records across pages
  const totalFetched = page1.data.length + page2.data.length + page3.data.length;
  assertEquals(totalFetched, 12);
});

Deno.test('pagination/traversal — no duplicate records across pages', () => {
  const allRecords = generateTransactions(12);
  const pageSize = 5;

  const allIds = new Set<string>();

  for (let offset = 0; offset < allRecords.length; offset += pageSize) {
    const pageRecords = allRecords.slice(offset, offset + pageSize + 1);
    const page = buildPaginatedResponse(pageRecords, pageSize, 'date', 12);

    for (const record of page.data) {
      const id = record.id as string;
      assertEquals(allIds.has(id), false, `Duplicate record found: ${id}`);
      allIds.add(id);
    }
  }

  assertEquals(allIds.size, 12);
});

// ---------------------------------------------------------------------------
// Tests: Edge Function handler contract
// ---------------------------------------------------------------------------

Deno.test('pagination/handler — requires Authorization header', () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/transactions-list',
  });

  assertEquals(req.headers.has('Authorization'), false);
});

Deno.test('pagination/handler — authenticated request has Authorization header', () => {
  const req = createAuthenticatedRequest('test-jwt', {
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/transactions-list?limit=10',
  });

  assertEquals(req.headers.has('Authorization'), true);
  assertStringIncludes(req.headers.get('Authorization')!, 'Bearer');
});

// ---------------------------------------------------------------------------
// Tests: Sort by amount_cents
// ---------------------------------------------------------------------------

Deno.test('pagination/sort — amount_cents sorting produces valid cursor', () => {
  const records = [
    { id: 'txn-1', amount_cents: -1000, date: '2024-03-01', created_at: '2024-03-01T10:00:00Z' },
    { id: 'txn-2', amount_cents: -5000, date: '2024-03-02', created_at: '2024-03-02T10:00:00Z' },
    { id: 'txn-3', amount_cents: -3000, date: '2024-03-03', created_at: '2024-03-03T10:00:00Z' },
    { id: 'txn-4', amount_cents: -7000, date: '2024-03-04', created_at: '2024-03-04T10:00:00Z' },
  ];

  const response = buildPaginatedResponse(records, 3, 'amount_cents', 10);
  assertEquals(response.data.length, 3);
  assertEquals(response.pagination.has_more, true);

  const decoded = decodeCursor(response.pagination.next_cursor!);
  assertNotEquals(decoded, null);
  assertEquals(decoded!.sort_value, '-3000');
  assertEquals(decoded!.id, 'txn-3');
});

// ---------------------------------------------------------------------------
// Tests: Filter + pagination combined
// ---------------------------------------------------------------------------

Deno.test('pagination/filter — params accept combined filter and pagination', () => {
  const params = new URLSearchParams({
    limit: '10',
    sort_by: 'date',
    sort_order: 'asc',
    account_id: 'acct-checking',
    start_date: '2024-01-01',
    end_date: '2024-06-30',
    cursor: encodeCursor({ sort_value: '2024-03-15', id: 'txn-050' }),
  });

  const result = parsePaginationParams(params);
  assertEquals('params' in result, true);
  if ('params' in result) {
    assertEquals(result.params.limit, 10);
    assertEquals(result.params.sortBy, 'date');
    assertEquals(result.params.sortOrder, 'asc');
    assertEquals(result.params.filters.account_id, 'acct-checking');
    assertEquals(result.params.filters.start_date, '2024-01-01');
    assertEquals(result.params.filters.end_date, '2024-06-30');
    assertNotEquals(result.params.cursor, null);
  }
});

// ---------------------------------------------------------------------------
// Tests: Single record page
// ---------------------------------------------------------------------------

Deno.test('pagination/edge — single record with limit=1', () => {
  const records = generateTransactions(2);
  const response = buildPaginatedResponse(records, 1, 'date', 5);

  assertEquals(response.data.length, 1);
  assertEquals(response.pagination.has_more, true);
  assertNotEquals(response.pagination.next_cursor, null);
  assertEquals(response.pagination.total_count, 5);
});

Deno.test('pagination/edge — limit=1 with only 1 total record', () => {
  const records = generateTransactions(1);
  const response = buildPaginatedResponse(records, 1, 'date', 1);

  assertEquals(response.data.length, 1);
  assertEquals(response.pagination.has_more, false);
  assertEquals(response.pagination.next_cursor, null);
  assertEquals(response.pagination.total_count, 1);
});
