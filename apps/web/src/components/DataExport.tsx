// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported export formats. */
export type ExportFormat = 'json' | 'csv';

/** Current state of the export operation. */
type ExportStatus = 'idle' | 'exporting' | 'success' | 'error';

export interface DataExportProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate mock financial data for export.
 *
 * TODO: Replace with real data from SQLite-WASM / KMP shared logic once the
 * DataExportService (packages/core/export) is integrated on the JS target.
 */
function gatherExportData(): Record<string, unknown>[] {
  return [
    { id: 'txn-1', date: '2024-03-06', payee: 'Grocery Store', category: 'Food', amount: -67.42 },
    { id: 'txn-2', date: '2024-03-06', payee: 'Monthly Salary', category: 'Income', amount: 4500 },
    { id: 'txn-3', date: '2024-03-05', payee: 'Electric Bill', category: 'Utilities', amount: -124 },
    { id: 'txn-4', date: '2024-03-05', payee: 'Coffee Shop', category: 'Dining', amount: -5.75 },
    { id: 'txn-5', date: '2024-03-04', payee: 'Gas Station', category: 'Transport', amount: -48.3 },
  ];
}

/** Serialize records to JSON string. */
function serializeJson(data: Record<string, unknown>[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), transactions: data }, null, 2);
}

/** Serialize records to CSV string with header row. */
function serializeCsv(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = String(row[h] ?? '');
        // Escape values containing commas, quotes, or newlines
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      })
      .join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

/** Trigger a browser file download from a Blob. */
function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  // Clean up
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(anchor);
  }, 100);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Data export UI — allows users to export their financial data as JSON or CSV.
 *
 * Features:
 * - Format selection (JSON / CSV) with accessible buttons
 * - Progress indicator during export
 * - Browser file download via blob URL
 * - Success/error feedback with ARIA live region
 * - Full keyboard navigation
 */
