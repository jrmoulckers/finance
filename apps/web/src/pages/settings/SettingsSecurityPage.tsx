// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { EncryptionDetails } from '../../components/settings/EncryptionDetails';

/**
 * Security & Encryption sub-page — transparent details about local storage,
 * transport security, key derivation, data residency, and recent security
 * activity on this device.
 */
export const SettingsSecurityPage: React.FC = () => {
  return (
    <>
      <h2 className="settings-subpage__title">Security &amp; Encryption</h2>
      <EncryptionDetails />
    </>
  );
};

export default SettingsSecurityPage;
