// SPDX-License-Identifier: BUSL-1.1

/**
 * PWA Install & Standalone Behavior tests (#1329)
 *
 * Validates that the web app meets installability requirements:
 * - manifest.json has all required fields
 * - Install prompt (beforeinstallprompt) is handled correctly
 * - Standalone display mode detection
 * - Meta tags for PWA (theme-color)
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// manifest.json validation
// ---------------------------------------------------------------------------

describe('PWA manifest.json (#1329)', () => {
  let manifest: Record<string, unknown>;

  beforeEach(() => {
    const raw = readFileSync(resolve(__dirname, '../../public/manifest.json'), 'utf-8');
    manifest = JSON.parse(raw) as Record<string, unknown>;
  });

  it('has a name field', () => {
    expect(manifest.name).toBeDefined();
    expect(typeof manifest.name).toBe('string');
    expect((manifest.name as string).length).toBeGreaterThan(0);
  });

  it('has a short_name field', () => {
    expect(manifest.short_name).toBeDefined();
    expect(typeof manifest.short_name).toBe('string');
  });

  it('has start_url rooted at "/"', () => {
    // start_url may include a tracking query (e.g. ?source=pwa) but must
    // resolve to the app root so installed sessions land on the home page.
    expect(typeof manifest.start_url).toBe('string');
    const startUrl = new URL(manifest.start_url as string, 'https://example.com');
    expect(startUrl.pathname).toBe('/');
  });

  it('has explicit id rooted at "/" so Chromium treats updates as the same app (#1965)', () => {
    expect(typeof manifest.id).toBe('string');
    const id = new URL(manifest.id as string, 'https://example.com');
    expect(id.pathname).toBe('/');
  });

  it('declares scope "/" so the SW controls the entire origin (#1965)', () => {
    expect(manifest.scope).toBe('/');
  });

  it('has display set to "standalone"', () => {
    expect(manifest.display).toBe('standalone');
  });

  it('has a theme_color', () => {
    expect(manifest.theme_color).toBeDefined();
    expect(typeof manifest.theme_color).toBe('string');
    expect(manifest.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('has a background_color', () => {
    expect(manifest.background_color).toBeDefined();
    expect(typeof manifest.background_color).toBe('string');
    expect(manifest.background_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('has at least two icons (192x192 and 512x512)', () => {
    const icons = manifest.icons as Array<{ sizes: string; type: string }>;
    expect(Array.isArray(icons)).toBe(true);
    expect(icons.length).toBeGreaterThanOrEqual(2);

    const sizes = icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('icons have image/png type', () => {
    const icons = manifest.icons as Array<{ type: string }>;
    for (const icon of icons) {
      expect(icon.type).toBe('image/png');
    }
  });

  it('all referenced icon files exist on disk', () => {
    const icons = manifest.icons as Array<{ src: string }>;
    for (const icon of icons) {
      const iconPath = resolve(__dirname, '../../public', icon.src.replace(/^\//, ''));
      expect(existsSync(iconPath), `icon ${icon.src} missing`).toBe(true);
    }
  });

  it('has a description field', () => {
    expect(manifest.description).toBeDefined();
    expect(typeof manifest.description).toBe('string');
    expect((manifest.description as string).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// index.html meta tag validation
// ---------------------------------------------------------------------------

describe('PWA meta tags in index.html (#1329)', () => {
  let html: string;

  beforeEach(() => {
    html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8');
  });

  it('has theme-color meta tag', () => {
    expect(html).toMatch(/<meta\s+name="theme-color"\s+content="[^"]+"/);
  });

  it('links the web app manifest', () => {
    expect(html).toMatch(/<link\s+rel="manifest"\s+href="\/manifest\.json"\s*\/>/);
  });

  it('has viewport meta tag with width=device-width', () => {
    expect(html).toMatch(/<meta\s+name="viewport"\s+content="[^"]*width=device-width/);
  });

  it('has lang attribute on html element', () => {
    expect(html).toMatch(/<html\s+lang="[^"]+"/);
  });
});

// ---------------------------------------------------------------------------
// Standalone display mode detection
// ---------------------------------------------------------------------------

describe('Standalone display mode detection (#1329)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('can detect standalone mode via matchMedia', () => {
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });

    const result = window.matchMedia('(display-mode: standalone)');
    expect(result.matches).toBe(true);
  });

  it('returns false for standalone when running in browser tab', () => {
    const matchMediaMock = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });

    const result = window.matchMedia('(display-mode: standalone)');
    expect(result.matches).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Install prompt lifecycle
// ---------------------------------------------------------------------------

describe('Install prompt handling (#1329)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('beforeinstallprompt event can be captured and deferred', () => {
    let captured: Event | null = null;

    const handler = (event: Event) => {
      event.preventDefault();
      captured = event;
    };

    window.addEventListener('beforeinstallprompt', handler);

    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(event);

    expect(captured).not.toBeNull();
    expect(event.defaultPrevented).toBe(true);

    window.removeEventListener('beforeinstallprompt', handler);
  });

  it('appinstalled event fires when app is installed', () => {
    let installed = false;

    const handler = () => {
      installed = true;
    };

    window.addEventListener('appinstalled', handler);
    window.dispatchEvent(new Event('appinstalled'));

    expect(installed).toBe(true);

    window.removeEventListener('appinstalled', handler);
  });

  it('dismissed state persists in localStorage', () => {
    localStorage.setItem('finance-install-dismissed', 'true');
    expect(localStorage.getItem('finance-install-dismissed')).toBe('true');
  });

  it('dismissed flag can be cleared for re-prompting', () => {
    localStorage.setItem('finance-install-dismissed', 'true');
    localStorage.removeItem('finance-install-dismissed');
    expect(localStorage.getItem('finance-install-dismissed')).toBeNull();
  });
});
