// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessible brokerage trade-import + cross-broker reconciliation surface.
 *
 * Self-contained component: it owns its own local UI state (no persistence —
 * this slice previews and reconciles trades only). The user adds one broker
 * export at a time (file or paste), confirms the auto-detected column mapping,
 * and the panel renders a parsed-trade preview plus a unified holdings summary
 * reconciled across every added broker. The pure engine lives in
 * `lib/investments/brokerage-import` and does all money math in integer cents.
 *
 * It is imported directly by {@link BrokerageImportPage} (never via the shared
 * `components/import` barrel) so its weight stays inside the brokerage route's
 * own lazy chunk and does not inflate other import routes.
 *
 * Accessibility:
 *   - Labeled broker-name input, paste field and file picker
 *   - Column mapping is a `<fieldset>` with one labeled `<select>` per field
 *   - Preview / holdings tables use a `<caption>` and `scope="col"` headers
 *   - Action is shown with an icon **and** text label (never colour alone)
 *   - Summary and status use `aria-live="polite"`; errors use `role="alert"`
 *   - Reconciliation findings carry a text + icon severity indicator
 *
 * References: issue #2120
 */

import React, { useCallback, useId, useMemo, useState } from 'react';

import { formatCurrency, formatGainLoss } from '../../lib/currency';
import { parseCsv } from '../../lib/csv-parser';
import {
  buildBrokerageImportPlan,
  parseBrokerageCsv,
  suggestColumnMapping,
  type BrokerageAction,
  type BrokerageColumnMapping,
  type BrokerageParseResult,
} from '../../lib/investments/brokerage-import';
import { AppIcon, type IconName } from '../icons';
import { FileDropZone } from './FileDropZone';

import './brokerage-import-panel.css';

const KNOWN_BROKERS = [
  'Fidelity',
  'Schwab',
  'Robinhood',
  'E*TRADE',
  'Vanguard',
  'Merrill',
] as const;

const MAX_PREVIEW_ROWS = 3;
const MAX_TRADE_ROWS = 100;

/** Logical mapping fields shown in the confirmation step, in display order. */
const MAPPING_FIELDS: readonly {
  key: keyof BrokerageColumnMapping;
  label: string;
  required: boolean;
}[] = [
  { key: 'date', label: 'Trade date', required: true },
  { key: 'action', label: 'Action (buy / sell / dividend)', required: true },
  { key: 'symbol', label: 'Symbol', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'price', label: 'Price per share', required: true },
  { key: 'fees', label: 'Fees / commission', required: false },
  { key: 'amount', label: 'Net amount', required: false },
];

const ACTION_META: Record<BrokerageAction, { label: string; icon: IconName }> = {
  BUY: { label: 'Buy', icon: 'trending-up' },
  SELL: { label: 'Sell', icon: 'trending-down' },
  DIV: { label: 'Dividend', icon: 'gift' },
};

interface PendingSource {
  readonly broker: string;
  readonly content: string;
  readonly headers: readonly string[];
  readonly previewRows: readonly string[][];
  readonly mapping: BrokerageColumnMapping;
}

