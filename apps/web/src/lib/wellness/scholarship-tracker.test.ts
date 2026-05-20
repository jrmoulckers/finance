// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for scholarship and financial aid tracking utilities.
 *
 * References: #1765
 */

import { describe, it, expect } from 'vitest';
import {
  filterByStatus,
  totalAwardedCents,
  totalPotentialCents,
  totalRenewableValueCents,
  summarizeAidPackage,
  compareAidPackages,
  calculateNetCost,
  averageAidPerComponent,
  buildDeadlineCalendar,
  upcomingDeadlines,
  overdueDeadlines,
  totalAidSummary,
} from './scholarship-tracker';
import type { Scholarship, FinancialAidPackage } from './types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const scholarships: Scholarship[] = [
  {
    id: 's1',
    name: 'Merit Award',
    provider: 'University',
    amountCents: 500000,
    deadline: '2024-03-15',
    status: 'awarded',
    renewable: true,
    renewalYears: 4,
    notes: '',
  },
  {
    id: 's2',
    name: 'STEM Grant',
    provider: 'Foundation',
    amountCents: 250000,
    deadline: '2024-04-01',
    status: 'submitted',
    renewable: false,
    renewalYears: 0,
    notes: 'Pending review',
  },
  {
    id: 's3',
    name: 'Community Service',
    provider: 'Local Org',
    amountCents: 100000,
    deadline: '2024-02-01',
    status: 'rejected',
    renewable: false,
    renewalYears: 0,
    notes: '',
  },
  {
    id: 's4',
    name: 'Leadership',
    provider: 'National Fund',
    amountCents: 300000,
    deadline: '2024-05-01',
    status: 'in_progress',
    renewable: true,
    renewalYears: 2,
    notes: 'Essay needed',
  },
];

const aidPackage: FinancialAidPackage = {
  id: 'pkg1',
  institution: 'State University',
  totalCostCents: 4000000,
  tuitionCents: 2500000,
  roomBoardCents: 1200000,
  booksCents: 200000,
  otherExpensesCents: 100000,
  aidComponents: [
    { id: 'a1', name: 'Pell Grant', type: 'grant', amountCents: 600000, requiresRepayment: false },
    {
      id: 'a2',
      name: 'University Scholarship',
      type: 'scholarship',
      amountCents: 1000000,
      requiresRepayment: false,
    },
    {
      id: 'a3',
      name: 'Federal Direct Loan',
      type: 'loan',
      amountCents: 550000,
      requiresRepayment: true,
    },
    {
      id: 'a4',
      name: 'Work-Study',
      type: 'work_study',
      amountCents: 300000,
      requiresRepayment: false,
    },
  ],
};

const aidPackage2: FinancialAidPackage = {
  id: 'pkg2',
  institution: 'Private College',
  totalCostCents: 6000000,
  tuitionCents: 4500000,
  roomBoardCents: 1200000,
  booksCents: 200000,
  otherExpensesCents: 100000,
  aidComponents: [
    {
      id: 'b1',
      name: 'Institutional Grant',
      type: 'grant',
      amountCents: 3500000,
      requiresRepayment: false,
    },
    { id: 'b2', name: 'Federal Loan', type: 'loan', amountCents: 550000, requiresRepayment: true },
  ],
};

// ---------------------------------------------------------------------------
// filterByStatus
// ---------------------------------------------------------------------------

