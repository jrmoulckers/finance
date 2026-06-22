// SPDX-License-Identifier: BUSL-1.1

/**
 * Domain types for equity compensation, crypto, alternative assets,
 * passive income, and ESG scoring engines.
 *
 * All monetary values are integer cents to avoid floating-point errors.
 * Dates use ISO-8601 strings (YYYY-MM-DD) for calendar dates.
 *
 * References: issues #1667, #1672, #1696, #1704, #1710, #1712, #1717, #1739
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** ISO-8601 local date string (e.g. "2024-01-15"). */
export type LocalDate = string;

// ---------------------------------------------------------------------------
// Crypto (#1667, #1672)
// ---------------------------------------------------------------------------

/** Source of a crypto holding. */
export type CryptoSource = 'EXCHANGE' | 'WALLET' | 'DEFI' | 'STAKING';

/**
 * Blockchain network identifier used for chain-aware cost-basis tracking.
 *
 * A free-form lowercase slug such as `"ethereum"`, `"arbitrum"`, `"optimism"`,
 * `"polygon"`, `"solana"`, or `"bitcoin"`. Per-chain identity matters because,
 * under IRS Rev. Proc. 2024-28, cost basis must be tracked per wallet/account
 * rather than universally pooled across all holdings (effective 2025).
 */
export type ChainId = string;

/** A single crypto holding on an exchange or wallet. */
export interface CryptoHolding {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly quantity: number;
  readonly costBasisCents: number;
  readonly currentPriceCents: number;
  readonly source: CryptoSource;
  readonly sourceLabel: string;
  readonly walletAddress?: string;
}

/** Aggregated portfolio summary for crypto. */
export interface CryptoPortfolioSummary {
  readonly totalValueCents: number;
  readonly totalCostBasisCents: number;
  readonly totalUnrealizedGainLossCents: number;
  readonly totalUnrealizedGainLossPercent: number;
  readonly allocationBySymbol: readonly CryptoAllocation[];
  readonly holdingCount: number;
}

/** Allocation entry for a single coin across all sources. */
export interface CryptoAllocation {
  readonly symbol: string;
  readonly totalValueCents: number;
  readonly totalQuantity: number;
  readonly percent: number;
}

/** Cost-basis lot matching method for crypto. */
export type CryptoLotMethod = 'FIFO' | 'LIFO' | 'HIFO';

/** A crypto tax lot representing a single acquisition. */
export interface CryptoTaxLot {
  readonly id: string;
  readonly symbol: string;
  readonly quantity: number;
  readonly acquisitionDate: LocalDate;
  readonly costBasisCents: number;
  readonly source: CryptoSource;
  /** Chain the lot lives on (optional; untagged lots are a global pool). */
  readonly chain?: ChainId;
}

/** Result of matching lots against a disposal. */
export interface CryptoDisposalResult {
  readonly disposalDate: LocalDate;
  readonly proceedsCents: number;
  readonly totalCostBasisCents: number;
  readonly gainLossCents: number;
  readonly shortTermGainLossCents: number;
  readonly longTermGainLossCents: number;
  readonly matchedLots: readonly MatchedLot[];
}

/** A matched lot with shares consumed and gain/loss. */
export interface MatchedLot {
  readonly lotId: string;
  readonly symbol: string;
  readonly quantityUsed: number;
  readonly costBasisCents: number;
  readonly isLongTerm: boolean;
  readonly holdingDays: number;
  readonly gainLossCents: number;
  /** Chain the consumed lot lived on (when chain-aware tracking is used). */
  readonly chain?: ChainId;
}

/** Term classification. */
export type GainTerm = 'SHORT_TERM' | 'LONG_TERM';

/** Staking or DeFi yield income record. */
export interface StakingIncome {
  readonly id: string;
  readonly symbol: string;
  readonly quantity: number;
  readonly fairMarketValueCents: number;
  readonly dateReceived: LocalDate;
  readonly type: 'STAKING' | 'DEFI_YIELD' | 'AIRDROP' | 'MINING';
  readonly protocol?: string;
}

/** DeFi position (LP, lending, etc.). */
export interface DeFiPosition {
  readonly id: string;
  readonly protocol: string;
  readonly poolName: string;
  readonly depositedValueCents: number;
  readonly currentValueCents: number;
  readonly rewardsPendingCents: number;
  readonly apy: number;
}

/** Crypto wash-sale alert. */
export interface CryptoWashSaleAlert {
  readonly symbol: string;
  readonly disposalDate: LocalDate;
  readonly reacquisitionDate: LocalDate;
  readonly disallowedLossCents: number;
}

