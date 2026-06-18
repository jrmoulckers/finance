// SPDX-License-Identifier: BUSL-1.1

export type RegionCode = 'US' | 'GB' | 'ES' | 'EU' | 'CA' | 'AU';
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MonthDay {
  readonly month: number;
  readonly day: number;
}

export interface RegionalTaxTerms {
  readonly indirectTax: string;
  readonly taxReturn: string;
  readonly taxIdentifier: string;
  readonly retirementAccount: string;
  readonly taxReserve: string;
}

export interface RegionalConvention {
  readonly region: RegionCode;
  readonly label: string;
  readonly defaultCurrency: string;
  readonly weekStartsOn: WeekdayIndex;
  readonly fiscalYearStart: MonthDay;
  readonly taxYearStart: MonthDay;
  readonly commonReportingPeriods: readonly string[];
  readonly taxTerms: RegionalTaxTerms;
  readonly guidanceDisclaimer: string;
}

export const REGIONAL_CONVENTIONS: Readonly<Record<RegionCode, RegionalConvention>> = {
  US: {
    region: 'US',
    label: 'United States',
    defaultCurrency: 'USD',
    weekStartsOn: 0,
    fiscalYearStart: { month: 1, day: 1 },
    taxYearStart: { month: 1, day: 1 },
    commonReportingPeriods: ['calendar-year', 'quarter', 'month'],
    taxTerms: {
      indirectTax: 'sales tax',
      taxReturn: 'tax return',
      taxIdentifier: 'SSN/ITIN',
      retirementAccount: '401(k) / IRA',
      taxReserve: 'tax reserve',
    },
    guidanceDisclaimer: 'Educational only; not tax, legal, or investment advice.',
  },
  GB: {
    region: 'GB',
    label: 'United Kingdom',
    defaultCurrency: 'GBP',
    weekStartsOn: 1,
    fiscalYearStart: { month: 4, day: 6 },
    taxYearStart: { month: 4, day: 6 },
    commonReportingPeriods: ['tax-year', 'quarter', 'month'],
    taxTerms: {
      indirectTax: 'VAT',
      taxReturn: 'Self Assessment tax return',
      taxIdentifier: 'National Insurance number',
      retirementAccount: 'pension',
      taxReserve: 'tax reserve',
    },
    guidanceDisclaimer: 'Educational only; not tax, legal, pension, or investment advice.',
  },
  ES: {
    region: 'ES',
    label: 'Spain',
    defaultCurrency: 'EUR',
    weekStartsOn: 1,
    fiscalYearStart: { month: 1, day: 1 },
    taxYearStart: { month: 1, day: 1 },
    commonReportingPeriods: ['calendar-year', 'quarter', 'month'],
    taxTerms: {
      indirectTax: 'IVA',
      taxReturn: 'declaración de la renta',
      taxIdentifier: 'NIF/NIE',
      retirementAccount: 'plan de pensiones',
      taxReserve: 'reserva para impuestos',
    },
    guidanceDisclaimer:
      'Solo información educativa; no es asesoramiento fiscal, legal ni de inversión.',
  },
  EU: {
    region: 'EU',
    label: 'European Union',
    defaultCurrency: 'EUR',
    weekStartsOn: 1,
    fiscalYearStart: { month: 1, day: 1 },
    taxYearStart: { month: 1, day: 1 },
    commonReportingPeriods: ['calendar-year', 'quarter', 'month'],
    taxTerms: {
      indirectTax: 'VAT',
      taxReturn: 'tax declaration',
      taxIdentifier: 'national tax ID',
      retirementAccount: 'retirement account',
      taxReserve: 'tax reserve',
    },
    guidanceDisclaimer:
      'Educational only; local rules vary and this is not tax, legal, or investment advice.',
  },
  CA: {
    region: 'CA',
    label: 'Canada',
    defaultCurrency: 'CAD',
    weekStartsOn: 0,
    fiscalYearStart: { month: 1, day: 1 },
    taxYearStart: { month: 1, day: 1 },
    commonReportingPeriods: ['calendar-year', 'quarter', 'month'],
    taxTerms: {
      indirectTax: 'GST/HST',
      taxReturn: 'income tax and benefit return',
      taxIdentifier: 'SIN',
      retirementAccount: 'RRSP / TFSA',
      taxReserve: 'tax reserve',
    },
    guidanceDisclaimer: 'Educational only; not tax, legal, or investment advice.',
  },
  AU: {
    region: 'AU',
    label: 'Australia',
    defaultCurrency: 'AUD',
    weekStartsOn: 1,
    fiscalYearStart: { month: 7, day: 1 },
    taxYearStart: { month: 7, day: 1 },
    commonReportingPeriods: ['financial-year', 'quarter', 'month'],
    taxTerms: {
      indirectTax: 'GST',
      taxReturn: 'tax return',
      taxIdentifier: 'TFN',
      retirementAccount: 'superannuation',
      taxReserve: 'tax reserve',
    },
    guidanceDisclaimer: 'Educational only; not tax, legal, superannuation, or investment advice.',
  },
};

const LOCALE_REGION_MAP: Readonly<Record<string, RegionCode>> = {
  'en-US': 'US',
  'en-GB': 'GB',
  'es-ES': 'ES',
  'fr-CA': 'CA',
  'en-CA': 'CA',
  'en-AU': 'AU',
};

export function getRegionalConvention(region: RegionCode): RegionalConvention {
  return REGIONAL_CONVENTIONS[region];
}

export function getRegionForLocale(locale: string): RegionCode {
  const canonical = (() => {
    try {
      return Intl.getCanonicalLocales(locale)[0] ?? locale;
    } catch {
      return locale;
    }
  })();

  if (LOCALE_REGION_MAP[canonical]) return LOCALE_REGION_MAP[canonical];

  try {
    const intlLocale = new Intl.Locale(canonical);
    const region = intlLocale.region as RegionCode | undefined;
    if (region && region in REGIONAL_CONVENTIONS) return region;
  } catch {
    // Fall through to language-level defaults.
  }

  if (canonical.toLowerCase().startsWith('es')) return 'ES';
  return 'US';
}

export function getRegionalConventionForLocale(locale: string): RegionalConvention {
  return getRegionalConvention(getRegionForLocale(locale));
}
