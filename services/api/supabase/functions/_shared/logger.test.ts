// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for `_shared/logger.ts` (#533).
 *
 * Validates structured JSON logging output, log levels, userId tracking,
 * and the elapsed-time counter.
 *
 * We capture console output by overriding `console.log/warn/error/debug`
 * during each test.
 */

import {
  assertEquals,
  assertStringIncludes,
  assertMatch,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import { assertIsoTimestamp, assertUuid } from '../_test_helpers/assertions.ts';
import { createLogger } from './logger.ts';

/** Capture console output for a specific log level. */
interface CapturedLog {
  level: string;
  output: string;
}

/**
 * Helper: intercept console methods and return captured outputs.
 * Restores original methods after the callback completes.
 */
function captureConsole(fn: () => void): CapturedLog[] {
  const captured: CapturedLog[] = [];

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalDebug = console.debug;

  console.log = (msg: string) => captured.push({ level: 'info', output: msg });
  console.warn = (msg: string) => captured.push({ level: 'warn', output: msg });
  console.error = (msg: string) => captured.push({ level: 'error', output: msg });
  console.debug = (msg: string) => captured.push({ level: 'debug', output: msg });

  try {
    fn();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    console.debug = originalDebug;
  }

  return captured;
}

// ---------------------------------------------------------------------------
// createLogger tests
// ---------------------------------------------------------------------------

Deno.test('createLogger — returns object with required methods', () => {
  const logger = createLogger('test-function');

  assertEquals(typeof logger.info, 'function');
  assertEquals(typeof logger.warn, 'function');
  assertEquals(typeof logger.error, 'function');
  assertEquals(typeof logger.debug, 'function');
  assertEquals(typeof logger.setUserId, 'function');
  assertEquals(typeof logger.elapsed, 'function');
  assertEquals(typeof logger.requestId, 'string');
});

Deno.test('createLogger — generates a UUID requestId', () => {
  const logger = createLogger('test-function');

  assertUuid(logger.requestId);
});

Deno.test('createLogger — uses custom requestId when provided', () => {
  const customId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const logger = createLogger('test-function', customId);

  assertEquals(logger.requestId, customId);
});

// ---------------------------------------------------------------------------
// Structured JSON output tests
// ---------------------------------------------------------------------------

Deno.test('logger.info — outputs valid JSON to console.log', () => {
  const logger = createLogger('health-check');
  const captured = captureConsole(() => {
    logger.info('Request received');
  });

  assertEquals(captured.length, 1);
  assertEquals(captured[0].level, 'info');

  const entry = JSON.parse(captured[0].output);
  assertEquals(entry.level, 'info');
  assertEquals(entry.message, 'Request received');
  assertEquals(entry.function, 'health-check');
});

Deno.test('logger.warn — outputs to console.warn', () => {
  const logger = createLogger('test-fn');
  const captured = captureConsole(() => {
    logger.warn('Slow query detected');
  });

  assertEquals(captured.length, 1);
  assertEquals(captured[0].level, 'warn');

  const entry = JSON.parse(captured[0].output);
  assertEquals(entry.level, 'warn');
  assertEquals(entry.message, 'Slow query detected');
});

Deno.test('logger.error — outputs to console.error', () => {
  const logger = createLogger('test-fn');
  const captured = captureConsole(() => {
    logger.error('Database connection failed');
  });

  assertEquals(captured.length, 1);
  assertEquals(captured[0].level, 'error');

  const entry = JSON.parse(captured[0].output);
  assertEquals(entry.level, 'error');
});

Deno.test('logger.debug — outputs to console.debug', () => {
  const logger = createLogger('test-fn');
  const captured = captureConsole(() => {
    logger.debug('Entering function');
  });

  assertEquals(captured.length, 1);
  assertEquals(captured[0].level, 'debug');

  const entry = JSON.parse(captured[0].output);
  assertEquals(entry.level, 'debug');
});

// ---------------------------------------------------------------------------
// Log entry fields
// ---------------------------------------------------------------------------

Deno.test('log entry — includes ISO 8601 timestamp', () => {
  const logger = createLogger('test-fn');
  const captured = captureConsole(() => {
    logger.info('test');
  });

  const entry = JSON.parse(captured[0].output);
  assertIsoTimestamp(entry.timestamp);
});

Deno.test('log entry — includes requestId', () => {
  const logger = createLogger('test-fn');
  const captured = captureConsole(() => {
    logger.info('test');
  });

  const entry = JSON.parse(captured[0].output);
  assertEquals(entry.requestId, logger.requestId);
});

Deno.test('log entry — includes function name', () => {
  const logger = createLogger('data-export');
  const captured = captureConsole(() => {
    logger.info('test');
  });

  const entry = JSON.parse(captured[0].output);
  assertEquals(entry.function, 'data-export');
});

Deno.test('log entry — includes duration_ms', () => {
  const logger = createLogger('test-fn');
  const captured = captureConsole(() => {
    logger.info('test');
  });

  const entry = JSON.parse(captured[0].output);
  assertEquals(typeof entry.duration_ms, 'number');
  assertEquals(entry.duration_ms >= 0, true, 'duration_ms should be non-negative');
});

Deno.test('log entry — includes additional context', () => {
  const logger = createLogger('test-fn');
  const captured = captureConsole(() => {
    logger.info('Request completed', { httpStatus: 200, method: 'GET' });
  });

  const entry = JSON.parse(captured[0].output);
  assertEquals(entry.httpStatus, 200);
  assertEquals(entry.method, 'GET');
});

// ---------------------------------------------------------------------------
// setUserId tests
// ---------------------------------------------------------------------------

Deno.test('setUserId — adds userId to subsequent log entries', () => {
  const logger = createLogger('test-fn');
  const userId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

  const beforeCapture = captureConsole(() => {
    logger.info('before setUserId');
  });

  logger.setUserId(userId);

  const afterCapture = captureConsole(() => {
    logger.info('after setUserId');
  });

  const beforeEntry = JSON.parse(beforeCapture[0].output);
  assertEquals(beforeEntry.userId, undefined);

  const afterEntry = JSON.parse(afterCapture[0].output);
  assertEquals(afterEntry.userId, userId);
});

Deno.test('setUserId — userId persists across multiple log calls', () => {
  const logger = createLogger('test-fn');
  logger.setUserId('user-123');

  const captured = captureConsole(() => {
    logger.info('first');
    logger.warn('second');
    logger.error('third');
  });

  for (const cap of captured) {
    const entry = JSON.parse(cap.output);
    assertEquals(entry.userId, 'user-123');
  }
});

// ---------------------------------------------------------------------------
// elapsed tests
// ---------------------------------------------------------------------------

Deno.test('elapsed — returns non-negative number', () => {
  const logger = createLogger('test-fn');
  const elapsed = logger.elapsed();

  assertEquals(typeof elapsed, 'number');
  assertEquals(elapsed >= 0, true);
});

Deno.test('elapsed — increases over time', async () => {
  const logger = createLogger('test-fn');
  const first = logger.elapsed();

  // Small delay to ensure time passes
  await new Promise((resolve) => setTimeout(resolve, 10));

  const second = logger.elapsed();
  assertEquals(second >= first, true, 'Elapsed time should increase');
});