/** Annual crypto tax summary. */
export interface CryptoTaxSummary {
  readonly taxYear: number;
  readonly shortTermGainLossCents: number;
  readonly longTermGainLossCents: number;
  readonly totalGainLossCents: number;
  readonly ordinaryIncomeCents: number;
  readonly totalDisposals: number;
  readonly washSaleAlerts: readonly CryptoWashSaleAlert[];
}

// ---------------------------------------------------------------------------
// Chain-aware DeFi taxable events (#2168)
// ---------------------------------------------------------------------------

/** Discriminator for chain-aware crypto taxable events. */
export type CryptoEventType = 'SWAP' | 'BRIDGE' | 'AIRDROP';

/**
 * A crypto-to-crypto swap (e.g. ETH → USDC on a DEX).
 *
 * Treated as a taxable disposal of the asset given up at its fair market
 * value, plus the acquisition of the asset received which takes a fresh cost
 * basis equal to that same fair market value.
 */
export interface CryptoSwapEvent {
  readonly id: string;
  readonly type: 'SWAP';
  readonly date: LocalDate;
  /** Chain the swap executes on; disposed lots are drawn from this chain. */
  readonly chain: ChainId;
  readonly fromSymbol: string;
  readonly fromQuantity: number;
  readonly toSymbol: string;
  readonly toQuantity: number;
  /** Fair market value (cents) of the trade — proceeds of the disposed leg. */
  readonly fairMarketValueCents: number;
  /** Destination chain for the acquired asset (defaults to {@link chain}). */
  readonly toChain?: ChainId;
  /** Optional network fee (cents) capitalized into the acquired asset basis. */
  readonly feeCents?: number;
}

/**
 * A same-asset cross-chain bridge (e.g. USDC moved from Ethereum to Arbitrum).
 *
 * Generally NON-taxable: no disposal occurs because the taxpayer retains the
 * same beneficial asset. Cost basis and the original acquisition date are
 * preserved (the holding period "tacks") and re-tagged to the destination
 * chain.
 */
export interface CryptoBridgeEvent {
  readonly id: string;
  readonly type: 'BRIDGE';
  readonly date: LocalDate;
  readonly symbol: string;
  readonly quantity: number;
  readonly fromChain: ChainId;
  readonly toChain: ChainId;
}

/**
 * An airdrop received into a wallet.
 *
 * Treated as ordinary income at the fair market value on the date of receipt
 * (when the taxpayer gains dominion and control). That same FMV establishes
 * the cost basis of the newly created lot.
 */
export interface CryptoAirdropEvent {
  readonly id: string;
  readonly type: 'AIRDROP';
  readonly date: LocalDate;
  readonly chain: ChainId;
  readonly symbol: string;
  readonly quantity: number;
  readonly fairMarketValueCents: number;
}

/** Any chain-aware crypto taxable event. */
export type CryptoTaxableEvent = CryptoSwapEvent | CryptoBridgeEvent | CryptoAirdropEvent;

/** Result of processing a single chain-aware crypto taxable event. */
export interface CryptoEventResult {
  readonly eventId: string;
  readonly eventType: CryptoEventType;
  readonly date: LocalDate;
  /** Primary chain associated with the event (destination for a bridge). */
  readonly chain: ChainId;
  /** Whether the event produced a taxable outcome (disposal or income). */
  readonly taxable: boolean;
  /** Capital-gain disposal detail (present for swaps), else null. */
  readonly disposal: CryptoDisposalResult | null;
  /** New tax lots created by the event (acquired/airdropped/bridged lots). */
  readonly acquiredLots: readonly CryptoTaxLot[];
  /** Ids of lots fully consumed (removed from the lot book) by the event. */
  readonly consumedLotIds: readonly string[];
  /** Ordinary income recognized (airdrops), in cents. */
  readonly ordinaryIncomeCents: number;
  /** Realized capital gain/loss (swaps), in cents. Equals short + long term. */
  readonly realizedGainLossCents: number;
  readonly shortTermGainLossCents: number;
  readonly longTermGainLossCents: number;
  /** Human-readable explanation of the tax treatment applied. */
  readonly note: string;
}

/** Aggregate result of processing a chronological batch of events. */
export interface CryptoEventBatchResult {
  readonly events: readonly CryptoEventResult[];
  /** The lot book after all events are applied. */
  readonly finalLots: readonly CryptoTaxLot[];
  /** Taxable disposals (from swaps), for feeding the annual tax summary. */
  readonly disposals: readonly CryptoDisposalResult[];
  /** Airdrop income records, for feeding the annual tax summary. */
  readonly incomeRecords: readonly StakingIncome[];
  readonly totalRealizedGainLossCents: number;
  readonly totalShortTermGainLossCents: number;
  readonly totalLongTermGainLossCents: number;
  readonly totalOrdinaryIncomeCents: number;
  readonly taxableEventCount: number;
}

