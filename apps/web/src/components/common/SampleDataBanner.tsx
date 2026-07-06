// SPDX-License-Identifier: BUSL-1.1

/**
 * SampleDataBanner — labels the seeded demo workspace as sample data and
 * offers a one-click path to a genuine clean slate.
 *
 * On first run the local database is seeded with sample accounts and
 * transactions so a brand-new user can explore the app (see `db/seed.ts`).
 * Without a label a first-time user cannot tell which numbers are real, and the
 * dashboard's insights are derived from that sample data. This banner makes the
 * sample state obvious and lets the user clear it: it requests a clean slate,
 * wipes device-local data, and reloads into an empty workspace (no re-seed).
 *
 * Accessibility:
 *   • `role="region"` with a descriptive `aria-label` so assistive technology
 *     can identify and skip the banner.
 *   • All controls are native buttons — keyboard-accessible and labeled.
 *   • The clear action is disabled and announces progress while it runs.
 *
 * CSP-compliant — styling lives in the companion `SampleDataBanner.css`.
 *
 * References: issue #3415
 */

import React, { useCallback, useState } from 'react';

import { isSampleDataActive, requestCleanSlate } from '../../db/sampleData';
import { wipeLocalData } from '../../storage/wipeLocalData';

import './SampleDataBanner.css';

/**
 * A banner shown while the workspace contains seeded sample data. Renders
 * nothing once the sample data has been cleared or the banner is dismissed.
 */
export const SampleDataBanner: React.FC = () => {
  const [isActive] = useState(() => isSampleDataActive());
  const [isDismissed, setIsDismissed] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleStartFresh = useCallback(async () => {
    setIsClearing(true);
    // Suppress the next boot's re-seed so the reload lands on an empty
    // workspace instead of fresh sample data (#3415).
    requestCleanSlate();
    try {
      await wipeLocalData();
    } catch {
      // A partial wipe still beats a mislabeled workspace — reload regardless
      // so the next boot re-runs against cleared, un-seeded local data.
    } finally {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }
  }, []);

  if (!isActive || isDismissed) {
    return null;
  }

  return (
    <aside className="sample-data-banner" role="region" aria-label="Sample data notice">
      <div className="sample-data-banner__content">
        <span className="sample-data-banner__badge">Sample data</span>
        <p className="sample-data-banner__text">
          These are example numbers so you can explore the app — they aren&rsquo;t your money yet.
          Start fresh whenever you&rsquo;re ready to add your own.
        </p>
      </div>
      <div className="sample-data-banner__actions">
        <button
          type="button"
          className="sample-data-banner__button sample-data-banner__button--primary"
          onClick={() => void handleStartFresh()}
          disabled={isClearing}
        >
          {isClearing ? 'Clearing sample data…' : 'Clear sample data & start fresh'}
        </button>
        <button
          type="button"
          className="sample-data-banner__button sample-data-banner__button--dismiss"
          onClick={() => setIsDismissed(true)}
          disabled={isClearing}
        >
          Keep exploring
        </button>
      </div>
    </aside>
  );
};

export default SampleDataBanner;
