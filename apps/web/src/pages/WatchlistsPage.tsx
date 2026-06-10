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

import React, { useCallback, useMemo, useState } from 'react';
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
          <h4 className="watchlist-item__name">{watchlist.categoryName}</h4>
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
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
          }}
        >
          Spending Watchlists
        </h2>
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
          <h3 className="page-section__title">Active Alerts</h3>
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
          <h3 className="page-section__title">Your Watchlists</h3>
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

      {/* Add watchlist form (inline) */}
      {isAddFormOpen && (
        <div
          className="watchlist-form-overlay"
          role="dialog"
          aria-label="Add spending watchlist"
          aria-modal="true"
        >
          <form className="watchlist-form card" onSubmit={handleAddSubmit}>
            <h3 className="watchlist-form__title">Add Watchlist</h3>
            <div className="watchlist-form__field">
              <label htmlFor="wl-category">Category</label>
              <select
                id="wl-category"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                required
                aria-required="true"
              >
                <option value="">Select categoryΓÇª</option>
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
              <button
                type="button"
                className="watchlist-form__cancel"
                onClick={() => setIsAddFormOpen(false)}
              >
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
