// SPDX-License-Identifier: BUSL-1.1

export interface EntityCandidate {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
}

export interface TransactionDraftInput {
  readonly phrase: string;
  readonly amountCents: number | null;
  readonly merchant: string | null;
  readonly category: string | null;
  readonly account: string | null;
  readonly date: string | null;
  readonly offline: boolean;
}

export interface TransactionDraft {
  readonly amountCents: number | null;
  readonly merchantId: string | null;
  readonly categoryId: string | null;
  readonly accountId: string | null;
  readonly date: string | null;
  readonly confidence: number;
  readonly ambiguities: readonly string[];
  readonly validationErrors: readonly string[];
  readonly requiresConfirmation: boolean;
  readonly offline: boolean;
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function mapEntity(value: string | null, candidates: readonly EntityCandidate[]): string | null {
  if (value === null) return null;
  const normalized = normalize(value);
  return (
    candidates.find(
      (candidate) =>
        normalize(candidate.name) === normalized ||
        candidate.aliases.map(normalize).includes(normalized),
    )?.id ?? null
  );
}

export function buildTransactionDraft(
  input: TransactionDraftInput,
  merchants: readonly EntityCandidate[],
  categories: readonly EntityCandidate[],
  accounts: readonly EntityCandidate[],
): TransactionDraft {
  const merchantId = mapEntity(input.merchant, merchants);
  const categoryId = mapEntity(input.category, categories);
  const accountId = mapEntity(input.account, accounts);
  const validationErrors = [
    ...(input.amountCents === null || input.amountCents <= 0 ? ['missing-amount'] : []),
    ...(merchantId === null ? ['missing-merchant'] : []),
    ...(categoryId === null ? ['missing-category'] : []),
    ...(accountId === null ? ['missing-account'] : []),
  ];
  const ambiguities = [
    ...(input.merchant !== null && merchantId === null ? ['merchant'] : []),
    ...(input.category !== null && categoryId === null ? ['category'] : []),
    ...(input.account !== null && accountId === null ? ['account'] : []),
  ];
  const populated = [
    input.amountCents !== null,
    merchantId !== null,
    categoryId !== null,
    accountId !== null,
    input.date !== null,
  ].filter(Boolean).length;
  return {
    amountCents: input.amountCents,
    merchantId,
    categoryId,
    accountId,
    date: input.date,
    confidence: populated / 5,
    ambiguities,
    validationErrors,
    requiresConfirmation: validationErrors.length > 0 || ambiguities.length > 0 || input.offline,
    offline: input.offline,
  };
}

export function privacySafeParseFailure(
  reason: string,
): Pick<TransactionDraft, 'validationErrors' | 'requiresConfirmation' | 'confidence'> {
  return { validationErrors: [reason], requiresConfirmation: true, confidence: 0 };
}
