// SPDX-License-Identifier: BUSL-1.1

/**
 * Healthcare cost projection utilities for retirement planning.
 *
 * Models Medicare premiums, IRMAA surcharges, supplemental coverage,
 * out-of-pocket estimates, and the pre-65 private insurance gap.
 *
 * All monetary values are in cents (integers).
 *
 * References: #2129
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input assumptions for retirement healthcare cost projections. */
export interface HealthcareCostProjectionParams {
  /** Age when retirement spending starts. */
  readonly retirementAge: number;
  /** Last age to include in the projection. Defaults to 90. */
  readonly projectionEndAge?: number;
  /** Desired annual retirement spending in today's cents. */
  readonly desiredAnnualRetirementSpendingCents: number;
  /** Expected general inflation for total retirement spending. */
  readonly generalInflationRate: number;
  /** Expected healthcare inflation. Defaults to 5.5%. */
  readonly healthcareInflationRate?: number;
  /** Estimated MAGI/retirement income in today's cents for IRMAA tiering. */
  readonly annualRetirementIncomeCents?: number;
  /** Medicare Part B monthly premium in today's cents. Defaults to ~$175. */
  readonly partBMonthlyPremiumCents?: number;
  /** Medicare Part D monthly premium in today's cents. */
  readonly partDMonthlyPremiumCents?: number;
  /** Medigap/supplemental monthly premium in today's cents. */
  readonly medigapMonthlyPremiumCents?: number;
  /** Medicare out-of-pocket annual estimate in today's cents. */
  readonly outOfPocketAnnualCents?: number;
  /** Pre-65 ACA/private monthly premium estimate in today's cents. */
  readonly preMedicareMonthlyPremiumCents?: number;
  /** Pre-65 out-of-pocket annual estimate in today's cents. */
  readonly preMedicareOutOfPocketAnnualCents?: number;
}

/** Annual healthcare cost projection point. */
export interface HealthcareCostProjectionYear {
  readonly age: number;
  readonly yearIndex: number;
  readonly isPreMedicareGap: boolean;
  readonly partBAnnualCents: number;
  readonly partDAnnualCents: number;
  readonly medigapAnnualCents: number;
  readonly outOfPocketCents: number;
  readonly irmaaSurchargeAnnualCents: number;
  readonly preMedicarePremiumAnnualCents: number;
  readonly totalAnnualCents: number;
  readonly retirementSpendingAnnualCents: number;
  readonly healthcareShareOfSpending: number;
}

/** Full healthcare cost projection result. */
export interface HealthcareCostProjectionResult {
  readonly years: readonly HealthcareCostProjectionYear[];
  readonly cumulativeHealthcareCents: number;
  readonly cumulativeRetirementSpendingCents: number;
  readonly healthcareShareOfSpending: number;
  readonly firstYearHealthcareCents: number;
  readonly finalYearHealthcareCents: number;
  readonly preMedicareGapYears: number;
  readonly healthcareInflationRate: number;
  readonly irmaaSurchargeMonthlyCents: number;
}

// ---------------------------------------------------------------------------
// Defaults and IRMAA brackets
// ---------------------------------------------------------------------------

const MEDICARE_ELIGIBILITY_AGE = 65;
const DEFAULT_PROJECTION_END_AGE = 90;
const DEFAULT_HEALTHCARE_INFLATION_RATE = 0.055;

const DEFAULT_PART_B_MONTHLY_CENTS = 17500;
const DEFAULT_PART_D_MONTHLY_CENTS = 5500;
const DEFAULT_MEDIGAP_MONTHLY_CENTS = 16000;
const DEFAULT_MEDICARE_OUT_OF_POCKET_ANNUAL_CENTS = 350000;
const DEFAULT_PRE_MEDICARE_MONTHLY_CENTS = 95000;
const DEFAULT_PRE_MEDICARE_OUT_OF_POCKET_ANNUAL_CENTS = 500000;

/** 2024 single-filer IRMAA tiers, approximated in cents. */
const IRMAA_TIERS: readonly {
  readonly incomeThresholdCents: number;
  readonly partBMonthlySurchargeCents: number;
  readonly partDMonthlySurchargeCents: number;
}[] = [
  {
    incomeThresholdCents: 50000000,
    partBMonthlySurchargeCents: 41930,
    partDMonthlySurchargeCents: 8100,
  },
  {
    incomeThresholdCents: 19300000,
    partBMonthlySurchargeCents: 38430,
    partDMonthlySurchargeCents: 7420,
  },
  {
    incomeThresholdCents: 16100000,
    partBMonthlySurchargeCents: 27950,
    partDMonthlySurchargeCents: 5380,
  },
  {
    incomeThresholdCents: 12900000,
    partBMonthlySurchargeCents: 17470,
    partDMonthlySurchargeCents: 3330,
  },
  {
    incomeThresholdCents: 10300000,
    partBMonthlySurchargeCents: 6990,
    partDMonthlySurchargeCents: 1290,
  },
];

// ---------------------------------------------------------------------------
// Projection engine
// ---------------------------------------------------------------------------