// ---------------------------------------------------------------------------
// Alternative assets & collectibles (#1696)
// ---------------------------------------------------------------------------

/** Category of alternative asset. */
export type AltAssetCategory =
  | 'ART'
  | 'WINE'
  | 'CARDS'
  | 'WATCHES'
  | 'VEHICLES'
  | 'PRECIOUS_METALS'
  | 'JEWELRY'
  | 'ANTIQUES'
  | 'OTHER';

/** A single manual valuation point. */
export interface Valuation {
  readonly date: LocalDate;
  readonly valueCents: number;
  readonly source?: string;
}

/** An alternative asset or collectible. */
export interface AlternativeAsset {
  readonly id: string;
  readonly name: string;
  readonly category: AltAssetCategory;
  readonly purchasePriceCents: number;
  readonly purchaseDate: LocalDate;
  readonly currentValueCents: number;
  readonly valuationHistory: readonly Valuation[];
  readonly insuranceValueCents?: number;
  readonly notes?: string;
}

/** Summary of all alternative asset holdings. */
export interface AltAssetSummary {
  readonly totalValueCents: number;
  readonly totalCostCents: number;
  readonly totalAppreciationCents: number;
  readonly totalAppreciationPercent: number;
  readonly totalInsuranceValueCents: number;
  readonly allocationByCategory: readonly AltAssetCategoryAllocation[];
  readonly assetCount: number;
}

/** Allocation by category. */
export interface AltAssetCategoryAllocation {
  readonly category: AltAssetCategory;
  readonly totalValueCents: number;
  readonly count: number;
  readonly percent: number;
}

// ---------------------------------------------------------------------------
// Private investments (#1704)
// ---------------------------------------------------------------------------

/** Status of a private portfolio company. */
export type CompanyStatus = 'ACTIVE' | 'ACQUIRED' | 'IPO' | 'FAILED' | 'WRITTEN_OFF';

/** A capital call or distribution event. */
export interface CapitalEvent {
  readonly id: string;
  readonly date: LocalDate;
  readonly amountCents: number;
  readonly type: 'CALL' | 'DISTRIBUTION';
  readonly notes?: string;
}

/** A private investment in a company or fund. */
export interface PrivateInvestment {
  readonly id: string;
  readonly companyName: string;
  readonly investmentDate: LocalDate;
  readonly investedAmountCents: number;
  readonly currentValueCents: number;
  readonly vintageYear: number;
  readonly status: CompanyStatus;
  readonly capitalEvents: readonly CapitalEvent[];
  readonly notes?: string;
}

/** Summary of private investment portfolio. */
export interface PrivateInvestmentSummary {
  readonly totalInvestedCents: number;
  readonly totalCurrentValueCents: number;
  readonly totalDistributionsCents: number;
  readonly totalCapitalCalledCents: number;
  readonly moic: number;
  readonly irr: number;
  readonly activeCount: number;
  readonly byStatus: ReadonlyMap<CompanyStatus, number>;
}

// ---------------------------------------------------------------------------
// Equity compensation (#1710, #1712)
// ---------------------------------------------------------------------------

/** Type of equity grant. */
export type GrantType = 'RSU' | 'ISO' | 'NSO' | 'ESPP';

/** Vesting frequency. */
export type VestingFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';

/** Vesting schedule definition. */
export interface VestingSchedule {
  readonly grantDate: LocalDate;
  readonly totalShares: number;
  readonly vestingStartDate: LocalDate;
  readonly cliffMonths: number;
  readonly vestingMonths: number;
  readonly frequency: VestingFrequency;
}

/** A single vesting event (shares that vest on a given date). */
export interface VestingEvent {
  readonly date: LocalDate;
  readonly shares: number;
  readonly vestedCumulativeShares: number;
  readonly percentVested: number;
}

/** An equity grant (RSU, option, or ESPP). */
export interface EquityGrant {
  readonly id: string;
  readonly grantType: GrantType;
  readonly companyName: string;
  readonly grantDate: LocalDate;
  readonly totalShares: number;
  readonly vestingSchedule: VestingSchedule;
  readonly currentSharePriceCents: number;
  /** Strike price for ISO/NSO, purchase price for ESPP. */
  readonly strikePriceCents?: number;
  /** ESPP discount rate as decimal (e.g. 0.15 for 15%). */
  readonly esppDiscountRate?: number;
  /** Whether an 83(b) election was filed. */
  readonly election83b?: boolean;
  /** Fair market value at grant date for ISOs (AMT calculation). */
  readonly fmvAtGrantCents?: number;
}

