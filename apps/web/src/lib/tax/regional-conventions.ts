// SPDX-License-Identifier: BUSL-1.1

/**
 * Regional tax-planning conventions used to localize educational tax copy.
 *
 * Sources captured for deterministic planning copy: IRS Pub. 509 calendar tax
 * year convention; HMRC individual tax year (6 April); Agencia Tributaria and
 * CRA calendar-year individual returns; ATO income year ending 30 June.
 * This module provides planning estimates only and is not tax or legal advice.
 *
 * References: issue #2500.
 */

export type RegionalProfileId = 'US' | 'UK' | 'ES' | 'CA' | 'AU';
export type Weekday = 'sunday' | 'monday';
export type IndirectTaxTerm = 'sales tax' | 'VAT' | 'GST/HST' | 'GST';

export interface RegionalTaxYearConvention {
  readonly startMonth: number;
  readonly startDay: number;
  readonly label: string;
  readonly source: string;
}

export interface RegionalConventionProfile {
  readonly id: RegionalProfileId;
  readonly countryName: string;
  readonly currencyCode: string;
  readonly weekStartsOn: Weekday;
  readonly taxYear: RegionalTaxYearConvention;
  readonly indirectTaxTerm: IndirectTaxTerm;
  readonly retirementAccountTerm: string;
  readonly fiscalYearTerm: string;
  readonly educationalDisclaimer: string;
}

export interface RegionalTaxYearPeriod {
  readonly profileId: RegionalProfileId;
  readonly taxYear: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly label: string;
}

export const REGIONAL_CONVENTION_PROFILES: readonly RegionalConventionProfile[] = [
  {
    id: 'US',
    countryName: 'United States',
    currencyCode: 'USD',
    weekStartsOn: 'sunday',
    taxYear: {
      startMonth: 1,
      startDay: 1,
      label: 'calendar tax year',
      source: 'IRS Pub. 509: individuals commonly use the calendar tax year ending December 31.',
    },
    indirectTaxTerm: 'sales tax',
    retirementAccountTerm: 'IRA/401(k)',
    fiscalYearTerm: 'tax year',
    educationalDisclaimer: 'For educational planning only; not tax, legal, or filing advice.',
  },
  {
    id: 'UK',
    countryName: 'United Kingdom',
    currencyCode: 'GBP',
    weekStartsOn: 'monday',
    taxYear: {
      startMonth: 4,
      startDay: 6,
      label: 'UK tax year',
      source: 'HMRC: individual tax years run from 6 April to 5 April.',
    },
    indirectTaxTerm: 'VAT',
    retirementAccountTerm: 'pension/ISA',
    fiscalYearTerm: 'tax year',
    educationalDisclaimer: 'For education only; this does not guarantee tax treatment or replace HMRC guidance.',
  },
  {
    id: 'ES',
    countryName: 'Spain / EU',
    currencyCode: 'EUR',
    weekStartsOn: 'monday',
    taxYear: {
      startMonth: 1,
      startDay: 1,
      label: 'calendar tax year',
      source: 'Agencia Tributaria: personal income tax is reported on a calendar-year basis.',
    },
    indirectTaxTerm: 'VAT',
    retirementAccountTerm: 'pension plan',
    fiscalYearTerm: 'fiscal year',
    educationalDisclaimer: 'Educational planning only; consult local tax guidance before relying on this output.',
  },
  {
    id: 'CA',
    countryName: 'Canada',
    currencyCode: 'CAD',
    weekStartsOn: 'monday',
    taxYear: {
      startMonth: 1,
      startDay: 1,
      label: 'calendar tax year',
      source: 'CRA: individual income tax returns generally report the calendar year.',
    },
    indirectTaxTerm: 'GST/HST',
    retirementAccountTerm: 'RRSP/TFSA',
    fiscalYearTerm: 'tax year',
    educationalDisclaimer: 'Educational estimates only; not CRA advice or a filing guarantee.',
  },
  {
    id: 'AU',
    countryName: 'Australia',
    currencyCode: 'AUD',
    weekStartsOn: 'monday',
    taxYear: {
      startMonth: 7,
      startDay: 1,
      label: 'Australian income year',
      source: 'ATO: income years run from 1 July to 30 June.',
    },
    indirectTaxTerm: 'GST',
    retirementAccountTerm: 'superannuation',
    fiscalYearTerm: 'income year',
    educationalDisclaimer: 'Educational estimates only; not ATO advice or a tax lodgment guarantee.',
  },
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dateToParts(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (match === null) throw new Error(`Invalid ISO date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function startsOnOrBefore(date: string, year: number, convention: RegionalTaxYearConvention): boolean {
  return date >= isoDate(year, convention.startMonth, convention.startDay);
}

export function getRegionalConventionProfile(id: RegionalProfileId): RegionalConventionProfile {
  const profile = REGIONAL_CONVENTION_PROFILES.find((candidate) => candidate.id === id);
  if (profile === undefined) throw new Error(`Unsupported regional profile: ${id}`);
  return profile;
}

/** Resolve the tax-year period containing an ISO date for a regional profile. */
export function getRegionalTaxYearPeriod(profileId: RegionalProfileId, date: string): RegionalTaxYearPeriod {
  const profile = getRegionalConventionProfile(profileId);
  const parts = dateToParts(date);
  const startYear = startsOnOrBefore(date, parts.year, profile.taxYear) ? parts.year : parts.year - 1;
  const endYear = startYear + 1;
  const startDate = isoDate(startYear, profile.taxYear.startMonth, profile.taxYear.startDay);
  const endDate = addDays(isoDate(endYear, profile.taxYear.startMonth, profile.taxYear.startDay), -1);

  const taxYear = profile.taxYear.startMonth === 1 && profile.taxYear.startDay === 1 ? startYear : endYear;

  return {
    profileId,
    taxYear,
    startDate,
    endDate,
    label: `${profile.countryName} ${profile.taxYear.label} ${taxYear}`,
  };
}

/** Build safe localized copy for tax reserve and planning flows. */
export function buildRegionalTaxPlanningCopy(profileId: RegionalProfileId): readonly string[] {
  const profile = getRegionalConventionProfile(profileId);
  return [
    `Use the ${profile.taxYear.label} for reporting periods and ${profile.fiscalYearTerm} summaries.`,
    `Use ${profile.indirectTaxTerm} terminology for indirect-tax copy in ${profile.countryName}.`,
    `Use ${profile.retirementAccountTerm} terminology for retirement planning references.`,
    profile.educationalDisclaimer,
  ];
}
