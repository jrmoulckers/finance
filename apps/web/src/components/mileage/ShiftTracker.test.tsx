// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShiftTracker } from './ShiftTracker';

describe('ShiftTracker', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('runs a start -> log preset leg -> end flow and shows grouped totals', () => {
    render(<ShiftTracker />);

    // No in-progress shift yet: the start control is visible.
    const platformInput = screen.getByLabelText('Platform') as HTMLInputElement;
    fireEvent.change(platformInput, { target: { value: 'DoorDash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start shift' }));

    // Active shift panel appears with a live timer and status.
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();

    // One-tap preset prefill for the leg start/end.
    fireEvent.click(screen.getByRole('button', { name: /^From Home base/ }));
    fireEvent.click(screen.getByRole('button', { name: /^To Delivery hotspot/ }));

    fireEvent.change(screen.getByLabelText('Miles'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log leg' }));

    // End the shift.
    fireEvent.click(screen.getByRole('button', { name: 'End shift' }));

    // Grouped totals by platform now show the logged mileage (10 mi @ 67c = $6.70).
    const totals = screen.getByLabelText('Shift totals by platform');
    expect(within(totals).getByText('DoorDash')).toBeInTheDocument();
    expect(within(totals).getByText('10.0 mi')).toBeInTheDocument();
    expect(within(totals).getByText('$6.70')).toBeInTheDocument();
  });

  it('requires presets and miles before logging a leg', () => {
    render(<ShiftTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Start shift' }));

    fireEvent.click(screen.getByRole('button', { name: 'Log leg' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a start and end preset');
  });

  it('exports an IRS audit trail as CSV', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ShiftTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Start shift' }));
    fireEvent.click(screen.getByRole('button', { name: /^From Home base/ }));
    fireEvent.click(screen.getByRole('button', { name: /^To Delivery hotspot/ }));
    fireEvent.change(screen.getByLabelText('Miles'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log leg' }));

    fireEvent.click(screen.getByRole('button', { name: 'Export IRS audit trail as CSV' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