/** Equity compensation summary. */
export interface EquityCompSummary {
  readonly totalGrantedShares: number;
  readonly totalVestedShares: number;
  readonly totalUnvestedShares: number;
  readonly totalVestedValueCents: number;
  readonly totalUnvestedValueCents: number;
  readonly totalSpreadCents: number;
  readonly grants: readonly EquityGrantSummary[];
}

/** Per-grant summary. */
export interface EquityGrantSummary {
  readonly grantId: string;
  readonly grantType: GrantType;
  readonly companyName: string;
  readonly vestedShares: number;
  readonly unvestedShares: number;
  readonly vestedValueCents: number;
  readonly unvestedValueCents: number;
  readonly spreadCents: number;
  readonly nextVestingDate?: LocalDate;
  readonly nextVestingShares?: number;
}

/** Tax implications for an equity event. */
export interface EquityTaxImplication {
  readonly grantType: GrantType;
  readonly ordinaryIncomeCents: number;
  readonly amtAdjustmentCents: number;
  readonly capitalGainCents: number;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Passive income (#1717)
// ---------------------------------------------------------------------------

/** Source of passive income. */
export type PassiveIncomeType =
  | 'DIVIDEND'
  | 'INTEREST'
  | 'RENTAL'
  | 'ROYALTY'
  | 'DISTRIBUTION'
  | 'OTHER';

/** Frequency of passive income payments. */
export type PaymentFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' | 'IRREGULAR';

/** A single passive income record. */
export interface PassiveIncomeRecord {
  readonly id: string;
  readonly source: string;
  readonly type: PassiveIncomeType;
  readonly amountCents: number;
  readonly date: LocalDate;
  readonly symbol?: string;
  readonly isQualified?: boolean;
}

/** A recurring passive income stream. */
export interface PassiveIncomeStream {
  readonly id: string;
  readonly source: string;
  readonly type: PassiveIncomeType;
  readonly amountPerPaymentCents: number;
  readonly frequency: PaymentFrequency;
  readonly startDate: LocalDate;
  readonly endDate?: LocalDate;
  readonly yieldPercent?: number;
  readonly principalCents?: number;
}

/** Monthly calendar entry for dividend/interest payments. */
export interface IncomeCalendarEntry {
  readonly month: number;
  readonly year: number;
  readonly totalCents: number;
  readonly records: readonly PassiveIncomeRecord[];
}

/** Summary of all passive income. */
export interface PassiveIncomeSummary {
  readonly totalAnnualIncomeCents: number;
  readonly totalYtdIncomeCents: number;
  readonly byType: readonly PassiveIncomeByType[];
  readonly monthlyProjectionCents: number;
  readonly annualProjectionCents: number;
  readonly weightedYieldPercent: number;
}

/** Income breakdown by type. */
export interface PassiveIncomeByType {
  readonly type: PassiveIncomeType;
  readonly totalCents: number;
  readonly count: number;
  readonly percent: number;
}

// ---------------------------------------------------------------------------
// ESG scoring (#1739)
// ---------------------------------------------------------------------------

/** ESG score for a single holding. */
export interface ESGScore {
  readonly symbol: string;
  readonly environmental: number;
  readonly social: number;
  readonly governance: number;
  readonly overall: number;
}

/** Category of ethical screen. */
export type ScreenCategory =
  | 'FOSSIL_FUELS'
  | 'TOBACCO'
  | 'ALCOHOL'
  | 'GAMBLING'
  | 'WEAPONS'
  | 'ADULT_ENTERTAINMENT'
  | 'ANIMAL_TESTING'
  | 'NUCLEAR'
  | 'PRIVATE_PRISONS';

/** User preferences for ethical screening. */
export interface ScreeningPreferences {
  readonly excludedCategories: readonly ScreenCategory[];
  readonly minimumOverallScore?: number;
  readonly minimumEnvironmental?: number;
  readonly minimumSocial?: number;
  readonly minimumGovernance?: number;
}

/** An alert when a holding violates screening preferences. */
export interface ScreeningAlert {
  readonly symbol: string;
  readonly companyName: string;
  readonly alertType: 'EXCLUDED_CATEGORY' | 'LOW_SCORE';
  readonly category?: ScreenCategory;
  readonly score?: number;
  readonly threshold?: number;
  readonly message: string;
}

/** Portfolio-level ESG summary. */
export interface PortfolioESGSummary {
  readonly weightedEnvironmental: number;
  readonly weightedSocial: number;
  readonly weightedGovernance: number;
  readonly weightedOverall: number;
  readonly scoredHoldingsCount: number;
  readonly unscoredHoldingsCount: number;
  readonly alerts: readonly ScreeningAlert[];
}

/** Holding with market value for ESG weighting. */
export interface ESGHolding {
  readonly symbol: string;
  readonly companyName: string;
  readonly marketValueCents: number;
  readonly categories?: readonly ScreenCategory[];
}
