// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useState } from 'react';

import { useAuth } from '../../auth/auth-context';
import { SettingInfoWidget } from '../../components/settings';
import { useAccountDeletion } from '../../components/settings/AccountDeletionModal';

/**
 * Account sub-page — identity, sign-out, and the destructive
 * delete-account flow (with typed-DELETE confirmation modal).
 */
export const SettingsAccountPage: React.FC = () => {
  const { isAuthenticated, isLoading, logout, user } = useAuth();

  const { openDeleteModal, deleteModal } = useAccountDeletion();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = useCallback(async () => {
    if (!isAuthenticated || isLoading) {
      return;
    }

    const confirmed = window.confirm('Are you sure you want to sign out?');
    if (!confirmed) {
      return;
    }

    try {
      await logout();
    } catch (err) {
      setSignOutError(err instanceof Error ? err.message : 'Sign out failed.');
    }
  }, [isAuthenticated, isLoading, logout]);

  return (
    <>
      <h2 className="settings-subpage__title">Account</h2>
      <section aria-label="Account" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Profile</h3>
          <div className="settings-item settings-item--static">
            <span className="settings-item__label">Email</span>
            <span className="settings-item__value">
              {isAuthenticated ? (user?.email ?? 'Not signed in') : 'Not signed in'}
            </span>
          </div>
          <button
            type="button"
            className="settings-item settings-item--button"
            onClick={() => {
              void handleSignOut();
            }}
            disabled={!isAuthenticated || isLoading}
            aria-label="Sign out"
          >
            <span className="settings-item__label">Sign Out</span>
            <span className="settings-item__value">&rarr;</span>
          </button>
          {signOutError && (
            <div className="settings-item settings-item--static" role="alert">
              <span className="settings-item__value">{signOutError}</span>
            </div>
          )}
        </div>
      </section>

      <section aria-label="Danger Zone" className="page-section">
        <div className="settings-group">
          <h3 className="settings-group__title">Danger Zone</h3>
          <SettingInfoWidget settingKey="accountDeletion">
            <button
              type="button"
              className="settings-item settings-item--button settings-item--destructive"
              onClick={openDeleteModal}
              disabled={!isAuthenticated}
              aria-label="Delete account"
            >
              <span className="settings-item__label">Delete account</span>
              <span className="settings-item__value">&rarr;</span>
            </button>
          </SettingInfoWidget>
        </div>
      </section>

      {deleteModal}
    </>
  );
};

export default SettingsAccountPage;
