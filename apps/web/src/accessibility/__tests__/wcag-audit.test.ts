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
  // Mode auto-switching, high-contrast, and chart-HC behaviour now live in the
  // shared @jrm/tokens barrel that tokens.css imports (adopted from
  // jrmoulckers/studio); finance-specific amount tokens live in the overlay.
  const sharedBarrel = readFileSync(
    resolve(__dirname, '../../../vendor/@jrm/tokens/css/default/index.css'),
    'utf-8',
  );
  const overlayCss = readFileSync(
    resolve(__dirname, '../../../src/theme/finance-overlay.css'),
    'utf-8',
  );

  it('should import the high-contrast generated CSS (finance base)', () => {
    expect(tokensCss).toContain('tokens-high-contrast.css');
  });

  it('should import the shared @jrm/tokens barrel that owns mode auto-switching', () => {
    expect(tokensCss).toContain('vendor/@jrm/tokens/css/default/index.css');
  });

  it('should apply all semantic tokens in prefers-contrast: more (shared layer)', () => {
    expect(sharedBarrel).toContain('prefers-contrast: more');
    // Must override ALL semantic categories, not just borders
    expect(sharedBarrel).toContain('--semantic-text-primary');
    expect(sharedBarrel).toContain('--semantic-interactive-default');
    expect(sharedBarrel).toContain('--semantic-status-positive');
    expect(sharedBarrel).toContain('--semantic-background-primary');
  });

  it('should keep financial amount tokens in lockstep with status (finance overlay)', () => {
    expect(overlayCss).toContain('--semantic-amount-positive');
    expect(overlayCss).toContain('--semantic-amount-negative');
  });

  it('should override chart colors for high contrast (shared layer)', () => {
    expect(sharedBarrel).toContain('--color-chart-1');
    expect(sharedBarrel).toContain('--color-chart-hc-1');
  });

  it('should handle dark + high contrast combination (shared layer)', () => {
    expect(sharedBarrel).toContain('prefers-color-scheme: dark');
    expect(sharedBarrel).toContain('prefers-contrast: more');
    // Should have a combined dark+HC media query
    expect(sharedBarrel).toMatch(
      /prefers-color-scheme:\s*dark\)\s*and\s*\(prefers-contrast:\s*more/,
    );
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
    expect(swCode).toContain('cache.addAll(APP_SHELL_PRECACHE_URLS)');
  });

  it('should purge stale caches on activate', () => {
    expect(swCode).toContain('caches.delete(key)');
  });

  it('should handle Background Sync', () => {
    expect(swCode).toContain('SYNC_TAG');
    expect(swCode).toContain('replayPendingMutations');
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

describe('Microinteractions CSS (WCAG 2.3.3)', () => {
  const css = loadCss('microinteractions.css');
  const mainTsx = readFileSync(resolve(__dirname, '../../../src/main.tsx'), 'utf-8');

  // Regression guard for #3199: the stylesheet was orphaned for its entire
  // history — present in the repo but never imported — silently nullifying the
  // shared hover state-layer (#3161) and micro-interaction library (#313/#314).
  it('must be imported by main.tsx so its rules reach users (#3199)', () => {
    expect(mainTsx).toContain("import './styles/microinteractions.css'");
  });

  it('should gate motion behind prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  it('should disable the decorative shake animation under reduced motion', () => {
    const reducedMotionBlock = css.slice(css.indexOf('prefers-reduced-motion: reduce'));
    expect(reducedMotionBlock).toContain('.shake');
  });

  it('should disable the nav-indicator slide (::after) under reduced motion', () => {
    const reducedMotionBlock = css.slice(css.indexOf('prefers-reduced-motion: reduce'));
    expect(reducedMotionBlock).toContain('.nav-item::after');
  });

  it('should drop shadow-based effects in prefers-contrast: more', () => {
    expect(css).toContain('prefers-contrast: more');
  });
});
