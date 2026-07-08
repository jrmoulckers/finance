// SPDX-License-Identifier: BUSL-1.1

/**
 * CrashReportingSettings — opt-in crash reporting controls with example payload viewer.
 *
 * Provides:
 *   - Plain-language explanation of crash reporting
 *   - Opt-in toggle (default off)
 *   - Expandable example payload so users can see what data is sent
 *   - List of sensitive fields that are NEVER included
 *
 * References: issue #1673
 */

import React, { useCallback, useMemo, useState } from 'react';

import {
  CRASH_REPORT_FIELD_DESCRIPTIONS,
  NEVER_INCLUDED_FIELDS,
  generateExamplePayload,
} from '../../lib/crash-report-scrubber';
import { initMonitoring } from '../../lib/monitoring';
import { Checkbox } from '../common/Checkbox';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONITORING_CONSENT_KEY = 'finance-monitoring-consent';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CrashReportingSettingsProps {
  /** Current monitoring consent state. */
  enabled: boolean;
  /** Called when the user toggles crash reporting. */
  onToggle: (enabled: boolean) => void;
}

/**
 * Crash reporting opt-in control with transparent data disclosure.
 */
export const CrashReportingSettings: React.FC<CrashReportingSettingsProps> = ({
  enabled,
  onToggle,
}) => {
  const [showExamplePayload, setShowExamplePayload] = useState(false);

  const examplePayload = useMemo(() => generateExamplePayload(), []);

  const handleToggle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextEnabled = event.target.checked;
      localStorage.setItem(MONITORING_CONSENT_KEY, String(nextEnabled));
      onToggle(nextEnabled);

      if (nextEnabled) {
        initMonitoring();
      }
    },
    [onToggle],
  );

  const handleToggleExample = useCallback(() => {
    setShowExamplePayload((prev) => !prev);
  }, []);

  return (
    <div className="settings-group privacy-settings__group-spacer">
      <h3 className="settings-group__title">Crash Reporting</h3>

      <p className="privacy-settings__info">
        When enabled, anonymous crash reports help us find and fix bugs faster. Reports never
        include your financial data, account names, transaction details, or personal information.
      </p>

      {/* Opt-in toggle */}
      <div className="settings-item settings-item--static">
        <div>
          <label htmlFor="crash-reporting-toggle" className="settings-item__label">
            Send anonymous crash reports
          </label>
          <p className="privacy-settings__category-description">
            Helps us identify and fix bugs. You can turn this off at any time.
          </p>
        </div>
        <Checkbox
          id="crash-reporting-toggle"
          className="settings-item__checkbox-wrapper"
          checked={enabled}
          onChange={handleToggle}
          aria-label="Send anonymous crash reports to help improve the app"
        />
      </div>

      {/* Never-included fields list */}
      <div className="settings-item settings-item--static">
        <div>
          <span className="settings-item__label">What is NEVER included:</span>
          <ul
            className="privacy-settings__never-included-list"
            aria-label="Data never included in crash reports"
          >
            {NEVER_INCLUDED_FIELDS.map((field) => (
              <li key={field} className="privacy-settings__never-included-item">
                ✕ {field}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Example payload toggle */}
      <button
        type="button"
        className="settings-item settings-item--button"
        onClick={handleToggleExample}
        aria-expanded={showExamplePayload}
        aria-controls="crash-report-example-payload"
        aria-label={showExamplePayload ? 'Hide example crash report' : 'View example crash report'}
      >
        <span className="settings-item__label">
          {showExamplePayload ? 'Hide Example Report' : 'View Example Report'}
        </span>
        <span className="settings-item__value" aria-hidden="true">
          {showExamplePayload ? '▲' : '▼'}
        </span>
      </button>

      {/* Example payload display */}
      {showExamplePayload && (
        <div
          id="crash-report-example-payload"
          className="privacy-settings__example-payload"
          role="region"
          aria-label="Example crash report payload"
        >
          <p className="privacy-settings__info">
            This is exactly what a crash report looks like. No financial data is ever sent.
          </p>

          {/* Field-by-field breakdown */}
          <dl className="privacy-settings__payload-fields">
            {Object.entries(CRASH_REPORT_FIELD_DESCRIPTIONS).map(([field, description]) => (
              <div key={field} className="privacy-settings__payload-field">
                <dt className="privacy-settings__payload-field-name">{field}</dt>
                <dd className="privacy-settings__payload-field-desc">{description}</dd>
                <dd className="privacy-settings__payload-field-value">
                  <code>
                    {typeof (examplePayload as unknown as Record<string, unknown>)[field] ===
                    'object'
                      ? JSON.stringify(
                          (examplePayload as unknown as Record<string, unknown>)[field],
                          null,
                          2,
                        )
                      : String((examplePayload as unknown as Record<string, unknown>)[field])}
                  </code>
                </dd>
              </div>
            ))}
          </dl>

          {/* Full JSON view */}
          <details className="privacy-settings__raw-json">
            <summary>View full JSON payload</summary>
            <pre className="privacy-settings__json-pre">
              <code>{JSON.stringify(examplePayload, null, 2)}</code>
            </pre>
          </details>
        </div>
      )}
    </div>
  );
};

export default CrashReportingSettings;
