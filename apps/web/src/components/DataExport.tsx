// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  buildAllCsvZip,
  buildDatedExportFileName,
  buildFullJsonExport,
  buildTransactionsCsv,
  serializeFullJsonExport,
} from '../lib/export/simple-export';
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
  requestButton: 'Request my data package',
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
  try {
    const records: ExportRecord[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      records.push({ key, value: localStorage.getItem(key) });
    }
    return records;
  } catch {
    return [];
  }
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

function triggerBrowserDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}

function triggerBytesDownload(bytes: Uint8Array, filename: string, mimeType: string): void {
  const blob = new Blob([bytes.slice().buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}

type NavigatorWithShare = Navigator & {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

/**
 * Probe whether the current browser actually supports sharing a file via the
 * Web Share API Level 2.
 *
 * Desktop Edge/Chrome on Windows expose `navigator.share` but reject file
 * payloads; calling `canShare({ files: [file] })` is the only reliable way to
 * distinguish "share sheet available" from "share sheet only handles text".
 */
export function canShareFiles(file: File): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as NavigatorWithShare;
  if (typeof nav.share !== 'function') return false;
  if (typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

type ShareOutcome =
  | { kind: 'shared' }
  | { kind: 'cancelled' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

/**
 * Attempt to open the system share sheet for a generated ZIP package.
 *
 * Distinguishes:
 * - `AbortError` (user dismissed the sheet) → silent.
 * - `NotAllowedError` (Permissions-Policy blocks share, browser doesn't allow
 *   file share, or activation gesture was consumed) → clear "unsupported"
 *   message.
 * - Anything else → generic error with the underlying message.
 */
export async function shareZipPackage(
  packageResult: DataAccessPackageResult,
): Promise<ShareOutcome> {
  if (
    typeof navigator === 'undefined' ||
    typeof (navigator as NavigatorWithShare).share !== 'function'
  ) {
    return { kind: 'unsupported' };
  }

  const file = new File([packageResult.zipBytes.slice().buffer], packageResult.fileName, {
    type: 'application/zip',
  });

  if (!canShareFiles(file)) {
    return { kind: 'unsupported' };
  }

  try {
    await (navigator as NavigatorWithShare).share!({
      files: [file],
      title: 'Finance data package',
    });
    return { kind: 'shared' };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { kind: 'cancelled' };
    }
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      // Browser refused — typically a Permissions-Policy block or the
      // user-activation requirement. Fall back gracefully.
      return { kind: 'unsupported' };
    }
    const message = error instanceof Error ? error.message : 'Unable to open the share sheet.';
    return { kind: 'error', message };
  }
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
  const [simpleDownloadMessage, setSimpleDownloadMessage] = useState('');
  const [expirationWarning, setExpirationWarning] = useState(false);
  const cancelledRef = useRef(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feature-detect Web Share with file support. We can't run the check until
  // a package exists (canShare wants a sample file), but `navigator.share`
  // existing is a necessary precondition we can probe up front.
  const shareApiPresent = useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      typeof (navigator as NavigatorWithShare).share === 'function',
    [],
  );
  const shareSupported = useMemo(() => {
    if (!shareApiPresent || !packageResult) return false;
    const probe = new File([new Uint8Array(0)], packageResult.fileName, {
      type: 'application/zip',
    });
    return canShareFiles(probe);
  }, [shareApiPresent, packageResult]);

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
    setSimpleDownloadMessage('');
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

  const downloadFullJson = useCallback(() => {
    setErrorMessage('');
    setSimpleDownloadMessage('');
    try {
      if (!db)
        throw new Error('Database is still initializing. Please wait a moment and try again.');
      const generatedAt = new Date();
      const exportData = buildFullJsonExport(db, {
        appVersion: APP_VERSION,
        generatedAt,
        preferences: readLocalStorageRecords('finance-'),
        settings: readLocalStorageRecords('settings-'),
      });
      triggerBrowserDownload(
        serializeFullJsonExport(exportData),
        buildDatedExportFileName('finance-data', 'json', generatedAt),
        'application/json;charset=utf-8',
      );
      setSimpleDownloadMessage('JSON download started.');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download JSON export.');
    }
  }, [db]);

  const downloadTransactionsCsv = useCallback(() => {
    setErrorMessage('');
    setSimpleDownloadMessage('');
    try {
      if (!db)
        throw new Error('Database is still initializing. Please wait a moment and try again.');
      const generatedAt = new Date();
      const exportData = buildFullJsonExport(db, { appVersion: APP_VERSION, generatedAt });
      triggerBrowserDownload(
        buildTransactionsCsv(exportData),
        buildDatedExportFileName('finance-transactions', 'csv', generatedAt),
        'text/csv;charset=utf-8',
      );
      setSimpleDownloadMessage('Transactions CSV download started.');
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to download transactions CSV.',
      );
    }
  }, [db]);

  const downloadAllCsvZip = useCallback(() => {
    setErrorMessage('');
    setSimpleDownloadMessage('');
    try {
      if (!db)
        throw new Error('Database is still initializing. Please wait a moment and try again.');
      const generatedAt = new Date();
      const exportData = buildFullJsonExport(db, {
        appVersion: APP_VERSION,
        generatedAt,
        preferences: readLocalStorageRecords('finance-'),
        settings: readLocalStorageRecords('settings-'),
      });
      const zipBytes = buildAllCsvZip(exportData);
      triggerBytesDownload(
        zipBytes,
        buildDatedExportFileName('finance-data-csv', 'zip', generatedAt),
        'application/zip',
      );
      setSimpleDownloadMessage('All-data CSV (ZIP) download started.');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download CSV ZIP.');
    }
  }, [db]);

  const downloadPackage = useCallback(() => {
    if (!packageResult) return;
    setErrorMessage('');
    try {
      const url = downloadBytes(packageResult.zipBytes, packageResult.fileName, 'application/zip');
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setObjectUrl(url);
      setStatus('delivered');
      setSimpleDownloadMessage('ZIP download started.');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download the package.');
    }
  }, [objectUrl, packageResult]);

  const sharePackage = useCallback(async () => {
    if (!packageResult) return;
    setErrorMessage('');
    const outcome = await shareZipPackage(packageResult);
    switch (outcome.kind) {
      case 'shared':
        setStatus('delivered');
        return;
      case 'cancelled':
        // Per platform UX guidance: a user-cancelled share is not an error.
        return;
      case 'unsupported':
        setStatus('error');
        setErrorMessage("Sharing isn't available in this browser. Use Download ZIP instead.");
        return;
      case 'error':
        setStatus('error');
        setErrorMessage(
          `Couldn't open the share sheet — ${outcome.message}. Try downloading instead.`,
        );
        return;
    }
  }, [packageResult]);

  const requestDisabled = dbUnavailable || status === 'pending' || status === 'generating';

  return (
    <div className={`data-export ${className}`.trim()}>
      <p id="data-export-description" className="data-export__description">
        {dbUnavailable
          ? 'Database is not available. Please wait for it to initialize.'
          : 'Download your data directly, or generate a signed ZIP package for sharing. Everything happens on this device — no server roundtrip.'}
      </p>

      <div className="data-export__group" role="group" aria-labelledby="data-export-direct-heading">
        <h4 id="data-export-direct-heading" className="data-export__group-title">
          Direct download
        </h4>
        <p className="data-export__group-help">
          One-click downloads that work for both fresh and populated accounts.
        </p>
        <div className="data-export__button-row">
          <button
            type="button"
            className="data-export__button"
            disabled={requestDisabled}
            onClick={downloadFullJson}
            aria-describedby="data-export-description"
          >
            <DownloadIcon />
            Download all data (JSON)
          </button>
          <button
            type="button"
            className="data-export__button"
            disabled={requestDisabled}
            onClick={downloadAllCsvZip}
            aria-describedby="data-export-description"
          >
            <DownloadIcon />
            Download all data (CSV ZIP)
          </button>
          <button
            type="button"
            className="data-export__button"
            disabled={requestDisabled}
            onClick={downloadTransactionsCsv}
            aria-describedby="data-export-description"
          >
            <DownloadIcon />
            Download transactions (CSV)
          </button>
        </div>
      </div>

      <div
        className="data-export__group"
        role="group"
        aria-labelledby="data-export-package-heading"
      >
        <h4 id="data-export-package-heading" className="data-export__group-title">
          Signed data package
        </h4>
        <p className="data-export__group-help">
          A signed ZIP with a manifest, README, and per-entity JSON files. Kept on-device for 7
          days.
        </p>
        <div className="data-export__button-row">
          <button
            type="button"
            className="data-export__button"
            disabled={requestDisabled}
            onClick={startRequest}
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
            <>
              <button
                type="button"
                className="data-export__button data-export__button--primary"
                onClick={downloadPackage}
              >
                <DownloadIcon />
                Download ZIP
              </button>
              {shareApiPresent && (
                <button
                  type="button"
                  className="data-export__button"
                  onClick={() => void sharePackage()}
                  disabled={!shareSupported}
                  aria-describedby="data-export-share-help"
                  title={
                    shareSupported
                      ? undefined
                      : "Sharing isn't available in this browser — use Download ZIP."
                  }
                >
                  Share my exported package
                </button>
              )}
            </>
          )}
          {!packageResult && shareApiPresent && (
            <button
              type="button"
              className="data-export__button"
              disabled
              aria-describedby="data-export-share-help"
              title="Generate a package first, then share."
            >
              Share my exported package
            </button>
          )}
        </div>
        {shareApiPresent && (
          <p id="data-export-share-help" className="data-export__group-help">
            Opens your device's share sheet (Files, AirDrop, Messages, etc.).
            {!packageResult && ' Generate a package first.'}
          </p>
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

      {simpleDownloadMessage && (
        <div
          role="status"
          aria-live="polite"
          className="data-export__feedback data-export__feedback--success"
        >
          <CheckIcon />
          <p className="data-export__feedback-message--success">{simpleDownloadMessage}</p>
        </div>
      )}

      {showConfirmation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="data-export-confirm-title"
          aria-describedby="data-export-confirm-body"
          className="data-export__dialog"
        >
          <h4 id="data-export-confirm-title" className="data-export__dialog-title">
            Request your data package
          </h4>
          <p id="data-export-confirm-body" className="data-export__dialog-body">
            Finance will include transactions, accounts, budgets, goals, recurring rules,
            categories, tags, attachments, preferences, settings, audit log entries, and sync
            metadata. The ZIP is generated on this device and is available in-app for 7 days.
          </p>

          <fieldset className="data-export__fieldset">
            <legend className="data-export__legend">Privacy options</legend>

            <label className="data-export__option">
              <input
                type="checkbox"
                className="data-export__checkbox"
                checked={includeProtectedCategories}
                onChange={(event) => setIncludeProtectedCategories(event.target.checked)}
              />
              <span className="data-export__option-text">
                <span className="data-export__option-label">Include protected categories</span>
                <span className="data-export__option-help">
                  Sensitive categories like medical or debt. Included by default.
                </span>
              </span>
            </label>

            <label className="data-export__option">
              <input
                type="checkbox"
                className="data-export__checkbox"
                checked={includeMoodTags}
                onChange={(event) => setIncludeMoodTags(event.target.checked)}
              />
              <span className="data-export__option-text">
                <span className="data-export__option-label">Include mood tags</span>
                <span className="data-export__option-help">
                  Mood tag data can reveal sensitive wellbeing patterns. Off by default.
                </span>
              </span>
            </label>
          </fieldset>

          <div className="data-export__dialog-actions">
            <button
              type="button"
              className="data-export__button data-export__button--primary"
              onClick={confirmRequest}
            >
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
    className="data-export__icon data-export__icon--shrink data-export__icon--positive"
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
    className="data-export__icon data-export__icon--shrink data-export__icon--negative"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export default DataExport;
