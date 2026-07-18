// SPDX-License-Identifier: BUSL-1.1

/**
 * Contrast regression guard for the first-run GDPR ConsentDialog footer (#3884).
 *
 * Why this test exists (and why axe never caught the original bug):
 * ----------------------------------------------------------------------------
 * The footer copy ("By using this app, you agree to our Privacy Policy…") is a
 * legally-significant consent notice. It regressed to
 * `color: var(--semantic-text-tertiary, var(--semantic-text-disabled))`.
 * `--semantic-text-tertiary` is never defined in the token set, so the
 * `--semantic-text-disabled` fallback always applied — a deliberately
 * low-contrast, WCAG-exempt token intended for *disabled* UI. That dropped the
 * footer to ~1.24:1 (light) and ~1.56:1 (dark), a clear SC 1.4.3 failure.
 *
 * The existing axe harness (`src/test-utils/axe.ts`) **disables the
 * `color-contrast` rule** because jsdom performs no layout or painting, so
 * axe-core physically cannot evaluate computed colour contrast. The consent
 * dialog therefore had zero axe coverage for the exact defect class that broke.
 *
 * This guard closes that gap by evaluating contrast at the *token* layer:
 * it pins the CSS to a legible token and recomputes the WCAG contrast ratio of
 * the footer text against the dialog surface for every shipped theme, using the
 * resolved token hex values. It needs no layout engine, so it runs reliably in
 * jsdom and fails loudly if the footer token (or a theme's palette) ever drops
 * below AA again.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConsentRecord } from '../../lib/consent-storage';

// The dialog only renders when `needsConsent` is true; mock the hook so the
// footer is present without touching localStorage.
const acceptAll = vi.fn();
const rejectAll = vi.fn();
const savePreferences = vi.fn();
const updateCategory = vi.fn();
const refresh = vi.fn();

const mockConsent: ConsentRecord = {
  categories: {
    essential: true,
    analytics: false,
    error_reporting: false,
    sync: false,
    marketing: false,
  },
  timestamp: '',
  policyVersion: '1.0.0',
  method: 'first_run',
  hasCompletedFirstRun: false,
};

vi.mock('../../hooks/useConsent', () => ({
  useConsent: () => ({
    consent: mockConsent,
    needsConsent: true,
    hasCompleted: false,
    updateCategory,
    acceptAll,
    rejectAll,
    savePreferences,
    refresh,
  }),
}));

import { ConsentDialog } from './ConsentDialog';

// ---------------------------------------------------------------------------
// WCAG contrast math (SC 1.4.3 relative luminance / contrast ratio).
// ---------------------------------------------------------------------------

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Remove CSS block comments so declaration assertions ignore explanatory prose. */
function stripComments(cssText: string): string {
  return cssText.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Resolved `--semantic-background-primary` (the dialog surface) and
 * `--semantic-text-secondary` (the footer copy token after the #3884 fix) for
 * every shipped theme.
 *
 * Sourced from the vendored shared token layer, which owns the semantic colour
 * DNA and its mode variants:
 *   - light:         apps/web/vendor/@jrm/tokens/css/default/tokens.css
 *   - dark:          apps/web/vendor/@jrm/tokens/css/default/tokens-dark.css
 *   - dark-oled:     apps/web/vendor/@jrm/tokens/css/default/tokens-dark-oled.css
 *   - high-contrast: apps/web/vendor/@jrm/tokens/css/default/tokens-high-contrast.css
 * If a token value changes, update this table in lockstep — that is the point
 * of the guard.
 */
const THEME_COLORS: Record<string, { surface: string; footerText: string }> = {
  light: { surface: '#f4f4fb', footerText: '#5b5e7e' },
  dark: { surface: '#0f1020', footerText: '#a3a6cb' },
  'dark-oled': { surface: '#000000', footerText: '#a3a6cb' },
  'high-contrast': { surface: '#ffffff', footerText: '#1c1d2e' },
};

const AA_NORMAL_TEXT = 4.5;

describe('ConsentDialog footer contrast (#3884)', () => {
  const cssPath = join(dirname(fileURLToPath(import.meta.url)), 'consent-dialog.css');
  const css = readFileSync(cssPath, 'utf8');

  function footerRuleBody(): string {
    // Grab the declaration block for `.consent-dialog__footer` (not the
    // `.consent-dialog__footer-link` rule) and strip comments so assertions
    // inspect the actual declarations, not explanatory prose.
    const match = css.match(/\.consent-dialog__footer\s*\{([^}]*)\}/);
    expect(match, 'expected a .consent-dialog__footer rule in consent-dialog.css').toBeTruthy();
    return stripComments(match![1]);
  }

  it('pins the footer copy to the legible secondary token, not the disabled/tertiary fallback', () => {
    const body = footerRuleBody();
    expect(body).toContain('--semantic-text-secondary');
    // The disabled token is WCAG-exempt; it must never gate legally-required copy.
    expect(body).not.toContain('--semantic-text-disabled');
    expect(body).not.toContain('--semantic-text-tertiary');
  });

  it('applies the same legible token to the "(required)" caption', () => {
    const match = css.match(/\.consent-dialog__category-required\s*\{([^}]*)\}/);
    expect(match).toBeTruthy();
    const body = stripComments(match![1]);
    expect(body).toContain('--semantic-text-secondary');
    expect(body).not.toContain('--semantic-text-disabled');
  });

  it.each(Object.entries(THEME_COLORS))(
    'footer copy clears WCAG AA (>=4.5:1) on the dialog surface in the %s theme',
    (_theme, { surface, footerText }) => {
      expect(contrastRatio(footerText, surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    },
  );

  it('regression sentinel: the old disabled-token fallback would have failed AA in light & dark', () => {
    // Documents the defect this guard protects against: disabled text on the
    // light (#dcdcea) and dark (#313357) surfaces is far below AA.
    expect(contrastRatio('#dcdcea', '#f4f4fb')).toBeLessThan(AA_NORMAL_TEXT);
    expect(contrastRatio('#313357', '#0f1020')).toBeLessThan(AA_NORMAL_TEXT);
  });
});

describe('ConsentDialog footer rendering (#3884)', () => {
  beforeEach(() => {
    render(<ConsentDialog />);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the legally-significant footer copy', () => {
    expect(screen.getByText(/By using this app, you agree to our/i)).toBeInTheDocument();
    expect(
      screen.getByText(/You can change your preferences at any time in Settings/i),
    ).toBeInTheDocument();
  });

  it('keeps the Privacy Policy link distinguishable by more than colour (underline + link role)', () => {
    const link = screen.getByRole('link', { name: /privacy policy/i });
    expect(link).toHaveClass('consent-dialog__footer-link');

    // The link is separated from body copy by a non-colour cue (underline),
    // satisfying SC 1.4.1 (Use of Colour) regardless of theme.
    const linkRule = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'consent-dialog.css'),
      'utf8',
    ).match(/\.consent-dialog__footer-link\s*\{([^}]*)\}/);
    expect(linkRule).toBeTruthy();
    expect(linkRule![1]).toContain('text-decoration: underline');
    // The link colour token is intentionally different from the body copy token
    // so the link does not blend into the surrounding sentence.
    expect(linkRule![1]).toContain('--semantic-interactive-default');
  });
});
