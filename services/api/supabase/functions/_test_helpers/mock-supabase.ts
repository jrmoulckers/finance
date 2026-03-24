// SPDX-License-Identifier: BUSL-1.1

/**
 * Mock Supabase client factory for Edge Function tests (#533).
 *
 * Provides a configurable mock that mimics the Supabase JS client
 * interface without requiring a live Supabase instance. Supports
 * RPC results, query results per table, and auth operations.
 *
 * Usage:
 * ```ts
 * const client = createMockSupabaseClient({
 *   rpcResults: {
 *     handle_new_user_signup: { data: { user_id: '...', household_id: '...' }, error: null },
 *   },
 *   queryResults: {
 *     users: { data: [{ id: '...', email: '...' }], error: null },
 *   },
 * });
 * ```
 */

/** Shape of a single Supabase query/RPC result. */
export interface MockResult {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

/** Configuration for the mock Supabase client. */
export interface MockSupabaseOptions {
  /** RPC function name → result mapping. */
  rpcResults?: Record<string, MockResult>;
  /** Table name → default query result mapping. */
  queryResults?: Record<string, MockResult>;
  /** Auth operations configuration. */
  auth?: {
    getUser?: {
      data: { user: { id: string; email: string } | null };
      error: { message: string } | null;
    };
    getUserById?: {
      data: { user: { id: string; email: string; created_at: string } | null };
      error: { message: string } | null;
    };
    deleteUser?: { data: unknown; error: { message: string } | null };
    generateLink?: {
      data: { properties: { hashed_token: string } } | null;
      error: { message: string } | null;
    };
    verifyOtp?: { data: { session: MockSession | null }; error: { message: string } | null };
  };
}

/** Minimal Supabase session shape. */
export interface MockSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  user: {
    id: string;
    email: string;
    created_at: string;
  };
}

/**
 * Build a chainable mock query builder that always resolves to the
 * configured result for a given table.
 */
function createMockQueryBuilder(result: MockResult) {
  const builder: Record<string, unknown> = {};

  // Every chaining method returns the same builder so calls like
  // `.select().eq().is().single()` all work without errors.
  const chainMethods = [
    'select',
    'insert',
    'update',
    'delete',
    'upsert',
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'is',
    'in',
    'like',
    'ilike',
    'order',
    'limit',
    'range',
    'single',
    'maybeSingle',
    'not',
    'or',
    'filter',
    'match',
    'contains',
    'containedBy',
    'overlaps',
    'textSearch',
  ];

  for (const method of chainMethods) {
    builder[method] = (..._args: unknown[]) => builder;
  }

  // Terminal: make the builder thenable so `await supabase.from(...).select(...)` works
  builder.then = (resolve: (value: MockResult) => void) => {
    resolve(result);
    return builder;
  };

  return builder;
}

/**
 * Create a mock Supabase client with configurable responses.
 *
 * The returned object satisfies the subset of the SupabaseClient
 * interface used by the Edge Functions: `.from()`, `.rpc()`, and `.auth`.
 */
export function createMockSupabaseClient(options: MockSupabaseOptions = {}) {
  const defaultResult: MockResult = { data: null, error: null };

  return {
    from: (table: string) => {
      const result = options.queryResults?.[table] ?? defaultResult;
      return createMockQueryBuilder(result);
    },

    rpc: (fn: string, _params?: unknown) => {
      const result = options.rpcResults?.[fn] ?? defaultResult;
      // Return a thenable that resolves to the result
      return {
        ...result,
        then: (resolve: (value: MockResult) => void) => {
          resolve(result);
        },
      };
    },

    auth: {
      getUser: (_token?: string) =>
        Promise.resolve(
          options.auth?.getUser ?? {
            data: { user: null },
            error: { message: 'Not authenticated' },
          },
        ),
      admin: {
        getUserById: (_id: string) =>
          Promise.resolve(
            options.auth?.getUserById ?? {
              data: { user: null },
              error: null,
            },
          ),
        deleteUser: (_id: string) =>
          Promise.resolve(options.auth?.deleteUser ?? { data: null, error: null }),
        generateLink: (_opts: unknown) =>
          Promise.resolve(
            options.auth?.generateLink ?? {
              data: null,
              error: null,
            },
          ),
      },
      verifyOtp: (_opts: unknown) =>
        Promise.resolve(
          options.auth?.verifyOtp ?? {
            data: { session: null },
            error: null,
          },
        ),
    },
  };
}

/** Type alias for the mock client returned by {@link createMockSupabaseClient}. */
export type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>;
