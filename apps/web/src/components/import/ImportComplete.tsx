// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { Link } from 'react-router-dom';

import type { ImportSummary } from '../../hooks/useImport';

export interface ImportCompleteProps {
  summary: ImportSummary;
  onReset: () => void;
}

export const ImportComplete: React.FC<ImportCompleteProps> = ({ summary, onReset }) => (
  <section aria-labelledby="complete-heading" className="import-complete">
    <span className="import-complete__icon" aria-hidden="true">
      ✅
    </span>
    <h3 id="complete-heading" className="import-complete__title">
      Import Complete
    </h3>

    <div className="import-complete__stats" role="group" aria-label="Import results">
      <div className="import-preview-stat import-preview-stat--success">
        <span className="import-preview-stat__value">{summary.imported}</span>
        <span className="import-preview-stat__label">Imported</span>
      </div>
      <div className="import-preview-stat">
        <span className="import-preview-stat__value">{summary.skipped}</span>
        <span className="import-preview-stat__label">Skipped</span>
      </div>
      {summary.errors > 0 && (
        <div className="import-preview-stat import-preview-stat--errors">
          <span className="import-preview-stat__value">{summary.errors}</span>
          <span className="import-preview-stat__label">Errors</span>
        </div>
      )}
    </div>

    <div className="import-complete__actions">
      <Link to="/transactions" className="form-button form-button--primary">
        View Transactions
      </Link>
      <button type="button" className="form-button form-button--secondary" onClick={onReset}>
        Import More
      </button>
    </div>
  </section>
);
