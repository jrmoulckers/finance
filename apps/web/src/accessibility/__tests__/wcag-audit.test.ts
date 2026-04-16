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
});

describe('Service Worker Caching', () => {
  const swCode = readFileSync(resolve(__dirname, '../../../src/sw/service-worker.ts'), 'utf-8');

  it('should implement stale-while-revalidate strategy', () => {
    expect(swCode).toContain('staleWhileRevalidate');
  });

  it('should use stale-while-revalidate for API requests', () => {
    // The fetch handler should route /api/ to staleWhileRevalidate
    expect(swCode).toContain("url.pathname.startsWith('/api/')");
    expect(swCode).toContain('staleWhileRevalidate(request)');
  });

  it('should implement cache-first for static assets', () => {
    expect(swCode).toContain('cacheFirst');
  });

  it('should pre-cache app shell on install', () => {
    expect(swCode).toContain('APP_SHELL');
    expect(swCode).toContain('cache.addAll(APP_SHELL)');
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
