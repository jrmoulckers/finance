// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for unusual activity alerts engine.
 *
 * References: #1731
 */

import { describe, it, expect } from 'vitest';
import {
  getDefaultThresholds,
  checkAmountThreshold,
  checkFrequencySpike,
  checkCategoryAnomaly,
  evaluateTransaction,
  acknowledgeAlert,
  filterBySeverity,
  getUnacknowledgedAlerts,
} from './activity-alerts';
import type { AlertTransaction, CategoryHistory } from './activity-alerts';
import type { ActivityAlert } from './types';

const NOW = '2025-01-15T12:00:00.000Z';

function makeTxn(overrides: Partial<AlertTransaction> = {}): AlertTransaction {
  return {
    amountCents: 1000,
    categoryId: null,
    categoryName: 'General',
    timestamp: NOW,
    ...overrides,
  };
}

function makeAlert(overrides: Partial<ActivityAlert> = {}): ActivityAlert {
  return {
    id: 'alert-1',
    accountId: 'acc-1',
    type: 'amount-threshold',
    severity: 'medium',
    message: 'Test alert',
    triggerAmountCents: 10000,
    acknowledged: false,
    createdAt: NOW,
    acknowledgedAt: '',
    ...overrides,
  };
}

describe('activity-alerts', () => {
  describe('getDefaultThresholds', () => {
    it('returns sensible defaults', () => {
      const thresholds = getDefaultThresholds();
      expect(thresholds.amountThresholdCents).toBe(5000);
      expect(thresholds.dailyTransactionLimit).toBe(10);
      expect(thresholds.categoryAnomalyPercent).toBe(50);
    });
  });

  describe('checkAmountThreshold', () => {
    const thresholds = getDefaultThresholds();

    it('returns null for amount under threshold', () => {
      const txn = makeTxn({ amountCents: 3000 });
      const alert = checkAmountThreshold(txn, thresholds, {
        alertId: 'a1',
        accountId: 'acc-1',
        now: NOW,
      });
      expect(alert).toBeNull();
    });

    it('returns alert for amount over threshold', () => {
      const txn = makeTxn({ amountCents: 10000 });
      const alert = checkAmountThreshold(txn, thresholds, {
        alertId: 'a1',
        accountId: 'acc-1',
        now: NOW,
      });
      expect(alert).not.toBeNull();
      expect(alert!.type).toBe('amount-threshold');
      expect(alert!.triggerAmountCents).toBe(10000);
    });

    it('classifies high severity for very large amounts', () => {
      const txn = makeTxn({ amountCents: 25000 }); // 5x threshold
      const alert = checkAmountThreshold(txn, thresholds, {
        alertId: 'a1',
        accountId: 'acc-1',
        now: NOW,
      });
      expect(alert!.severity).toBe('critical');
    });
  });

  describe('checkFrequencySpike', () => {
    const thresholds = getDefaultThresholds(); // limit = 10

    it('returns null when under limit', () => {
      const txns = Array.from({ length: 8 }, (_, i) =>
        makeTxn({ timestamp: `2025-01-15T${String(i + 1).padStart(2, '0')}:00:00.000Z` }),
      );
      const alert = checkFrequencySpike(txns, thresholds, {
        alertId: 'a1',
        accountId: 'acc-1',
        date: NOW,
        now: NOW,
      });
      expect(alert).toBeNull();
    });

    it('returns alert when over limit', () => {
      const txns = Array.from({ length: 12 }, (_, i) =>
        makeTxn({ timestamp: `2025-01-15T${String(i + 1).padStart(2, '0')}:00:00.000Z` }),
      );
      const alert = checkFrequencySpike(txns, thresholds, {
        alertId: 'a1',
        accountId: 'acc-1',
        date: NOW,
        now: NOW,
      });
      expect(alert).not.toBeNull();
      expect(alert!.type).toBe('frequency-spike');
    });

    it('only counts transactions on the specified date', () => {
      const txns = [
        ...Array.from({ length: 5 }, () => makeTxn({ timestamp: '2025-01-15T10:00:00.000Z' })),
        ...Array.from({ length: 10 }, () => makeTxn({ timestamp: '2025-01-14T10:00:00.000Z' })),
      ];
      const alert = checkFrequencySpike(txns, thresholds, {
        alertId: 'a1',
        accountId: 'acc-1',
        date: NOW,
        now: NOW,
      });
      expect(alert).toBeNull(); // Only 5 on Jan 15
    });
  });

  describe('checkCategoryAnomaly', () => {
    const thresholds = getDefaultThresholds(); // 50% above average
    const history: CategoryHistory = {
      categoryId: 'food',
      categoryName: 'Food',
      averageMonthlySpendCents: 10000,
    };

    it('returns null when spending is normal', () => {
      const alert = checkCategoryAnomaly(12000, history, thresholds, {
        alertId: 'a1',
        accountId: 'acc-1',
        now: NOW,
      });
      expect(alert).toBeNull();
    });

    it('returns alert when spending exceeds anomaly threshold', () => {
      const alert = checkCategoryAnomaly(20000, history, thresholds, {
        alertId: 'a1',
        accountId: 'acc-1',
        now: NOW,
      });
      expect(alert).not.toBeNull();
      expect(alert!.type).toBe('category-anomaly');
    });

    it('returns null when historical average is zero', () => {
      const zeroHistory: CategoryHistory = {
        categoryId: 'food',
        categoryName: 'Food',
        averageMonthlySpendCents: 0,
      };
      const alert = checkCategoryAnomaly(5000, zeroHistory, thresholds, {
        alertId: 'a1',
        accountId: 'acc-1',
        now: NOW,
      });
      expect(alert).toBeNull();
    });
  });

  describe('evaluateTransaction', () => {
    it('returns multiple alerts when multiple checks trigger', () => {
      const thresholds = { ...getDefaultThresholds(), dailyTransactionLimit: 0 };
      const txn = makeTxn({ amountCents: 10000, categoryId: 'food', categoryName: 'Food' });
      const allTxns = [txn];
      const histories: CategoryHistory[] = [
        { categoryId: 'food', categoryName: 'Food', averageMonthlySpendCents: 1000 },
      ];
      const monthSpend = new Map([['food', 10000]]);
      let idCounter = 0;

      const alerts = evaluateTransaction(txn, allTxns, histories, monthSpend, thresholds, {
        accountId: 'acc-1',
        now: NOW,
        generateId: () => `alert-${++idCounter}`,
      });

      expect(alerts.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty array when nothing triggers', () => {
      const txn = makeTxn({ amountCents: 100 });
      const alerts = evaluateTransaction(txn, [txn], [], new Map(), getDefaultThresholds(), {
        accountId: 'acc-1',
        now: NOW,
        generateId: () => 'a1',
      });
      expect(alerts).toHaveLength(0);
    });
  });

  describe('acknowledgeAlert', () => {
    it('marks alert as acknowledged', () => {
      const alert = makeAlert();
      const acked = acknowledgeAlert(alert, NOW);
      expect(acked.acknowledged).toBe(true);
      expect(acked.acknowledgedAt).toBe(NOW);
    });
  });

  describe('filterBySeverity', () => {
    const alerts: ActivityAlert[] = [
      makeAlert({ id: 'a1', severity: 'low' }),
      makeAlert({ id: 'a2', severity: 'medium' }),
      makeAlert({ id: 'a3', severity: 'high' }),
      makeAlert({ id: 'a4', severity: 'critical' }),
    ];

    it('filters by minimum severity', () => {
      expect(filterBySeverity(alerts, 'high')).toHaveLength(2);
    });

    it('returns all for low severity', () => {
      expect(filterBySeverity(alerts, 'low')).toHaveLength(4);
    });
  });

  describe('getUnacknowledgedAlerts', () => {
    it('returns only unacknowledged alerts', () => {
      const alerts = [
        makeAlert({ id: 'a1', acknowledged: false }),
        makeAlert({ id: 'a2', acknowledged: true }),
        makeAlert({ id: 'a3', acknowledged: false }),
      ];
      expect(getUnacknowledgedAlerts(alerts)).toHaveLength(2);
    });
  });
});
