// SPDX-License-Identifier: BUSL-1.1

/**
 * Standard JSON response helpers for Supabase Edge Functions (#98, #353).
 *
 * Provides consistent response formatting with origin-validated CORS headers.
 * All response helpers require the incoming Request so the correct
 * Access-Control-Allow-Origin can be computed.
 *
 * NEVER include raw financial data in error responses.
 */

import { getCorsHeaders } from './cors.ts';

/** Standard success response with JSON body. */
export function jsonResponse(
  request: Request,
  data: Record<string, unknown>,
  status: number = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json',
    },
  });
}

/** Standard error response. */
export function errorResponse(request: Request, message: string, status: number = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json',
    },
  });
}

/** 201 Created response. */
export function createdResponse(request: Request, data: Record<string, unknown>): Response {
  return jsonResponse(request, data, 201);
}

/** 204 No Content response (for successful deletes, etc.). */
export function noContentResponse(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

/** 405 Method Not Allowed response. */
export function methodNotAllowedResponse(request: Request): Response {
  return errorResponse(request, 'Method not allowed', 405);
}

/** 500 Internal Server Error response. Never include internal details. */
export function internalErrorResponse(request: Request): Response {
  return errorResponse(request, 'Internal server error', 500);
}

/**
 * Streaming response for large datasets (data export).
 *
 * @param request The incoming request (for CORS headers).
 * @param stream A ReadableStream of the response body.
 * @param contentType The MIME type of the response.
 * @param filename Suggested filename for the Content-Disposition header.
 */
export function streamingResponse(
  request: Request,
  stream: ReadableStream,
  contentType: string,
  filename: string,
): Response {
  return new Response(stream, {
    status: 200,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Transfer-Encoding': 'chunked',
    },
  });
}
