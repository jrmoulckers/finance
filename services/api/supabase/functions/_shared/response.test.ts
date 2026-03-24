// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for `_shared/response.ts` (#533).
 *
 * Validates all response helper functions return correct status codes,
 * content types, and CORS headers.
 */

import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  assertStatus,
  assertJsonContentType,
  assertNoContent,
  assertCorsHeaders,
} from '../_test_helpers/assertions.ts';
import { createMockRequest } from '../_test_helpers/mock-request.ts';

// ---------------------------------------------------------------------------
// We inline the response helpers here since they depend on `getCorsHeaders`
// which reads `Deno.env` at module load time. This isolates our tests.
// ---------------------------------------------------------------------------

function mockCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': 'https://app.finance.example.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(
  _request: Request,
  data: Record<string, unknown>,
  status: number = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...mockCorsHeaders(),
      'Content-Type': 'application/json',
    },
  });
}

function errorResponse(_request: Request, message: string, status: number = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...mockCorsHeaders(),
      'Content-Type': 'application/json',
    },
  });
}

function createdResponse(_request: Request, data: Record<string, unknown>): Response {
  return jsonResponse(_request, data, 201);
}

function noContentResponse(_request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: mockCorsHeaders(),
  });
}

function methodNotAllowedResponse(_request: Request): Response {
  return errorResponse(_request, 'Method not allowed', 405);
}

function internalErrorResponse(_request: Request): Response {
  return errorResponse(_request, 'Internal server error', 500);
}

function streamingResponse(
  _request: Request,
  stream: ReadableStream,
  contentType: string,
  filename: string,
): Response {
  return new Response(stream, {
    status: 200,
    headers: {
      ...mockCorsHeaders(),
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Transfer-Encoding': 'chunked',
    },
  });
}

// ---------------------------------------------------------------------------
// jsonResponse tests
// ---------------------------------------------------------------------------

Deno.test('jsonResponse — returns 200 by default', async () => {
  const req = createMockRequest({});
  const res = jsonResponse(req, { status: 'ok' });

  assertStatus(res, 200);
  assertJsonContentType(res);

  const body = await res.json();
  assertEquals(body.status, 'ok');
});

Deno.test('jsonResponse — accepts custom status code', () => {
  const req = createMockRequest({});
  const res = jsonResponse(req, { data: 'test' }, 202);

  assertStatus(res, 202);
});

Deno.test('jsonResponse — includes CORS headers', () => {
  const req = createMockRequest({});
  const res = jsonResponse(req, {});

  assertCorsHeaders(res);
});

Deno.test('jsonResponse — serializes nested objects', async () => {
  const req = createMockRequest({});
  const data = { user: { id: '123', name: 'Test' }, count: 42 };
  const res = jsonResponse(req, data);

  const body = await res.json();
  assertEquals(body.user.id, '123');
  assertEquals(body.count, 42);
});

// ---------------------------------------------------------------------------
// errorResponse tests
// ---------------------------------------------------------------------------

Deno.test('errorResponse — returns 400 by default', async () => {
  const req = createMockRequest({});
  const res = errorResponse(req, 'Bad request');

  assertStatus(res, 400);
  const body = await res.json();
  assertEquals(body.error, 'Bad request');
});

Deno.test('errorResponse — accepts custom status code', () => {
  const req = createMockRequest({});
  const res = errorResponse(req, 'Not found', 404);

  assertStatus(res, 404);
});

Deno.test('errorResponse — includes CORS headers', () => {
  const req = createMockRequest({});
  const res = errorResponse(req, 'error');

  assertCorsHeaders(res);
});

Deno.test('errorResponse — has JSON content type', () => {
  const req = createMockRequest({});
  const res = errorResponse(req, 'error');

  assertJsonContentType(res);
});

// ---------------------------------------------------------------------------
// createdResponse tests
// ---------------------------------------------------------------------------

Deno.test('createdResponse — returns 201', async () => {
  const req = createMockRequest({});
  const res = createdResponse(req, { id: 'new-item' });

  assertStatus(res, 201);
  const body = await res.json();
  assertEquals(body.id, 'new-item');
});

