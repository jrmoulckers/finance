// SPDX-License-Identifier: BUSL-1.1

type JsonValue =
  string | number | boolean | null | JsonValue[] | { readonly [key: string]: JsonValue };
export type AuditActionType =
  | 'data_export_generated'
  | 'account_deletion_attempted'
  | 'account_deletion_completed'
  | 'consent_changed'
  | 'passkey_registered'
  | 'passkey_removed'
  | 'session_timeout'
  | 'app_lock_enabled'
  | 'app_locked'
  | 'app_unlocked'
  | 'app_lock_bypassed'
  | 'step_up_reauth'
  | 'third_party_permission_granted'
  | 'third_party_permission_revoked'
  | 'third_party_education_acknowledged'
  | 'privacy_mode_toggled';

export interface SecurityAuditEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly action: AuditActionType;
  readonly actor: string;
  readonly sessionId: string;
  readonly platform: string;
  readonly result: 'success' | 'failure' | 'cancelled' | 'warning';
  readonly metadata: Record<string, JsonValue>;
  readonly previousHash: string;
  readonly hash: string;
}

export interface SecurityAuditInput {
  readonly action: AuditActionType;
  readonly result: SecurityAuditEvent['result'];
  readonly actor?: string;
  readonly sessionId?: string;
  readonly platform?: string;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp?: string;
}

export interface AuditIntegrityResult {
  readonly ok: boolean;
  readonly checked: number;
  readonly failedEventIds: string[];
}

export interface SecurityAuditExportOptions {
  readonly redacted?: boolean;
}

export const SECURITY_AUDIT_LOG_KEY = 'finance-security-audit-log-v1';
const SESSION_ID_KEY = 'finance-security-session-id-v1';
const MAX_AUDIT_EVENTS = 1000;
const GENESIS_HASH = 'GENESIS';
const SECRET_KEY_PATTERN = /(password|token|secret|credential|authorization|cookie|key)/i;

export function getSecuritySessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const next = makeId();
    sessionStorage.setItem(SESSION_ID_KEY, next);
    return next;
  } catch {
    return 'session-unavailable';
  }
}

export function loadSecurityAuditLog(): SecurityAuditEvent[] {
  try {
    const raw = localStorage.getItem(SECURITY_AUDIT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAuditEvent).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch {
    return [];
  }
}

export async function appendSecurityAuditEvent(
  input: SecurityAuditInput,
): Promise<SecurityAuditEvent> {
  const history = loadSecurityAuditLog();
  const previous = history.at(-1);
  const eventWithoutHash = {
    id: makeId(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    action: input.action,
    actor: input.actor ?? 'local-user',
    sessionId: input.sessionId ?? getSecuritySessionId(),
    platform: input.platform ?? getPlatform(),
    result: input.result,
    metadata: sanitizeMetadata(input.metadata ?? {}),
    previousHash: previous?.hash ?? GENESIS_HASH,
  } satisfies Omit<SecurityAuditEvent, 'hash'>;
  const hash = await hashEvent(eventWithoutHash);
  const event: SecurityAuditEvent = { ...eventWithoutHash, hash };
  const trimmed = [...history, event].slice(-MAX_AUDIT_EVENTS);
  localStorage.setItem(SECURITY_AUDIT_LOG_KEY, JSON.stringify(trimmed));
  return event;
}

export async function verifySecurityAuditLogIntegrity(
  events: readonly SecurityAuditEvent[] = loadSecurityAuditLog(),
): Promise<AuditIntegrityResult> {
  const failedEventIds: string[] = [];
  let expectedPrevious = GENESIS_HASH;
  const ordered = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const event of ordered) {
    const { hash: _hash, ...eventWithoutHash } = event;
    const expectedHash = await hashEvent(eventWithoutHash);
    if (event.previousHash !== expectedPrevious || event.hash !== expectedHash) {
      failedEventIds.push(event.id);
    }
    expectedPrevious = event.hash;
  }
  return { ok: failedEventIds.length === 0, checked: ordered.length, failedEventIds };
}

export function exportSecurityAuditLog(options: SecurityAuditExportOptions = {}): string {
  const events = loadSecurityAuditLog().map((event) =>
    options.redacted ? { ...event, metadata: sanitizeMetadata(event.metadata) } : event,
  );
  return JSON.stringify(
    {
      type: 'security_audit_log',
      exportedAt: new Date().toISOString(),
      tamperEvidence:
        'sha-256 hash chain over timestamp, action, actor, session, platform, result, metadata, and previousHash',
      totalEvents: events.length,
      events,
    },
    null,
    2,
  );
}

export function clearSecurityAuditLog(): void {
  localStorage.removeItem(SECURITY_AUDIT_LOG_KEY);
}

export function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, JsonValue> {
  const sanitized: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    sanitized[key] = SECRET_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeValue(value);
  }
  return sanitized;
}

async function hashEvent(event: Omit<SecurityAuditEvent, 'hash'>): Promise<string> {
  const canonical = stableStringify(event);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(canonical),
    );
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return fallbackHash(canonical);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return (
    '{' +
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          JSON.stringify(key) + ':' + stableStringify((value as Record<string, unknown>)[key]),
      )
      .join(',') +
    '}'
  );
}

function sanitizeValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === 'object') return sanitizeMetadata(value as Record<string, unknown>);
  return String(value);
}

function isAuditEvent(value: unknown): value is SecurityAuditEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Partial<SecurityAuditEvent>;
  return (
    typeof event.id === 'string' &&
    typeof event.timestamp === 'string' &&
    typeof event.action === 'string' &&
    typeof event.actor === 'string' &&
    typeof event.sessionId === 'string' &&
    typeof event.platform === 'string' &&
    typeof event.result === 'string' &&
    typeof event.previousHash === 'string' &&
    typeof event.hash === 'string' &&
    typeof event.metadata === 'object' &&
    event.metadata !== null
  );
}

function getPlatform(): string {
  if (typeof navigator === 'undefined') return 'web';
  return 'web:' + (navigator.userAgent || 'unknown');
}

function makeId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

function fallbackHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
