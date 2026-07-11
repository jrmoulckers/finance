// SPDX-License-Identifier: BUSL-1.1

/**
 * Spending Watchlists Page
 *
 * Displays user-configured spending watchlists with proactive alerts.
 * Users can add, edit, and remove watchlists that monitor category
 * spending against defined thresholds.
 *
 * Accessibility:
 *   - Alert notifications use role="alert" for screen reader announcements
 *   - All forms use proper label associations
 *   - Keyboard-accessible add/remove/edit controls
 *   - Responsive mobile-first layout
 *
 * References: issue #316
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../accessibility/aria';
import {
  ConfirmDialog,
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  LoadingSpinner,
  SortableList,
  type SortableListRenderProps,
} from '../components/common';
import { AmountInput } from '../components/forms/AmountInput';
import '../components/forms/forms.css';
import { AppIcon } from '../components/icons';
import { useAmountInput } from '../hooks/useAmountInput';
import { useCategories } from '../hooks/useCategories';
import {
  useSpendingWatchlists,
  type AlertLevel,
  type CreateWatchlistInput,
  type Watchlist,
  type WatchlistAlert,
} from '../hooks/useSpendingWatchlists';
import { useSecurityWatchlists } from '../hooks/useSecurityWatchlists';
import type { SecurityAlertLevel } from '../lib/investment/security-watchlist';
import { computePriceMovePercent, normalizeSymbol } from '../lib/investment/security-watchlist';

import '../styles/watchlists.css';

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

const ALERT_ARIA_LABELS: Record<AlertLevel, string> = {
  info: 'Information',
  warning: 'Warning',
  critical: 'Critical alert',
};

interface AlertCardProps {
  alert: WatchlistAlert;
  onDismiss: (id: string) => void;
}

const AlertCard: React.FC<AlertCardProps> = ({ alert, onDismiss }) => (
  <div
    className={`watchlist-alert watchlist-alert--${alert.level}`}
    role="alert"
    aria-label={`${ALERT_ARIA_LABELS[alert.level]}: ${alert.message}`}
  >
    <div className="watchlist-alert__content">
      <span className="watchlist-alert__icon" aria-hidden="true">
        <AppIcon
          name={
            alert.level === 'critical'
              ? 'alert-triangle'
              : alert.level === 'warning'
                ? 'alert-circle'
                : 'info'
          }
        />
      </span>
      <div className="watchlist-alert__text">
        <p className="watchlist-alert__message">{alert.message}</p>
        <div
          className="watchlist-alert__progress"
          role="progressbar"
          aria-valuenow={Math.min(Math.round(alert.percentage), 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${Math.round(alert.percentage)}% of spending limit`}
        >
          <div
            className={`watchlist-alert__progress-fill watchlist-alert__progress-fill--${alert.level}`}
            style={{ width: `${Math.min(alert.percentage, 100)}%` }}
          />
        </div>
      </div>
    </div>
    <button
      type="button"
      className="watchlist-alert__dismiss"
      onClick={() => onDismiss(alert.watchlist.id)}
      aria-label={`Dismiss ${alert.watchlist.categoryName} alert`}
    >
      Γ£ò
    </button>
  </div>
);

interface WatchlistItemProps {
  watchlist: Watchlist;
  currentSpent: number;
  onRemove: (id: string) => void;
  onToggleAlerts: (id: string) => void;
  itemProps: SortableListRenderProps['itemProps'];
  dragHandleProps: SortableListRenderProps['dragHandleProps'];
}

const WatchlistItem: React.FC<WatchlistItemProps> = ({
  watchlist,
  currentSpent,
  onRemove,
  onToggleAlerts,
  itemProps,
  dragHandleProps,
}) => {
  const percentage =
    watchlist.thresholdCents > 0 ? (currentSpent / watchlist.thresholdCents) * 100 : 0;

  return (
    <div {...itemProps} className={`${itemProps.className} watchlist-item`.trim()} role="listitem">
      <button
        {...dragHandleProps}
        className={`${dragHandleProps.className ?? ''} watchlist-item__drag-handle`.trim()}
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>
      <div className="watchlist-item__content">
        <div className="watchlist-item__header">
          <h3 className="watchlist-item__name">{watchlist.categoryName}</h3>
          <span className="watchlist-item__period">{watchlist.period}</span>
        </div>
        <div className="watchlist-item__spending">
          <CurrencyDisplay amount={currentSpent} /> of{' '}
          <CurrencyDisplay amount={watchlist.thresholdCents} />
          <span className="watchlist-item__percentage"> ({Math.round(percentage)}%)</span>
        </div>
        <div
          className="watchlist-item__bar"
          role="progressbar"
          aria-valuenow={Math.min(Math.round(percentage), 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${watchlist.categoryName}: ${Math.round(percentage)}% of limit`}
        >
          <div
            className={`watchlist-item__bar-fill ${percentage >= 100 ? 'watchlist-item__bar-fill--critical' : percentage >= 80 ? 'watchlist-item__bar-fill--warning' : ''}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        <div className="watchlist-item__actions">
          <button
            type="button"
            className="watchlist-item__toggle"
            onClick={() => onToggleAlerts(watchlist.id)}
            aria-label={`${watchlist.alertsEnabled ? 'Disable' : 'Enable'} alerts for ${watchlist.categoryName}`}
            aria-pressed={watchlist.alertsEnabled}
          >
            {watchlist.alertsEnabled ? (
              <>
                <AppIcon name="bell" /> Alerts on
              </>
            ) : (
              'Alerts off'
            )}
          </button>
          <button
            type="button"
            className="watchlist-item__remove"
            onClick={() => onRemove(watchlist.id)}
            aria-label={`Remove ${watchlist.categoryName} watchlist`}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Security watchlists (issue #3260)
// ---------------------------------------------------------------------------

const SECURITY_ALERT_ARIA_LABELS: Record<SecurityAlertLevel, string> = {
  info: 'Information',
  warning: 'Warning',
  critical: 'Critical alert',
};

/**
 * Security/ticker watchlists with price-move alerts. Current prices come from
 * the user's holdings; a move from each entry's reference price beyond its
 * threshold raises an alert.
 */
