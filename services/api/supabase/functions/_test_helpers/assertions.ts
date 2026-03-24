// SPDX-License-Identifier: BUSL-1.1

/**
 * Custom assertion helpers for Edge Function tests (#533).
 *
 * Provides domain-specific assertions for HTTP responses, JSON bodies,
 * CORS headers, and security properties.
 */

import {
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';

/**
 * Assert that a Response has the expected HTTP status code.
 */
export function assertStatus(response: Response, expectedStatus: number): void {
  assertEquals(
    response.status,
    expectedStatus,
    `Expected HTTP status ${expectedStatus}, got ${response.status}`,
  );
}

/**
 * Assert that a Response has a JSON content-type header.
 */
export function assertJsonContentType(response: Response): void {
  const contentType = response.headers.get('Content-Type');
  assertStringIncludes(
    contentType ?? '',
    'application/json',
    `Expected Content-Type to include 'application/json', got '${contentType}'`,
  );
}

/**
 * Assert that a Response body is valid JSON and return the parsed object.
 */
export async function assertJsonBody(response: Response): Promise<Record<string, unknown>> {
  assertJsonContentType(response);
  const body = await response.json();
  assertEquals(typeof body, 'object', 'Response body should be a JSON object');
  return body as Record<string, unknown>;
}

/**
 * Assert that a Response is a JSON error with the expected status and message.
 */
export async function assertErrorResponse(
  response: Response,
  expectedStatus: number,
  expectedMessage?: string,
): Promise<Record<string, unknown>> {
  assertStatus(response, expectedStatus);
  const body = await assertJsonBody(response);

  if (typeof body.error === 'string') {
    if (expectedMessage) {
      assertStringIncludes(
        body.error as string,
        expectedMessage,
        `Error message should contain '${expectedMessage}'`,
      );
    }
  } else if (typeof body.error === 'object' && body.error !== null) {
    // Structured error format { error: { code, message } }
    const errorObj = body.error as Record<string, unknown>;
    if (expectedMessage && errorObj.message) {
      assertStringIncludes(
        errorObj.message as string,
        expectedMessage,
        `Error message should contain '${expectedMessage}'`,
      );
    }
  }

  return body;
}

/**
 * Assert that a Response includes CORS headers.
 */
export function assertCorsHeaders(response: Response): void {
  const allowOrigin = response.headers.get('Access-Control-Allow-Origin');
  assertEquals(
    allowOrigin !== null,
    true,
    'Response should include Access-Control-Allow-Origin header',
  );
}

/**
 * Assert that a Response includes CORS headers with a specific allowed origin.
 */
export function assertCorsOrigin(response: Response, expectedOrigin: string): void {
  assertEquals(
    response.headers.get('Access-Control-Allow-Origin'),
    expectedOrigin,
    `Expected Access-Control-Allow-Origin to be '${expectedOrigin}'`,
  );
}

/**
 * Assert that a Response does NOT include sensitive data patterns.
 *
 * Checks that the response body does not contain strings that look
 * like service role keys, database connection strings, or internal
 * error stack traces.
 */
export async function assertNoSensitiveDataLeakage(response: Response): Promise<void> {
  const clone = response.clone();
  const text = await clone.text();

  const sensitivePatterns = [
    /SUPABASE_SERVICE_ROLE_KEY/i,
    /service_role/i,
    /postgres:\/\//i,
    /postgresql:\/\//i,
    /at\s+\S+\s+\(\S+:\d+:\d+\)/, // Stack trace line
    /eyJ[A-Za-z0-9_-]{20,}/, // JWT-like token pattern
  ];

  for (const pattern of sensitivePatterns) {
    assertEquals(
      pattern.test(text),
      false,
      `Response body should not contain sensitive data matching: ${pattern}`,
    );
  }
}

/**
 * Assert that a Response is a 204 No Content with no body.
 */
export async function assertNoContent(response: Response): Promise<void> {
  assertStatus(response, 204);
  const body = await response.text();
  assertEquals(body, '', 'A 204 response should have an empty body');
}

/**
 * Assert that a Response has the expected Content-Disposition header.
 */
export function assertContentDisposition(response: Response, expectedFilename: string): void {
  const disposition = response.headers.get('Content-Disposition');
  assertEquals(disposition !== null, true, 'Response should include Content-Disposition header');
  assertStringIncludes(
    disposition!,
    expectedFilename,
    `Content-Disposition should reference filename '${expectedFilename}'`,
  );
}

/**
 * Assert that a string is a valid ISO 8601 timestamp.
 */
export function assertIsoTimestamp(value: string): void {
  assertMatch(
    value,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    `Expected ISO 8601 timestamp, got '${value}'`,
  );
}

/**
 * Assert that a string is a valid UUID v4 (or similar UUID format).
 */
export function assertUuid(value: string): void {
  assertMatch(
    value,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    `Expected UUID format, got '${value}'`,
  );
}
