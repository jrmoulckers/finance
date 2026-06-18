// SPDX-License-Identifier: BUSL-1.1

import { appendSecurityAuditEvent } from './security-audit-log';
import { getStepUpStatus, type RiskyAction } from './session-security';

export type ThirdPartyConnectionType = 'oauth' | 'bank' | 'sync' | 'export_recipient';
export type ThirdPartyConnectionStatus = 'active' | 'revoked' | 'needs_review';

export interface ThirdPartyConnection {
  readonly id: string;
  readonly displayName: string;
  readonly type: ThirdPartyConnectionType;
  readonly scopes: string[];
  readonly consentedAt: string;
  readonly lastActivityAt: string | null;
  readonly status: ThirdPartyConnectionStatus;
  readonly risk: 'low' | 'medium' | 'high';
  readonly domain?: string;
}

export interface PermissionReviewSummary {
  readonly total: number;
  readonly active: number;
  readonly stale: number;
  readonly risky: number;
}

export const THIRD_PARTY_CONNECTIONS_KEY = 'finance-third-party-connections-v1';
export const THIRD_PARTY_EDUCATION_KEY = 'finance-third-party-education-v1';
const REVIEW_STALE_MS = 90 * 24 * 60 * 60 * 1000;
const STEP_UP_ACTION: RiskyAction = 'third_party_permission_change';

export function loadThirdPartyConnections(now: Date = new Date()): ThirdPartyConnection[] {
  const stored = readStoredConnections();
  return stored.map((connection) => flagStaleConnection(connection, now));
}

export function saveThirdPartyConnections(connections: readonly ThirdPartyConnection[]): void {
  localStorage.setItem(THIRD_PARTY_CONNECTIONS_KEY, JSON.stringify(connections));
}

export async function recordThirdPartyConnectionGrant(
  connection: ThirdPartyConnection,
): Promise<ThirdPartyConnection> {
  const connections = readStoredConnections().filter((item) => item.id !== connection.id);
  const next = { ...connection, status: 'active' as const };
  saveThirdPartyConnections([...connections, next]);
  await appendSecurityAuditEvent({
    action: 'third_party_permission_granted',
    result: 'success',
    metadata: {
      connectionId: next.id,
      displayName: next.displayName,
      scopes: next.scopes,
      type: next.type,
    },
  });
  return next;
}

export async function revokeThirdPartyConnection(
  id: string,
  now: Date = new Date(),
): Promise<
  | { kind: 'revoked'; connection: ThirdPartyConnection }
  | { kind: 'step_up_required' }
  | { kind: 'not_found' }
> {
  if (!getStepUpStatus(STEP_UP_ACTION, now).allowed) return { kind: 'step_up_required' };
  const connections = readStoredConnections();
  const found = connections.find((connection) => connection.id === id);
  if (!found) return { kind: 'not_found' };
  const revoked: ThirdPartyConnection = {
    ...found,
    status: 'revoked',
    lastActivityAt: now.toISOString(),
  };
  saveThirdPartyConnections(
    connections.map((connection) => (connection.id === id ? revoked : connection)),
  );
  await appendSecurityAuditEvent({
    action: 'third_party_permission_revoked',
    result: 'success',
    metadata: { connectionId: revoked.id, displayName: revoked.displayName, type: revoked.type },
    timestamp: now.toISOString(),
  });
  return { kind: 'revoked', connection: revoked };
}

export async function acknowledgeThirdPartyEducation(now: Date = new Date()): Promise<void> {
  localStorage.setItem(THIRD_PARTY_EDUCATION_KEY, now.toISOString());
  await appendSecurityAuditEvent({
    action: 'third_party_education_acknowledged',
    result: 'success',
    metadata: { education: 'scam-resistant permission review' },
    timestamp: now.toISOString(),
  });
}

export function hasAcknowledgedThirdPartyEducation(): boolean {
  return localStorage.getItem(THIRD_PARTY_EDUCATION_KEY) !== null;
}

export function summarizeThirdPartyPermissions(
  connections: readonly ThirdPartyConnection[],
  now: Date = new Date(),
): PermissionReviewSummary {
  const flagged = connections.map((connection) => flagStaleConnection(connection, now));
  return {
    total: flagged.length,
    active: flagged.filter((connection) => connection.status === 'active').length,
    stale: flagged.filter((connection) => connection.status === 'needs_review').length,
    risky: flagged.filter((connection) => connection.risk === 'high').length,
  };
}

function flagStaleConnection(connection: ThirdPartyConnection, now: Date): ThirdPartyConnection {
  if (connection.status !== 'active') return connection;
  const lastActivityAt = connection.lastActivityAt ?? connection.consentedAt;
  const stale = now.getTime() - new Date(lastActivityAt).getTime() > REVIEW_STALE_MS;
  return stale ? { ...connection, status: 'needs_review' } : connection;
}

function readStoredConnections(): ThirdPartyConnection[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(THIRD_PARTY_CONNECTIONS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isConnection);
  } catch {
    return [];
  }
}

function isConnection(value: unknown): value is ThirdPartyConnection {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<ThirdPartyConnection>;
  return (
    typeof item.id === 'string' &&
    typeof item.displayName === 'string' &&
    typeof item.type === 'string' &&
    Array.isArray(item.scopes) &&
    typeof item.consentedAt === 'string' &&
    typeof item.status === 'string' &&
    typeof item.risk === 'string'
  );
}
