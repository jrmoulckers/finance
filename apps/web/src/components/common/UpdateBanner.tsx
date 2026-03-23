// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useState } from 'react';

import { useServiceWorkerUpdate } from '../../hooks/useServiceWorkerUpdate';

/** Announce when a new service worker is ready and let the user update in place. */
export const UpdateBanner: React.FC = () => {
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (updateAvailable) {
      setDismissed(false);
    }
  }, [updateAvailable]);

  if (!updateAvailable || dismissed) {
    return null;
  }

  return (
    <div className="update-banner" role="status" aria-live="polite" aria-atomic="true">
      <span className="update-banner__text">Update available</span>
      <div className="update-banner__actions">
        <button
          type="button"
          className="update-banner__action"
          aria-label="Update the app now and reload to the latest version"
          onClick={applyUpdate}
        >
          Update now
        </button>
        <button
          type="button"
          className="update-banner__dismiss"
          aria-label="Dismiss update notification"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default UpdateBanner;
