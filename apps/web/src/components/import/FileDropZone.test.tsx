// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FileDropZone } from './FileDropZone';

describe('FileDropZone', () => {
  it('keeps the file input in the tab order so keyboard users can reach it', () => {
    render(<FileDropZone onFile={vi.fn()} inputLabel="Choose CSV" />);
    const input = screen.getByLabelText('Choose CSV');
    expect(input).not.toHaveAttribute('tabindex', '-1');
    input.focus();
    expect(input).toHaveFocus();
  });
});
