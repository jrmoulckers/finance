import { describe, it, expect } from 'vitest';
import {
  createDefaultProfile,
  createElderProfile,
  toggleElderMode,
  setEmergencyContact,
  setCaregiverNotifications,
  getFontScale,
  filterNavItems,
  isFeatureVisible,
  getCSSCustomProperties,
} from '../elder-mode';

describe('elder-mode', () => {
  describe('createDefaultProfile', () => {
    it('creates standard profile', () => {
      const profile = createDefaultProfile();
      expect(profile.enabled).toBe(false);
      expect(profile.minTouchTargetPx).toBe(44);
      expect(profile.baseFontSizePx).toBe(16);
      expect(profile.highContrast).toBe(false);
      expect(profile.essentialFeaturesOnly).toBe(false);
    });
  });

  describe('createElderProfile', () => {
    it('creates elder mode with large targets', () => {
      const profile = createElderProfile();
      expect(profile.enabled).toBe(true);
      expect(profile.minTouchTargetPx).toBeGreaterThanOrEqual(56);
      expect(profile.baseFontSizePx).toBeGreaterThanOrEqual(20);
      expect(profile.highContrast).toBe(true);
      expect(profile.maxNavItems).toBeLessThanOrEqual(5);
      expect(profile.essentialFeaturesOnly).toBe(true);
    });

    it('includes emergency contact', () => {
      const contact = { name: 'Jane', phone: '555-1234', relationship: 'Daughter' };
      const profile = createElderProfile(contact);
      expect(profile.emergencyContact).toEqual(contact);
    });
  });

  describe('toggleElderMode', () => {
    it('toggles from standard to elder', () => {
      const standard = createDefaultProfile();
      const elder = toggleElderMode(standard);
      expect(elder.enabled).toBe(true);
      expect(elder.minTouchTargetPx).toBeGreaterThanOrEqual(56);
    });

    it('toggles from elder to standard', () => {
      const elder = createElderProfile();
      const standard = toggleElderMode(elder);
      expect(standard.enabled).toBe(false);
    });
  });

  describe('setEmergencyContact', () => {
    it('sets emergency contact', () => {
      const profile = createDefaultProfile();
      const contact = { name: 'Bob', phone: '555-5678', relationship: 'Son' };
      const updated = setEmergencyContact(profile, contact);
      expect(updated.emergencyContact).toEqual(contact);
    });
  });

  describe('setCaregiverNotifications', () => {
    it('enables caregiver notifications', () => {
      const profile = createDefaultProfile();
      const updated = setCaregiverNotifications(profile, true);
      expect(updated.caregiverNotifications).toBe(true);
    });
  });

  describe('getFontScale', () => {
    it('returns 1.0 for standard 16px', () => {
      const profile = createDefaultProfile();
      expect(getFontScale(profile)).toBe(1);
    });

    it('returns 1.25 for elder 20px', () => {
      const profile = createElderProfile();
      expect(getFontScale(profile)).toBe(1.25);
    });
  });

  describe('filterNavItems', () => {
    it('truncates to max nav items', () => {
      const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
      const profile = createElderProfile();
      expect(filterNavItems(items, profile)).toHaveLength(5);
    });

    it('returns all items when under max', () => {
      const items = ['a', 'b'];
      const profile = createDefaultProfile();
      expect(filterNavItems(items, profile)).toHaveLength(2);
    });
  });

  describe('isFeatureVisible', () => {
    const essentials = new Set(['dashboard', 'accounts', 'transfers']);

    it('shows all features when essentialFeaturesOnly is false', () => {
      const profile = createDefaultProfile();
      expect(isFeatureVisible('investments', essentials, profile)).toBe(true);
    });

    it('hides non-essential features in elder mode', () => {
      const profile = createElderProfile();
      expect(isFeatureVisible('investments', essentials, profile)).toBe(false);
    });

    it('shows essential features in elder mode', () => {
      const profile = createElderProfile();
      expect(isFeatureVisible('dashboard', essentials, profile)).toBe(true);
    });
  });

  describe('getCSSCustomProperties', () => {
    it('returns CSS custom properties', () => {
      const profile = createElderProfile();
      const props = getCSSCustomProperties(profile);
      expect(props['--a11y-min-touch-target']).toBe('56px');
      expect(props['--a11y-base-font-size']).toBe('20px');
      expect(props['--a11y-high-contrast']).toBe('1');
    });
  });
});
