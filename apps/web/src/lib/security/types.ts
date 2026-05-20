// SPDX-License-Identifier: BUSL-1.1

/**
 * Security & Privacy types — shared across all security modules.
 *
 * These types define the data structures for GDPR/CCPA data access,
 * selective record erasure, device session management, telemetry
 * transparency, third-party connection management, audit logging,
 * and encrypted memo handling.
 *
 * References: #1654, #1658, #1663, #1668, #1677, #1682, #1723
 */

// ---------------------------------------------------------------------------
// Data Access Request (#1654)
// ---------------------------------------------------------------------------

/** Categories of user data that can be exported. */
export type DataCategory =
  | 'accounts'
  | 'transactions'
  | 'budgets'
  | 'goals'
  | 'categories'
  | 'settings'
  | 'consent'
  | 'audit_log';

/** Status of a data access request. */
export type DataAccessRequestStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** A GDPR/CCPA self-service data access request. */
export interface DataAccessRequest {
  /** Unique request ID. */
  readonly id: string;
  /** ISO-8601 timestamp when the request was created. */
  readonly requestedAt: string;
  /** Current status. */
  readonly status: DataAccessRequestStatus;
  /** Categories included in this export. */
  readonly categories: readonly DataCategory[];
  /** ISO-8601 timestamp when the export was completed (null if pending). */
  readonly completedAt: string | null;
  /** Format of the exported data. */
  readonly format: 'json' | 'csv';
}

/** A structured data export package. */
export interface DataExportPackage {
  /** Export metadata. */
  readonly meta: {
    readonly exportId: string;
    readonly exportedAt: string;
    readonly format: 'json';
    readonly categories: readonly DataCategory[];
    readonly totalRecords: number;
  };
  /** Data grouped by category. */
  readonly data: Partial<Record<DataCategory, readonly Record<string, unknown>[]>>;
}

// ---------------------------------------------------------------------------
// Selective Record Erasure (#1658)
// ---------------------------------------------------------------------------

/** Type of record being erased. */
export type ErasableRecordType = 'transaction' | 'account' | 'budget' | 'goal' | 'category';

/** Status of an erasure request. */
export type ErasureStatus = 'pending' | 'approved' | 'completed' | 'rejected';

/** A selective record erasure request. */
export interface ErasureRequest {
  /** Unique request ID. */
  readonly id: string;
  /** ISO-8601 timestamp of request creation. */
  readonly requestedAt: string;
  /** Type of record to erase. */
  readonly recordType: ErasableRecordType;
  /** ID of the specific record to erase. */
  readonly recordId: string;
  /** Human-readable reason for erasure. */
  readonly reason: string;
  /** Current status. */
  readonly status: ErasureStatus;
  /** ISO-8601 timestamp when erasure was completed (null if pending). */
  readonly completedAt: string | null;
  /** Cascade actions taken (e.g., balance recalculation). */
  readonly cascadeActions: readonly string[];
}

/** Result of a retention policy check. */
export interface RetentionCheckResult {
  /** Whether the record can be erased now. */
  readonly canErase: boolean;
  /** Reason if erasure is blocked. */
  readonly reason: string | null;
  /** ISO-8601 date when the retention period expires (null if no hold). */
  readonly retentionExpiresAt: string | null;
}

// ---------------------------------------------------------------------------
// Device Session Management (#1663)
// ---------------------------------------------------------------------------

/** A device/session entry. */
export interface DeviceSession {
  /** Unique session ID. */
  readonly id: string;
  /** Human-readable device name. */
  readonly deviceName: string;
  /** Browser or app user agent string. */
  readonly userAgent: string;
  /** IP address (masked for privacy, e.g. "192.168.x.x"). */
  readonly ipAddress: string;
  /** ISO-8601 timestamp of last activity. */
  readonly lastActiveAt: string;
  /** ISO-8601 timestamp when the session was created. */
  readonly createdAt: string;
  /** Whether this is the current session. */
  readonly isCurrent: boolean;
  /** Whether the session has been revoked. */
  readonly isRevoked: boolean;
}

// ---------------------------------------------------------------------------
// Telemetry Configuration (#1668)
// ---------------------------------------------------------------------------

/** Granular telemetry category. */
export type TelemetryCategory =
  | 'crash_reports'
  | 'usage_analytics'
  | 'performance_metrics'
  | 'feature_flags';

/** Configuration for no-telemetry mode. */
export interface TelemetryConfig {
  /** Master kill switch — disables all telemetry when true. */
  readonly noTelemetryMode: boolean;
  /** Per-category overrides (only relevant when noTelemetryMode is false). */
  readonly categorySettings: Readonly<Record<TelemetryCategory, boolean>>;
  /** ISO-8601 timestamp of last configuration change. */
  readonly lastUpdatedAt: string;
}

