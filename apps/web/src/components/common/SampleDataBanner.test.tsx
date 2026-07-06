// SPDX-License-Identifier: BUSL-1.1

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SampleDataBanner } from './SampleDataBanner';
import { isSampleDataActive, requestCleanSlate } from '../../db/sampleData';
import { wipeLocalData } from '../../storage/wipeLocalData';

vi.mock('../../db/sampleData', () => ({
  isSampleDataActive: vi.fn(),
  requestCleanSlate: vi.fn(),
}));

vi.mock('../../storage/wipeLocalData', () => ({
  wipeLocalData: vi.fn().mockResolvedValue([]),
}));

describe('SampleDataBanner (#3415)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(wipeLocalData).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when the workspace is not sample data', () => {
    vi.mocked(isSampleDataActive).mockReturnValue(false);
    const { container } = render(<SampleDataBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('labels the workspace as sample data when active', () => {
    vi.mocked(isSampleDataActive).mockReturnValue(true);
    render(<SampleDataBanner />);

    expect(screen.getByRole('region', { name: /sample data notice/i })).toBeInTheDocument();
    // The text badge — not color alone — carries the "sample" meaning.
    expect(screen.getByText(/^sample data$/i)).toBeInTheDocument();
  });

  it('dismisses without wiping when the user keeps exploring', async () => {
    vi.mocked(isSampleDataActive).mockReturnValue(true);
    const user = userEvent.setup();
    render(<SampleDataBanner />);

    await user.click(screen.getByRole('button', { name: /keep exploring/i }));

    expect(screen.queryByRole('region', { name: /sample data notice/i })).not.toBeInTheDocument();
    expect(requestCleanSlate).not.toHaveBeenCalled();
    expect(wipeLocalData).not.toHaveBeenCalled();
  });

  it('requests a clean slate, wipes local data, and reloads on start fresh', async () => {
    vi.mocked(isSampleDataActive).mockReturnValue(true);
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    const user = userEvent.setup();
    render(<SampleDataBanner />);

    await user.click(screen.getByRole('button', { name: /clear sample data & start fresh/i }));

    await waitFor(() => {
      expect(requestCleanSlate).toHaveBeenCalledTimes(1);
      expect(wipeLocalData).toHaveBeenCalledTimes(1);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
  });
});
