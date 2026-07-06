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

export { summarizeRemittances, summarizeByRecipient } from './remittance-summary';
export type { RemittanceSummary, RemittanceRecipientBreakdown } from './remittance-summary';
