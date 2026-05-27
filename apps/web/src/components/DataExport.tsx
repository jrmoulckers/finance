// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import type { SqliteDb } from '../db/sqlite-wasm';
import { getAllAccounts } from '../db/repositories/accounts';
import { getAllTransactions } from '../db/repositories/transactions';
import { getAllBudgets } from '../db/repositories/budgets';
import { getAllGoals } from '../db/repositories/goals';
import { getAllCategories } from '../db/repositories/categories';
import {
  buildDataAccessPackage,
  shouldAutoDeletePackage,
  shouldWarnPackageExpiresSoon,
  type DataAccessManifest,
  type DataAccessPackageResult,
} from '../lib/data-access-package';
import './data-export.css';

type ExportStatus =
  | 'idle'
  | 'pending'
  | 'generating'
  | 'ready'
  | 'delivered'
  | 'error'
  | 'cancelled';
type ExportRecord = Record<string, unknown>;

interface ExportData {
  accounts: ReturnType<typeof getAllAccounts>;
  transactions: ReturnType<typeof getAllTransactions>;
  budgets: ReturnType<typeof getAllBudgets>;
  goals: ReturnType<typeof getAllGoals>;
  categories: ReturnType<typeof getAllCategories>;
}

export interface DataExportProps {
  className?: string;
}

const APP_VERSION = '0.1.0';

const STRINGS = {
  requestButton: 'Request my data',
  pending: 'Pending',
  generating: 'Generating',
  ready: 'Ready',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  error: 'Error',
};

/** Gather all exportable financial data from the local SQLite-WASM database. */
function gatherExportData(db: SqliteDb, includeMoodTags: boolean): ExportData {
  const transactions = getAllTransactions(db).map((transaction) => {
    if (includeMoodTags) return transaction;
    const { moodTag: _moodTag, ...exportableTransaction } = transaction;
    return exportableTransaction as typeof transaction;
  });

  return {
    accounts: getAllAccounts(db),
    transactions,
    budgets: getAllBudgets(db),
    goals: getAllGoals(db),
    categories: getAllCategories(db),
  };
}

function useExportDatabase(): SqliteDb | null {
  try {
    return useDatabase();
  } catch {
    return null;
  }
}

function readLocalStorageRecords(prefix: string): ExportRecord[] {
  const records: ExportRecord[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    records.push({ key, value: localStorage.getItem(key) });
  }
  return records;
}

function hasExportData(data: ExportData): boolean {
  return Object.values(data).some((records) => records.length > 0);
}

function toExportRecords<T extends object>(records: readonly T[]): ExportRecord[] {
  return records.map((record) => Object.fromEntries(Object.entries(record)));
}

