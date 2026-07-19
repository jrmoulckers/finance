// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for #3904: the mobile top header (`.app-header`) and bottom
 * tab bar (`.bottom-nav`) must respect the device safe-area insets so their
 * interactive content does not underlap the iOS status bar / notch (top) or the
 * home indicator (bottom) on installed PWAs. These assertions read the compiled
 * CSS source so the insets can't silently regress if the rules are refactored.
 */
describe('safe-area insets (responsive.css)', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles/responsive.css'), 'utf8');

  const headerRule = css.slice(css.indexOf('.app-header {'), css.indexOf('.app-header__title'));

  const bottomNavRule = css.slice(css.indexOf('.bottom-nav {'), css.indexOf('.nav-item {'));

  it('pads the header top by the safe-area inset so content clears the notch', () => {
    expect(headerRule).toMatch(/padding:[^;]*env\(safe-area-inset-top/);
  });

  it('grows the header height by the safe-area inset so the box fills the notch strip', () => {
    expect(headerRule).toMatch(/height:\s*calc\([^;]*env\(safe-area-inset-top[^;]*\)/);
  });

  it('pads the bottom nav by the safe-area inset so tap targets clear the home indicator', () => {
    expect(bottomNavRule).toMatch(/padding-bottom:\s*env\(safe-area-inset-bottom/);
  });

  it('grows the bottom nav height by the safe-area inset so the tap targets are not compressed', () => {
    expect(bottomNavRule).toMatch(/height:\s*calc\([^;]*env\(safe-area-inset-bottom[^;]*\)/);
  });
});
