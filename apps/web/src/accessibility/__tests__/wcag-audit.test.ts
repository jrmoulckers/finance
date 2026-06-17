// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessibility audit tests for WCAG 2.2 AA compliance.
 *
 * Validates that:
 * - Focus indicators are properly configured
 * - Touch targets meet minimum sizing
 * - Reduced motion preferences are respected
 * - Screen reader utilities exist
 * - Dark mode focus colors are adjusted
 *
 * These tests validate CSS file contents rather than runtime behavior
 * to catch regressions in the accessibility stylesheet.
 *
 * References: issue #915
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadCss(filename: string): string {
  const filePath = resolve(__dirname, '../../../src/styles', filename);
  return readFileSync(filePath, 'utf-8');
}

describe('Accessibility CSS', () => {
  const css = loadCss('accessibility.css');

  describe('Focus Indicators (WCAG 2.4.7, 2.4.11)', () => {
    it('should define :focus-visible styles', () => {
      expect(css).toContain(':focus-visible');
    });

    it('should use outline for focus indicators (not box-shadow)', () => {
      expect(css).toContain('outline:');
      // Should not use box-shadow for focus — it clips in overflow contexts
    });

    it('should have outline-offset for adequate spacing', () => {
      expect(css).toContain('outline-offset:');
    });

    it('should enhance focus in high contrast mode', () => {
      expect(css).toContain('prefers-contrast: more');
    });
  });

  describe('Touch Target Sizing (WCAG 2.5.8)', () => {
    it('should set minimum 44px height on buttons', () => {
      expect(css).toContain('min-height: 44px');
    });

    it('should set minimum 44px width on buttons', () => {
      expect(css).toContain('min-width: 44px');
    });

    it('should set minimum 44px height on inputs', () => {
      // input, select, textarea should all have min-height
      expect(css).toMatch(/input[\s\S]*min-height:\s*44px/);
    });
  });

  describe('Reduced Motion (WCAG 2.3.3)', () => {
    it('should include prefers-reduced-motion media query', () => {
      expect(css).toContain('prefers-reduced-motion: reduce');
    });

    it('should reduce animation duration', () => {
      expect(css).toContain('animation-duration: 0.01ms');
    });

    it('should reduce transition duration', () => {
      expect(css).toContain('transition-duration: 0.01ms');
    });
  });

  describe('Screen Reader Utilities', () => {
    it('should define .sr-only class', () => {
      expect(css).toContain('.sr-only');
    });

    it('should visually hide sr-only content', () => {
      expect(css).toContain('clip: rect(0, 0, 0, 0)');
    });
  });

  describe('Dark Mode Focus', () => {
    it('should adjust focus color for dark theme', () => {
      expect(css).toContain("[data-theme='dark']");
      expect(css).toContain('prefers-color-scheme: dark');
    });
  });

  describe('High Contrast Mode (WCAG 1.4.3, 1.4.6, 1.4.11)', () => {
    it('should enhance focus indicators in prefers-contrast: more', () => {
      expect(css).toContain('prefers-contrast: more');
      expect(css).toContain('outline-width: 3px');
    });

    it('should add visible borders to buttons in high contrast', () => {
      // Secondary buttons have transparent bg — need borders for visibility
      expect(css).toContain('border: 2px solid currentColor');
    });

    it('should add heavier borders to cards in high contrast', () => {
      expect(css).toMatch(/\[class\*='card'\]/i);
    });

    it('should increase input border width in high contrast', () => {
      expect(css).toContain('border-width: 2px');
    });

    it('should add borders to progress bars in high contrast', () => {
      expect(css).toContain("[role='progressbar']");
    });

    it('should underline links in high contrast', () => {
      expect(css).toContain('text-decoration: underline');
    });

    it('should support explicit high-contrast theme toggle', () => {
      expect(css).toContain("[data-theme='high-contrast']");
    });

    it('should adjust focus color for explicit high-contrast theme', () => {
      expect(css).toContain("[data-theme='high-contrast'] :focus-visible");
    });
  });
});

describe('High Contrast Token Integration', () => {
  const tokensCss = readFileSync(resolve(__dirname, '../../../src/theme/tokens.css'), 'utf-8');

  it('should import the high-contrast generated CSS', () => {
    expect(tokensCss).toContain('tokens-high-contrast.css');
  });

  it('should apply all semantic tokens in prefers-contrast: more', () => {
    expect(tokensCss).toContain('prefers-contrast: more');
    // Must override ALL semantic categories, not just borders
    expect(tokensCss).toContain('--semantic-text-primary');
    expect(tokensCss).toContain('--semantic-interactive-default');
    expect(tokensCss).toContain('--semantic-status-positive');
    expect(tokensCss).toContain('--semantic-amount-positive');
    expect(tokensCss).toContain('--semantic-background-primary');
  });

  it('should override chart colors for high contrast', () => {
    expect(tokensCss).toContain('--color-chart-1');
    expect(tokensCss).toContain('--color-chart-hc-1');
  });

  it('should handle dark + high contrast combination', () => {
    expect(tokensCss).toContain('prefers-color-scheme: dark');
    expect(tokensCss).toContain('prefers-contrast: more');
    // Should have a combined dark+HC media query
    expect(tokensCss).toMatch(/prefers-color-scheme:\s*dark\)\s*and\s*\(prefers-contrast:\s*more/);
  });
});

describe('Service Worker Caching', () => {
  const swCode = readFileSync(resolve(__dirname, '../../../src/sw/service-worker.ts'), 'utf-8');

  it('should implement network-only no-store for authenticated API requests', () => {
    expect(swCode).toContain('networkOnlyNoStore');
  });

  it('should route non-sync API requests away from Cache Storage', () => {
    expect(swCode).toContain("pathname.startsWith('/api/'))");
    expect(swCode).toContain("return 'network-only-no-store'");
  });

  it('should implement cache-first for static assets', () => {
    expect(swCode).toContain('cacheFirst');
  });

  it('should pre-cache app shell on install', () => {
    expect(swCode).toContain('PRECACHE_MANIFEST');
    expect(swCode).toContain("cache.addAll(['/', '/index.html', '/manifest.json'])");
  });

  it('should purge stale caches on activate', () => {
    expect(swCode).toContain('caches.delete(key)');
  });

  it('should handle Background Sync', () => {
    expect(swCode).toContain('SYNC_TAG');
    expect(swCode).toContain('replayMutations');
  });
});

describe('Offline Fallback Styles', () => {
  const css = loadCss('offline-fallback.css');

  it('should have minimum touch target on retry button', () => {
    expect(css).toContain('min-height: 44px');
  });

  it('should have focus-visible styles', () => {
    expect(css).toContain(':focus-visible');
  });

  it('should respect reduced motion', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  it('should support dark mode', () => {
    expect(css).toContain('prefers-color-scheme: dark');
  });
});
