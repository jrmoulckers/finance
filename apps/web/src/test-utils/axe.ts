// SPDX-License-Identifier: BUSL-1.1

/**
 * Lightweight axe-core harness for Vitest + jsdom.
 *
 * We drive `axe-core` directly (already available in the workspace via the
 * Storybook a11y addon and declared as an explicit devDependency) rather than
 * pulling in a wrapper library. This keeps the regression tests dependency-light
 * while still asserting zero WCAG violations on rendered shared components.
 *
 * jsdom does not perform layout, so rules that require computed geometry or
 * real colour rendering (e.g. `color-contrast`) cannot run meaningfully and are
 * disabled here. Contrast is covered separately by the design token audits and
 * manual/E2E checks.
 */

import axe, { type RunOptions, type Result } from 'axe-core';

const DEFAULT_OPTIONS: RunOptions = {
  rules: {
    // Requires real layout/painting which jsdom does not provide.
    'color-contrast': { enabled: false },
  },
};

function formatViolations(violations: Result[]): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => `    - ${node.target.join(' ')}`).join('\n');
      return `  • [${violation.id}] ${violation.help} (${violation.impact ?? 'n/a'})\n${targets}`;
    })
    .join('\n');
}

/**
 * Runs axe-core against a DOM subtree and throws a readable error if any
 * accessibility violations are found.
 */
export async function expectNoAxeViolations(
  container: Element,
  options: RunOptions = {},
): Promise<void> {
  const results = await axe.run(container, { ...DEFAULT_OPTIONS, ...options });

  if (results.violations.length > 0) {
    throw new Error(
      `Expected no axe-core accessibility violations but found ${results.violations.length}:\n${formatViolations(
        results.violations,
      )}`,
    );
  }
}
