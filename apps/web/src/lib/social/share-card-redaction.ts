// SPDX-License-Identifier: BUSL-1.1

export type ShareCardType =
  'goal-milestone' | 'goal-completion' | 'badge-unlock' | 'streak-milestone';
export type RedactionPolicy =
  'amount-hidden' | 'percent-only' | 'nickname-only' | 'private-household';

export interface ShareCardPayload {
  readonly type: ShareCardType;
  readonly title: string;
  readonly nickname: string;
  readonly amountCents?: number;
  readonly percentComplete?: number;
  readonly accountName?: string;
  readonly householdName?: string;
}

export interface RedactedShareCard {
  readonly title: string;
  readonly displayName: string;
  readonly amountCents: number | null;
  readonly percentComplete: number | null;
  readonly accountName: null;
  readonly householdName: null;
}

export function redactShareCard(
  payload: ShareCardPayload,
  policy: RedactionPolicy,
): RedactedShareCard {
  return {
    title: payload.title,
    displayName:
      policy === 'nickname-only' || policy === 'private-household'
        ? payload.nickname
        : payload.nickname,
    amountCents:
      policy === 'amount-hidden' || policy === 'percent-only' || policy === 'private-household'
        ? null
        : (payload.amountCents ?? null),
    percentComplete:
      policy === 'amount-hidden'
        ? (payload.percentComplete ?? null)
        : policy === 'percent-only'
          ? (payload.percentComplete ?? null)
          : null,
    accountName: null,
    householdName: null,
  };
}
