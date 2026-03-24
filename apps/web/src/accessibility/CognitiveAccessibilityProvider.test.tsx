// SPDX-License-Identifier: BUSL-1.1
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CognitiveAccessibilityProvider,
  useCognitiveAccessibility,
  SIMPLIFIED_LABELS,
} from './CognitiveAccessibilityProvider';

function TestConsumer() {
  const { isSimplified, toggleSimplified, preferences, getLabel } = useCognitiveAccessibility();
  return (
    <div>
      <span data-testid="is-simplified">{String(isSimplified)}</span>
      <span data-testid="label-income">{getLabel('Income')}</span>
      <span data-testid="label-unknown">{getLabel('SomethingUnknown')}</span>
      <span data-testid="pref-larger-text">{String(preferences.largerText)}</span>
      <span data-testid="pref-animations">{String(preferences.disableAnimations)}</span>
      <button type="button" onClick={toggleSimplified}>
        Toggle
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-simplified');
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('CognitiveAccessibilityProvider', () => {
  it('defaults to not simplified', () => {
    render(
      <CognitiveAccessibilityProvider>
        <TestConsumer />
      </CognitiveAccessibilityProvider>,
    );
    expect(screen.getByTestId('is-simplified').textContent).toBe('false');
    expect(document.documentElement.getAttribute('data-simplified')).toBe('false');
  });

  it('toggles simplified mode on', async () => {
    const user = userEvent.setup();
    render(
      <CognitiveAccessibilityProvider>
        <TestConsumer />
      </CognitiveAccessibilityProvider>,
    );
    expect(screen.getByTestId('is-simplified').textContent).toBe('false');
    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByTestId('is-simplified').textContent).toBe('true');
    expect(document.documentElement.getAttribute('data-simplified')).toBe('true');
  });

  it('persists setting to localStorage', async () => {
    const user = userEvent.setup();
    render(
      <CognitiveAccessibilityProvider>
        <TestConsumer />
      </CognitiveAccessibilityProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(localStorage.getItem('finance-simplified-mode')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(localStorage.getItem('finance-simplified-mode')).toBe('false');
  });

  it('loads persisted value from localStorage on mount', () => {
    localStorage.setItem('finance-simplified-mode', 'true');
    render(
      <CognitiveAccessibilityProvider>
        <TestConsumer />
      </CognitiveAccessibilityProvider>,
    );
    expect(screen.getByTestId('is-simplified').textContent).toBe('true');
    expect(document.documentElement.getAttribute('data-simplified')).toBe('true');
  });

  it('provides correct context values when simplified', async () => {
    const user = userEvent.setup();
    render(
      <CognitiveAccessibilityProvider>
        <TestConsumer />
      </CognitiveAccessibilityProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByTestId('pref-larger-text').textContent).toBe('true');
    expect(screen.getByTestId('pref-animations').textContent).toBe('true');
    expect(screen.getByTestId('label-income').textContent).toBe('Money In');
    expect(screen.getByTestId('label-unknown').textContent).toBe('SomethingUnknown');
  });

  it('provides correct context values when not simplified', () => {
    render(
      <CognitiveAccessibilityProvider>
        <TestConsumer />
      </CognitiveAccessibilityProvider>,
    );
    expect(screen.getByTestId('pref-larger-text').textContent).toBe('false');
    expect(screen.getByTestId('pref-animations').textContent).toBe('false');
    expect(screen.getByTestId('label-income').textContent).toBe('Income');
  });

  it('uses prefers-reduced-data media query as a hint when no stored value', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-data: reduce)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    render(
      <CognitiveAccessibilityProvider>
        <TestConsumer />
      </CognitiveAccessibilityProvider>,
    );
    expect(screen.getByTestId('is-simplified').textContent).toBe('true');
  });

  it('removes data-simplified attribute on unmount', () => {
    const { unmount } = render(
      <CognitiveAccessibilityProvider>
        <TestConsumer />
      </CognitiveAccessibilityProvider>,
    );
    expect(document.documentElement.hasAttribute('data-simplified')).toBe(true);
    unmount();
    expect(document.documentElement.hasAttribute('data-simplified')).toBe(false);
  });
});

describe('useCognitiveAccessibility', () => {
  it('returns context values when used inside provider', () => {
    render(
      <CognitiveAccessibilityProvider>
        <TestConsumer />
      </CognitiveAccessibilityProvider>,
    );
    expect(screen.getByTestId('is-simplified').textContent).toBe('false');
    expect(screen.getByRole('button', { name: 'Toggle' })).toBeInTheDocument();
  });

  it('throws when used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useCognitiveAccessibility must be used within a <CognitiveAccessibilityProvider>');
    spy.mockRestore();
  });
});

describe('SIMPLIFIED_LABELS', () => {
  it('maps Income to Money In', () => {
    expect(SIMPLIFIED_LABELS['Income']).toBe('Money In');
  });
  it('maps Expenses to Money Out', () => {
    expect(SIMPLIFIED_LABELS['Expenses']).toBe('Money Out');
  });
  it('maps Transactions to Money Moves', () => {
    expect(SIMPLIFIED_LABELS['Transactions']).toBe('Money Moves');
  });
  it('maps Budgets to Spending Plans', () => {
    expect(SIMPLIFIED_LABELS['Budgets']).toBe('Spending Plans');
  });
});
