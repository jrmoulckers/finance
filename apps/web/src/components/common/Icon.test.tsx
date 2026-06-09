// SPDX-License-Identifier: BUSL-1.1

import type { SVGProps } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Icon } from './Icon';
vi.mock('@fluentui/react-icons', () => ({
  Home24Filled: (props: SVGProps<SVGSVGElement>) => <svg {...props} data-fluent-mock="filled" />,
  Home24Regular: (props: SVGProps<SVGSVGElement>) => <svg {...props} data-fluent-mock="regular" />,
}));

import {
  FLUENT_FILLED,
  FLUENT_REGULAR,
  ICON_PACK_PREFERENCE_KEY,
  IOS_SF_SYMBOLS,
  MATERIAL_SYMBOLS_OUTLINED,
  MATERIAL_SYMBOLS_ROUNDED,
  MATERIAL_SYMBOLS_SHARP,
  STANDARD_LUCIDE,
  IconToken,
} from '../../icons/tokens';

function renderIconWithStoredPack(packId: string | null) {
  if (packId === null) {
    localStorage.removeItem(ICON_PACK_PREFERENCE_KEY);
  } else {
    localStorage.setItem(ICON_PACK_PREFERENCE_KEY, packId);
  }
  return render(<Icon name={IconToken.HOME} ariaLabel="Home" />);
}

describe('Icon', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to Lucide when no icon pack is stored', () => {
    renderIconWithStoredPack(null);

    const icon = screen.getByRole('img', { name: 'Home' });
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon).toHaveAttribute('data-icon-pack', STANDARD_LUCIDE);
    expect(icon).toHaveAttribute('data-icon-token', IconToken.HOME);
  });

  it.each([
    [MATERIAL_SYMBOLS_OUTLINED, 'material-symbols-outlined'],
    [MATERIAL_SYMBOLS_ROUNDED, 'material-symbols-rounded'],
    [MATERIAL_SYMBOLS_SHARP, 'material-symbols-sharp'],
  ])('renders %s as a Material Symbols span', (packId, className) => {
    renderIconWithStoredPack(packId);

    const icon = screen.getByRole('img', { name: 'Home' });
    expect(icon.tagName.toLowerCase()).toBe('span');
    expect(icon).toHaveClass(className);
    expect(icon).toHaveTextContent('home');
    expect(icon).toHaveAttribute('data-icon-pack', packId);
  });

  it.each([FLUENT_REGULAR, FLUENT_FILLED])(
    'renders %s with Fluent icons after lazy import',
    async (packId) => {
      renderIconWithStoredPack(packId);

      await waitFor(() => {
        const icon = screen.getByRole('img', { name: 'Home' });
        expect(icon).toHaveAttribute('data-icon-pack', packId);
        expect(icon.tagName.toLowerCase()).toBe('svg');
      });
    },
  );

  it('falls back to Standard Lucide when an unsupported web pack is stored', () => {
    renderIconWithStoredPack(IOS_SF_SYMBOLS);

    expect(screen.getByRole('img', { name: 'Home' })).toHaveAttribute(
      'data-icon-pack',
      STANDARD_LUCIDE,
    );
  });
});
