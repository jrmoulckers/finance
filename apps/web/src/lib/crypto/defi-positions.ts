// SPDX-License-Identifier: BUSL-1.1

/** Manual-entry DeFi position model separate from spot holdings. References: issue #2689 */
export type DeFiPositionType =
  'staking' | 'liquidity-pool' | 'lending' | 'borrow' | 'vault' | 'farm';
export type LockStatus = 'liquid' | 'locked' | 'unbonding' | 'withdrawal-pending';

export interface RewardBalance {
  readonly token: string;
  readonly quantity: number;
  readonly valueCents?: number;
}

export interface DeFiPosition {
  readonly id: string;
  readonly type: DeFiPositionType;
  readonly chain: string;
  readonly protocol: string;
  readonly label: string;
  readonly principalValueCents: number;
  readonly currency: string;
  readonly lockStatus: LockStatus;
  readonly apyBps?: number;
  readonly rewardTokens: readonly RewardBalance[];
  readonly valuationAsOf: string;
}

export interface DeFiTotalsOptions {
  readonly excludeLocked?: boolean;
  readonly excludeUnbonding?: boolean;
}

export interface DeFiTotals {
  readonly totalValueCents: number;
  readonly availableValueCents: number;
  readonly lockedValueCents: number;
  readonly rewardsValueCents: number;
  readonly byProtocol: Readonly<Record<string, number>>;
}

function rewardsValue(position: DeFiPosition): number {
  return position.rewardTokens.reduce((sum, reward) => sum + (reward.valueCents ?? 0), 0);
}

function isUnavailable(position: DeFiPosition, options: DeFiTotalsOptions): boolean {
  if (options.excludeLocked && position.lockStatus === 'locked') return true;
  if (
    options.excludeUnbonding &&
    (position.lockStatus === 'unbonding' || position.lockStatus === 'withdrawal-pending')
  )
    return true;
  return false;
}

export function calculateDeFiTotals(
  positions: readonly DeFiPosition[],
  options: DeFiTotalsOptions = {},
): DeFiTotals {
  let totalValueCents = 0;
  let availableValueCents = 0;
  let lockedValueCents = 0;
  let rewardsValueCents = 0;
  const byProtocol: Record<string, number> = {};

  for (const position of positions) {
    const rewardValue = rewardsValue(position);
    const value = position.principalValueCents + rewardValue;
    totalValueCents += value;
    rewardsValueCents += rewardValue;
    byProtocol[position.protocol] = (byProtocol[position.protocol] ?? 0) + value;
    if (isUnavailable(position, options)) lockedValueCents += value;
    else availableValueCents += value;
  }

  return { totalValueCents, availableValueCents, lockedValueCents, rewardsValueCents, byProtocol };
}

export function upsertManualDeFiPosition(
  positions: readonly DeFiPosition[],
  next: DeFiPosition,
): readonly DeFiPosition[] {
  const withoutExisting = positions.filter((position) => position.id !== next.id);
  return [...withoutExisting, next].sort(
    (a, b) => a.protocol.localeCompare(b.protocol) || a.label.localeCompare(b.label),
  );
}