/** A logged outbound network request for transparency. */
export interface NetworkRequestEntry {
  /** Unique entry ID. */
  readonly id: string;
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
  /** Destination URL (domain only, no path details for privacy). */
  readonly destination: string;
  /** HTTP method. */
  readonly method: string;
  /** Purpose of the request. */
  readonly purpose: string;
  /** Whether the request was blocked by telemetry settings. */
  readonly blocked: boolean;
}

/** A transparency report summarizing data destinations. */
export interface TransparencyReport {
  /** ISO-8601 timestamp of report generation. */
  readonly generatedAt: string;
  /** Summary of destinations and what data goes where. */
  readonly destinations: readonly TransparencyDestination[];
  /** Total requests logged in the reporting period. */
  readonly totalRequests: number;
  /** Total requests blocked. */
  readonly totalBlocked: number;
}

/** A destination in the transparency report. */
export interface TransparencyDestination {
  /** Domain name. */
  readonly domain: string;
  /** Description of the service. */
  readonly service: string;
  /** What data is sent. */
  readonly dataSent: string;
  /** Purpose of sending data. */
  readonly purpose: string;
  /** Number of requests in the reporting period. */
  readonly requestCount: number;
}

// ---------------------------------------------------------------------------
// Third-Party Connection Transparency (#1677)
// ---------------------------------------------------------------------------

/** Status of a third-party connection. */
export type ConnectionStatus = 'active' | 'paused' | 'revoked' | 'expired';

/** A third-party service connection (aggregator, sync provider, etc.). */
export interface ConnectionRecord {
  /** Unique connection ID. */
  readonly id: string;
  /** Name of the third-party provider. */
  readonly providerName: string;
  /** Type of connection. */
  readonly providerType: 'aggregator' | 'sync' | 'export' | 'import' | 'analytics';
  /** Current status. */
  readonly status: ConnectionStatus;
  /** Permission scopes granted to this connection. */
  readonly scopes: readonly string[];
  /** ISO-8601 timestamp when the connection was created. */
  readonly connectedAt: string;
  /** ISO-8601 timestamp of last data access by this provider. */
  readonly lastAccessedAt: string | null;
  /** ISO-8601 timestamp when the connection expires (null if no expiry). */
  readonly expiresAt: string | null;
}

// ---------------------------------------------------------------------------
// Audit Log (#1682)
// ---------------------------------------------------------------------------

/** Types of auditable security events. */
export type AuditEventType =
  | 'login'
  | 'logout'
  | 'permission_change'
  | 'data_access'
  | 'data_export'
  | 'data_erasure'
  | 'connection_added'
  | 'connection_revoked'
  | 'session_revoked'
  | 'telemetry_changed'
  | 'memo_encrypted'
  | 'memo_decrypted'
  | 'settings_changed';

/** Severity of an audit event. */
export type AuditSeverity = 'info' | 'warning' | 'critical';

/** An entry in the append-only security audit log. */
export interface AuditEntry {
  /** Unique entry ID. */
  readonly id: string;
  /** ISO-8601 timestamp of the event. */
  readonly timestamp: string;
  /** Type of event. */
  readonly eventType: AuditEventType;
  /** Severity level. */
  readonly severity: AuditSeverity;
  /** Human-readable description (never contains financial data). */
  readonly description: string;
  /** Additional metadata (scrubbed of sensitive data). */
  readonly metadata: Readonly<Record<string, string>>;
  /** IP address at time of event (masked). */
  readonly ipAddress: string | null;
  /** User agent at time of event. */
  readonly userAgent: string | null;
}

/** Filter criteria for querying the audit log. */
export interface AuditLogFilter {
  /** Filter by event type(s). */
  readonly eventTypes?: readonly AuditEventType[];
  /** Start of date range (ISO-8601). */
  readonly startDate?: string;
  /** End of date range (ISO-8601). */
  readonly endDate?: string;
  /** Filter by severity. */
  readonly severity?: AuditSeverity;
  /** Maximum number of results. */
  readonly limit?: number;
}

// ---------------------------------------------------------------------------
// Encrypted Memo (#1723)
// ---------------------------------------------------------------------------

/** An encrypted memo attached to a transaction or record. */
export interface EncryptedMemo {
  /** The encrypted content (base64-encoded in placeholder implementation). */
  readonly ciphertext: string;
  /** Initialization vector (base64-encoded). */
  readonly iv: string;
  /** Algorithm identifier. */
  readonly algorithm: string;
  /** ISO-8601 timestamp when encryption was performed. */
  readonly encryptedAt: string;
}

/** Export settings for memo handling. */
export interface MemoExportOptions {
  /** Whether to include memos in the export. */
  readonly includeMemos: boolean;
  /** Whether to redact memo content (replace with [REDACTED]). */
  readonly redactMemos: boolean;
}
