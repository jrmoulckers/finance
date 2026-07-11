// SPDX-License-Identifier: BUSL-1.1

/**
 * Public barrel for the remittance tracking module (issue #2170).
 *
 * Pure FX/fee math plus aggregation helpers and the domain types. UI surfaces
 * and the `useRemittances` hook import from here.
 */

export type {
  RemittanceFeeModel,
  RemittanceRecipient,
  RemittanceQuoteInput,
  RemittanceQuote,
  RemittanceRecord,
  RemittanceFrequency,
  RemittanceRecurrence,
  CreateRemittanceInput,
} from './remittance-types';

export {
  roundHalfUp,
  convertMinorUnits,
  quoteRemittance,
  amountReceivedMinor,
  effectiveFxRate,
  totalCostMinor,
} from './remittance-math';

export {
  REMITTANCE_FREQUENCIES,
  REMITTANCE_FREQUENCY_LABELS,
  remittanceTotalPaidMinor,
  advanceRemittanceDate,
  projectUpcomingRemittances,
} from './remittance-schedule';
export type { UpcomingRemittance } from './remittance-schedule';

export { summarizeRemittances, summarizeByRecipient } from './remittance-summary';
export type { RemittanceSummary, RemittanceRecipientBreakdown } from './remittance-summary';