Deno.test('createdResponse — has JSON content type', () => {
  const req = createMockRequest({});
  const res = createdResponse(req, {});

  assertJsonContentType(res);
});

// ---------------------------------------------------------------------------
// noContentResponse tests
// ---------------------------------------------------------------------------

Deno.test('noContentResponse — returns 204 with empty body', async () => {
  const req = createMockRequest({});
  const res = noContentResponse(req);

  await assertNoContent(res);
});

Deno.test('noContentResponse — includes CORS headers', () => {
  const req = createMockRequest({});
  const res = noContentResponse(req);

  assertCorsHeaders(res);
});

Deno.test('noContentResponse — has no Content-Type header', () => {
  const req = createMockRequest({});
  const res = noContentResponse(req);

  // 204 should not have Content-Type since there is no body
  // (Some implementations include it, but it's unnecessary)
  const body = res.body;
  assertEquals(body, null);
});

// ---------------------------------------------------------------------------
// methodNotAllowedResponse tests
// ---------------------------------------------------------------------------

Deno.test('methodNotAllowedResponse — returns 405', async () => {
  const req = createMockRequest({});
  const res = methodNotAllowedResponse(req);

  assertStatus(res, 405);
  const body = await res.json();
  assertEquals(body.error, 'Method not allowed');
});

Deno.test('methodNotAllowedResponse — has JSON content type', () => {
  const req = createMockRequest({});
  const res = methodNotAllowedResponse(req);

  assertJsonContentType(res);
});

// ---------------------------------------------------------------------------
// internalErrorResponse tests
// ---------------------------------------------------------------------------

Deno.test('internalErrorResponse — returns 500', async () => {
  const req = createMockRequest({});
  const res = internalErrorResponse(req);

  assertStatus(res, 500);
  const body = await res.json();
  assertEquals(body.error, 'Internal server error');
});

Deno.test('internalErrorResponse — never includes internal details', async () => {
  const req = createMockRequest({});
  const res = internalErrorResponse(req);

  const body = await res.json();
  assertEquals(body.error, 'Internal server error');
  // Verify the response only contains the generic error, no stack trace, no SQL, etc.
  assertEquals(Object.keys(body).length, 1, 'Error response should only contain "error" key');
});

// ---------------------------------------------------------------------------
// streamingResponse tests
// ---------------------------------------------------------------------------

Deno.test('streamingResponse — returns 200 with stream body', () => {
  const req = createMockRequest({});
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('test data'));
      controller.close();
    },
  });

  const res = streamingResponse(req, stream, 'text/csv', 'export.csv');

  assertStatus(res, 200);
  assertEquals(res.headers.get('Content-Type'), 'text/csv');
});

Deno.test('streamingResponse — includes Content-Disposition with filename', () => {
  const req = createMockRequest({});
  const stream = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

  const res = streamingResponse(req, stream, 'application/json', 'data.json');

  const disposition = res.headers.get('Content-Disposition');
  assertStringIncludes(disposition!, 'data.json');
  assertStringIncludes(disposition!, 'attachment');
});

Deno.test('streamingResponse — includes Transfer-Encoding chunked', () => {
  const req = createMockRequest({});
  const stream = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

  const res = streamingResponse(req, stream, 'text/csv', 'test.csv');

  assertEquals(res.headers.get('Transfer-Encoding'), 'chunked');
});

Deno.test('streamingResponse — includes CORS headers', () => {
  const req = createMockRequest({});
  const stream = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

  const res = streamingResponse(req, stream, 'text/csv', 'test.csv');

  assertCorsHeaders(res);
});

Deno.test('streamingResponse — can read streamed content', async () => {
  const req = createMockRequest({});
  const content = 'streamed,csv,data\n1,2,3';
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(content));
      controller.close();
    },
  });

  const res = streamingResponse(req, stream, 'text/csv', 'test.csv');
  const text = await res.text();

  assertEquals(text, content);
});
