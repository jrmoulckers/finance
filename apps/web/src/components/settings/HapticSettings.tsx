// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback } from 'react';

import { useHaptics } from '../../hooks/useHaptics';
import { HAPTIC_INTENSITY_OPTIONS } from '../../lib/haptics/preferences';
import type { HapticEventType, HapticIntensity } from '../../lib/haptics/types';
import { SettingInfoWidget } from './SettingInfoWidget';

const INTENSITY_LABELS: Readonly<Record<HapticIntensity, string>> = {
  off: 'Off',
  light: 'Light',
  medium: 'Medium',
  strong: 'Strong',
};

const TEST_EVENTS: ReadonlyArray<{ eventType: HapticEventType; label: string }> = [
  { eventType: 'budget_warning', label: 'Budget warning' },
  { eventType: 'budget_critical', label: 'Budget critical' },
  { eventType: 'goal_reached', label: 'Goal reached' },
  { eventType: 'savings_milestone', label: 'Savings milestone' },
];

export const HapticSettings: React.FC = () => {
  const { isSupported, preferences, setIntensity, trigger } = useHaptics();
  const sliderValue = Math.max(0, HAPTIC_INTENSITY_OPTIONS.indexOf(preferences.intensity));
  const testButtonsDisabled = !isSupported || preferences.intensity === 'off';

  const handleSliderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextIntensity =
        HAPTIC_INTENSITY_OPTIONS[Number.parseInt(event.target.value, 10)] ?? 'medium';
      setIntensity(nextIntensity);
    },
    [setIntensity],
  );

  const helperText = isSupported
    ? `${preferences.intensity === 'off' ? 'Haptic feedback is currently disabled.' : `Current intensity: ${INTENSITY_LABELS[preferences.intensity]}.`} Saved locally on this device only.`
    : 'Your browser does not expose the Vibration API, so haptic feedback is unavailable on this device.';

  return (
    <>
      <SettingInfoWidget settingKey="haptics">
        <div className="settings-item settings-item--static settings-item--stacked">
          <div className="settings-item__row">
            <label className="settings-item__label" htmlFor="settings-haptics-intensity">
              Haptic feedback
            </label>
            <span className="settings-item__value">{INTENSITY_LABELS[preferences.intensity]}</span>
          </div>
          <div
            className="settings-item__control"
            style={{ display: 'grid', gap: 'var(--spacing-2)' }}
          >
            <input
              id="settings-haptics-intensity"
              type="range"
              min="0"
              max={String(HAPTIC_INTENSITY_OPTIONS.length - 1)}
              step="1"
              value={sliderValue}
              onChange={handleSliderChange}
              disabled={!isSupported}
              className="settings-item__input"
              aria-describedby="settings-haptics-help settings-haptics-scale"
            />
            <div
              id="settings-haptics-scale"
              aria-hidden="true"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${HAPTIC_INTENSITY_OPTIONS.length}, minmax(0, 1fr))`,
                gap: 'var(--spacing-2)',
                color: 'var(--semantic-text-secondary)',
                fontSize: 'var(--type-scale-caption-font-size, 0.875rem)',
              }}
            >
              {HAPTIC_INTENSITY_OPTIONS.map((option) => (
                <span key={option} style={{ textAlign: 'center' }}>
                  {INTENSITY_LABELS[option]}
                </span>
              ))}
            </div>
          </div>
          <p id="settings-haptics-help" className="settings-item__description">
            {helperText}
          </p>
        </div>
      </SettingInfoWidget>

      <div className="settings-item settings-item--static settings-item--stacked">
        <div className="settings-item__row">
          <span className="settings-item__label">Test haptics</span>
          <span className="settings-item__value">
            {isSupported ? 'Preview patterns' : 'Unsupported'}
          </span>
        </div>
        <div
          className="settings-item__control"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: 'var(--spacing-2)',
          }}
        >
          {TEST_EVENTS.map((testEvent) => (
            <button
              key={testEvent.eventType}
              type="button"
              className="form-button form-button--secondary"
              onClick={() => trigger(testEvent.eventType)}
              disabled={testButtonsDisabled}
              aria-label={`Test ${testEvent.label.toLowerCase()} haptic`}
            >
              {testEvent.label}
            </button>
          ))}
        </div>
        <p className="settings-item__description">
          Preview the exact patterns used for threshold crossings, spending alerts, and milestone
          celebrations.
        </p>
      </div>
    </>
  );
};
