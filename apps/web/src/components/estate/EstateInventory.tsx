// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo, useState } from 'react';

import { ConfirmDialog } from '../common';
import { CurrencyDisplay } from '../common';
import { getAccessInfo, saveAccessInfo } from '../../lib/estate/accessInfo';
import { ESTATE_CATEGORIES, getEstateCategory } from '../../lib/estate/categories';
import {
  createEmptyInventoryItem,
  deleteInventoryItem,
  listInventoryItems,
  saveInventoryItem,
  summarizeInventory,
} from '../../lib/estate/inventory';
import type {
  EstateAccessInfo,
  EstateCategoryId,
  EstateInventoryItem,
} from '../../lib/estate/types';

import { EstateChecklist } from './EstateChecklist';
import { ExportInventory } from './ExportInventory';
import { InventoryItem } from './InventoryItem';
import { TrustedContacts } from './TrustedContacts';
import './estate-inventory.css';

function describeInventoryItem(item: EstateInventoryItem): string {
  const category = getEstateCategory(item.categoryId);
  const named = category.summaryFields
    .map((field) => item.details[field]?.trim())
    .find((value) => Boolean(value));
  return named || `this ${category.shortLabel.toLowerCase()} entry`;
}

export const EstateInventory: React.FC = () => {
  const [items, setItems] = useState<EstateInventoryItem[]>(() => listInventoryItems());
  const [accessInfo, setAccessInfo] = useState<EstateAccessInfo>(() => getAccessInfo());
  const [selectedCategoryId, setSelectedCategoryId] = useState<EstateCategoryId>('bank-accounts');
  const [pendingItem, setPendingItem] = useState<EstateInventoryItem | null>(null);
  const [itemPendingDelete, setItemPendingDelete] = useState<EstateInventoryItem | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const activeCategory = useMemo(() => getEstateCategory(selectedCategoryId), [selectedCategoryId]);
  const visibleItems = useMemo(
    () => items.filter((item) => item.categoryId === selectedCategoryId),
    [items, selectedCategoryId],
  );
  const summary = useMemo(() => summarizeInventory(items), [items]);

  const handleSaveItem = (item: EstateInventoryItem) => {
    const saved = saveInventoryItem(item);
    setItems((current) =>
      [...current.filter((existing) => existing.id !== saved.id), saved].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    );
    setPendingItem(null);
    setSavedMessage(`${activeCategory.label} saved locally.`);
  };

  const handleDeleteItem = (itemId: string) => {
    const target = items.find((item) => item.id === itemId);
    if (!target) {
      // Unsaved draft entry - nothing is persisted, so just discard it.
      if (pendingItem?.id === itemId) {
        setPendingItem(null);
      }
      return;
    }
    setItemPendingDelete(target);
  };

  const confirmDeleteItem = () => {
    if (!itemPendingDelete) {
      return;
    }
    const itemId = itemPendingDelete.id;
    deleteInventoryItem(itemId);
    setItems((current) => current.filter((item) => item.id !== itemId));
    if (pendingItem?.id === itemId) {
      setPendingItem(null);
    }
    setItemPendingDelete(null);
    setSavedMessage('Entry removed from this device.');
  };

  const cancelDeleteItem = () => {
    setItemPendingDelete(null);
  };

  const handleAccessInfoChange = (nextAccessInfo: EstateAccessInfo) => {
    const saved = saveAccessInfo(nextAccessInfo);
    setAccessInfo(saved);
    setSavedMessage('Trusted contacts saved locally.');
  };

  return (
    <div className="estate-inventory-page">
      <section className="estate-hero" aria-label="Estate inventory overview">
        <div>
          <p className="estate-hero__eyebrow">Local-first estate planning</p>
          <h1 className="estate-hero__title">Estate &amp; end-of-life financial inventory</h1>
          <p className="estate-hero__description">
            Capture accounts, policies, property, debts, digital assets, and trusted contacts in one
            protected page that stays on this device unless you export it.
          </p>
        </div>
        <div className="estate-hero__stats">
          <div className="estate-hero__stat">
            <span className="estate-hero__stat-value">{summary.totalItems}</span>
            <span className="estate-hero__stat-label">items saved</span>
          </div>
          <div className="estate-hero__stat">
            <span className="estate-hero__stat-value">{summary.documentedCategories.length}</span>
            <span className="estate-hero__stat-label">categories covered</span>
          </div>
          <div className="estate-hero__stat">
            <span className="estate-hero__stat-value">{accessInfo.trustedContacts.length}</span>
            <span className="estate-hero__stat-label">trusted contacts</span>
          </div>
          <div className="estate-hero__stat estate-hero__stat--value">
            <span className="estate-hero__stat-value">
              {summary.hasEstimatedValue ? (
                <CurrencyDisplay amount={summary.netEstimatedValueCents} />
              ) : (
                '—'
              )}
            </span>
            <span className="estate-hero__stat-label">est. net value</span>
          </div>
        </div>
      </section>

      {summary.hasEstimatedValue ? (
        <section className="estate-value-summary" aria-label="Estimated estate value breakdown">
          <div className="estate-value-summary__totals">
            <div className="estate-value-summary__total">
              <span className="estate-value-summary__total-label">Assets</span>
              <span className="estate-value-summary__total-value">
                <CurrencyDisplay amount={summary.totalAssetsCents} />
              </span>
            </div>
            <div className="estate-value-summary__total">
              <span className="estate-value-summary__total-label">Liabilities</span>
              <span className="estate-value-summary__total-value">
                <CurrencyDisplay amount={summary.totalLiabilitiesCents} />
              </span>
            </div>
            <div className="estate-value-summary__total estate-value-summary__total--net">
              <span className="estate-value-summary__total-label">Estimated net value</span>
              <span className="estate-value-summary__total-value">
                <CurrencyDisplay amount={summary.netEstimatedValueCents} />
              </span>
            </div>
          </div>
          {summary.categoryValueSubtotals.length > 0 ? (
            <details className="estate-value-summary__details">
              <summary>Per-category subtotals</summary>
              <ul className="estate-value-summary__list">
                {summary.categoryValueSubtotals.map((subtotal) => (
                  <li key={subtotal.categoryId} className="estate-value-summary__row">
                    <span className="estate-value-summary__row-label">
                      {getEstateCategory(subtotal.categoryId).label}
                      {subtotal.kind === 'liability' ? ' (liability)' : ''}
                      {subtotal.kind === 'other' ? ' (not counted in net)' : ''}
                    </span>
                    <span className="estate-value-summary__row-value">
                      <CurrencyDisplay amount={subtotal.totalCents} />
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className="estate-value-summary__note">
            Estimate only, based on the approximate values you entered. Blank or mixed-currency
            entries are treated as zero.
          </p>
        </section>
      ) : null}

      {savedMessage ? (
        <p className="estate-page-status" role="status" aria-live="polite">
          {savedMessage}
        </p>
      ) : null}

      <div className="estate-layout">
        <section className="estate-panel estate-panel--main" aria-label="Inventory entries">
          <div className="estate-panel__header estate-panel__header--stacked-mobile">
            <div>
              <h2 className="estate-panel__title">Inventory entries</h2>
              <p className="estate-panel__description">
                Switch categories to document each part of the estate.
              </p>
            </div>
            <button
              type="button"
              className="estate-button"
              onClick={() => setPendingItem(createEmptyInventoryItem(selectedCategoryId))}
              aria-label={`Add ${activeCategory.label} entry`}
            >
              Add {activeCategory.shortLabel} entry
            </button>
          </div>

          <div
            className="estate-category-tabs"
            role="tablist"
            aria-label="Estate inventory categories"
          >
            {ESTATE_CATEGORIES.map((category) => {
              const count = items.filter((item) => item.categoryId === category.id).length;
              const active = category.id === selectedCategoryId;
              return (
                <button
                  key={category.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`estate-category-tab ${active ? 'estate-category-tab--active' : ''}`}
                  onClick={() => {
                    setSelectedCategoryId(category.id);
                    if (pendingItem && pendingItem.categoryId !== category.id) {
                      setPendingItem(null);
                    }
                  }}
                >
                  <span>{category.label}</span>
                  <span className="estate-category-tab__count">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="estate-category-summary">
            <h3 className="estate-category-summary__title">{activeCategory.label}</h3>
            <p className="estate-panel__description">{activeCategory.description}</p>
          </div>

          <div className="estate-entry-list" role="list">
            {pendingItem && pendingItem.categoryId === selectedCategoryId ? (
              <InventoryItem
                key={pendingItem.id}
                category={activeCategory}
                item={pendingItem}
                isNew
                startInEditMode
                onSave={handleSaveItem}
                onDelete={handleDeleteItem}
                onCancelNew={() => setPendingItem(null)}
              />
            ) : null}

            {visibleItems.length === 0 && !pendingItem ? (
              <div className="estate-empty-state" role="status" aria-live="polite">
                {activeCategory.emptyState}
              </div>
            ) : null}

            {visibleItems.map((item) => (
              <InventoryItem
                key={item.id}
                category={activeCategory}
                item={item}
                onSave={handleSaveItem}
                onDelete={handleDeleteItem}
              />
            ))}
          </div>
        </section>

        <aside className="estate-sidebar">
          <EstateChecklist items={items} accessInfo={accessInfo} />
          <ExportInventory items={items} accessInfo={accessInfo} />
        </aside>
      </div>

      <TrustedContacts accessInfo={accessInfo} onChange={handleAccessInfoChange} />

      <ConfirmDialog
        isOpen={Boolean(itemPendingDelete)}
        title="Delete estate entry?"
        message={
          itemPendingDelete
            ? `Permanently remove ${describeInventoryItem(itemPendingDelete)} from this device? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Keep entry"
        variant="danger"
        onConfirm={confirmDeleteItem}
        onCancel={cancelDeleteItem}
      />
    </div>
  );
};

export default EstateInventory;
