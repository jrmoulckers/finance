// SPDX-License-Identifier: BUSL-1.1

/**
 * Structured JSON logger for Supabase Edge Functions (#468).
 *
 * Outputs structured JSON to stdout/stderr for log aggregation,
 * filtering, and alerting. Each log entry includes an ISO 8601
 * timestamp, log level, message, request ID, and optional context.
 *
 * Security:
 *   NEVER log sensitive data — tokens, passwords, emails,
 *   account numbers, or financial amounts.
 *   DO log — request IDs, function names, HTTP status codes,
 *   durations, error types/messages (operational, not user data).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: string;
  function?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

/**
 * Emit a structured log entry as JSON to the appropriate console stream.
 *
 * Supabase captures stdout/stderr, so we use the matching console
 * method to ensure correct stream routing and log-level filtering
 * in the Supabase dashboard.
 */
function emit(entry: LogEntry): void {
  const output = JSON.stringify(entry);
  switch (entry.level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'debug':
      console.debug(output);
      break;
    default:
      console.log(output);
  }
}

/**
 * Create a structured logger scoped to a single Edge Function invocation.
 *
 * Usage:
 * ```ts
 * const logger = createLogger('health-check');
 * logger.info('Request received', { method: 'GET' });
 * logger.setUserId(user.id);
 * logger.info('Request completed', { httpStatus: 200 });
 * ```
 *
 * @param functionName The Edge Function name (e.g. "health-check").
 * @param requestId    Optional pre-generated request ID. Defaults to `crypto.randomUUID()`.
 * @returns A logger instance with `info`, `warn`, `error`, and `debug` methods.
 */
export function createLogger(functionName: string, requestId?: string) {
  const id = requestId ?? crypto.randomUUID();
  const startTime = performance.now();
  let currentUserId: string | undefined;

  function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId: id,
      function: functionName,
      ...(currentUserId ? { userId: currentUserId } : {}),
      duration_ms: Math.round(performance.now() - startTime),
      ...context,
    };
    emit(entry);
  }

  return {
    /** The unique request ID assigned to this logger instance. */
    get requestId(): string {
      return id;
    },

    /**
     * Associate a user ID with all subsequent log entries.
     * Call after authentication succeeds.
     */
    setUserId(userId: string): void {
      currentUserId = userId;
    },

    /** Milliseconds elapsed since this logger was created. */
    elapsed(): number {
      return Math.round(performance.now() - startTime);
    },

    /** Log an informational message. */
    info(message: string, context?: Record<string, unknown>): void {
      log('info', message, context);
    },

    /** Log a warning. */
    warn(message: string, context?: Record<string, unknown>): void {
      log('warn', message, context);
    },

    /** Log an error. */
    error(message: string, context?: Record<string, unknown>): void {
      log('error', message, context);
    },

    /** Log a debug-level message. */
    debug(message: string, context?: Record<string, unknown>): void {
      log('debug', message, context);
    },
  };
}

/** Type alias for the logger instance returned by {@link createLogger}. */
export type Logger = ReturnType<typeof createLogger>;
