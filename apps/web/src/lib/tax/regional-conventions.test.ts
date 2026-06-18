// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildRegionalTaxPlanningCopy,
  getRegionalConventionProfile,
  getRegionalTaxYearPeriod,
} from './regional-conventions';

describe('regional-conventions', () => {
  it('uses US calendar-year conventions and sales-tax terminology', () => {
    const period = getRegionalTaxYearPeriod('US', '2025-03-15');
    const copy = buildRegionalTaxPlanningCopy('US');

    expect(period).toMatchObject({ taxYear: 2025, startDate: '2025-01-01', endDate: '2025-12-31' });
    expect(getRegionalConventionProfile('US').indirectTaxTerm).toBe('sales tax');
    expect(copy.join(' ')).toContain('not tax, legal, or filing advice');
  });

  it('uses UK 6 April to 5 April tax years', () => {
    expect(getRegionalTaxYearPeriod('UK', '2025-04-05')).toMatchObject({
      taxYear: 2025,
      startDate: '2024-04-06',
      endDate: '2025-04-05',
    });
    expect(getRegionalTaxYearPeriod('UK', '2025-04-06')).toMatchObject({
      taxYear: 2026,
      startDate: '2025-04-06',
      endDate: '2026-04-05',
    });
  });

  it('covers Spain/EU, Canada, and Australia profile terminology', () => {
    expect(getRegionalConventionProfile('ES')).toMatchObject({
      indirectTaxTerm: 'VAT',
      weekStartsOn: 'monday',
    });
    expect(getRegionalConventionProfile('CA')).toMatchObject({
      indirectTaxTerm: 'GST/HST',
      retirementAccountTerm: 'RRSP/TFSA',
    });
    expect(getRegionalTaxYearPeriod('AU', '2025-06-30')).toMatchObject({
      taxYear: 2025,
      startDate: '2024-07-01',
    });
    expect(getRegionalConventionProfile('AU').retirementAccountTerm).toBe('superannuation');
  });
});
