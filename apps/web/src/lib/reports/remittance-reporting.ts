// SPDX-License-Identifier: BUSL-1.1

export interface RemittanceMetadataInput {
  readonly transactionId: string;
  readonly sentAt: string;
  readonly sendAmountMinor: number;
  readonly sendCurrency: string;
  readonly feeAmountMinor: number;
  readonly provider: string;
  readonly recipient: string;
  readonly corridor: string;
  readonly receivedAmountMinor: number;
  readonly receivedCurrency: string;
  readonly exchangeRate?: number;
  readonly rateTimestamp: string;
}

export interface RemittanceMetadata extends RemittanceMetadataInput {
  readonly exchangeRate: number;
  readonly effectiveRateIncludingFee: number;
  readonly customFields: Readonly<Record<string, string | number>>;
}

export interface RemittanceMonthlyTotals {
  readonly month: string;
  readonly sendCurrency: string;
  readonly receivedCurrency: string;
  readonly sentAmountMinor: number;
  readonly feeAmountMinor: number;
  readonly receivedAmountMinor: number;
  readonly averageExchangeRate: number;
  readonly effectiveRateIncludingFee: number;
  readonly count: number;
  readonly byRecipient: readonly RemittanceGroupTotal[];
  readonly byCorridor: readonly RemittanceGroupTotal[];
}

export interface RemittanceGroupTotal {
  readonly key: string;
  readonly sentAmountMinor: number;
  readonly feeAmountMinor: number;
  readonly receivedAmountMinor: number;
  readonly count: number;
}

function assertMinorUnits(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer minor-unit amount.`);
  }
}

function roundRate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function monthKey(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
    throw new Error('Remittance sentAt must start with an ISO local date.');
  }
  return date.slice(0, 7);
}

export function buildRemittanceMetadata(input: RemittanceMetadataInput): RemittanceMetadata {
  assertMinorUnits('sendAmountMinor', input.sendAmountMinor);
  assertMinorUnits('feeAmountMinor', input.feeAmountMinor);
  assertMinorUnits('receivedAmountMinor', input.receivedAmountMinor);
  if (input.sendAmountMinor === 0) throw new Error('sendAmountMinor must be greater than zero.');
  if (!input.provider.trim()) throw new Error('provider is required.');
  if (!input.recipient.trim()) throw new Error('recipient is required.');
  if (!input.corridor.trim()) throw new Error('corridor is required.');

  const exchangeRate = input.exchangeRate ?? input.receivedAmountMinor / input.sendAmountMinor;
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error('exchangeRate must be positive when provided.');
  }

  const effectiveRateIncludingFee =
    input.receivedAmountMinor / (input.sendAmountMinor + input.feeAmountMinor);
  const metadata = {
    ...input,
    exchangeRate: roundRate(exchangeRate),
    effectiveRateIncludingFee: roundRate(effectiveRateIncludingFee),
  };

  return {
    ...metadata,
    customFields: serializeRemittanceCustomFields(metadata),
  };
}

export function serializeRemittanceCustomFields(
  metadata: Omit<RemittanceMetadata, 'customFields'>,
): Readonly<Record<string, string | number>> {
  return {
    remittanceProvider: metadata.provider,
    remittanceRecipient: metadata.recipient,
    remittanceCorridor: metadata.corridor,
    remittanceSendAmountMinor: metadata.sendAmountMinor,
    remittanceSendCurrency: metadata.sendCurrency,
    remittanceFeeAmountMinor: metadata.feeAmountMinor,
    remittanceReceivedAmountMinor: metadata.receivedAmountMinor,
    remittanceReceivedCurrency: metadata.receivedCurrency,
    remittanceExchangeRate: metadata.exchangeRate,
    remittanceEffectiveRateIncludingFee: metadata.effectiveRateIncludingFee,
    remittanceRateTimestamp: metadata.rateTimestamp,
  };
}

function addGroup(
  groups: Map<string, RemittanceGroupTotal>,
  key: string,
  remittance: RemittanceMetadata,
): void {
  const existing = groups.get(key) ?? {
    key,
    sentAmountMinor: 0,
    feeAmountMinor: 0,
    receivedAmountMinor: 0,
    count: 0,
  };
  groups.set(key, {
    key,
    sentAmountMinor: existing.sentAmountMinor + remittance.sendAmountMinor,
    feeAmountMinor: existing.feeAmountMinor + remittance.feeAmountMinor,
    receivedAmountMinor: existing.receivedAmountMinor + remittance.receivedAmountMinor,
    count: existing.count + 1,
  });
}

export function summarizeMonthlyRemittances(params: {
  readonly remittances: readonly RemittanceMetadata[];
  readonly month: string;
  readonly recipient?: string;
  readonly corridor?: string;
}): RemittanceMonthlyTotals {
  const filtered = params.remittances.filter(
    (remittance) =>
      monthKey(remittance.sentAt) === params.month &&
      (params.recipient === undefined || remittance.recipient === params.recipient) &&
      (params.corridor === undefined || remittance.corridor === params.corridor),
  );

  const sentAmountMinor = filtered.reduce((sum, item) => sum + item.sendAmountMinor, 0);
  const feeAmountMinor = filtered.reduce((sum, item) => sum + item.feeAmountMinor, 0);
  const receivedAmountMinor = filtered.reduce((sum, item) => sum + item.receivedAmountMinor, 0);
  const byRecipient = new Map<string, RemittanceGroupTotal>();
  const byCorridor = new Map<string, RemittanceGroupTotal>();
  for (const remittance of filtered) {
    addGroup(byRecipient, remittance.recipient, remittance);
    addGroup(byCorridor, remittance.corridor, remittance);
  }

  const first = filtered[0];
  return {
    month: params.month,
    sendCurrency: first?.sendCurrency ?? 'USD',
    receivedCurrency: first?.receivedCurrency ?? 'MXN',
    sentAmountMinor,
    feeAmountMinor,
    receivedAmountMinor,
    averageExchangeRate: sentAmountMinor > 0 ? roundRate(receivedAmountMinor / sentAmountMinor) : 0,
    effectiveRateIncludingFee:
      sentAmountMinor + feeAmountMinor > 0
        ? roundRate(receivedAmountMinor / (sentAmountMinor + feeAmountMinor))
        : 0,
    count: filtered.length,
    byRecipient: Array.from(byRecipient.values()).sort((a, b) => a.key.localeCompare(b.key)),
    byCorridor: Array.from(byCorridor.values()).sort((a, b) => a.key.localeCompare(b.key)),
  };
}
