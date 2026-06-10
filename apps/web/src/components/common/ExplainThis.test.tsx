import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExplainThis } from './ExplainThis';

describe('ExplainThis', () => {
  it('opens glossary content on click', () => {
    render(<ExplainThis glossaryKey="netWorth" />);

    fireEvent.click(screen.getByRole('button', { name: /explain net worth/i }));

    expect(screen.getByRole('tooltip', { name: 'Net Worth' })).toBeInTheDocument();
    expect(screen.getByText(/what you own minus what you owe/i)).toBeInTheDocument();
    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(screen.getByText('Why it matters')).toBeInTheDocument();
  });

  it('opens contextual tips on hover', () => {
    render(<ExplainThis tipKey="budget503020Rule" />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: /50\/30\/20 rule/i }));

    expect(screen.getByRole('tooltip', { name: '50/30/20 Rule' })).toBeInTheDocument();
    expect(
      screen.getByText(/50% for needs, 30% for wants, and 20% for savings/i),
    ).toBeInTheDocument();
  });

  it('closes when escape is pressed', () => {
    render(<ExplainThis glossaryKey="apr" />);

    fireEvent.click(screen.getByRole('button', { name: /explain apr/i }));
    expect(screen.getByRole('tooltip', { name: 'APR' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('tooltip', { name: 'APR' })).not.toBeInTheDocument();
  });

  it('moves focus into the popover and traps tab navigation when opened manually', () => {
    render(<ExplainThis glossaryKey="compoundInterest" />);

    fireEvent.click(screen.getByRole('button', { name: /compound interest/i }));

    const closeButton = screen.getByRole('button', {
      name: /close explanation for compound interest/i,
    });
    expect(closeButton).toHaveFocus();

    const tooltip = screen.getByRole('tooltip', { name: 'Compound Interest' });
    fireEvent.keyDown(tooltip, { key: 'Tab' });

    expect(closeButton).toHaveFocus();
  });
});
