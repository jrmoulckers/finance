// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for #3904: the mobile top header (`.app-header`) must respect
 * the top safe-area inset so it does not underlap the iOS status bar / notch on
 * installed PWAs, mirroring how `.bottom-nav` / `.app-main` handle
 * `safe-area-inset-bottom`. These assertions read the compiled CSS source so the
 * inset can't silently regress if the rule is refactored.
 */
describe('app-header safe-area inset (responsive.css)', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles/responsive.css'), 'utf8');

  const headerRule = css.slice(css.indexOf('.app-header {'), css.indexOf('.app-header__title'));

  it('pads the header top by the safe-area inset so content clears the notch', () => {
    expect(headerRule).toMatch(/padding:[^;]*env\(safe-area-inset-top/);
  });

  it('grows the header height by the safe-area inset so the box fills the notch strip', () => {
    expect(headerRule).toMatch(/height:\s*calc\([^;]*env\(safe-area-inset-top[^;]*\)/);
  });
});
