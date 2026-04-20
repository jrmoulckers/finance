// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for responsive layout components and hooks.
 *
 * References: issue #627, #309
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

import {
  ResponsiveContainer,
  ResponsiveGrid,
  ResponsiveStack,
  useBreakpoint,
  useMinBreakpoint,
} from './ResponsiveLayout';

describe('ResponsiveContainer', () => {
  it('should render children', () => {
    render(
      <ResponsiveContainer>
        <p>Content</p>
      </ResponsiveContainer>,
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('should apply default max-width class', () => {
    const { container } = render(<ResponsiveContainer>Content</ResponsiveContainer>);
    expect(container.firstChild).toHaveClass('responsive-container--default');
  });

  it('should apply narrow max-width class', () => {
    const { container } = render(
      <ResponsiveContainer maxWidth="narrow">Content</ResponsiveContainer>,
    );
    expect(container.firstChild).toHaveClass('responsive-container--narrow');
  });

  it('should render as specified HTML element', () => {
    render(<ResponsiveContainer as="section">Content</ResponsiveContainer>);
    const el = screen.getByText('Content');
    expect(el.tagName).toBe('SECTION');
  });

  it('should add custom className', () => {
    const { container } = render(
      <ResponsiveContainer className="custom-class">Content</ResponsiveContainer>,
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});

describe('ResponsiveGrid', () => {
  it('should render children in a grid', () => {
    render(
      <ResponsiveGrid>
        <div>Item 1</div>
        <div>Item 2</div>
      </ResponsiveGrid>,
    );
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('should apply responsive-grid class', () => {
    const { container } = render(<ResponsiveGrid>Content</ResponsiveGrid>);
    expect(container.firstChild).toHaveClass('responsive-grid');
  });

  it('should support custom className', () => {
    const { container } = render(<ResponsiveGrid className="my-grid">Content</ResponsiveGrid>);
    expect(container.firstChild).toHaveClass('my-grid');
  });
});

describe('ResponsiveStack', () => {
  it('should render children', () => {
    render(
      <ResponsiveStack>
        <div>A</div>
        <div>B</div>
      </ResponsiveStack>,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('should default to tablet breakpoint', () => {
    const { container } = render(<ResponsiveStack>Content</ResponsiveStack>);
    expect(container.firstChild).toHaveClass('responsive-stack--break-tablet');
  });

  it('should apply desktop breakpoint', () => {
    const { container } = render(<ResponsiveStack breakAt="desktop">Content</ResponsiveStack>);
    expect(container.firstChild).toHaveClass('responsive-stack--break-desktop');
  });

  it('should apply align variants', () => {
    const { container } = render(<ResponsiveStack align="center">Content</ResponsiveStack>);
    expect(container.firstChild).toHaveClass('responsive-stack--align-center');
  });
});

describe('useBreakpoint', () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
  });

  it('should return mobile for narrow viewport', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 375,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('mobile');
  });

  it('should return tablet for medium viewport', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 768,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('tablet');
  });

  it('should return desktop for large viewport', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1200,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('desktop');
  });

  it('should return widescreen for extra-large viewport', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1600,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('widescreen');
  });

  it('should update on resize', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 375,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('mobile');

    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        value: 1200,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toBe('desktop');
  });
});

describe('useMinBreakpoint', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1200,
      writable: true,
      configurable: true,
    });
  });

  it('should return true when at or above the tier', () => {
    const { result } = renderHook(() => useMinBreakpoint('tablet'));
    expect(result.current).toBe(true);
  });

  it('should return false when below the tier', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 375,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMinBreakpoint('desktop'));
    expect(result.current).toBe(false);
  });
});