function formatQuantity(quantity: number): string {
  return quantity.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export const BrokerageImportPanel: React.FC = () => {
  const brokerInputId = useId();
  const pasteInputId = useId();
  const summaryId = useId();

  const [brokerName, setBrokerName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [sources, setSources] = useState<readonly BrokerageParseResult[]>([]);
  const [pending, setPending] = useState<PendingSource | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const plan = useMemo(() => buildBrokerageImportPlan(sources), [sources]);

  const loadContent = useCallback(
    (content: string) => {
      setParseError(null);
      const broker = brokerName.trim();
      if (!broker) {
        setParseError('Enter the broker name before adding an export.');
        return;
      }
      const { headers, rows } = parseCsv(content, { hasHeader: true });
      if (headers.length === 0 || rows.length === 0) {
        setParseError('No rows found. Make sure the file is a CSV with a header row.');
        return;
      }
      setPending({
        broker,
        content,
        headers,
        previewRows: rows.slice(0, MAX_PREVIEW_ROWS),
        mapping: suggestColumnMapping(headers),
      });
    },
    [brokerName],
  );

  const handleFile = useCallback(
    (file: File) => {
      file
        .text()
        .then((text) => loadContent(text))
        .catch(() => setParseError('Could not read that file. Please try another CSV.'));
    },
    [loadContent],
  );

  const handlePaste = useCallback(() => {
    if (pasteText.trim().length === 0) {
      setParseError('Paste the CSV text first, then add it.');
      return;
    }
    loadContent(pasteText);
  }, [loadContent, pasteText]);

  const setMappingField = useCallback((key: keyof BrokerageColumnMapping, value: string) => {
    setPending((prev) => (prev ? { ...prev, mapping: { ...prev.mapping, [key]: value } } : prev));
  }, []);

  const mappingReady = useMemo(() => {
    if (!pending) return false;
    return MAPPING_FIELDS.filter((f) => f.required).every(
      (f) => (pending.mapping[f.key] ?? '').length > 0,
    );
  }, [pending]);

  const confirmMapping = useCallback(() => {
    if (!pending || !mappingReady) return;
    const result = parseBrokerageCsv(pending.content, {
      broker: pending.broker,
      mapping: pending.mapping,
    });
    setSources((prev) => [...prev, result]);
    setPending(null);
    setPasteText('');
    setBrokerName('');
    setStatusMessage(
      `Added ${result.trades.length} trade${result.trades.length === 1 ? '' : 's'} from ${
        result.broker
      }${result.errors.length > 0 ? `; ${result.errors.length} row(s) skipped.` : '.'}`,
    );
  }, [pending, mappingReady]);

  const cancelPending = useCallback(() => {
    setPending(null);
    setParseError(null);
  }, []);

  const removeSource = useCallback((index: number) => {
    setSources((prev) => prev.filter((_, i) => i !== index));
    setStatusMessage('Removed a broker export from the reconciliation.');
  }, []);

  const reset = useCallback(() => {
    setSources([]);
    setPending(null);
    setBrokerName('');
    setPasteText('');
    setParseError(null);
    setStatusMessage('Cleared all imported trades.');
  }, []);

  const hasData = sources.length > 0;
  const previewTrades = plan.trades.slice(0, MAX_TRADE_ROWS);

  return (
    <section className="brokerage-import" aria-labelledby="brokerage-import-heading">
      <h2 id="brokerage-import-heading" className="brokerage-import__title">
        Brokerage Trade Import &amp; Reconciliation
      </h2>
      <p className="brokerage-import__intro">
        Export a trade-confirmation CSV from each broker (Fidelity, Schwab, Robinhood and others),
        add them one at a time, and we reconcile buys, sells and dividends into a single holdings
        view with average cost basis. Connecting a live brokerage account is not available here —
        all parsing happens on this device and nothing is saved automatically.
      </p>

      {/* ----------------------------------------------------------------- */}
      {/* Add a broker export                                               */}
      {/* ----------------------------------------------------------------- */}
      <div className="brokerage-import__add">
        <div className="brokerage-import__field">
          <label htmlFor={brokerInputId} className="brokerage-import__label">
            Broker name
          </label>
          <input
            id={brokerInputId}
            className="form-input"
            type="text"
            list={`${brokerInputId}-list`}
            value={brokerName}
            onChange={(event) => setBrokerName(event.target.value)}
            placeholder="e.g. Fidelity"
            autoComplete="off"
          />
          <datalist id={`${brokerInputId}-list`}>
            {KNOWN_BROKERS.map((broker) => (
              <option key={broker} value={broker} />
            ))}
          </datalist>
        </div>

        <FileDropZone
          accept=".csv"
          onFile={handleFile}
          inputLabel="Choose a broker trade-confirmation CSV file to import"
          hint=".csv files up to 10 MB — set the broker name first"
        />

        <div className="brokerage-import__field">
          <label htmlFor={pasteInputId} className="brokerage-import__label">
            …or paste CSV text
          </label>
          <textarea
            id={pasteInputId}
            className="form-input brokerage-import__paste"
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            rows={4}
            placeholder="Date,Action,Symbol,Quantity,Price,Fees&#10;2024-01-03,Buy,AAPL,10,150.00,4.95"
          />
          <button
            type="button"
            className="form-button form-button--secondary"
            onClick={handlePaste}
          >
            Add pasted CSV
          </button>
        </div>
      </div>

      {parseError !== null && (
        <p className="brokerage-import__error" role="alert">
          <AppIcon name="alert-triangle" />
          {parseError}
        </p>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Column mapping confirmation                                       */}
      {/* ----------------------------------------------------------------- */}
      {pending !== null && (
        <div className="brokerage-import__mapping">
          <fieldset className="brokerage-import__fieldset">
            <legend className="brokerage-import__legend">
              Confirm columns for {pending.broker}
            </legend>
            <p className="brokerage-import__hint">
              We matched these columns automatically. Adjust any that look wrong, then confirm.
            </p>
            <div className="brokerage-import__map-grid">
              {MAPPING_FIELDS.map((field) => {
                const selectId = `brokerage-map-${field.key}`;
                return (
                  <div key={field.key} className="brokerage-import__field">
                    <label htmlFor={selectId} className="brokerage-import__label">
                      {field.label}
                      {field.required ? (
                        <span className="brokerage-import__required"> (required)</span>
                      ) : (
                        <span className="brokerage-import__optional"> (optional)</span>
                      )}
                    </label>
                    <select
                      id={selectId}
                      className="form-select"
                      value={pending.mapping[field.key] ?? ''}
                      onChange={(event) => setMappingField(field.key, event.target.value)}
                      aria-required={field.required}
                    >
                      <option value="">{field.required ? 'Select a column' : 'Not in file'}</option>
                      {pending.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <div className="brokerage-import__table-wrapper">
            <table className="brokerage-import__table">
              <caption className="brokerage-import__caption">
                Preview of the first {pending.previewRows.length} row(s) from {pending.broker}.
              </caption>
              <thead>
                <tr>
                  {pending.headers.map((header) => (
                    <th key={header} scope="col">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.previewRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {pending.headers.map((header, colIndex) => (
                      <td key={header}>{row[colIndex] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="brokerage-import__actions">
            <button
              type="button"
              className="form-button form-button--secondary"
              onClick={cancelPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="form-button form-button--primary"
              onClick={confirmMapping}
              disabled={!mappingReady}
              aria-disabled={!mappingReady}
            >
              Confirm &amp; add export
            </button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Added sources                                                     */}
      {/* ----------------------------------------------------------------- */}
      {hasData && (
        <>
          <div
            className="brokerage-import__summary"
            role="group"
            aria-labelledby={summaryId}
            aria-live="polite"
          >
            <h3 id={summaryId} className="brokerage-import__summary-title">
              Reconciliation summary
            </h3>
            <p className="brokerage-import__sources">
              {plan.brokers.length} broker{plan.brokers.length === 1 ? '' : 's'}:{' '}
              {plan.brokers.join(', ')}
            </p>
            <dl className="brokerage-import__stats">
              <div className="brokerage-import__stat">
                <dt>Trades parsed</dt>
                <dd>{plan.totals.tradeCount}</dd>
              </div>
              <div className="brokerage-import__stat">
                <dt>Net invested</dt>
                <dd>{formatCurrency(plan.totals.netInvestedCents)}</dd>
              </div>
              <div className="brokerage-import__stat">
                <dt>Dividends</dt>
                <dd>{formatCurrency(plan.totals.dividendsCents)}</dd>
              </div>
              <div className="brokerage-import__stat">
                <dt>Total fees</dt>
                <dd>{formatCurrency(plan.totals.feesCents)}</dd>
              </div>
            </dl>
          </div>

          <ul className="brokerage-import__source-list">
            {sources.map((source, index) => (
              <li key={`${source.broker}-${index}`} className="brokerage-import__source-item">
                <span>
                  {source.broker} — {source.trades.length} trade
                  {source.trades.length === 1 ? '' : 's'}
                  {source.errors.length > 0 ? `, ${source.errors.length} skipped` : ''}
                </span>
                <button
                  type="button"
                  className="form-button form-button--secondary brokerage-import__remove"
                  onClick={() => removeSource(index)}
                >
                  Remove
                  <span className="sr-only"> {source.broker} export</span>
                </button>
              </li>
            ))}
          </ul>

          {/* Reconciled holdings ------------------------------------------- */}
          <div className="brokerage-import__table-wrapper">
            <table className="brokerage-import__table">
              <caption className="brokerage-import__caption">
                Unified holdings reconciled across all added brokers (average cost basis).
              </caption>
              <thead>
                <tr>
                  <th scope="col">Symbol</th>
                  <th scope="col" className="brokerage-import__num">
                    Net quantity
                  </th>
                  <th scope="col" className="brokerage-import__num">
                    Cost basis
                  </th>
                  <th scope="col" className="brokerage-import__num">
                    Avg cost
                  </th>
                  <th scope="col" className="brokerage-import__num">
                    Realized
                  </th>
                  <th scope="col" className="brokerage-import__num">
                    Dividends
                  </th>
                  <th scope="col">Brokers</th>
                </tr>
              </thead>
              <tbody>
                {plan.holdings.map((holding) => (
                  <tr key={holding.symbol}>
                    <th scope="row">{holding.symbol}</th>
                    <td className="brokerage-import__num">{formatQuantity(holding.netQuantity)}</td>
                    <td className="brokerage-import__num">
                      {formatCurrency(holding.costBasisCents)}
                    </td>
                    <td className="brokerage-import__num">
                      {formatCurrency(holding.averageCostCents)}
                    </td>
                    <td className="brokerage-import__num">
                      {formatGainLoss(holding.realizedGainCents)}
                    </td>
                    <td className="brokerage-import__num">
                      {formatCurrency(holding.dividendsCents)}
                    </td>
                    <td>{holding.brokers.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Warnings ------------------------------------------------------ */}
          {plan.warnings.length > 0 && (
            <div className="brokerage-import__warnings">
              <h3 className="brokerage-import__warnings-title">
                Reconciliation findings ({plan.warnings.length})
              </h3>
              <ul className="brokerage-import__warning-list">
                {plan.warnings.map((warning, index) => (
                  <li key={`${warning.type}-${index}`} className="brokerage-import__warning-item">
                    <AppIcon name={warning.severity === 'warning' ? 'alert-triangle' : 'info'} />
                    <span>
                      <span className="brokerage-import__warning-tag">
                        {warning.severity === 'warning' ? 'Warning: ' : 'Note: '}
                      </span>
                      {warning.message}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Parsed-trade preview ----------------------------------------- */}
          <div className="brokerage-import__table-wrapper">
            <table className="brokerage-import__table">
              <caption className="brokerage-import__caption">
                Parsed trades ({plan.trades.length}
                {plan.trades.length > MAX_TRADE_ROWS ? `, showing first ${MAX_TRADE_ROWS}` : ''}).
              </caption>
              <thead>
                <tr>
                  <th scope="col">Broker</th>
                  <th scope="col">Date</th>
                  <th scope="col">Symbol</th>
                  <th scope="col">Action</th>
                  <th scope="col" className="brokerage-import__num">
                    Quantity
                  </th>
                  <th scope="col" className="brokerage-import__num">
                    Price
                  </th>
                  <th scope="col" className="brokerage-import__num">
                    Fees
                  </th>
                  <th scope="col" className="brokerage-import__num">
                    Cash flow
                  </th>
                </tr>
              </thead>
              <tbody>
                {previewTrades.map((trade) => {
                  const meta = ACTION_META[trade.action];
                  return (
                    <tr key={trade.id}>
                      <td>{trade.broker}</td>
                      <td>{trade.date}</td>
                      <td>{trade.symbol}</td>
                      <td>
                        <span className="brokerage-import__action">
                          <AppIcon name={meta.icon} />
                          <span>{meta.label}</span>
                        </span>
                      </td>
                      <td className="brokerage-import__num">{formatQuantity(trade.quantity)}</td>
                      <td className="brokerage-import__num">{formatCurrency(trade.priceCents)}</td>
                      <td className="brokerage-import__num">{formatCurrency(trade.feesCents)}</td>
                      <td className="brokerage-import__num">
                        {formatGainLoss(trade.cashFlowCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Skipped rows -------------------------------------------------- */}
          {plan.errors.length > 0 && (
            <div className="brokerage-import__warnings">
              <h3 className="brokerage-import__warnings-title">
                Skipped rows ({plan.errors.length})
              </h3>
              <table className="brokerage-import__table">
                <caption className="sr-only">Rows that could not be parsed</caption>
                <thead>
                  <tr>
                    <th scope="col">Broker</th>
                    <th scope="col">Line</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.errors.map((error, index) => (
                    <tr key={`${error.broker}-${error.line}-${index}`}>
                      <td>{error.broker}</td>
                      <td>{error.line}</td>
                      <td>{error.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="brokerage-import__actions">
            <button type="button" className="form-button form-button--secondary" onClick={reset}>
              Start over
            </button>
          </div>
        </>
      )}

      <div className="brokerage-import__status" role="status" aria-live="polite">
        {statusMessage}
      </div>
    </section>
  );
};

export default BrokerageImportPanel;
