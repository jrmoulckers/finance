// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

export interface ImportProgressProps {
  progress: { current: number; total: number };
}

export const ImportProgress: React.FC<ImportProgressProps> = ({ progress }) => {
  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <section aria-labelledby="importing-heading" className="import-progress">
      <h3 id="importing-heading" className="import-section-heading">
        Importing Transactions
      </h3>

      <div
        className="import-progress__bar-container"
        role="progressbar"
        aria-valuenow={progress.current}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-label="Import progress"
      >
        <div className="import-progress__bar-fill" style={{ width: `${percentage}%` }} />
      </div>

      <p className="import-progress__text" aria-live="polite">
        Importing {progress.current} of {progress.total}…
      </p>
    </section>
  );
};
