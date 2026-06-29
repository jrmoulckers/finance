// SPDX-License-Identifier: BUSL-1.1

/**
 * ITIN-aware onboarding profile model and tailoring logic.
 *
 * Newcomers to the US may file taxes with an ITIN instead of an SSN, work a mix
 * of W-2 and 1099 jobs, and be new to ideas like withholding and 401(k) plans.
 * This module captures only a privacy-safe *category* for the person's tax-ID
 * status and how they earn money — never a real ID number — and turns those
 * categories into plain-language budgeting tips and a set of explainers to
 * surface.
 *
 * Everything here is a pure function so it is easy to test and reuse. The output
 * is deterministic and ordered for predictable, accessible rendering.
 *
 * References: issue #2178
 */

import {
  NEWCOMER_EXPLAINER_KEYS,
  type NewcomerExplainerKey,
} from '../education/newcomer-explainers';

/** Privacy-safe tax-ID category. No real ID numbers are ever collected. */
export const TAX_ID_STATUSES = ['ssn', 'itin', 'none', 'unspecified'] as const;
export type TaxIdStatus = (typeof TAX_ID_STATUSES)[number];

/** How the person earns money. `unspecified` means they chose not to say. */
export const INCOME_TYPES = ['w2', '1099', 'hourly', 'seasonal', 'mixed', 'unspecified'] as const;
export type IncomeType = (typeof INCOME_TYPES)[number];

export interface NewcomerProfile {
  taxIdStatus: TaxIdStatus;
  incomeType: IncomeType;
}

export interface NewcomerGuidance {
  /** Tailored, plain-language budgeting tips. */
  tips: string[];
  /** Explainers to surface, in canonical order with duplicates removed. */
  explainers: NewcomerExplainerKey[];
  /** Short, friendly summary of what was tailored. */
  summary: string;
}

export const DEFAULT_NEWCOMER_PROFILE: NewcomerProfile = {
  taxIdStatus: 'unspecified',
  incomeType: 'unspecified',
};

export const TAX_ID_STATUS_LABELS: Record<TaxIdStatus, string> = {
  ssn: 'Social Security Number (SSN)',
  itin: 'Individual Taxpayer Identification Number (ITIN)',
  none: 'No tax ID yet',
  unspecified: 'Prefer not to say',
};

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  w2: 'W-2 job',
  '1099': '1099 or contract work',
  hourly: 'Hourly pay',
  seasonal: 'Seasonal work',
  mixed: 'A mix of these',
  unspecified: 'Prefer not to say',
};

const GENERIC_BUDGETING_TIPS: readonly string[] = [
  'Start by listing the bills that stay about the same each month, then plan flexible spending around them.',
  'Keep a small buffer for tight weeks so a late or smaller paycheck does not turn into an emergency.',
];

export function isTaxIdStatus(value: string): value is TaxIdStatus {
  return (TAX_ID_STATUSES as readonly string[]).includes(value);
}

export function isIncomeType(value: string): value is IncomeType {
  return (INCOME_TYPES as readonly string[]).includes(value);
}

function incomeBudgetingTips(incomeType: IncomeType): string[] {
  switch (incomeType) {
    case 'w2':
      return [
        'A W-2 paycheck is usually steady, so budgeting around your regular pay date works well.',
        'Check whether benefits like health insurance or a 401(k) come out before payday, then budget from your take-home pay.',
      ];
    case '1099':
      return [
        'With 1099 work no taxes are taken out for you, so set aside about a quarter to a third of each payment for taxes in a separate place.',
        'Income can rise and fall, so plan around a lower, safer estimate and treat anything extra as a bonus.',
      ];
    case 'hourly':
      return [
        'When hours change week to week, budget on your lowest expected hours so a slow week still covers the essentials.',
        'In weeks with extra hours, move the difference into savings or a buffer instead of raising your regular spending.',
      ];
    case 'seasonal':
      return [
        'During busy months, save part of the extra income to help cover the slower months ahead.',
        'Spread big yearly costs across the whole year so they do not all land during a slow season.',
      ];
    case 'mixed':
      return [
        'When you mix W-2 and 1099 or seasonal work, track each source separately so you can see what is steady and what varies.',
        'Use steady income for fixed bills, treat variable income as flexible, and set aside taxes from any 1099 pay.',
      ];
    case 'unspecified':
    default:
      return [...GENERIC_BUDGETING_TIPS];
  }
}