/** Return the combined monthly Part B + Part D IRMAA surcharge for an income level. */
export function calculateIrmaaMonthlySurchargeCents(annualIncomeCents: number): number {
  const tier = IRMAA_TIERS.find((t) => annualIncomeCents > t.incomeThresholdCents);
  return tier ? tier.partBMonthlySurchargeCents + tier.partDMonthlySurchargeCents : 0;
}

/** Compound and round a cents value by an annual inflation rate. */
function inflateCents(baseCents: number, rate: number, years: number): number {
  return Math.round(baseCents * (1 + rate) ** years);
}

/**
 * Project annual healthcare costs from retirement through age 90 by default.
 *
 * @param params - Healthcare projection assumptions
 * @returns Annual and cumulative healthcare cost projection
 */
export function projectRetirementHealthcareCosts(
  params: HealthcareCostProjectionParams,
): HealthcareCostProjectionResult {
  const retirementAge = Math.max(0, Math.floor(params.retirementAge));
  const projectionEndAge = Math.max(
    retirementAge,
    Math.floor(params.projectionEndAge ?? DEFAULT_PROJECTION_END_AGE),
  );
  const healthcareInflationRate =
    params.healthcareInflationRate ?? DEFAULT_HEALTHCARE_INFLATION_RATE;
  const annualIncomeCents =
    params.annualRetirementIncomeCents ?? params.desiredAnnualRetirementSpendingCents;
  const irmaaSurchargeMonthlyCents = calculateIrmaaMonthlySurchargeCents(annualIncomeCents);

  const years: HealthcareCostProjectionYear[] = [];

  for (let age = retirementAge; age <= projectionEndAge; age++) {
    const yearIndex = age - retirementAge;
    const inflationYears = yearIndex;
    const isPreMedicareGap = age < MEDICARE_ELIGIBILITY_AGE;

    const partBAnnualCents = isPreMedicareGap
      ? 0
      : inflateCents(
          (params.partBMonthlyPremiumCents ?? DEFAULT_PART_B_MONTHLY_CENTS) * 12,
          healthcareInflationRate,
          inflationYears,
        );
    const partDAnnualCents = isPreMedicareGap
      ? 0
      : inflateCents(
          (params.partDMonthlyPremiumCents ?? DEFAULT_PART_D_MONTHLY_CENTS) * 12,
          healthcareInflationRate,
          inflationYears,
        );
    const medigapAnnualCents = isPreMedicareGap
      ? 0
      : inflateCents(
          (params.medigapMonthlyPremiumCents ?? DEFAULT_MEDIGAP_MONTHLY_CENTS) * 12,
          healthcareInflationRate,
          inflationYears,
        );
    const irmaaSurchargeAnnualCents = isPreMedicareGap
      ? 0
      : inflateCents(irmaaSurchargeMonthlyCents * 12, healthcareInflationRate, inflationYears);
    const outOfPocketCents = inflateCents(
      isPreMedicareGap
        ? (params.preMedicareOutOfPocketAnnualCents ??
            DEFAULT_PRE_MEDICARE_OUT_OF_POCKET_ANNUAL_CENTS)
        : (params.outOfPocketAnnualCents ?? DEFAULT_MEDICARE_OUT_OF_POCKET_ANNUAL_CENTS),
      healthcareInflationRate,
      inflationYears,
    );
    const preMedicarePremiumAnnualCents = isPreMedicareGap
      ? inflateCents(
          (params.preMedicareMonthlyPremiumCents ?? DEFAULT_PRE_MEDICARE_MONTHLY_CENTS) * 12,
          healthcareInflationRate,
          inflationYears,
        )
      : 0;

    const totalAnnualCents =
      partBAnnualCents +
      partDAnnualCents +
      medigapAnnualCents +
      outOfPocketCents +
      irmaaSurchargeAnnualCents +
      preMedicarePremiumAnnualCents;
    const retirementSpendingAnnualCents = inflateCents(
      params.desiredAnnualRetirementSpendingCents,
      params.generalInflationRate,
      yearIndex,
    );

    years.push({
      age,
      yearIndex,
      isPreMedicareGap,
      partBAnnualCents,
      partDAnnualCents,
      medigapAnnualCents,
      outOfPocketCents,
      irmaaSurchargeAnnualCents,
      preMedicarePremiumAnnualCents,
      totalAnnualCents,
      retirementSpendingAnnualCents,
      healthcareShareOfSpending:
        retirementSpendingAnnualCents > 0 ? totalAnnualCents / retirementSpendingAnnualCents : 0,
    });
  }

  const cumulativeHealthcareCents = years.reduce((sum, y) => sum + y.totalAnnualCents, 0);
  const cumulativeRetirementSpendingCents = years.reduce(
    (sum, y) => sum + y.retirementSpendingAnnualCents,
    0,
  );

  return {
    years,
    cumulativeHealthcareCents,
    cumulativeRetirementSpendingCents,
    healthcareShareOfSpending:
      cumulativeRetirementSpendingCents > 0
        ? cumulativeHealthcareCents / cumulativeRetirementSpendingCents
        : 0,
    firstYearHealthcareCents: years[0]?.totalAnnualCents ?? 0,
    finalYearHealthcareCents: years[years.length - 1]?.totalAnnualCents ?? 0,
    preMedicareGapYears: years.filter((y) => y.isPreMedicareGap).length,
    healthcareInflationRate,
    irmaaSurchargeMonthlyCents,
  };
}
