// SPDX-License-Identifier: BUSL-1.1

export const DEMO_MODE_TAG = 'demo-mode';

export interface DemoTaggedRecord {
  readonly id: string;
  readonly tags?: readonly string[];
  readonly metadata?: Readonly<Record<string, string | boolean | number>>;
}

export interface DemoModeBanner {
  readonly visible: boolean;
  readonly tone: 'info';
  readonly text: string;
  readonly resetLabel: string;
  readonly exitLabel: string;
  readonly ariaLabel: string;
}

export interface DemoResetResult<T extends DemoTaggedRecord> {
  readonly keptRecords: readonly T[];
  readonly deletedDemoIds: readonly string[];
}

export function isDemoTagged(record: DemoTaggedRecord): boolean {
  return record.tags?.includes(DEMO_MODE_TAG) === true || record.metadata?.demoMode === true;
}

export function buildDemoModeBanner(enabled: boolean): DemoModeBanner {
  return {
    visible: enabled,
    tone: 'info',
    text: enabled
      ? 'Demo mode is using fictional sample finances. Reset or exit before adding real accounts.'
      : 'Demo mode is off.',
    resetLabel: 'Reset demo data',
    exitLabel: 'Exit demo mode',
    ariaLabel: enabled
      ? 'Demo mode banner. Fictional sample data is active.'
      : 'Demo mode is currently off.',
  };
}

export function tagDemoRecords<T extends DemoTaggedRecord>(records: readonly T[]): T[] {
  return records.map((record) => ({
    ...record,
    tags: Array.from(new Set([...(record.tags ?? []), DEMO_MODE_TAG])),
    metadata: { ...(record.metadata ?? {}), demoMode: true },
  }));
}

export function resetDemoRecords<T extends DemoTaggedRecord>(
  records: readonly T[],
): DemoResetResult<T> {
  const keptRecords = records.filter((record) => !isDemoTagged(record));
  return {
    keptRecords,
    deletedDemoIds: records.filter(isDemoTagged).map((record) => record.id),
  };
}

export function buildDemoModeEntryState(params: {
  readonly hasRealAccounts: boolean;
  readonly demoEnabled: boolean;
}): {
  readonly canStartDemo: boolean;
  readonly primaryLabel: string;
  readonly warning?: string;
} {
  if (params.demoEnabled) {
    return { canStartDemo: false, primaryLabel: 'Continue demo' };
  }
  if (params.hasRealAccounts) {
    return {
      canStartDemo: false,
      primaryLabel: 'Demo unavailable',
      warning:
        'Demo mode starts from a clean fictional workspace to avoid mixing with real records.',
    };
  }
  return { canStartDemo: true, primaryLabel: 'Try demo mode' };
}
