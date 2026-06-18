// SPDX-License-Identifier: BUSL-1.1

/** Privacy screen masking and coverage helpers for sensitive finance surfaces. */

export type SensitiveSurfaceCategory =
  | 'amount'
  | 'balance'
  | 'net-worth'
  | 'account-name'
  | 'merchant-name'
  | 'transaction-note'
  | 'chart-label'
  | 'notification'
  | 'search-result'
  | 'recent-activity';

export type PrivacyScreenMode = 'visible' | 'masked' | 'bucketed';
export type PrivacyScreenTrigger = 'manual' | 'background' | 'resume' | 'screen-share';

export interface SensitiveSurfaceDescriptor {
  readonly id: string;
  readonly categories: readonly SensitiveSurfaceCategory[];
  readonly masked: boolean;
  readonly exportSurface?: boolean;
}

export interface PrivacyCoverageReport {
  readonly safe: boolean;
  readonly unmaskedSurfaceIds: readonly string[];
  readonly unmaskedCategories: readonly SensitiveSurfaceCategory[];
}

export interface PrivacyScreenAutoEnableOptions {
  readonly enabled: boolean;
  readonly autoEnableOnBackground: boolean;
  readonly autoEnableOnScreenShare: boolean;
}

const DEFAULT_MASKS: Readonly<Record<SensitiveSurfaceCategory, string>> = {
  amount: '•••',
  balance: '•••',
  'net-worth': '•••',
  'account-name': 'Hidden account',
  'merchant-name': 'Hidden merchant',
  'transaction-note': 'Hidden note',
  'chart-label': 'Hidden label',
  notification: 'Hidden notification',
  'search-result': 'Hidden result',
  'recent-activity': 'Hidden activity',
};

export function maskPrivacyScreenValue(
  value: string,
  category: SensitiveSurfaceCategory,
  mode: PrivacyScreenMode,
): string {
  if (mode === 'visible') return value;
  if (
    mode === 'bucketed' &&
    (category === 'amount' || category === 'balance' || category === 'net-worth')
  ) {
    return 'Approximate amount';
  }
  return DEFAULT_MASKS[category];
}

export function evaluatePrivacyScreenCoverage(
  surfaces: readonly SensitiveSurfaceDescriptor[],
): PrivacyCoverageReport {
  const relevantSurfaces = surfaces.filter((surface) => !surface.exportSurface);
  const unmasked = relevantSurfaces.filter(
    (surface) => surface.categories.length > 0 && !surface.masked,
  );
  const categories = new Set<SensitiveSurfaceCategory>();
  for (const surface of unmasked) {
    for (const category of surface.categories) categories.add(category);
  }

  return {
    safe: unmasked.length === 0,
    unmaskedSurfaceIds: unmasked.map((surface) => surface.id),
    unmaskedCategories: [...categories].sort(),
  };
}

export function shouldAutoEnablePrivacyScreen(
  trigger: PrivacyScreenTrigger,
  options: PrivacyScreenAutoEnableOptions,
): boolean {
  if (!options.enabled) return false;
  if (trigger === 'background' || trigger === 'resume') return options.autoEnableOnBackground;
  if (trigger === 'screen-share') return options.autoEnableOnScreenShare;
  return false;
}
