// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  FLUENT_FILLED,
  ICON_PACK_PREFERENCE_KEY,
  MATERIAL_SYMBOLS_ROUNDED,
} from '../../icons/tokens';
import { AppearanceSettings } from './AppearanceSettings';

describe('AppearanceSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists icon style changes to the settings store', () => {
    render(<AppearanceSettings />);

    fireEvent.click(screen.getByRole('radio', { name: /Fluent \(Filled\)/ }));

    expect(localStorage.getItem(ICON_PACK_PREFERENCE_KEY)).toBe(FLUENT_FILLED);
    expect(screen.getByRole('radio', { name: /Fluent \(Filled\)/ })).toBeChecked();
  });

  it('resets icon style to the Standard default', () => {
    localStorage.setItem(ICON_PACK_PREFERENCE_KEY, MATERIAL_SYMBOLS_ROUNDED);
    render(<AppearanceSettings />);

    fireEvent.click(screen.getByRole('button', { name: /reset icon style/i }));

    expect(localStorage.getItem(ICON_PACK_PREFERENCE_KEY)).toBeNull();
    expect(screen.getByRole('radio', { name: /Standard \(Lucide\)/ })).toBeChecked();
  });
});