const SecurityWatchlistsSection: React.FC = () => {
  const {
    watches,
    alerts,
    priceBySymbolCents,
    addWatch,
    removeWatch,
    toggleAlerts,
    resetReferencePrice,
    dismissAlert,
  } = useSecurityWatchlists();

  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [referencePrice, setReferencePrice] = useState('');
  const [threshold, setThreshold] = useState('5');

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const trimmedSymbol = normalizeSymbol(symbol);
      const referenceCents = Math.round(Number.parseFloat(referencePrice) * 100);
      const thresholdPercent = Number.parseFloat(threshold);
      if (
        !trimmedSymbol ||
        !Number.isFinite(referenceCents) ||
        referenceCents <= 0 ||
        !Number.isFinite(thresholdPercent) ||
        thresholdPercent <= 0
      ) {
        return;
      }
      addWatch({
        symbol: trimmedSymbol,
        name: name.trim() || undefined,
        referencePriceCents: referenceCents,
        alertThresholdPercent: thresholdPercent,
      });
      setSymbol('');
      setName('');
      setReferencePrice('');
      setThreshold('5');
    },
    [addWatch, name, referencePrice, symbol, threshold],
  );

  return (
    <section className="page-section" aria-label="Security watchlists">
      <h2 className="page-section__title">Security Watchlists</h2>

      {alerts.length > 0 && (
        <div
          className="watchlist-alerts"
          role="log"
          aria-label="Security price-move alert notifications"
        >
          {alerts.map((alert) => (
            <div
              key={alert.watch.id}
              className={`watchlist-alert watchlist-alert--${alert.level}`}
              role="alert"
              aria-label={`${SECURITY_ALERT_ARIA_LABELS[alert.level]}: ${alert.message}`}
            >
              <div className="watchlist-alert__content">
                <span className="watchlist-alert__icon" aria-hidden="true">
                  <AppIcon
                    name={
                      alert.level === 'critical'
                        ? 'alert-triangle'
                        : alert.level === 'warning'
                          ? 'alert-circle'
                          : 'info'
                    }
                  />
                </span>
                <div className="watchlist-alert__text">
                  <p className="watchlist-alert__message">{alert.message}</p>
                </div>
              </div>
              <button
                type="button"
                className="watchlist-alert__dismiss"
                onClick={() => dismissAlert(alert.watch.id)}
                aria-label={`Dismiss ${alert.watch.symbol} price alert`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <form
          className="watchlist-security-form"
          onSubmit={handleSubmit}
          aria-label="Add security watch"
        >
          <div className="watchlist-form__field">
            <label htmlFor="sec-symbol">Ticker</label>
            <input
              id="sec-symbol"
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="AAPL"
              autoComplete="off"
              required
              aria-required="true"
            />
          </div>
          <div className="watchlist-form__field">
            <label htmlFor="sec-name">Name (optional)</label>
            <input
              id="sec-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Apple Inc."
              autoComplete="off"
            />
          </div>
          <div className="watchlist-form__field">
            <label htmlFor="sec-reference">Reference price ($)</label>
            <input
              id="sec-reference"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={referencePrice}
              onChange={(e) => setReferencePrice(e.target.value)}
              placeholder="195.00"
              required
              aria-required="true"
            />
          </div>
          <div className="watchlist-form__field">
            <label htmlFor="sec-threshold">Alert on move (±%)</label>
            <input
              id="sec-threshold"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              required
              aria-required="true"
            />
          </div>
          <button type="submit" className="watchlist-form__submit">
            Add ticker
          </button>
        </form>

        {watches.length === 0 ? (
          <EmptyState
            title="No securities watched yet"
            description="Add a ticker with a reference price to get alerted when it moves beyond your threshold."
          />
        ) : (
          <ul className="watchlist-security-list" aria-label="Watched securities">
            {watches.map((watch) => {
              const currentPrice = priceBySymbolCents.get(normalizeSymbol(watch.symbol));
              const movePercent =
                currentPrice === undefined
                  ? null
                  : computePriceMovePercent(watch.referencePriceCents, currentPrice);
              return (
                <li key={watch.id} className="watchlist-security-item">
                  <div className="watchlist-security-item__head">
                    <span className="watchlist-security-item__symbol">{watch.symbol}</span>
                    {watch.name && (
                      <span className="watchlist-security-item__name">{watch.name}</span>
                    )}
                  </div>
                  <div className="watchlist-security-item__prices">
                    <span>
                      Ref <CurrencyDisplay amount={watch.referencePriceCents} />
                    </span>
                    {currentPrice !== undefined ? (
                      <span>
                        Now <CurrencyDisplay amount={currentPrice} />
                      </span>
                    ) : (
                      <span className="watchlist-security-item__no-price">No live price</span>
                    )}
                    {movePercent !== null && (
                      <span
                        className={`watchlist-security-item__move watchlist-security-item__move--${
                          movePercent > 0 ? 'up' : movePercent < 0 ? 'down' : 'flat'
                        }`}
                      >
                        {movePercent > 0 ? '+' : ''}
                        {movePercent.toFixed(2)}%
                      </span>
                    )}
                    <span className="watchlist-security-item__threshold">
                      ±{watch.alertThresholdPercent}% alert
                    </span>
                  </div>
                  <div className="watchlist-security-item__actions">
                    <button
                      type="button"
                      onClick={() => toggleAlerts(watch.id)}
                      aria-pressed={watch.alertsEnabled}
                      aria-label={`${watch.alertsEnabled ? 'Disable' : 'Enable'} alerts for ${watch.symbol}`}
                    >
                      {watch.alertsEnabled ? (
                        <>
                          <AppIcon name="bell" /> Alerts on
                        </>
                      ) : (
                        'Alerts off'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => resetReferencePrice(watch.id)}
                      disabled={currentPrice === undefined}
                      aria-label={`Reset reference price for ${watch.symbol} to the latest price`}
                    >
                      Re-baseline
                    </button>
                    <button
                      type="button"
                      onClick={() => removeWatch(watch.id)}
                      aria-label={`Remove ${watch.symbol} from watchlist`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export const WatchlistsPage: React.FC = () => {
  const {
    watchlists,
    alerts,
    loading,
    error,
    addWatchlist,
    removeWatchlist,
    toggleAlerts,
    dismissAlert,
    reorderWatchlists,
    refresh,
  } = useSpendingWatchlists();

  const { categories, loading: categoriesLoading } = useCategories();

  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const addDialogRef = useRef<HTMLDivElement>(null);
  const addCategoryRef = useRef<HTMLSelectElement>(null);
  const thresholdInput = useAmountInput({
    currencySymbol: '$',
    decimalPlaces: 2,
    allowNegative: false,
  });
  const [periodInput, setPeriodInput] = useState<'monthly' | 'weekly'>('monthly');
  const [removingWatchlist, setRemovingWatchlist] = useState<Watchlist | null>(null);

  // Filter out categories that already have watchlists.
  const availableCategories = useMemo(
    () =>
      categories.filter(
        (cat) => !cat.isIncome && !watchlists.some((wl) => wl.categoryId === cat.id),
      ),
    [categories, watchlists],
  );

  // Compute current spending per watchlist (for display).
  const spendingMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const alert of alerts) {
      map.set(alert.watchlist.id, alert.spentCents);
    }
    return map;
  }, [alerts]);

  const handleAddSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const category = categories.find((c) => c.id === selectedCategoryId);
      if (!category || thresholdInput.cents <= 0) return;

      const thresholdCents = thresholdInput.cents;

      const input: CreateWatchlistInput = {
        categoryId: category.id,
        categoryName: category.name,
        thresholdCents,
        period: periodInput,
      };

      addWatchlist(input);
      setIsAddFormOpen(false);
      setSelectedCategoryId('');
      thresholdInput.reset(0);
    },
    [addWatchlist, categories, periodInput, selectedCategoryId, thresholdInput],
  );

  const closeAddForm = useCallback(() => {
    setIsAddFormOpen(false);
    setSelectedCategoryId('');
    thresholdInput.reset(0);
  }, [thresholdInput]);

  useFocusTrap(addDialogRef, {
    active: isAddFormOpen,
    restoreFocus: true,
    initialFocusRef: addCategoryRef,
  });

  const handleAddDialogKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAddForm();
      }
    },
    [closeAddForm],
  );

  const handleConfirmRemove = useCallback(() => {
    if (removingWatchlist) {
      removeWatchlist(removingWatchlist.id);
      setRemovingWatchlist(null);
    }
  }, [removeWatchlist, removingWatchlist]);

  const isLoading = loading || categoriesLoading;

  return (
    <>
      <div className="page-header-with-actions">
        <h1
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
          }}
        >
          Spending Watchlists
        </h1>
        <button
          type="button"
          className="add-button"
          onClick={() => setIsAddFormOpen(true)}
          aria-label="Add new spending watchlist"
        >
          <span aria-hidden="true">+</span> Add Watchlist
        </button>
      </div>

      {/* Active alerts */}
      {alerts.length > 0 && (
        <section className="page-section" aria-label="Spending alerts">
          <h2 className="page-section__title">Active Alerts</h2>
          <div className="watchlist-alerts" role="log" aria-label="Spending alert notifications">
            {alerts.map((alert) => (
              <AlertCard key={alert.watchlist.id} alert={alert} onDismiss={dismissAlert} />
            ))}
          </div>
        </section>
      )}

      {/* Watchlist items */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
          <LoadingSpinner label="Loading watchlists" />
        </div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={refresh} />
      ) : watchlists.length === 0 ? (
        <EmptyState
          title="No watchlists yet"
          description="Set up spending limits on categories to get proactive alerts when you're approaching your budget."
        />
      ) : (
        <section className="page-section" aria-label="Configured watchlists">
          <h2 className="page-section__title">Your Watchlists</h2>
          <div className="card">
            <SortableList
              items={watchlists}
              getItemId={(watchlist) => watchlist.id}
              getItemLabel={(watchlist) => watchlist.categoryName}
              onReorder={reorderWatchlists}
              className="watchlist-list"
              ariaLabel="Configured watchlists"
              renderItem={(watchlist, { itemProps, dragHandleProps }) => (
                <WatchlistItem
                  key={watchlist.id}
                  watchlist={watchlist}
                  currentSpent={spendingMap.get(watchlist.id) ?? 0}
                  onRemove={() => setRemovingWatchlist(watchlist)}
                  onToggleAlerts={toggleAlerts}
                  itemProps={itemProps}
                  dragHandleProps={dragHandleProps}
                />
              )}
            />
          </div>
        </section>
      )}

      <SecurityWatchlistsSection />

      {/* Add watchlist form (inline) */}
      {isAddFormOpen && (
        <div
          ref={addDialogRef}
          className="watchlist-form-overlay"
          role="dialog"
          aria-labelledby="watchlist-add-title"
          aria-modal="true"
          onKeyDown={handleAddDialogKeyDown}
        >
          <div
            className="watchlist-form-overlay__backdrop"
            aria-hidden="true"
            onClick={closeAddForm}
          />
          <form className="watchlist-form card" onSubmit={handleAddSubmit}>
            <h2 id="watchlist-add-title" className="watchlist-form__title">
              Add Watchlist
            </h2>
            <div className="watchlist-form__field">
              <label htmlFor="wl-category">Category</label>
              <select
                id="wl-category"
                ref={addCategoryRef}
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                required
                aria-required="true"
              >
                <option value="">Select category...</option>
                {availableCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="watchlist-form__field">
              <label htmlFor="wl-threshold">Spending Limit ($)</label>
              <AmountInput
                id="wl-threshold"
                amountInput={thresholdInput}
                className="form-input"
                displayLabel="Spending limit"
                required
                aria-required="true"
                placeholder="$0.00"
              />
            </div>
            <div className="watchlist-form__field">
              <label htmlFor="wl-period">Period</label>
              <select
                id="wl-period"
                value={periodInput}
                onChange={(e) => setPeriodInput(e.target.value as 'monthly' | 'weekly')}
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div className="watchlist-form__actions">
              <button type="submit" className="watchlist-form__submit">
                Add
              </button>
              <button type="button" className="watchlist-form__cancel" onClick={closeAddForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        isOpen={removingWatchlist !== null}
        title="Remove Watchlist"
        message={
          removingWatchlist
            ? `Remove the "${removingWatchlist.categoryName}" spending watchlist?`
            : ''
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={handleConfirmRemove}
        onCancel={() => setRemovingWatchlist(null)}
      />
    </>
  );
};

export default WatchlistsPage;
