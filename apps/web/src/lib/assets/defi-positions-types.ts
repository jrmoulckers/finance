// SPDX-License-Identifier: BUSL-1.1

/**
 * Domain types for the DeFi / locked-position engine (#2172).
 *
 * A "yield farmer" holds assets that are NOT freely spendable spot balances:
 * they are staked, supplied to a liquidity pool, lent out, deposited in a
 * vault, or otherwise locked inside a smart contract. Those positions accrue
 * protocol rewards and may have lock / unbonding states that make part of the
 * portfolio illiquid.
 *
 * This module models those positions separately from spot holdings so the UI
 * can report a "liquid vs locked" split and feed staking / DeFi rewards into
 * the existing income / tax classification concepts (see {@link StakingIncome}).
 *
 * All monetary values are integer cents (smallest fiat unit). These types carry
 * no behaviour — the pure functions live in `./defi-positions`.
 *
 * References: issue #2172
 */

import type { ChainId, LocalDate, StakingIncome } from './types';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The kind of DeFi position, which drives reward-income classification. */
export type DefiPositionKind =
  'STAKING' | 'LIQUIDITY_POOL' | 'LENDING' | 'BORROW' | 'VAULT' | 'FARM';

/**
 * Lock / withdrawal state of a position.
 *
 * - `LIQUID` — withdrawable on demand; counts toward the liquid portfolio.
 * - `LOCKED` — bonded / time-locked inside a contract; counts as locked.
 * - `UNBONDING` — in a cooldown / unbonding window; still locked.
 * - `WITHDRAWAL_PENDING` — withdrawal requested but not yet claimable; locked.
 */
export type DefiLockState = 'LIQUID' | 'LOCKED' | 'UNBONDING' | 'WITHDRAWAL_PENDING';

/** Whether a position's value is currently liquid or locked in a contract. */
export type DefiLiquidityClass = 'LIQUID' | 'LOCKED';

/** A single unclaimed protocol-reward balance with its fiat value. */
export interface DefiRewardToken {
  /** Reward token symbol (e.g. `"CRV"`, `"AERO"`). */
  readonly token: string;
  /** Token quantity accrued (may be fractional). */
  readonly quantity: number;
  /** Fair-market value of the accrued reward, in integer cents. */
  readonly valueCents: number;
}

/**
 * A manual-entry DeFi position separate from spot holdings.
 *
 * Distinct from {@link import('./types').DeFiPosition} (kept for backwards
 * compatibility) so it can carry the chain, lock state, and reward-token
 * exposure that yield farmers need.
 */
export interface DefiPositionEntry {
  readonly id: string;
  /** Protocol name (e.g. `"Lido"`, `"Aave"`, `"Curve"`). */
  readonly protocol: string;
  /** Blockchain network the position lives on (e.g. `"ethereum"`). */
  readonly chain: ChainId;
  /** What kind of DeFi activity this position represents. */
  readonly kind: DefiPositionKind;
  /** Human-readable label (e.g. `"stETH staking"`, `"USDC/ETH LP"`). */
  readonly label: string;
  /** Current fiat value of the deposited / locked principal, in cents. */
  readonly principalValueCents: number;
  /** Current lock / unbonding state. */
  readonly lockState: DefiLockState;
  /** Annual percentage yield as a percent (e.g. `4.2` for 4.2% APY). */
  readonly apyPercent?: number;
  /** ISO date the position unlocks / finishes unbonding, when known. */
  readonly unlockDate?: LocalDate;
  /** Unclaimed protocol rewards accrued by this position. */
  readonly rewards?: readonly DefiRewardToken[];
  /** ISO date the principal / reward valuation was taken. */
  readonly valuationAsOf?: LocalDate;
}

// ---------------------------------------------------------------------------
// Derived views & summaries
// ---------------------------------------------------------------------------

/** A position enriched with computed value and classification fields. */
export interface DefiPositionView {
  readonly id: string;
  readonly protocol: string;
  readonly chain: ChainId;
  readonly kind: DefiPositionKind;
  readonly kindLabel: string;
  readonly label: string;
  readonly lockState: DefiLockState;
  readonly lockStateLabel: string;
  /** Whether the position's value is liquid or locked. */
  readonly liquidityClass: DefiLiquidityClass;
  readonly principalValueCents: number;
  /** Sum of all unclaimed reward values, in cents. */
  readonly rewardValueCents: number;
  /** `principalValueCents + rewardValueCents`. */
  readonly totalValueCents: number;
  readonly apyPercent?: number;
  readonly unlockDate?: LocalDate;
  readonly rewards: readonly DefiRewardToken[];
}

/** Liquid vs locked breakdown across a set of DeFi positions. */
export interface DefiLiquidityBreakdown {
  /** Total value of positions classified as liquid, in cents. */
  readonly liquidValueCents: number;
  /** Total value of positions classified as locked, in cents. */
  readonly lockedValueCents: number;
  /** Total unclaimed reward value across all positions, in cents. */
  readonly pendingRewardValueCents: number;
  /** `liquidValueCents + lockedValueCents` (principal + rewards), in cents. */
  readonly totalExposureCents: number;
  /** Liquid share of total exposure, as a 2-decimal percent. */
  readonly liquidPercent: number;
  /** Locked share of total exposure, as a 2-decimal percent. */
  readonly lockedPercent: number;
}

/** Aggregated exposure for a single protocol. */
export interface DefiProtocolSummary {
  readonly protocol: string;
  readonly totalValueCents: number;
  readonly liquidValueCents: number;
  readonly lockedValueCents: number;
  readonly pendingRewardValueCents: number;
  readonly positionCount: number;
  /** Chains this protocol's positions span, sorted alphabetically. */
  readonly chains: readonly string[];
}

/** Aggregated exposure for a single chain. */
export interface DefiChainSummary {
  readonly chain: string;
  readonly totalValueCents: number;
  readonly liquidValueCents: number;
  readonly lockedValueCents: number;
  readonly pendingRewardValueCents: number;
  readonly positionCount: number;
}

/** Full DeFi portfolio summary produced by {@link summarizeDefiPortfolio}. */
export interface DefiPortfolioSummary {
  readonly positions: readonly DefiPositionView[];
  readonly breakdown: DefiLiquidityBreakdown;
  readonly byProtocol: readonly DefiProtocolSummary[];
  readonly byChain: readonly DefiChainSummary[];
  /** Reward income records for downstream income / tax classification. */
  readonly rewardIncome: readonly StakingIncome[];
  readonly positionCount: number;
}

/**
 * The combined liquid-vs-locked split of an entire portfolio, blending freely
 * spendable spot holdings with DeFi positions.
 */
export interface PortfolioLiquiditySplit {
  /** Spot-holding value treated as liquid, in cents. */
  readonly spotLiquidValueCents: number;
  /** DeFi value classified as liquid, in cents. */
  readonly defiLiquidValueCents: number;
  /** DeFi value classified as locked, in cents. */
  readonly defiLockedValueCents: number;
  /** Spot liquid + DeFi liquid, in cents. */
  readonly liquidValueCents: number;
  /** DeFi locked, in cents. */
  readonly lockedValueCents: number;
  /** Total unclaimed DeFi reward value, in cents. */
  readonly pendingRewardValueCents: number;
  /** Liquid + locked, in cents. */
  readonly totalValueCents: number;
  /** Liquid share of the total, as a 2-decimal percent. */
  readonly liquidPercent: number;
  /** Locked share of the total, as a 2-decimal percent. */
  readonly lockedPercent: number;
}
