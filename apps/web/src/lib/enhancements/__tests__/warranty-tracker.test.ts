import { describe, it, expect } from 'vitest';
import {
  createWarrantyItem,
  generateReminders,
  generateAllReminders,
  getActiveWarranties,
  getExpiredWarranties,
  activeWarrantySummary,
  linkReceipt,
  daysBetween,
  getUrgency,
} from '../warranty-tracker';
import type { WarrantyItem } from '../types';

describe('warranty-tracker', () => {
  const makeItem = (overrides?: Partial<WarrantyItem>): WarrantyItem => ({
    ...createWarrantyItem(
      'w-1',
      'Laptop',
      '2024-01-15',
      '2026-01-15',
      129999,
      'receipt-1',
      '2024-02-15',
    ),
    ...overrides,
  });

  describe('daysBetween', () => {
    it('calculates positive days', () => {
      expect(daysBetween('2025-01-01', '2025-01-31')).toBe(30);
    });

    it('returns 0 for same day', () => {
      expect(daysBetween('2025-01-01', '2025-01-01')).toBe(0);
    });

    it('returns negative for past dates', () => {
      expect(daysBetween('2025-01-31', '2025-01-01')).toBe(-30);
    });
  });

  describe('getUrgency', () => {
    it('returns high for ≤7 days', () => {
      expect(getUrgency(7)).toBe('high');
      expect(getUrgency(1)).toBe('high');
    });

    it('returns medium for 8-14 days', () => {
      expect(getUrgency(14)).toBe('medium');
      expect(getUrgency(8)).toBe('medium');
    });

    it('returns low for >14 days', () => {
      expect(getUrgency(15)).toBe('low');
      expect(getUrgency(30)).toBe('low');
    });
  });

  describe('generateReminders', () => {
    it('generates warranty reminder within 30 days', () => {
      const item = makeItem({ warrantyExpiry: '2025-02-10' });
      const reminders = generateReminders(item, '2025-01-20');
      expect(reminders).toHaveLength(1);
      expect(reminders[0].type).toBe('warranty');
      expect(reminders[0].daysRemaining).toBe(21);
      expect(reminders[0].urgency).toBe('low');
    });

    it('generates high-urgency warranty reminder at 5 days', () => {
      const item = makeItem({ warrantyExpiry: '2025-01-25' });
      const reminders = generateReminders(item, '2025-01-20');
      expect(reminders).toHaveLength(1);
      expect(reminders[0].urgency).toBe('high');
      expect(reminders[0].daysRemaining).toBe(5);
    });

    it('generates return window reminder', () => {
      const item = makeItem({ returnWindowExpiry: '2025-01-30' });
      const reminders = generateReminders(item, '2025-01-20');
      const returnReminders = reminders.filter((r) => r.type === 'return_window');
      expect(returnReminders).toHaveLength(1);
      expect(returnReminders[0].daysRemaining).toBe(10);
    });

    it('generates no reminder when expiry is far away', () => {
      const item = makeItem({ warrantyExpiry: '2026-01-15', returnWindowExpiry: undefined });
      expect(generateReminders(item, '2025-01-01')).toHaveLength(0);
    });

    it('generates no reminder when already expired', () => {
      const item = makeItem({
        warrantyExpiry: '2024-12-31',
        returnWindowExpiry: '2024-12-31',
      });
      expect(generateReminders(item, '2025-01-01')).toHaveLength(0);
    });
  });

  describe('generateAllReminders', () => {
    it('generates reminders for all items', () => {
      const items = [
        makeItem({ id: '1', warrantyExpiry: '2025-01-25' }),
        makeItem({ id: '2', warrantyExpiry: '2025-02-01', returnWindowExpiry: undefined }),
      ];
      const reminders = generateAllReminders(items, '2025-01-20');
      expect(reminders.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getActiveWarranties / getExpiredWarranties', () => {
    it('separates active from expired', () => {
      const items = [
        makeItem({ id: '1', warrantyExpiry: '2026-01-01' }),
        makeItem({ id: '2', warrantyExpiry: '2024-06-01' }),
      ];
      expect(getActiveWarranties(items, '2025-01-01')).toHaveLength(1);
      expect(getExpiredWarranties(items, '2025-01-01')).toHaveLength(1);
    });
  });

  describe('activeWarrantySummary', () => {
    it('counts and sums active warranties in cents', () => {
      const items = [
        makeItem({ id: '1', warrantyExpiry: '2026-01-01', costCents: 50000 }),
        makeItem({ id: '2', warrantyExpiry: '2026-06-01', costCents: 75000 }),
        makeItem({ id: '3', warrantyExpiry: '2024-01-01', costCents: 10000 }),
      ];
      const summary = activeWarrantySummary(items, '2025-01-01');
      expect(summary.count).toBe(2);
      expect(summary.totalCoveredCents).toBe(125000);
    });
  });

  describe('linkReceipt', () => {
    it('links a receipt to a warranty item', () => {
      const item = makeItem({ receiptId: undefined });
      const linked = linkReceipt(item, 'receipt-99');
      expect(linked.receiptId).toBe('receipt-99');
    });
  });
});