function downloadBytes(content: Uint8Array, filename: string, mimeType: string): string {
  const blob = new Blob([content.slice().buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  return url;
}

async function shareOrDownloadPackage(
  packageResult: DataAccessPackageResult,
): Promise<string | null> {
  const file = new File([packageResult.zipBytes.slice().buffer], packageResult.fileName, {
    type: 'application/zip',
  });
  const navigatorWithShare = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (
    navigatorWithShare.share &&
    (!navigatorWithShare.canShare || navigatorWithShare.canShare({ files: [file] }))
  ) {
    await navigatorWithShare.share({ files: [file], title: 'Finance data package' });
    return null;
  }

  return downloadBytes(packageResult.zipBytes, packageResult.fileName, 'application/zip');
}

export const DataExport: React.FC<DataExportProps> = ({ className = '' }) => {
  const db = useExportDatabase();
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [includeProtectedCategories, setIncludeProtectedCategories] = useState(true);
  const [includeMoodTags, setIncludeMoodTags] = useState(false);
  const [packageResult, setPackageResult] = useState<DataAccessPackageResult | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [expirationWarning, setExpirationWarning] = useState(false);
  const cancelledRef = useRef(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  useEffect(() => {
    if (!packageResult) return undefined;
    const expiresAt = packageResult.manifest.expires_at;
    if (shouldAutoDeletePackage(new Date(), expiresAt)) {
      setPackageResult(null);
      setStatus('idle');
      return undefined;
    }
    setExpirationWarning(shouldWarnPackageExpiresSoon(new Date(), expiresAt));
    const expiresInMs = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    const warningInMs = Math.max(0, expiresInMs - 24 * 60 * 60 * 1000);
    const warningTimer = setTimeout(() => setExpirationWarning(true), warningInMs);
    const deleteTimer = setTimeout(() => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setPackageResult(null);
      setObjectUrl(null);
      setStatus('idle');
      setExpirationWarning(false);
    }, expiresInMs);
    return () => {
      clearTimeout(warningTimer);
      clearTimeout(deleteTimer);
    };
  }, [objectUrl, packageResult]);

  const manifest = packageResult?.manifest;
  const dbUnavailable = db === null;

  const startRequest = useCallback(() => {
    setShowConfirmation(true);
    setErrorMessage('');
  }, []);

  const cancelRequest = useCallback(() => {
    cancelledRef.current = true;
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    setShowConfirmation(false);
    setStatus('cancelled');
  }, []);

  const confirmRequest = useCallback(() => {
    setShowConfirmation(false);
    setStatus('pending');
    setErrorMessage('');
    cancelledRef.current = false;

    pendingTimerRef.current = setTimeout(async () => {
      if (cancelledRef.current) return;
      setStatus('generating');
      try {
        if (!db)
          throw new Error('Database is still initializing. Please wait a moment and try again.');
        const data = gatherExportData(db, includeMoodTags);
        if (!hasExportData(data)) throw new Error('No data available to export.');

        const result = buildDataAccessPackage(
          {
            accounts: toExportRecords(data.accounts),
            transactions: toExportRecords(data.transactions),
            budgets: toExportRecords(data.budgets),
            goals: toExportRecords(data.goals),
            categories: toExportRecords(data.categories),
            preferences: readLocalStorageRecords('finance-'),
            settings: readLocalStorageRecords('settings-'),
            auditLog: [
              { event: 'data_access_export_generated', timestamp: new Date().toISOString() },
            ],
            syncMetadata: [{ offline: !navigator.onLine, user_agent: navigator.userAgent }],
            recurringRules: [],
            attachments: [],
            moodTags: includeMoodTags ? readLocalStorageRecords('finance-mood-') : [],
          },
          {
            appVersion: APP_VERSION,
            locale: navigator.language,
            includeProtectedCategories,
            includeMoodTags,
          },
        );
        if (cancelledRef.current) return;
        setPackageResult(result);
        setStatus('ready');
      } catch (error) {
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Data package generation failed.');
      }
    }, 100);
  }, [db, includeMoodTags, includeProtectedCategories]);

  const deliverPackage = useCallback(async () => {
    if (!packageResult) return;
    try {
      const url = await shareOrDownloadPackage(packageResult);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setObjectUrl(url);
      setStatus('delivered');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to open the share sheet.');
    }
  }, [objectUrl, packageResult]);

  return (
    <div className={`data-export ${className}`.trim()}>
      <p id="data-export-description" className="data-export__description">
        {dbUnavailable
          ? 'Database is not available. Please wait for it to initialize.'
          : 'Generate a local ZIP package with manifest.json, per-domain JSON files, attachments, and a localized README.md. No server roundtrip is used.'}
      </p>

      <div
        className="data-export__button-group"
        role="group"
        aria-labelledby="data-export-description"
      >
        <button
          type="button"
          className="data-export__button"
          disabled={dbUnavailable || status === 'pending' || status === 'generating'}
          onClick={startRequest}
          aria-describedby="data-export-description"
        >
          <DownloadIcon />
          {STRINGS.requestButton}
        </button>
        {(status === 'pending' || status === 'generating') && (
          <button type="button" className="data-export__button" onClick={cancelRequest}>
            Cancel request
          </button>
        )}
        {packageResult && status !== 'pending' && status !== 'generating' && (
          <button
            type="button"
            className="data-export__button"
            onClick={() => void deliverPackage()}
          >
            Share ZIP package
          </button>
        )}
      </div>

      <div className="data-export__progress" role="status" aria-live="polite">
        <span>Status: {statusLabel(status)}</span>
        {(status === 'pending' || status === 'generating') && (
          <div className="progress-bar">
            <div className="progress-bar__fill data-export__progress-fill" />
          </div>
        )}
      </div>

      {showConfirmation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="data-export-confirm-title"
          className="data-export__feedback"
        >
          <h4 id="data-export-confirm-title">Request your data package?</h4>
          <p>
            Finance will include transactions, accounts, budgets, goals, recurring rules,
            categories, tags, attachments, preferences, settings, audit log entries, and sync
            metadata. The ZIP is generated on this device and is available in-app for 7 days.
          </p>
          <p>
            Mood tag data can reveal sensitive wellbeing patterns. It is excluded by default and
            only included if you opt in for this request.
          </p>
          <label>
            <input
              type="checkbox"
              checked={includeProtectedCategories}
              onChange={(event) => setIncludeProtectedCategories(event.target.checked)}
            />
            Include protected categories (included by default)
          </label>
          <label>
            <input
              type="checkbox"
              checked={includeMoodTags}
              onChange={(event) => setIncludeMoodTags(event.target.checked)}
            />
            Include mood tags for this request
          </label>
          <div className="data-export__button-group">
            <button type="button" className="data-export__button" onClick={confirmRequest}>
              Generate package
            </button>
            <button type="button" className="data-export__button" onClick={cancelRequest}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {manifest && <PackageSummary manifest={manifest} expirationWarning={expirationWarning} />}

      {status === 'delivered' && (
        <div
          role="status"
          aria-live="polite"
          className="data-export__feedback data-export__feedback--success"
        >
          <CheckIcon />
          <p className="data-export__feedback-message--success">
            Delivered — your ZIP package is ready in the share destination.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div role="alert" className="data-export__feedback data-export__feedback--error">
          <ErrorIcon />
          <p className="data-export__feedback-message--error">{errorMessage}</p>
          <button
            type="button"
            onClick={() => setStatus('idle')}
            aria-label="Dismiss error"
            className="data-export__feedback-dismiss"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
};

function statusLabel(status: ExportStatus): string {
  switch (status) {
    case 'pending':
      return STRINGS.pending;
    case 'generating':
      return STRINGS.generating;
    case 'ready':
      return STRINGS.ready;
    case 'delivered':
      return STRINGS.delivered;
    case 'cancelled':
      return STRINGS.cancelled;
    case 'error':
      return STRINGS.error;
    case 'idle':
      return 'Not requested';
  }
}

const PackageSummary: React.FC<{ manifest: DataAccessManifest; expirationWarning: boolean }> = ({
  manifest,
  expirationWarning,
}) => (
  <div className="data-export__feedback data-export__feedback--success">
    <CheckIcon />
    <div>
      <p className="data-export__feedback-message--success">
        Package ready. Expires {new Date(manifest.expires_at).toLocaleString()}.
      </p>
      {expirationWarning && (
        <p role="alert">This data package expires within 24 hours and will be auto-deleted.</p>
      )}
      <p>
        Protected categories included:{' '}
        {manifest.privacy.protected_categories_included ? 'yes' : 'no'}; mood tags included:{' '}
        {manifest.privacy.mood_tags_included ? 'yes' : 'no'}.
      </p>
    </div>
  </div>
);

const DownloadIcon: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className="data-export__icon"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className="data-export__icon data-export__icon--shrink"
    style={{ stroke: 'var(--semantic-status-positive)' }}
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const ErrorIcon: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className="data-export__icon data-export__icon--shrink"
    style={{ stroke: 'var(--semantic-status-negative)' }}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export default DataExport;
