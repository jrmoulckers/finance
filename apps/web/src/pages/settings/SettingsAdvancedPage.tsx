// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useState } from 'react';

import { SettingInfoWidget } from '../../components/settings';
import { useDatabase } from '../../db/DatabaseProvider';
import { eraseAllMoodTags } from '../../db/repositories/transactions';
import {
  MOOD_TAGS_CHANGED_EVENT,
  MOOD_TAGS_ENABLED_KEY,
  MOOD_TAGS_SYNC_ENABLED_KEY,
  setMoodTagPreference,
} from '../../lib/mood-tags';

function useOptionalDatabase() {
  try {
    return useDatabase();
  } catch {
    return null;
  }
}

/**
 * Advanced sub-page — experimental feature flags and developer-leaning preferences.
 */
export const SettingsAdvancedPage: React.FC = () => {
  const db = useOptionalDatabase();
  const [moodTagsEnabled, setMoodTagsEnabled] = useState(
    () => localStorage.getItem(MOOD_TAGS_ENABLED_KEY) === 'true',
  );
  const [moodTagsSyncEnabled, setMoodTagsSyncEnabled] = useState(
    () => localStorage.getItem(MOOD_TAGS_SYNC_ENABLED_KEY) === 'true',
  );

  const handleMoodTagsEnabledChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    setMoodTagPreference(MOOD_TAGS_ENABLED_KEY, enabled);
    setMoodTagsEnabled(enabled);
    if (!enabled) {
      setMoodTagPreference(MOOD_TAGS_SYNC_ENABLED_KEY, false);
      setMoodTagsSyncEnabled(false);
    }
  }, []);

  const handleMoodTagsSyncChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    setMoodTagPreference(MOOD_TAGS_SYNC_ENABLED_KEY, enabled);
    setMoodTagsSyncEnabled(enabled);
  }, []);

  const handleEraseMoodData = useCallback(() => {
    if (!window.confirm('Erase all mood data?')) return;
    if (db) eraseAllMoodTags(db);
    setMoodTagPreference(MOOD_TAGS_ENABLED_KEY, false);
    setMoodTagPreference(MOOD_TAGS_SYNC_ENABLED_KEY, false);
    setMoodTagsEnabled(false);
    setMoodTagsSyncEnabled(false);
    window.dispatchEvent(new Event(MOOD_TAGS_CHANGED_EVENT));
  }, [db]);

  return (
    <>
      <h2 className="settings-subpage__title">Advanced</h2>

      <section aria-label="Experimental" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Experimental</h3>
          <SettingInfoWidget settingKey="moodTags">
            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-mood-tags">
                Allow mood tags on transactions
              </label>
              <input
                type="checkbox"
                id="settings-mood-tags"
                checked={moodTagsEnabled}
                onChange={handleMoodTagsEnabledChange}
                aria-label="Allow mood tags on transactions"
                className="settings-item__checkbox"
              />
            </div>
          </SettingInfoWidget>
          {moodTagsEnabled && (
            <SettingInfoWidget settingKey="moodTagsSync">
              <div className="settings-item settings-item--static">
                <label className="settings-item__label" htmlFor="settings-mood-tags-sync">
                  Sync mood tags across my devices
                </label>
                <input
                  type="checkbox"
                  id="settings-mood-tags-sync"
                  checked={moodTagsSyncEnabled}
                  onChange={handleMoodTagsSyncChange}
                  aria-label="Sync mood tags across my devices"
                  className="settings-item__checkbox"
                />
              </div>
            </SettingInfoWidget>
          )}
        </div>
      </section>

      <section aria-label="Danger Zone" className="page-section">
        {/* TODO(#2010): Replace this inline card with the shared <DangerZone> once fix/settings-arrows-danger-zone-2010 is merged. */}
        <div className="danger-zone-card">
          <div className="danger-zone-card__header">
            <h3 className="danger-zone-card__title">Danger Zone</h3>
            <p className="danger-zone-card__description">
              Destructive Advanced actions live here so they are visually separated from safe
              preferences.
            </p>
          </div>
          <div className="danger-zone-card__content">
            <SettingInfoWidget settingKey="eraseMoodData">
              <button
                type="button"
                className="danger-zone-card__action"
                onClick={handleEraseMoodData}
                aria-label="Erase all mood data"
              >
                <span>Erase all mood data</span>
                <span aria-hidden="true">⌫</span>
              </button>
            </SettingInfoWidget>
          </div>
        </div>
      </section>
    </>
  );
};

export default SettingsAdvancedPage;
