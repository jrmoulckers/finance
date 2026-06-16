// SPDX-License-Identifier: BUSL-1.1

/** Pure verification helpers for full account + browser-local deletion receipts. */

export type DeletionDomain =
  | 'server-account'
  | 'server-financial-data'
  | 'server-auth-identities'
  | 'server-passkeys'
  | 'local-opfs'
  | 'local-indexeddb'
  | 'local-caches'
  | 'local-service-workers'
  | 'local-storage'
  | 'session-storage'
  | 'sync-queues'
  | 'audit-log'
  | 'consent-records';

export type DeletionStatus = 'deleted' | 'retained' | 'failed' | 'not_applicable';

export interface DeletionDomainResult {
  readonly domain: DeletionDomain;
  readonly status: DeletionStatus;
  readonly retainedReason?: string;
  readonly error?: string;
}

export interface DeletionVerificationInput {
  readonly requestId: string;
  readonly requestedAt: string;
  readonly completedAt: string;
  readonly serverConfirmed: boolean;
  readonly domains: readonly DeletionDomainResult[];
  readonly requiredDomains?: readonly DeletionDomain[];
}

export interface DeletionVerificationResult {
  readonly verified: boolean;
  readonly missingDomains: readonly DeletionDomain[];
  readonly failedDomains: readonly DeletionDomain[];
  readonly retainedDomains: readonly DeletionDomain[];
  readonly receipt: DeletionReceipt;
}

export interface DeletionReceipt {
  readonly type: 'account_deletion_receipt';
  readonly requestId: string;
  readonly requestedAt: string;
  readonly completedAt: string;
  readonly verified: boolean;
  readonly deletedDomains: readonly DeletionDomain[];
  readonly retained: readonly Pick<DeletionDomainResult, 'domain' | 'retainedReason'>[];
  readonly failures: readonly Pick<DeletionDomainResult, 'domain' | 'error'>[];
}

export const DEFAULT_ACCOUNT_DELETION_DOMAINS: readonly DeletionDomain[] = [
  'server-account',
  'server-financial-data',
  'server-auth-identities',
  'server-passkeys',
  'local-opfs',
  'local-indexeddb',
  'local-caches',
  'local-service-workers',
  'local-storage',
  'session-storage',
  'sync-queues',
  'audit-log',
  'consent-records',
];

export function verifyAccountDeletion(input: DeletionVerificationInput): DeletionVerificationResult {
  const requiredDomains = input.requiredDomains ?? DEFAULT_ACCOUNT_DELETION_DOMAINS;
  const byDomain = new Map(input.domains.map((result) => [result.domain, result]));
  const missingDomains = requiredDomains.filter((domain) => !byDomain.has(domain));
  const failedDomains = requiredDomains.filter((domain) => byDomain.get(domain)?.status === 'failed');
  const retainedDomains = requiredDomains.filter((domain) => byDomain.get(domain)?.status === 'retained');
  const deletedDomains = input.domains
    .filter((result) => result.status === 'deleted' && requiredDomains.includes(result.domain))
    .map((result) => result.domain);
  const verified =
    input.serverConfirmed && missingDomains.length === 0 && failedDomains.length === 0 && retainedDomains.length === 0;

  return {
    verified,
    missingDomains,
    failedDomains,
    retainedDomains,
    receipt: {
      type: 'account_deletion_receipt',
      requestId: input.requestId,
      requestedAt: input.requestedAt,
      completedAt: input.completedAt,
      verified,
      deletedDomains,
      retained: input.domains
        .filter((result) => result.status === 'retained')
        .map((result) => ({ domain: result.domain, retainedReason: result.retainedReason })),
      failures: input.domains
        .filter((result) => result.status === 'failed')
        .map((result) => ({ domain: result.domain, error: result.error })),
    },
  };
}

export function serializeDeletionReceipt(receipt: DeletionReceipt): string {
  return JSON.stringify(receipt, null, 2);
}

export function deletionResult(domain: DeletionDomain, status: DeletionStatus, detail = ''): DeletionDomainResult {
  return {
    domain,
    status,
    ...(status === 'retained' ? { retainedReason: detail } : {}),
    ...(status === 'failed' ? { error: detail } : {}),
  };
}
