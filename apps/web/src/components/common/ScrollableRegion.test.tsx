// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScrollableRegion } from './ScrollableRegion';

/**
 * jsdom reports `scrollWidth`/`clientWidth` as `0`, so overflow is not detected
 * by default. These helpers let a test simulate a container whose content is
 * wider than its box.
 */
function stubOverflow(scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get() {
      return scrollWidth;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return clientWidth;
    },
  });
}

function restoreOverflow(): void {
  // Deleting the own-property override restores jsdom's native getter (0).
  delete (HTMLElement.prototype as unknown as { scrollWidth?: number }).scrollWidth;
  delete (HTMLElement.prototype as unknown as { clientWidth?: number }).clientWidth;
}

describe('ScrollableRegion', () => {
  afterEach(() => {
    restoreOverflow();
    vi.restoreAllMocks();
  });

  it('exposes a labelled region for assistive tech', () => {
    render(
      <ScrollableRegion label="Investment holdings">
        <table>
          <tbody>
            <tr>
              <td>Row</td>
            </tr>
          </tbody>
        </table>
      </ScrollableRegion>,
    );

    expect(screen.getByRole('region', { name: 'Investment holdings' })).toBeInTheDocument();
  });

  it('applies the shared scroll + themed-scrollbar classes and any extra class', () => {
    render(
      <ScrollableRegion label="Report data" className="report-scroll">
        <table />
      </ScrollableRegion>,
    );

    const region = screen.getByRole('region', { name: 'Report data' });
    expect(region).toHaveClass('data-table-scroll');
    expect(region).toHaveClass('themed-scrollbar');
    expect(region).toHaveClass('report-scroll');
  });

  it('is not a keyboard tab stop when the content fits (no overflow)', () => {
    render(
      <ScrollableRegion label="Fits fine">
        <table />
      </ScrollableRegion>,
    );

    expect(screen.getByRole('region', { name: 'Fits fine' })).not.toHaveAttribute('tabindex');
  });

  it('becomes keyboard focusable when the content overflows horizontally', () => {
    stubOverflow(800, 320);

    render(
      <ScrollableRegion label="Wide table">
        <table />
      </ScrollableRegion>,
    );

    expect(screen.getByRole('region', { name: 'Wide table' })).toHaveAttribute('tabindex', '0');
  });
});
