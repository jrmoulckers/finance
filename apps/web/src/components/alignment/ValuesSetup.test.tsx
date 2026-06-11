// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultValuePreferences } from '../../lib/alignment';
import { ValuesSetup } from './ValuesSetup';

describe('ValuesSetup', () => {
  it('updates a value weight', () => {
    const onChange = vi.fn();
    render(<ValuesSetup preferences={createDefaultValuePreferences()} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Security importance'), { target: { value: '4' } });

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([{ valueId: 'security', weight: 4 }]),
    );
  });

  it('supports keyboard reordering through the shared sortable list', () => {
    const onChange = vi.fn();
    render(<ValuesSetup preferences={createDefaultValuePreferences()} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Security' }), {
      key: 'ArrowDown',
      altKey: true,
    });

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0]?.[0][0]?.valueId).toBe('freedom');
    expect(onChange.mock.calls[0]?.[0][1]?.valueId).toBe('security');
  });
});