function taxIdTips(taxIdStatus: TaxIdStatus): string[] {
  switch (taxIdStatus) {
    case 'itin':
      return [
        'You can budget, save, and plan with an ITIN. It is the number used to file taxes when you do not have an SSN.',
        'Some banks and credit unions open accounts for ITIN holders, so it is worth asking which documents they accept.',
      ];
    case 'ssn':
      return [
        'If your job offers a 401(k) or similar plan, you can usually join and may get matching contributions. It is worth checking.',
      ];
    case 'none':
      return [
        'You can still make a budget and build savings now, and revisit tax questions whenever your situation changes.',
      ];
    case 'unspecified':
    default:
      return [];
  }
}

function incomeExplainers(incomeType: IncomeType): NewcomerExplainerKey[] {
  switch (incomeType) {
    case 'w2':
      return ['w2', 'taxWithholding', 'retirement401k'];
    case '1099':
      return ['form1099', 'taxWithholding'];
    case 'hourly':
      return ['w2', 'taxWithholding'];
    case 'seasonal':
      return ['w2', 'form1099', 'taxWithholding'];
    case 'mixed':
      return ['w2', 'form1099', 'taxWithholding', 'retirement401k'];
    case 'unspecified':
    default:
      return ['w2', 'form1099', 'taxWithholding'];
  }
}

function taxIdExplainers(taxIdStatus: TaxIdStatus): NewcomerExplainerKey[] {
  switch (taxIdStatus) {
    case 'itin':
      return ['itinBasics'];
    case 'ssn':
      return ['retirement401k'];
    case 'none':
    case 'unspecified':
    default:
      return [];
  }
}

function buildSummary(taxIdStatus: TaxIdStatus, incomeType: IncomeType): string {
  if (taxIdStatus === 'unspecified' && incomeType === 'unspecified') {
    return 'Here are general money basics to get you started. Share more whenever you like. Nothing here is required, and nothing is ever shared.';
  }

  const parts: string[] = [];
  if (incomeType !== 'unspecified') {
    parts.push(`how you earn money (${INCOME_TYPE_LABELS[incomeType]})`);
  }
  if (taxIdStatus !== 'unspecified') {
    parts.push(`your tax-ID type (${TAX_ID_STATUS_LABELS[taxIdStatus]})`);
  }

  return `Tips below are tailored to ${parts.join(' and ')}. These choices stay private on this device.`;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * Pure tailoring function: turns a privacy-safe profile into plain-language
 * budgeting tips and the explainers to surface. Missing fields default to
 * `unspecified`, which yields a safe, generic set of basics.
 */
export function getNewcomerGuidance(profile: Partial<NewcomerProfile> = {}): NewcomerGuidance {
  const taxIdStatus = profile.taxIdStatus ?? 'unspecified';
  const incomeType = profile.incomeType ?? 'unspecified';

  const tips = dedupeStrings([...incomeBudgetingTips(incomeType), ...taxIdTips(taxIdStatus)]);

  const explainerSet = new Set<NewcomerExplainerKey>([
    ...incomeExplainers(incomeType),
    ...taxIdExplainers(taxIdStatus),
  ]);
  const explainers = NEWCOMER_EXPLAINER_KEYS.filter((key) => explainerSet.has(key));

  return {
    tips,
    explainers,
    summary: buildSummary(taxIdStatus, incomeType),
  };
}
