// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the RuleManager component.
 *
 * Mocks the useTaggingRules hook (not repositories) per project convention.
 *
 * References: issue #1473
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UseTaggingRulesResult } from '../../hooks/useTaggingRules';
import type { TaggingRule } from '../../lib/tagging/tagging-types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseTaggingRules = vi.fn<() => UseTaggingRulesResult>();

vi.mock('../../hooks/useTaggingRules', () => ({
  useTaggingRules: () => mockUseTaggingRules(),
}));

vi.mock('../../accessibility/aria', () => ({
  useFocusTrap: vi.fn(),
}));

vi.mock('../../lib/tagging/rule-engine', () => ({
  matchCondition: vi.fn(() => false),
}));

// Import after mocks
import { RuleManager } from './RuleManager';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockRule: TaggingRule = {
  id: 'rule-1',
  name: 'Coffee shops',
  enabled: true,
  conditions: [{ field: 'counterpartyName', operator: 'contains', value: 'starbucks' }],
  actions: [{ type: 'addTag', value: 'coffee' }],
  priority: 50,
  createdAt: '2024-01-01T00:00:00Z',
  matchCount: 12,
};

function defaultHookResult(): UseTaggingRulesResult {
  return {
    rules: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    addRule: vi.fn(),
    editRule: vi.fn(),
    removeRule: vi.fn(),
    toggleRule: vi.fn(),
    applyRules: vi.fn(() => []),
    applyAndTrack: vi.fn(() => []),
    createFromTransaction: vi.fn(() => mockRule),
    testRules: vi.fn(() => new Map()),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RuleManager', () => {
  beforeEach(() => {
    mockUseTaggingRules.mockReturnValue(defaultHookResult());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders loading state', () => {
    mockUseTaggingRules.mockReturnValue({ ...defaultHookResult(), loading: true });
    render(<RuleManager />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading rules');
  });

  it('renders empty state', () => {
    render(<RuleManager />);
    expect(screen.getByText(/no tagging rules yet/i)).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockUseTaggingRules.mockReturnValue({ ...defaultHookResult(), error: 'Something went wrong' });
    render(<RuleManager />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('renders rule list with rule details', () => {
    mockUseTaggingRules.mockReturnValue({
      ...defaultHookResult(),
      rules: [mockRule],
    });
    render(<RuleManager />);

    expect(screen.getByText('Coffee shops')).toBeInTheDocument();
    expect(screen.getByText(/Matched: 12/)).toBeInTheDocument();
    expect(screen.getByText(/starbucks/)).toBeInTheDocument();
  });

  it('renders enable/disable checkbox', () => {
    mockUseTaggingRules.mockReturnValue({
      ...defaultHookResult(),
      rules: [mockRule],
    });
    render(<RuleManager />);

    const checkbox = screen.getByRole('checkbox', { name: /disable rule: coffee shops/i });
    expect(checkbox).toBeChecked();
  });

  it('calls toggleRule when checkbox clicked', () => {
    const toggleRule = vi.fn();
    mockUseTaggingRules.mockReturnValue({
      ...defaultHookResult(),
      rules: [mockRule],
      toggleRule,
    });
    render(<RuleManager />);

    const checkbox = screen.getByRole('checkbox', { name: /disable rule: coffee shops/i });
    fireEvent.click(checkbox);
    expect(toggleRule).toHaveBeenCalledWith('rule-1');
  });

  it('opens create form on button click', () => {
    render(<RuleManager />);

    fireEvent.click(screen.getByLabelText('Create new tagging rule'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Create Rule', { selector: 'h3' })).toBeInTheDocument();
  });

  it('opens edit form on edit button click', () => {
    mockUseTaggingRules.mockReturnValue({
      ...defaultHookResult(),
      rules: [mockRule],
    });
    render(<RuleManager />);

    fireEvent.click(screen.getByLabelText('Edit rule: Coffee shops'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Edit Rule')).toBeInTheDocument();
  });

  it('shows delete confirmation on delete button click', () => {
    mockUseTaggingRules.mockReturnValue({
      ...defaultHookResult(),
      rules: [mockRule],
    });
    render(<RuleManager />);

    fireEvent.click(screen.getByLabelText('Delete rule: Coffee shops'));
    expect(screen.getByText('Delete?')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm delete rule: Coffee shops')).toBeInTheDocument();
  });

  it('calls removeRule on confirm delete', () => {
    const removeRule = vi.fn();
    mockUseTaggingRules.mockReturnValue({
      ...defaultHookResult(),
      rules: [mockRule],
      removeRule,
    });
    render(<RuleManager />);

    fireEvent.click(screen.getByLabelText('Delete rule: Coffee shops'));
    fireEvent.click(screen.getByLabelText('Confirm delete rule: Coffee shops'));
    expect(removeRule).toHaveBeenCalledWith('rule-1');
  });

  it('cancels delete on No click', () => {
    mockUseTaggingRules.mockReturnValue({
      ...defaultHookResult(),
      rules: [mockRule],
    });
    render(<RuleManager />);

    fireEvent.click(screen.getByLabelText('Delete rule: Coffee shops'));
    fireEvent.click(screen.getByLabelText('Cancel delete'));
    expect(screen.queryByText('Delete?')).not.toBeInTheDocument();
  });

  it('renders action chips with emojis', () => {
    mockUseTaggingRules.mockReturnValue({
      ...defaultHookResult(),
      rules: [mockRule],
    });
    render(<RuleManager />);

    expect(screen.getByText(/🏷️ coffee/)).toBeInTheDocument();
  });

  it('has accessible "New Rule" button', () => {
    render(<RuleManager />);
    const btn = screen.getByLabelText('Create new tagging rule');
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
  });
});
