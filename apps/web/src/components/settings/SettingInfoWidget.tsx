// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react';

import { AppIcon } from '../icons';

import { SETTING_DESCRIPTIONS, type SettingDescription } from './setting-descriptions';

import './setting-info-widget.css';

/** Props for {@link SettingInfoWidget}. */
export interface SettingInfoWidgetProps {
  /** The setting key to look up in the descriptions map. */
  settingKey: string;
  /** Children rendered as the main setting content. */
  children: React.ReactNode;
}

/**
 * Wraps a setting item with an expandable info description.
 *
 * Shows a small info button inline with the setting.
 * Clicking it expands an accessible description panel below.
 */
export function SettingInfoWidget({ settingKey, children }: SettingInfoWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const description: SettingDescription | undefined = SETTING_DESCRIPTIONS[settingKey];

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleExpanded();
      }
    },
    [toggleExpanded],
  );

  if (!description) {
    // No description available — render children without the info widget
    return <>{children}</>;
  }

  return (
    <div className="setting-info-widget">
      <div className="setting-info-widget__row">
        {children}
        <button
          ref={buttonRef}
          type="button"
          className="setting-info-widget__trigger"
          onClick={toggleExpanded}
          onKeyDown={handleKeyDown}
          aria-expanded={isExpanded}
          aria-controls={contentId}
          aria-label={description.summary}
          title={description.summary}
        >
          <AppIcon className="setting-info-widget__icon" name="info" size={24} />
        </button>
      </div>

      <div
        id={contentId}
        className={`setting-info-widget__content ${isExpanded ? 'setting-info-widget__content--expanded' : ''}`}
        role="region"
        aria-label={`${settingKey} setting description`}
        hidden={!isExpanded}
      >
        <p className="setting-info-widget__summary">{description.summary}</p>
        {description.impact && (
          <p className="setting-info-widget__impact">
            <strong>Data impact:</strong> {description.impact}
          </p>
        )}
        {description.recommendation && (
          <p className="setting-info-widget__recommendation">
            <strong>Recommended:</strong> {description.recommendation}
          </p>
        )}
      </div>
    </div>
  );
}

export default SettingInfoWidget;
