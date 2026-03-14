// SPDX-License-Identifier: BUSL-1.1

/**
 * Standard JSON response helpers for Supabase Edge Functions (#98).
 *
 * Provides consistent response formatting with CORS headers included.
 * NEVER include raw financial data in error responses.
 */

import { corsHeaders } from './cors.ts';

/** Standard success response with JSON body. */
export function jsonResponse(data: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

/** Standard error response. */
export function errorResponse(message: string, status: number = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

/** 201 Created response. */
export function createdResponse(data: Record<string, unknown>): Response {
  return jsonResponse(data, 201);
}

/** 204 No Content response (for successful deletes, etc.). */
export function noContentResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/** 405 Method Not Allowed response. */
export function methodNotAllowedResponse(): Response {
  return errorResponse('Method not allowed', 405);
}

/** 500 Internal Server Error response. Never include internal details. */
export function internalErrorResponse(): Response {
  return errorResponse('Internal server error', 500);
}

/**
 * Streaming response for large datasets (data export).
 *
 * @param stream A ReadableStream of the response body.
 * @param contentType The MIME type of the response.
 * @param filename Suggested filename for the Content-Disposition header.
 */
export function streamingResponse(
  stream: ReadableStream,
  contentType: string,
  filename: string,
): Response {
  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Transfer-Encoding': 'chunked',
    },
  });
}
