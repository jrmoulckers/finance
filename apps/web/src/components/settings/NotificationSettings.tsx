// SPDX-License-Identifier: BUSL-1.1

/**
 * NotificationSettings — user-facing controls for the notification system.
 *
 * This surfaces the {@link useNotificationPreferences} store (persisted under
 * `finance-notification-preferences`) which actually gates delivery via
 * `shouldDeliverNotification`. It intentionally does **not** touch the legacy
 * `finance-notifications` key, which is owned by `useNotifications` for the
 * notification list — writing a boolean there previously corrupted the store
 * (see issue #3788, items 1–3).
 *
 * @module components/settings/NotificationSettings
 */

import React, { useCallback } from 'react';

import { Checkbox } from '../common/Checkbox';
import { useNotificationPreferences } from '../../hooks/useNotificationPreferences';
import { SettingInfoWidget } from './SettingInfoWidget';

/**
 * Notifications settings group.
 *
 * Master enable, Do Not Disturb, quiet hours, and per-category toggles for the
 * notification types the app can generate. All sub-controls are disabled while
 * the master switch is off so the hierarchy is obvious to screen-reader and
 * sighted users alike.
 */
export const NotificationSettings: React.FC = () => {
  const { preferences, loading, updatePreferences, toggleEnabled, resetToDefaults } =
    useNotificationPreferences();

  const notificationsOn = preferences.enabled;

  const handleDoNotDisturbChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updatePreferences({ doNotDisturb: event.target.checked });
    },
    [updatePreferences],
  );

  const handleQuietHoursEnabledChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updatePreferences({
        quietHours: { ...preferences.quietHours, enabled: event.target.checked },
      });
    },
    [preferences.quietHours, updatePreferences],
  );

  const handleQuietStartChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updatePreferences({
        quietHours: { ...preferences.quietHours, startTime: event.target.value },
      });
    },
    [preferences.quietHours, updatePreferences],
  );

  const handleQuietEndChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updatePreferences({
        quietHours: { ...preferences.quietHours, endTime: event.target.value },
      });
    },
    [preferences.quietHours, updatePreferences],
  );

  const handleGoalNudgesChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updatePreferences({ goalNudgesEnabled: event.target.checked });
    },
    [updatePreferences],
  );

  const handleStreakCelebrationsChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updatePreferences({ goalStreakCelebrationsEnabled: event.target.checked });
    },
    [updatePreferences],
  );

  const handleTransactionConfirmationsChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updatePreferences({ transactionConfirmations: event.target.checked });
    },
    [updatePreferences],
  );

  const handleSoundChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      updatePreferences({ soundEnabled: event.target.checked });
    },
    [updatePreferences],
  );

  const quietHoursDisabled = !notificationsOn || !preferences.quietHours.enabled;

  return (
    <section aria-label="Notifications" className="page-section">
      <div className="settings-group">
        <h3 className="settings-group__title">Notifications</h3>
        <p className="settings-group__description">
          Choose which alerts Finance can raise. Preferences are saved locally on this device and
          control whether notifications are actually delivered.
        </p>

        {loading ? (
          <p className="settings-item__description" role="status">
            Loading notification preferences…
          </p>
        ) : (
          <>
            <SettingInfoWidget settingKey="notifications">
              <div className="settings-item settings-item--static">
                <label className="settings-item__label" htmlFor="settings-notifications-enabled">
                  Enable notifications
                </label>
                <Checkbox
                  id="settings-notifications-enabled"
                  className="settings-item__checkbox-wrapper"
                  checked={notificationsOn}
                  onChange={toggleEnabled}
                  aria-label="Enable notifications"
                  aria-describedby="settings-notifications-enabled-help"
                />
                <p id="settings-notifications-enabled-help" className="settings-item__description">
                  Master switch for bill reminders, budget alerts, goal updates, and sync status.
                </p>
              </div>
            </SettingInfoWidget>

            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-notifications-dnd">
                Do not disturb
              </label>
              <Checkbox
                id="settings-notifications-dnd"
                className="settings-item__checkbox-wrapper"
                checked={preferences.doNotDisturb}
                onChange={handleDoNotDisturbChange}
                disabled={!notificationsOn}
                aria-label="Do not disturb"
                aria-describedby="settings-notifications-dnd-help"
              />
              <p id="settings-notifications-dnd-help" className="settings-item__description">
                Temporarily silences every notification without changing your other choices.
              </p>
            </div>

            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-notifications-quiet">
                Quiet hours
              </label>
              <Checkbox
                id="settings-notifications-quiet"
                className="settings-item__checkbox-wrapper"
                checked={preferences.quietHours.enabled}
                onChange={handleQuietHoursEnabledChange}
                disabled={!notificationsOn}
                aria-label="Quiet hours"
                aria-describedby="settings-notifications-quiet-help"
              />
              <p id="settings-notifications-quiet-help" className="settings-item__description">
                Suppress non-critical notifications overnight or during focus time.
              </p>
            </div>

            <div className="settings-item settings-item--static settings-item--stacked">
              <div className="settings-item__row">
                <label className="settings-item__label" htmlFor="settings-quiet-start">
                  Quiet hours start
                </label>
                <div className="settings-item__control">
                  <input
                    id="settings-quiet-start"
                    type="time"
                    className="form-input settings-item__input"
                    value={preferences.quietHours.startTime}
                    onChange={handleQuietStartChange}
                    disabled={quietHoursDisabled}
                    aria-label="Quiet hours start time"
                  />
                </div>
              </div>
              <div className="settings-item__row">
                <label className="settings-item__label" htmlFor="settings-quiet-end">
                  Quiet hours end
                </label>
                <div className="settings-item__control">
                  <input
                    id="settings-quiet-end"
                    type="time"
                    className="form-input settings-item__input"
                    value={preferences.quietHours.endTime}
                    onChange={handleQuietEndChange}
                    disabled={quietHoursDisabled}
                    aria-label="Quiet hours end time"
                  />
                </div>
              </div>
            </div>

            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-notifications-goal-nudges">
                Goal contribution nudges
              </label>
              <Checkbox
                id="settings-notifications-goal-nudges"
                className="settings-item__checkbox-wrapper"
                checked={preferences.goalNudgesEnabled}
                onChange={handleGoalNudgesChange}
                disabled={!notificationsOn}
                aria-label="Goal contribution nudges"
              />
            </div>

            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-notifications-streaks">
                Savings streak celebrations
              </label>
              <Checkbox
                id="settings-notifications-streaks"
                className="settings-item__checkbox-wrapper"
                checked={preferences.goalStreakCelebrationsEnabled}
                onChange={handleStreakCelebrationsChange}
                disabled={!notificationsOn}
                aria-label="Savings streak celebrations"
              />
            </div>

            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-notifications-txn">
                Transaction confirmations
              </label>
              <Checkbox
                id="settings-notifications-txn"
                className="settings-item__checkbox-wrapper"
                checked={preferences.transactionConfirmations}
                onChange={handleTransactionConfirmationsChange}
                disabled={!notificationsOn}
                aria-label="Transaction confirmations"
              />
            </div>

            <div className="settings-item settings-item--static">
              <label className="settings-item__label" htmlFor="settings-notifications-sound">
                Notification sound
              </label>
              <Checkbox
                id="settings-notifications-sound"
                className="settings-item__checkbox-wrapper"
                checked={preferences.soundEnabled}
                onChange={handleSoundChange}
                disabled={!notificationsOn}
                aria-label="Notification sound"
              />
            </div>

            <button
              type="button"
              className="settings-item settings-item--button"
              onClick={resetToDefaults}
              aria-label="Reset notification preferences to defaults"
            >
              <span className="settings-item__label">Reset notifications to defaults</span>
              <span className="settings-item__value">↺</span>
            </button>
          </>
        )}
      </div>
    </section>
  );
};

export default NotificationSettings;
