import { describe, it, expect } from 'vitest';
import {
  getEncryptionInfo,
  getDetailsByCategory,
  getSecurityPostureSummary,
  getUnmetCompliance,
  setLastAuditDate,
  updateComplianceItem,
} from '../encryption-info';

describe('encryption-info', () => {
  describe('getEncryptionInfo', () => {
    it('returns static encryption documentation', () => {
      const info = getEncryptionInfo();
      expect(info.details.length).toBeGreaterThan(0);
      expect(info.complianceItems.length).toBeGreaterThan(0);
      expect(info.lastAuditDate).toBeUndefined();
    });

    it('accepts a last audit date', () => {
      const info = getEncryptionInfo('2025-01-01');
      expect(info.lastAuditDate).toBe('2025-01-01');
    });
  });

  describe('getDetailsByCategory', () => {
    it('filters at_rest details', () => {
      const details = getDetailsByCategory('at_rest');
      expect(details.length).toBeGreaterThan(0);
      expect(details.every((d) => d.category === 'at_rest')).toBe(true);
    });

    it('filters in_transit details', () => {
      const details = getDetailsByCategory('in_transit');
      expect(details.length).toBeGreaterThan(0);
      expect(details.every((d) => d.category === 'in_transit')).toBe(true);
    });

    it('filters key_derivation details', () => {
      const details = getDetailsByCategory('key_derivation');
      expect(details.length).toBeGreaterThan(0);
      expect(details.every((d) => d.category === 'key_derivation')).toBe(true);
    });
  });

  describe('getSecurityPostureSummary', () => {
    it('shows 100% when all items satisfied', () => {
      const info = getEncryptionInfo();
      const summary = getSecurityPostureSummary(info);
      expect(summary).toContain('100%');
      expect(summary).toContain('All requirements met');
    });

    it('handles empty compliance list', () => {
      const info = { details: [], complianceItems: [], lastAuditDate: undefined };
      expect(getSecurityPostureSummary(info)).toBe('No compliance items defined.');
    });

    it('shows action needed when items unmet', () => {
      const info = updateComplianceItem(getEncryptionInfo(), 'enc-at-rest', false);
      const summary = getSecurityPostureSummary(info);
      expect(summary).toContain('Action needed');
    });
  });

  describe('getUnmetCompliance', () => {
    it('returns empty when all satisfied', () => {
      const info = getEncryptionInfo();
      expect(getUnmetCompliance(info)).toHaveLength(0);
    });

    it('returns unmet items', () => {
      const info = updateComplianceItem(getEncryptionInfo(), 'hsts', false);
      const unmet = getUnmetCompliance(info);
      expect(unmet).toHaveLength(1);
      expect(unmet[0].id).toBe('hsts');
    });
  });

  describe('setLastAuditDate', () => {
    it('updates the audit date', () => {
      const info = getEncryptionInfo();
      const updated = setLastAuditDate(info, '2025-06-15');
      expect(updated.lastAuditDate).toBe('2025-06-15');
    });
  });

  describe('updateComplianceItem', () => {
    it('updates a specific item', () => {
      const info = getEncryptionInfo();
      const updated = updateComplianceItem(info, 'enc-at-rest', false);
      const item = updated.complianceItems.find((c) => c.id === 'enc-at-rest');
      expect(item?.satisfied).toBe(false);
    });

    it('leaves other items unchanged', () => {
      const info = getEncryptionInfo();
      const updated = updateComplianceItem(info, 'enc-at-rest', false);
      const other = updated.complianceItems.find((c) => c.id === 'hsts');
      expect(other?.satisfied).toBe(true);
    });
  });
});
