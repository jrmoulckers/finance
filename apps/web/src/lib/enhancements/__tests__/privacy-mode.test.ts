import { describe, it, expect } from 'vitest';
import {
  createDefaultConfig,
  setPrivacyLevel,
  togglePrivacy,
  getEffectiveLevel,
  setScreenOverride,
  removeScreenOverride,
  maskAmount,
  getAriaLabel,
  maskText,
} from '../privacy-mode';

describe('privacy-mode', () => {
  describe('createDefaultConfig', () => {
    it('creates config with privacy off', () => {
      const config = createDefaultConfig();
      expect(config.level).toBe('off');
      expect(config.quickToggleEnabled).toBe(true);
      expect(config.overrides).toHaveLength(0);
    });
  });

  describe('setPrivacyLevel', () => {
    it('sets level', () => {
      const config = setPrivacyLevel(createDefaultConfig(), 'full');
      expect(config.level).toBe('full');
    });
  });

  describe('togglePrivacy', () => {
    it('cycles off → partial → full → off', () => {
      let config = createDefaultConfig();
      config = togglePrivacy(config);
      expect(config.level).toBe('partial');
      config = togglePrivacy(config);
      expect(config.level).toBe('full');
      config = togglePrivacy(config);
      expect(config.level).toBe('off');
    });
  });

  describe('getEffectiveLevel', () => {
    it('returns global level when no override', () => {
      const config = setPrivacyLevel(createDefaultConfig(), 'full');
      expect(getEffectiveLevel(config, 'dashboard')).toBe('full');
    });

    it('returns override level when set', () => {
      let config = setPrivacyLevel(createDefaultConfig(), 'full');
      config = setScreenOverride(config, 'dashboard', 'off');
      expect(getEffectiveLevel(config, 'dashboard')).toBe('off');
    });
  });

  describe('setScreenOverride / removeScreenOverride', () => {
    it('replaces existing override for same screen', () => {
      let config = createDefaultConfig();
      config = setScreenOverride(config, 'dash', 'partial');
      config = setScreenOverride(config, 'dash', 'full');
      expect(config.overrides).toHaveLength(1);
      expect(config.overrides[0].level).toBe('full');
    });

    it('removes override', () => {
      let config = setScreenOverride(createDefaultConfig(), 'dash', 'full');
      config = removeScreenOverride(config, 'dash');
      expect(config.overrides).toHaveLength(0);
    });
  });

  describe('maskAmount', () => {
    it('returns formatted amount when off', () => {
      expect(maskAmount(123456, 'off')).toBe('$1,234.56');
    });

    it('masks cents in partial mode', () => {
      const result = maskAmount(123456, 'partial');
      expect(result).toContain('$');
      expect(result).toContain('.••');
      expect(result).toContain('1,234');
    });

    it('fully masks in full mode', () => {
      expect(maskAmount(123456, 'full')).toBe('$•••.••');
    });

    it('handles negative amounts', () => {
      expect(maskAmount(-50000, 'off')).toBe('-$500.00');
      expect(maskAmount(-50000, 'partial')).toBe('-$500.••');
    });

    it('handles zero', () => {
      expect(maskAmount(0, 'off')).toBe('$0.00');
    });
  });

  describe('getAriaLabel', () => {
    it('returns formatted amount when off', () => {
      expect(getAriaLabel(123456, 'off')).toBe('$1,234.56');
    });

    it('returns privacy label when partial or full', () => {
      expect(getAriaLabel(123456, 'partial')).toBe('Amount hidden for privacy');
      expect(getAriaLabel(123456, 'full')).toBe('Amount hidden for privacy');
    });
  });

  describe('maskText', () => {
    it('returns original when off', () => {
      expect(maskText('Starbucks', 'off')).toBe('Starbucks');
    });

    it('partially masks in partial mode', () => {
      const result = maskText('Starbucks', 'partial');
      expect(result).toMatch(/^St•+$/);
    });

    it('fully masks in full mode', () => {
      const result = maskText('Starbucks', 'full');
      expect(result).toMatch(/^•+$/);
    });

    it('handles short text in partial mode', () => {
      expect(maskText('Hi', 'partial')).toBe('••••');
    });
  });
});