describe('filterByStatus', () => {
  it('filters scholarships by awarded status', () => {
    const result = filterByStatus(scholarships, 'awarded');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s1');
  });

  it('returns empty array for no matching status', () => {
    expect(filterByStatus(scholarships, 'waitlisted')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// totalAwardedCents
// ---------------------------------------------------------------------------

describe('totalAwardedCents', () => {
  it('sums only awarded scholarships', () => {
    expect(totalAwardedCents(scholarships)).toBe(500000);
  });

  it('returns 0 with no awarded scholarships', () => {
    expect(totalAwardedCents([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// totalPotentialCents
// ---------------------------------------------------------------------------

describe('totalPotentialCents', () => {
  it('sums submitted and awarded scholarships', () => {
    expect(totalPotentialCents(scholarships)).toBe(750000);
  });
});

// ---------------------------------------------------------------------------
// totalRenewableValueCents
// ---------------------------------------------------------------------------

describe('totalRenewableValueCents', () => {
  it('calculates multi-year value for awarded renewable scholarships', () => {
    // s1: 500000 * 4 = 2000000
    expect(totalRenewableValueCents(scholarships)).toBe(2000000);
  });

  it('returns 0 with no renewable awarded scholarships', () => {
    expect(totalRenewableValueCents([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// summarizeAidPackage
// ---------------------------------------------------------------------------

describe('summarizeAidPackage', () => {
  it('breaks down aid into grants, loans, and work-study', () => {
    const summary = summarizeAidPackage(aidPackage);
    expect(summary.institution).toBe('State University');
    expect(summary.totalGrantsCents).toBe(1600000); // grant + scholarship
    expect(summary.totalLoansCents).toBe(550000);
    expect(summary.totalWorkStudyCents).toBe(300000);
    expect(summary.totalAidCents).toBe(2450000);
  });

  it('calculates net cost correctly', () => {
    const summary = summarizeAidPackage(aidPackage);
    expect(summary.netCostCents).toBe(1550000); // 4000000 - 2450000
  });

  it('calculates out-of-pocket excluding loans', () => {
    const summary = summarizeAidPackage(aidPackage);
    // 4000000 - 1600000 (grants) - 300000 (work-study) = 2100000
    expect(summary.outOfPocketCents).toBe(2100000);
  });

  it('floors net cost at 0', () => {
    const cheapPkg: FinancialAidPackage = {
      id: 'cheap',
      institution: 'Free U',
      totalCostCents: 100000,
      tuitionCents: 100000,
      roomBoardCents: 0,
      booksCents: 0,
      otherExpensesCents: 0,
      aidComponents: [
        {
          id: 'c1',
          name: 'Full Ride',
          type: 'grant',
          amountCents: 200000,
          requiresRepayment: false,
        },
      ],
    };
    const summary = summarizeAidPackage(cheapPkg);
    expect(summary.netCostCents).toBe(0);
    expect(summary.outOfPocketCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// compareAidPackages
// ---------------------------------------------------------------------------

describe('compareAidPackages', () => {
  it('sorts packages by net cost ascending', () => {
    const result = compareAidPackages([aidPackage, aidPackage2]);
    expect(result[0].institution).toBe('State University');
    expect(result[1].institution).toBe('Private College');
  });
});

// ---------------------------------------------------------------------------
// calculateNetCost
// ---------------------------------------------------------------------------

describe('calculateNetCost', () => {
  it('subtracts aid from cost', () => {
    expect(calculateNetCost(4000000, 2450000)).toBe(1550000);
  });

  it('returns 0 when aid exceeds cost', () => {
    expect(calculateNetCost(100000, 500000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// averageAidPerComponent
// ---------------------------------------------------------------------------

describe('averageAidPerComponent', () => {
  it('calculates average with banker rounding', () => {
    const avg = averageAidPerComponent(aidPackage);
    // (600000 + 1000000 + 550000 + 300000) / 4 = 612500
    expect(avg).toBe(612500);
  });

  it('returns 0 for empty components', () => {
    const emptyPkg: FinancialAidPackage = {
      id: 'e',
      institution: 'Empty',
      totalCostCents: 100000,
      tuitionCents: 100000,
      roomBoardCents: 0,
      booksCents: 0,
      otherExpensesCents: 0,
      aidComponents: [],
    };
    expect(averageAidPerComponent(emptyPkg)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildDeadlineCalendar
// ---------------------------------------------------------------------------

describe('buildDeadlineCalendar', () => {
  it('builds sorted deadlines excluding awarded and rejected', () => {
    const cal = buildDeadlineCalendar(scholarships, '2024-03-01');
    // s2 (submitted, 2024-04-01) and s4 (in_progress, 2024-05-01) only
    expect(cal).toHaveLength(2);
    expect(cal[0].scholarshipId).toBe('s2');
    expect(cal[1].scholarshipId).toBe('s4');
  });

  it('marks urgent deadlines within 7 days', () => {
    const cal = buildDeadlineCalendar(scholarships, '2024-03-28');
    const s2 = cal.find((e) => e.scholarshipId === 's2');
    expect(s2?.isUrgent).toBe(true);
    expect(s2?.daysRemaining).toBeLessThanOrEqual(7);
  });

  it('shows negative days for past deadlines', () => {
    const cal = buildDeadlineCalendar(scholarships, '2024-06-01');
    expect(cal.every((e) => e.daysRemaining < 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// upcomingDeadlines / overdueDeadlines
// ---------------------------------------------------------------------------

describe('upcomingDeadlines', () => {
  it('filters to only future deadlines', () => {
    const cal = buildDeadlineCalendar(scholarships, '2024-04-15');
    const upcoming = upcomingDeadlines(cal);
    expect(upcoming.every((e) => e.daysRemaining >= 0)).toBe(true);
  });
});

describe('overdueDeadlines', () => {
  it('filters to only past deadlines', () => {
    const cal = buildDeadlineCalendar(scholarships, '2024-04-15');
    const overdue = overdueDeadlines(cal);
    expect(overdue.every((e) => e.daysRemaining < 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// totalAidSummary
// ---------------------------------------------------------------------------

describe('totalAidSummary', () => {
  it('combines scholarship and institutional aid', () => {
    const summary = totalAidSummary(scholarships, aidPackage);
    expect(summary.totalScholarshipsCents).toBe(500000);
    expect(summary.totalInstitutionalAidCents).toBe(2450000);
    expect(summary.combinedAidCents).toBe(2950000);
    expect(summary.totalCostCents).toBe(4000000);
    expect(summary.netCostCents).toBe(1050000);
  });

  it('handles null aid package', () => {
    const summary = totalAidSummary(scholarships, null);
    expect(summary.totalInstitutionalAidCents).toBe(0);
    expect(summary.totalCostCents).toBe(0);
    expect(summary.netCostCents).toBe(0);
  });

  it('floors net cost at 0', () => {
    const richScholarships: Scholarship[] = [{ ...scholarships[0], amountCents: 10000000 }];
    const summary = totalAidSummary(richScholarships, aidPackage);
    expect(summary.netCostCents).toBe(0);
  });
});
