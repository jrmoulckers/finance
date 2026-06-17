// SPDX-License-Identifier: BUSL-1.1

import type { MileageCalculation, MileageRatePurpose, TripEntry, TripPurpose } from './types';

export const IRS_STANDARD_MILEAGE_RATES = {
  2024: {
    business: 67,
    medical: 21,
    moving: 21,
    charity: 14,
  },
} as const;

type SupportedMileageRateYear = keyof typeof IRS_STANDARD_MILEAGE_RATES;
const LATEST_SUPPORTED_YEAR: SupportedMileageRateYear = 2024;

function roundMiles(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizePercent(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) {
    return 100;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

export function resolveMileageRateYear(year?: number): SupportedMileageRateYear {
  if (year !== undefined && year in IRS_STANDARD_MILEAGE_RATES) {
    return year as SupportedMileageRateYear;
  }

  return LATEST_SUPPORTED_YEAR;
}

export function getMileageRate(purpose: TripPurpose, year?: number): number {
  if (purpose === 'personal') {
    return 0;
  }

  const appliedYear = resolveMileageRateYear(year);
  return IRS_STANDARD_MILEAGE_RATES[appliedYear][purpose as MileageRatePurpose];
}

export function calculateMileageDeduction(
  miles: number,
  purpose: TripPurpose,
  options: { year?: number; businessUsePercent?: number } = {},
): MileageCalculation {
  const appliedYear = resolveMileageRateYear(options.year);
  if (!Number.isFinite(miles) || miles <= 0 || purpose === 'personal') {
    return {
      rateCentsPerMile: 0,
      deductionCents: 0,
      appliedYear,
    };
  }

  const normalizedMiles = roundMiles(miles);
  const effectiveMiles =
    purpose === 'business'
      ? normalizedMiles * (normalizePercent(options.businessUsePercent) / 100)
      : normalizedMiles;
  const rateCentsPerMile = getMileageRate(purpose, appliedYear);

  return {
    rateCentsPerMile,
    deductionCents: Math.round(effectiveMiles * rateCentsPerMile),
    appliedYear,
  };
}

export function calculateTripDeduction(trip: TripEntry): MileageCalculation {
  const tripYear = Number.parseInt(trip.date.slice(0, 4), 10);

  return calculateMileageDeduction(trip.miles, trip.purpose, {
    year: Number.isFinite(tripYear) ? tripYear : undefined,
    businessUsePercent: trip.businessUsePercent,
  });
}
