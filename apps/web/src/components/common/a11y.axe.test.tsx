// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessibility regression tests (#3628).
 *
 * Renders the shared, presentational a11y primitives and asserts that
 * axe-core reports zero WCAG violations. These act as a safety net so future
 * changes to the shared component library cannot silently regress core
 * accessibility semantics (labels, roles, name/role/value).
 */

import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, it } from 'vitest';

import { expectNoAxeViolations } from '../../test-utils/axe';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { EmptyState } from './EmptyState';
import { ModalBackdrop } from './ModalBackdrop';
import { VisuallyHidden } from './VisuallyHidden';

describe('shared component accessibility (axe-core)', () => {
  it('Button has no axe violations', async () => {
    const { container } = render(createElement(Button, { children: 'Save changes' }));
    await expectNoAxeViolations(container);
  });

  it('destructive Button has no axe violations', async () => {
    const { container } = render(
      createElement(Button, { variant: 'destructive', children: 'Delete account' }),
    );
    await expectNoAxeViolations(container);
  });

  it('Checkbox with a visible label has no axe violations', async () => {
    const { container } = render(
      createElement(Checkbox, { label: 'Enable auto-pay', defaultChecked: true }),
    );
    await expectNoAxeViolations(container);
  });

  it('EmptyState has no axe violations', async () => {
    const { container } = render(
      createElement(EmptyState, {
        title: 'No transactions yet',
        description: 'Once you add an account your transactions will appear here.',
      }),
    );
    await expectNoAxeViolations(container);
  });

  it('ModalBackdrop wrapping a dialog has no axe violations', async () => {
    const { container } = render(
      createElement(
        ModalBackdrop,
        null,
        createElement(
          'div',
          { role: 'dialog', 'aria-label': 'Example dialog' },
          createElement('p', null, 'Dialog body content.'),
        ),
      ),
    );
    await expectNoAxeViolations(container);
  });

  it('VisuallyHidden content has no axe violations', async () => {
    const { container } = render(
      createElement(
        'div',
        null,
        createElement(VisuallyHidden, null, 'Screen-reader only context'),
        createElement('span', { 'aria-hidden': true }, 'Visible glyph'),
      ),
    );
    await expectNoAxeViolations(container);
  });
});
