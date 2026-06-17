// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { Icon } from '../../components/common';
import { IconToken } from '../../icons/tokens';
import { useIconPack, type WebIconPackId } from '../../hooks/useIconPack';
import './appearance-settings.css';

const PREVIEW_TOKENS = [
  IconToken.HOME,
  IconToken.TRANSACTIONS,
  IconToken.BUDGETS,
  IconToken.GOALS,
  IconToken.CHART_LINE,
  IconToken.SETTINGS,
] as const;

export const AppearanceSettings: React.FC = () => {
  const { iconPackId, setIconPack, resetIconPack, options } = useIconPack();

  return (
    <section aria-label="Appearance" className="page-section">
      <div className="settings-group">
        <div className="settings-group__header-row">
          <div>
            <h3 className="settings-group__title">Appearance</h3>
            <p className="settings-group__description">
              Choose the icon style used throughout the web app. SF Symbols are Apple-system only
              and are not offered on web.
            </p>
          </div>
          <button
            type="button"
            className="appearance-settings__reset"
            onClick={resetIconPack}
            aria-label="Reset icon style to default"
          >
            Reset to default
          </button>
        </div>

        <fieldset className="icon-style-picker" aria-label="Icon Style">
          <legend className="settings-item__label">Icon Style</legend>
          <div className="icon-style-picker__options" role="radiogroup" aria-label="Icon Style">
            {options.map((option) => (
              <label
                key={option.id}
                className={`icon-style-option${iconPackId === option.id ? ' icon-style-option--selected' : ''}`}
              >
                <input
                  type="radio"
                  name="icon-style"
                  value={option.id}
                  checked={iconPackId === option.id}
                  onChange={(event) => setIconPack(event.target.value as WebIconPackId)}
                />
                <span className="icon-style-option__content">
                  <span className="icon-style-option__title">{option.label}</span>
                  <span className="icon-style-option__description">{option.description}</span>
                  <span className="icon-style-option__preview" aria-hidden="true">
                    {PREVIEW_TOKENS.map((token) => (
                      <Icon key={token} name={token} size={22} packId={option.id} />
                    ))}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
};

export default AppearanceSettings;
