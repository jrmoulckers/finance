// SPDX-License-Identifier: BUSL-1.1

import type { MessageCatalog } from './catalog-loader';

export const BETA_CRITICAL_MESSAGE_IDS = {
  navigation: ['nav.dashboard', 'nav.accounts', 'nav.transactions', 'nav.budgets', 'nav.settings'],
  onboarding: [
    'onboarding.welcome.title',
    'onboarding.welcome.body',
    'onboarding.action.getStarted',
  ],
  accounts: ['accounts.empty.title', 'accounts.empty.body', 'accounts.action.add'],
  transactions: ['transactions.empty.title', 'transactions.empty.body', 'transactions.action.add'],
  budgets: ['budgets.empty.title', 'budgets.empty.body', 'budgets.action.create'],
  settings: [
    'settings.preferences.title',
    'settings.preferences.currency.label',
    'settings.preferences.theme.label',
  ],
  commonErrors: ['errors.offline', 'errors.unexpected', 'errors.validation'],
} as const;

export type BetaCriticalArea = keyof typeof BETA_CRITICAL_MESSAGE_IDS;

export interface BetaCriticalCompleteness {
  readonly total: number;
  readonly translated: number;
  readonly missing: readonly string[];
  readonly completionRatio: number;
}

export function getBetaCriticalMessageIds(): readonly string[] {
  return Object.values(BETA_CRITICAL_MESSAGE_IDS).flat();
}

export function getBetaCriticalCompleteness(catalog: MessageCatalog): BetaCriticalCompleteness {
  const ids = getBetaCriticalMessageIds();
  const missing = ids.filter((id) => !Object.prototype.hasOwnProperty.call(catalog, id));
  const translated = ids.length - missing.length;
  return {
    total: ids.length,
    translated,
    missing,
    completionRatio: ids.length === 0 ? 1 : translated / ids.length,
  };
}
