// SPDX-License-Identifier: BUSL-1.1

// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingInfoWidget } from './SettingInfoWidget';

// Mock descriptions
vi.mock('./setting-descriptions', () => ({
  SETTING_DESCRIPTIONS: {
    currency: {
      summary: 'Sets the default display currency.',
      impact: 'Does not convert existing amounts.',
      recommendation: 'Choose your most used currency.',
    },
    unknownSetting: undefined,
  },
}));

describe('SettingInfoWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children and info button for known setting', () => {
    render(
      <SettingInfoWidget settingKey="currency">
        <span>Currency Setting</span>
      </SettingInfoWidget>,
    );

    expect(screen.getByText('Currency Setting')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Sets the default display currency.' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('title', 'Sets the default display currency.');
  });

  it('renders only children when setting has no description', () => {
    render(
      <SettingInfoWidget settingKey="nonExistent">
        <span>Unknown Setting</span>
      </SettingInfoWidget>,
    );

    expect(screen.getByText('Unknown Setting')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sets the default display currency.' }),
    ).not.toBeInTheDocument();
  });

  it('expands description on button click', () => {
    render(
      <SettingInfoWidget settingKey="currency">
        <span>Currency</span>
      </SettingInfoWidget>,
    );

    const button = screen.getByRole('button', { name: 'Sets the default display currency.' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Sets the default display currency.')).toBeInTheDocument();
    expect(screen.getByText(/does not convert existing amounts/i)).toBeInTheDocument();
    expect(screen.getByText(/choose your most used currency/i)).toBeInTheDocument();
  });

  it('collapses description on second click', () => {
    render(
      <SettingInfoWidget settingKey="currency">
        <span>Currency</span>
      </SettingInfoWidget>,
    );

    const button = screen.getByRole('button', { name: 'Sets the default display currency.' });
    fireEvent.click(button); // expand
    fireEvent.click(button); // collapse

    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('has proper aria-controls linking', () => {
    render(
      <SettingInfoWidget settingKey="currency">
        <span>Currency</span>
      </SettingInfoWidget>,
    );

    const button = screen.getByRole('button', { name: 'Sets the default display currency.' });
    const controlsId = button.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();

    // The controlled element should exist
    fireEvent.click(button);
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('id', controlsId);
  });

  it('toggles on Enter keypress', () => {
    render(
      <SettingInfoWidget settingKey="currency">
        <span>Currency</span>
      </SettingInfoWidget>,
    );

    const button = screen.getByRole('button', { name: 'Sets the default display currency.' });
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});
