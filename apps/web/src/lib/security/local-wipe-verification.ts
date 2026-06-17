// SPDX-License-Identifier: BUSL-1.1

export type LocalWipeArea =
  | 'opfs'
  | 'indexeddb'
  | 'caches'
  | 'service-workers'
  | 'local-storage'
  | 'session-storage'
  | 'sync-queues'
  | 'audit-log'
  | 'consent-records';

export type LocalWipeStatus = 'deleted' | 'failed' | 'not_applicable';
export type DeletionRunMode = 'online' | 'offline' | 'demo';

export interface LocalWipeOutcome {
  readonly area: LocalWipeArea;
  readonly status: LocalWipeStatus;
  readonly detail?: string;
}

export interface LocalWipeReceipt {
  readonly mode: DeletionRunMode;
  readonly verified: boolean;
  readonly deleted: readonly LocalWipeArea[];
  readonly failed: readonly Pick<LocalWipeOutcome, 'area' | 'detail'>[];
  readonly notApplicable: readonly LocalWipeArea[];
  readonly serverDeletionClaim: 'confirmed' | 'not_claimed';
  readonly userCopy: string;
}

export const REQUIRED_LOCAL_WIPE_AREAS: readonly LocalWipeArea[] = [
  'opfs',
  'indexeddb',
  'caches',
  'service-workers',
  'local-storage',
  'session-storage',
  'sync-queues',
  'audit-log',
  'consent-records',
];

export function buildLocalWipeReceipt(
  mode: DeletionRunMode,
  outcomes: readonly LocalWipeOutcome[],
  requiredAreas: readonly LocalWipeArea[] = REQUIRED_LOCAL_WIPE_AREAS,
): LocalWipeReceipt {
  const byArea = new Map(outcomes.map((outcome) => [outcome.area, outcome]));
  const missingOutcomes = requiredAreas
    .filter((area) => !byArea.has(area))
    .map((area) => ({ area, status: 'failed', detail: 'No wipe verification was recorded.' }) as const);
  const completeOutcomes = [...outcomes, ...missingOutcomes].filter((outcome) => requiredAreas.includes(outcome.area));
  const failed = completeOutcomes
    .filter((outcome) => outcome.status === 'failed')
    .map((outcome) => ({ area: outcome.area, detail: outcome.detail }));
  const deleted = completeOutcomes.filter((outcome) => outcome.status === 'deleted').map((outcome) => outcome.area);
  const notApplicable = completeOutcomes
    .filter((outcome) => outcome.status === 'not_applicable')
    .map((outcome) => outcome.area);

  return {
    mode,
    verified: failed.length === 0,
    deleted,
    failed,
    notApplicable,
    serverDeletionClaim: mode === 'online' ? 'confirmed' : 'not_claimed',
    userCopy: buildDeletionModeCopy(mode, failed.length),
  };
}

export function buildDeletionModeCopy(mode: DeletionRunMode, failureCount: number): string {
  if (mode === 'demo') {
    return 'Demo data was cleared locally only. No production server deletion is claimed.';
  }
  if (mode === 'offline') {
    return 'Local data was cleared on this device while offline. Server deletion has not been claimed.';
  }
  if (failureCount > 0) {
    return 'Some local areas could not be verified; retry before treating this device as wiped.';
  }
  return 'Local browser data was verified as deleted or not applicable for this device.';
}

export function localWipeOutcome(area: LocalWipeArea, status: LocalWipeStatus, detail?: string): LocalWipeOutcome {
  return { area, status, detail };
}
