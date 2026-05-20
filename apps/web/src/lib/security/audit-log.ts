// SPDX-License-Identifier: BUSL-1.1

/**
 * Security Audit Log — append-only log for security events.
 *
 * Records login/logout, permission changes, data access, connection
 * changes, and other security-relevant events. Supports querying by
 * event type and date range.
 *
 * The log is append-only by design — entries are never modified or
 * deleted (except via full log export + clear for storage management).
 *
 * References: issue #1682
 */

import type { AuditEntry, AuditEventType, AuditLogFilter, AuditSeverity } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for the audit log. */
const AUDIT_LOG_KEY = 'finance-audit-log';

/** Maximum audit log entries to retain. */
const MAX_AUDIT_ENTRIES = 2000;

/** Default severity for each event type. */
const EVENT_SEVERITY: Readonly<Record<AuditEventType, AuditSeverity>> = {
  login: 'info',
  logout: 'info',
  permission_change: 'warning',
  data_access: 'info',
  data_export: 'warning',
  data_erasure: 'critical',
  connection_added: 'info',
  connection_revoked: 'warning',
  session_revoked: 'warning',
  telemetry_changed: 'info',
  memo_encrypted: 'info',
  memo_decrypted: 'info',
  settings_changed: 'info',
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Load the full audit log from localStorage.
 *
 * @returns An array of AuditEntry objects, oldest first.
 */
export function loadAuditLog(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_LOG_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (e: unknown): e is AuditEntry =>
        typeof e === 'object' && e !== null && 'id' in e && 'eventType' in e && 'timestamp' in e,
    );
  } catch {
    return [];
  }
}

/**
 * Save the audit log to localStorage (internal use).
 *
 * @param entries - The log entries to persist.
 */
function saveAuditLog(entries: readonly AuditEntry[]): void {
  const trimmed = entries.length > MAX_AUDIT_ENTRIES ? entries.slice(-MAX_AUDIT_ENTRIES) : entries;
  localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(trimmed));
}

// ---------------------------------------------------------------------------
// Append operations (append-only — no update or delete)
// ---------------------------------------------------------------------------

/**
 * Append a security event to the audit log.
 *
 * @param eventType - The type of security event.
 * @param description - Human-readable description (must not contain financial data).
 * @param metadata - Optional metadata (must be scrubbed of sensitive data).
 * @param options - Optional IP address and user agent.
 * @returns The created AuditEntry.
 */
export function appendAuditEntry(
  eventType: AuditEventType,
  description: string,
  metadata: Record<string, string> = {},
  options: { ipAddress?: string; userAgent?: string } = {},
): AuditEntry {
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    eventType,
    severity: EVENT_SEVERITY[eventType],
    description,
    metadata,
    ipAddress: options.ipAddress ?? null,
    userAgent: options.userAgent ?? null,
  };

  const log = loadAuditLog();
  log.push(entry);
  saveAuditLog(log);

  return entry;
}

// ---------------------------------------------------------------------------
// Query operations
// ---------------------------------------------------------------------------

/**
 * Query the audit log with optional filters.
 *
 * @param filter - Optional filter criteria.
 * @returns An array of matching AuditEntry objects, newest first.
 */
export function queryAuditLog(filter: AuditLogFilter = {}): AuditEntry[] {
  let entries = loadAuditLog();

  if (filter.eventTypes && filter.eventTypes.length > 0) {
    const types = new Set(filter.eventTypes);
    entries = entries.filter((e) => types.has(e.eventType));
  }

  if (filter.startDate) {
    const start = filter.startDate;
    entries = entries.filter((e) => e.timestamp >= start);
  }

  if (filter.endDate) {
    const end = filter.endDate;
    entries = entries.filter((e) => e.timestamp <= end);
  }

  if (filter.severity) {
    entries = entries.filter((e) => e.severity === filter.severity);
  }

  // Return newest first
  entries.reverse();

  if (filter.limit && filter.limit > 0) {
    entries = entries.slice(0, filter.limit);
  }

  return entries;
}

/**
 * Get a count of events grouped by event type.
 *
 * @returns A map of event type to count.
 */
export function getEventTypeCounts(): Record<AuditEventType, number> {
  const log = loadAuditLog();
  const counts = {} as Record<AuditEventType, number>;

  for (const entry of log) {
    counts[entry.eventType] = (counts[entry.eventType] ?? 0) + 1;
  }

  return counts;
}

/**
 * Export the audit log as a formatted JSON string.
 *
 * @returns A JSON string suitable for download.
 */
export function exportAuditLog(): string {
  const log = loadAuditLog();
  return JSON.stringify(
    {
      type: 'security_audit_log',
      exportedAt: new Date().toISOString(),
      totalEntries: log.length,
      entries: log,
    },
    null,
    2,
  );
}

/**
 * Clear the audit log (for storage management only).
 *
 * This should only be called after the log has been exported.
 */
export function clearAuditLog(): void {
  localStorage.removeItem(AUDIT_LOG_KEY);
}
