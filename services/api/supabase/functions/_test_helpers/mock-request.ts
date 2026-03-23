// SPDX-License-Identifier: BUSL-1.1

/**
 * Mock Request builder for Edge Function tests (#533).
 *
 * Simplifies the creation of `Request` objects with common headers,
 * methods, body content, and URL patterns.
 *
 * Usage:
 * ```ts
 * const req = createMockRequest({ method: 'POST', body: { confirm: true } });
 * const req = createMockRequest({
 *   method: 'GET',
 *   url: 'https://example.com/fn?format=csv',
 *   headers: { Authorization: 'Bearer test-jwt' },
 * });
 * ```
 */

/** Options for building a mock Request. */
export interface MockRequestOptions {
  /** HTTP method. Defaults to 'GET'. */
  method?: string;
  /** Full URL string. Defaults to 'https://test.supabase.co/functions/v1/test'. */
  url?: string;
  /** Additional headers to include. */
  headers?: Record<string, string>;
  /** Body payload — will be JSON-serialized if it's an object. */
  body?: unknown;
}

/** Default base URL used for mock requests. */
const DEFAULT_URL = 'https://test.supabase.co/functions/v1/test';

/**
 * Create a mock `Request` object suitable for passing to Edge Function handlers.
 *
 * @param options Configuration for the request.
 * @returns A standard `Request` instance.
 */
export function createMockRequest(options: MockRequestOptions = {}): Request {
  const method = options.method ?? 'GET';
  const url = options.url ?? DEFAULT_URL;
  const headers = new Headers(options.headers ?? {});

  // Default Content-Type for requests with a body
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const init: RequestInit = {
    method,
    headers,
  };

  // Attach body for methods that support it
  if (options.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  return new Request(url, init);
}

/**
 * Create a mock Request with a valid-looking JWT Authorization header.
 *
 * @param token The bearer token string. Defaults to 'test-jwt-token'.
 * @param options Additional request options.
 * @returns A Request with the Authorization header set.
 */
export function createAuthenticatedRequest(
  token: string = 'test-jwt-token',
  options: MockRequestOptions = {},
): Request {
  return createMockRequest({
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}

/**
 * Create a mock CORS preflight (OPTIONS) request.
 *
 * @param origin The Origin header value. Defaults to 'https://app.finance.example.com'.
 * @param url The request URL.
 * @returns A Request configured as a CORS preflight.
 */
export function createCorsPreflightRequest(
  origin: string = 'https://app.finance.example.com',
  url: string = DEFAULT_URL,
): Request {
  return createMockRequest({
    method: 'OPTIONS',
    url,
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  });
}

/**
 * Create a mock webhook request with the webhook secret Authorization header.
 *
 * @param secret The webhook secret to use in the Bearer token.
 * @param body The webhook payload body.
 * @returns A POST Request mimicking a Supabase Auth webhook.
 */
export function createWebhookRequest(secret: string, body: unknown): Request {
  return createMockRequest({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body,
  });
}
