// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { EncryptionDetails } from '../../components/settings/EncryptionDetails';
import { EncryptionUnlockSettings } from '../../components/settings/EncryptionUnlockSettings';

/**
 * Security & Encryption sub-page — transparent details about local storage,
 * transport security, key derivation, data residency, and recent security
 * activity on this device.
 */
export const SettingsSecurityPage: React.FC = () => {
  return (
    <>
      <h2 className="settings-subpage__title">Security &amp; Encryption</h2>
      <EncryptionUnlockSettings />
      <EncryptionDetails />
    </>
  );
};

export default SettingsSecurityPage;