export const DataExport: React.FC<DataExportProps> = ({ className = '' }) => {
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [lastFormat, setLastFormat] = useState<ExportFormat | null>(null);

  // Ref for returning focus after export completes
  const jsonBtnRef = useRef<HTMLButtonElement>(null);
  const csvBtnRef = useRef<HTMLButtonElement>(null);

  const handleExport = useCallback(async (format: ExportFormat) => {
    setStatus('exporting');
    setErrorMessage('');
    setLastFormat(format);

    try {
      // Simulate a brief processing delay for UX feedback (real export may
      // involve reading from SQLite-WASM which is async).
      await new Promise((resolve) => setTimeout(resolve, 400));

      const data = gatherExportData();

      if (data.length === 0) {
        setStatus('error');
        setErrorMessage('No data available to export.');
        return;
      }

      const timestamp = new Date().toISOString().slice(0, 10);

      if (format === 'json') {
        const content = serializeJson(data);
        downloadBlob(content, `finance-export-${timestamp}.json`, 'application/json');
      } else {
        const content = serializeCsv(data);
        downloadBlob(content, `finance-export-${timestamp}.csv`, 'text/csv');
      }

      setStatus('success');

      // Auto-clear success after a few seconds
      setTimeout(() => setStatus('idle'), 4000);
    } catch {
      setStatus('error');
      setErrorMessage('Export failed. Please try again.');
    }
  }, []);

  const handleDismissError = useCallback(() => {
    setStatus('idle');
    setErrorMessage('');
    // Return focus to the button that triggered the failed export
    if (lastFormat === 'csv') {
      csvBtnRef.current?.focus();
    } else {
      jsonBtnRef.current?.focus();
    }
  }, [lastFormat]);

  const isExporting = status === 'exporting';

  return (
    <div className={`data-export ${className}`.trim()}>
      <p
        id="data-export-description"
        style={{
          fontSize: 'var(--type-scale-body-font-size)',
          color: 'var(--semantic-text-secondary)',
          marginBottom: 'var(--spacing-4)',
        }}
      >
        Download your financial data for backup or use in other applications.
      </p>

      {/* Export buttons */}
      <div
        role="group"
        aria-labelledby="data-export-description"
        style={{
          display: 'flex',
          gap: 'var(--spacing-3)',
          flexWrap: 'wrap',
        }}
      >
        <button
          ref={jsonBtnRef}
          type="button"
          disabled={isExporting}
          onClick={() => handleExport('json')}
          aria-describedby="data-export-description"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)',
            padding: 'var(--spacing-2) var(--spacing-4)',
            border: '1px solid var(--semantic-interactive-default)',
            borderRadius: 'var(--border-radius-md)',
            background: 'none',
            color: 'var(--semantic-interactive-default)',
            cursor: isExporting ? 'not-allowed' : 'pointer',
            opacity: isExporting ? 0.6 : 1,
            fontSize: 'var(--type-scale-body-font-size)',
            fontWeight: 'var(--font-weight-medium)',
          }}
        >
          {isExporting && lastFormat === 'json' ? (
            <>
              <SpinnerIcon />
              Exporting…
            </>
          ) : (
            <>
              <DownloadIcon />
              Export as JSON
            </>
          )}
        </button>

        <button
          ref={csvBtnRef}
          type="button"
          disabled={isExporting}
          onClick={() => handleExport('csv')}
          aria-describedby="data-export-description"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)',
            padding: 'var(--spacing-2) var(--spacing-4)',
            border: '1px solid var(--semantic-interactive-default)',
            borderRadius: 'var(--border-radius-md)',
            background: 'none',
            color: 'var(--semantic-interactive-default)',
            cursor: isExporting ? 'not-allowed' : 'pointer',
            opacity: isExporting ? 0.6 : 1,
            fontSize: 'var(--type-scale-body-font-size)',
            fontWeight: 'var(--font-weight-medium)',
          }}
        >
          {isExporting && lastFormat === 'csv' ? (
            <>
              <SpinnerIcon />
              Exporting…
            </>
          ) : (
            <>
              <DownloadIcon />
              Export as CSV
            </>
          )}
        </button>
      </div>

      {/* Progress bar — shown during export */}
      {isExporting && (
        <div
          style={{ marginTop: 'var(--spacing-4)' }}
          role="status"
          aria-label="Export in progress"
        >
          <div className="progress-bar">
            <div
              className="progress-bar__fill"
              style={{
                width: '100%',
                animation: 'export-progress 0.8s ease-in-out infinite alternate',
              }}
            />
          </div>
          <p
            style={{
              fontSize: 'var(--type-scale-caption-font-size)',
              color: 'var(--semantic-text-secondary)',
              marginTop: 'var(--spacing-2)',
            }}
          >
            Preparing your data for download…
          </p>
        </div>
      )}

      {/* Success message — ARIA live region */}
      {status === 'success' && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: 'var(--spacing-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)',
            padding: 'var(--spacing-3) var(--spacing-4)',
            background: 'var(--color-green-50, #f0fdf4)',
            border: '1px solid var(--semantic-status-positive)',
            borderRadius: 'var(--border-radius-md)',
          }}
        >
          <CheckIcon />
          <p style={{ margin: 0, color: 'var(--semantic-status-positive)' }}>
            Export complete — your file has been downloaded.
          </p>
        </div>
      )}

      {/* Error message — ARIA alert */}
      {status === 'error' && (
        <div
          role="alert"
          style={{
            marginTop: 'var(--spacing-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-3)',
            padding: 'var(--spacing-3) var(--spacing-4)',
            background: 'var(--color-red-50, #fef2f2)',
            border: '1px solid var(--semantic-status-negative)',
            borderRadius: 'var(--border-radius-md)',
          }}
        >
          <ErrorIcon />
          <p style={{ flex: 1, color: 'var(--semantic-status-negative)', margin: 0 }}>
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={handleDismissError}
            aria-label="Dismiss error"
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--semantic-status-negative)',
              fontSize: '1.25rem',
              lineHeight: 1,
              padding: 'var(--spacing-1)',
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Inline keyframe for indeterminate progress animation */}
      <style>{`
        @keyframes export-progress {
          0%   { width: 30%; }
          100% { width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .data-export .progress-bar__fill {
            animation: none !important;
            width: 100% !important;
          }
        }
        .data-export button:focus-visible {
          outline: 2px solid var(--semantic-border-focus);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Icon sub-components (inline SVG, no external deps)
// ---------------------------------------------------------------------------

const DownloadIcon: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    style={{
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
    }}
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const SpinnerIcon: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    style={{ animation: 'spinner-rotate 1s linear infinite' }}
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="3"
      fill="none"
      opacity={0.3}
    />
    <path
      d="M12 2a10 10 0 0 1 10 10"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    style={{
      flexShrink: 0,
      stroke: 'var(--semantic-status-positive)',
      strokeWidth: 2,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
    }}
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
    style={{
      flexShrink: 0,
      stroke: 'var(--semantic-status-negative)',
      strokeWidth: 2,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
    }}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export default DataExport;
