// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback } from 'react';

import { useModuleVisibility } from '../../hooks/useModuleVisibility';
import {
  HIDEABLE_MODULE_CATEGORY_LABELS,
  HIDEABLE_MODULE_CATEGORY_ORDER,
  getHideableModulesByCategory,
} from '../../lib/ux/module-visibility';
import './minimalist-mode-settings.css';

/**
 * Minimalist mode — "Customize what you see" (#2122).
 *
 * Lets a low-noise user hide product areas / nav modules they never use. Each
 * area is a labelled switch (checked = shown); turning it off removes the area
 * from the primary navigation and its dashboard quick-access card. Essential
 * areas (Dashboard, Accounts, Transactions, Settings) are never listed here, so
 * the user can't lock themselves out — and hidden areas stay reachable by their
 * direct URL and keyboard shortcut.
 *
 * Accessibility (WCAG 2.2 AA):
 *   - Each category is a semantic `<fieldset>`/`<legend>` group.
 *   - Each toggle is a keyboard-operable `role="switch"` checkbox with a `<label>`.
 *   - On/off state is conveyed by the native control and redundant text
 *     ("Shown"/"Hidden"), never by colour alone.
 *   - A live region announces how many areas are hidden.
 */
export const MinimalistModeSettings: React.FC = () => {
  const { hiddenCount, hasHiddenModules, isVisible, setHidden, showAll } = useModuleVisibility();

  const handleToggle = useCallback(
    (id: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      // The switch reads "Show <area>": checked = visible, unchecked = hidden.
      setHidden(id, !event.target.checked);
    },
    [setHidden],
  );

  const summary = hasHiddenModules
    ? `${hiddenCount} ${hiddenCount === 1 ? 'area is' : 'areas are'} hidden.`
    : 'Every area is shown.';

  return (
    <section aria-labelledby="minimalist-mode-heading" className="page-section">
      <div className="settings-group">
        <h3 id="minimalist-mode-heading" className="settings-group__title">
          Minimalist mode
        </h3>
        <p className="settings-group__description">
          Customize what you see. Turn off areas you never use to keep the navigation and your
          dashboard focused on what matters to you. Dashboard, Accounts, Transactions, and Settings
          always stay available, and hidden areas remain reachable by their direct link and keyboard
          shortcut.
        </p>
        <p className="minimalist-mode__status" role="status" aria-live="polite">
          {summary}
        </p>

        {HIDEABLE_MODULE_CATEGORY_ORDER.map((category) => {
          const modules = getHideableModulesByCategory(category);
          if (modules.length === 0) {
            return null;
          }
          return (
            <fieldset key={category} className="minimalist-mode__group">
              <legend className="minimalist-mode__legend">
                {HIDEABLE_MODULE_CATEGORY_LABELS[category]}
              </legend>
              {modules.map((module) => {
                const visible = isVisible(module.id);
                const switchId = `minimalist-toggle-${module.id}`;
                const descriptionId = `${switchId}-description`;
                return (
                  <div key={module.id} className="settings-item settings-item--static">
                    <label className="settings-item__label" htmlFor={switchId}>
                      {module.label}
                    </label>
                    <span className="settings-item__control">
                      <span className="minimalist-mode__state" aria-hidden="true">
                        {visible ? 'Shown' : 'Hidden'}
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        id={switchId}
                        className="settings-item__checkbox"
                        checked={visible}
                        onChange={handleToggle(module.id)}
                        aria-describedby={descriptionId}
                      />
                    </span>
                    <p id={descriptionId} className="settings-item__description">
                      {module.description}
                    </p>
                  </div>
                );
              })}
            </fieldset>
          );
        })}

        <div className="settings-item settings-item--static">
          <span className="settings-item__label">Reset</span>
          <div className="settings-item__control">
            <button
              type="button"
              className="form-button form-button--secondary"
              onClick={showAll}
              disabled={!hasHiddenModules}
            >
              Show all areas
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default MinimalistModeSettings;
