// SPDX-License-Identifier: BUSL-1.1

import type { Category } from '../../kmp/bridge';
import { useAutoCategorize } from '../../hooks/useAutoCategorize';
import { RuleManager } from './RuleManager';

import './categorization.css';

export interface CategorizationSettingsProps {
  categories: Category[];
}

export function CategorizationSettings({ categories }: CategorizationSettingsProps) {
  const { settings, setEnabled, setConfidenceThreshold, learnedRules } =
    useAutoCategorize(categories);

  return (
    <div className="settings-group">
      <h3 className="settings-group__title">Smart auto-categorization</h3>
      <div className="settings-item settings-item--static">
        <label className="settings-item__label" htmlFor="settings-auto-categorization-enabled">
          Enable smart categorization
        </label>
        <input
          id="settings-auto-categorization-enabled"
          type="checkbox"
          className="settings-item__checkbox"
          checked={settings.enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
      </div>
      <div className="settings-item settings-item--static">
        <label className="settings-item__label" htmlFor="settings-auto-categorization-threshold">
          Minimum confidence for auto-apply
        </label>
        <div className="settings-item__control">
          <input
            id="settings-auto-categorization-threshold"
            className="form-input settings-item__input"
            type="range"
            min="0.5"
            max="0.95"
            step="0.05"
            value={settings.confidenceThreshold}
            onChange={(event) => setConfidenceThreshold(Number(event.target.value))}
          />
        </div>
        <p className="categorization-settings__help">
          Current threshold: {Math.round(settings.confidenceThreshold * 100)}% ·{' '}
          {learnedRules.length} learned rule{learnedRules.length === 1 ? '' : 's'} stored locally.
        </p>
      </div>
      <RuleManager categories={categories} />
    </div>
  );
}
