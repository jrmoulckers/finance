// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMoveFocusTo = vi.fn();

vi.mock('../../accessibility/aria', () => ({
  moveFocusTo: (...args: unknown[]) => mockMoveFocusTo(...args),
}));

import { SkipToContent } from './SkipToContent';

describe('SkipToContent', () => {
  beforeEach(() => {
    mockMoveFocusTo.mockClear();
  });

  it('renders a skip link with the default label', () => {
    render(<SkipToContent />);

    const link = screen.getByText('Skip to main content');
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
  });

  it('targets #main-content by default', () => {
    render(<SkipToContent />);

    expect(screen.getByText('Skip to main content')).toHaveAttribute('href', '#main-content');
  });

  it('targets a custom targetId when provided', () => {
    render(<SkipToContent targetId="custom-content" />);

    expect(screen.getByText('Skip to main content')).toHaveAttribute('href', '#custom-content');
  });

  it('renders a custom label when provided', () => {
    render(<SkipToContent label="Skip to navigation" />);

    expect(screen.getByText('Skip to navigation')).toBeInTheDocument();
  });

  it('calls moveFocusTo with the target element on click', () => {
    const targetEl = document.createElement('main');
    targetEl.id = 'main-content';
    document.body.appendChild(targetEl);

    render(<SkipToContent />);

    fireEvent.click(screen.getByText('Skip to main content'));

    expect(mockMoveFocusTo).toHaveBeenCalledTimes(1);
    expect(mockMoveFocusTo).toHaveBeenCalledWith(targetEl);

    document.body.removeChild(targetEl);
  });

  it('calls moveFocusTo when Enter key is pressed', () => {
    const targetEl = document.createElement('main');
    targetEl.id = 'main-content';
    document.body.appendChild(targetEl);

    render(<SkipToContent />);

    fireEvent.keyDown(screen.getByText('Skip to main content'), { key: 'Enter' });

    expect(mockMoveFocusTo).toHaveBeenCalledTimes(1);
    expect(mockMoveFocusTo).toHaveBeenCalledWith(targetEl);

    document.body.removeChild(targetEl);
  });

  it('calls moveFocusTo when Space key is pressed', () => {
    const targetEl = document.createElement('main');
    targetEl.id = 'main-content';
    document.body.appendChild(targetEl);

    render(<SkipToContent />);

    fireEvent.keyDown(screen.getByText('Skip to main content'), { key: ' ' });

    expect(mockMoveFocusTo).toHaveBeenCalledTimes(1);
    expect(mockMoveFocusTo).toHaveBeenCalledWith(targetEl);

    document.body.removeChild(targetEl);
  });

  it('does not call moveFocusTo for other keys', () => {
    render(<SkipToContent />);

    fireEvent.keyDown(screen.getByText('Skip to main content'), { key: 'Tab' });

    expect(mockMoveFocusTo).not.toHaveBeenCalled();
  });

  it('calls moveFocusTo with the custom target element on click', () => {
    const customEl = document.createElement('div');
    customEl.id = 'custom-section';
    document.body.appendChild(customEl);

    render(<SkipToContent targetId="custom-section" />);

    fireEvent.click(screen.getByText('Skip to main content'));

    expect(mockMoveFocusTo).toHaveBeenCalledWith(customEl);

    document.body.removeChild(customEl);
  });
});
