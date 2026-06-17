// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useMemo, useState } from 'react';

import { CurrencyDisplay } from '../common';
import { usePrivacyMode } from '../../contexts/PrivacyModeContext';
import { createEmptyBeneficiary } from '../../lib/estate/inventory';
import type {
  Beneficiary,
  EstateCategoryDefinition,
  EstateCategoryFieldDefinition,
  EstateInventoryItem,
} from '../../lib/estate/types';

export interface InventoryItemProps {
  readonly category: EstateCategoryDefinition;
  readonly item: EstateInventoryItem;
  readonly isNew?: boolean;
  readonly startInEditMode?: boolean;
  readonly onSave: (item: EstateInventoryItem) => void;
  readonly onDelete: (itemId: string) => void;
  readonly onCancelNew?: () => void;
}

function parseCurrencyValue(value: string): number | null {
  const normalized = value.replaceAll(',', '').trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed * 100);
}

function formatDate(value: string): string {
  if (!value) {
    return 'Not recorded';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

function buildItemTitle(item: EstateInventoryItem, category: EstateCategoryDefinition): string {
  return (
    category.summaryFields
      .map((field) => item.details[field]?.trim())
      .find((value) => Boolean(value)) || `Untitled ${category.shortLabel.toLowerCase()} entry`
  );
}

function renderReadOnlyValue(
  field: EstateCategoryFieldDefinition,
  value: string,
  maskValue: (value: string, replacement?: string) => string,
): React.ReactNode {
  if (field.inputType === 'currency') {
    const parsed = parseCurrencyValue(value);
    if (parsed !== null) {
      return <CurrencyDisplay amount={parsed} />;
    }
  }

  return maskValue(value);
}

export const InventoryItem: React.FC<InventoryItemProps> = ({
  category,
  item,
  isNew = false,
  startInEditMode = false,
  onSave,
  onDelete,
  onCancelNew,
}) => {
  const { maskValue } = usePrivacyMode();
  const [draft, setDraft] = useState(item);
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(item);
  }, [item]);

  useEffect(() => {
    if (startInEditMode) {
      setIsEditing(true);
    }
  }, [startInEditMode, item.id]);

  const title = useMemo(() => buildItemTitle(item, category), [category, item]);

  const handleDetailChange = (fieldKey: string, value: string) => {
    setDraft((current) => ({
      ...current,
      details: {
        ...current.details,
        [fieldKey]: value,
      },
    }));
  };

  const handleBeneficiaryChange = (
    beneficiaryId: string,
    field: keyof Beneficiary,
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      beneficiaries: current.beneficiaries.map((beneficiary) =>
        beneficiary.id === beneficiaryId ? { ...beneficiary, [field]: value } : beneficiary,
      ),
    }));
  };

  const addBeneficiary = () => {
    setDraft((current) => ({
      ...current,
      beneficiaries: [...current.beneficiaries, createEmptyBeneficiary()],
    }));
  };

  const removeBeneficiary = (beneficiaryId: string) => {
    setDraft((current) => ({
      ...current,
      beneficiaries: current.beneficiaries.filter(
        (beneficiary) => beneficiary.id !== beneficiaryId,
      ),
    }));
  };

  const handleSave = () => {
    const missingRequiredLabels = category.fields
      .filter((field) => field.required && !draft.details[field.key]?.trim())
      .map((field) => field.label);

    if (missingRequiredLabels.length > 0) {
      setError(`Add ${missingRequiredLabels.join(', ')} before saving.`);
      return;
    }

    setError('');
    onSave({
      ...draft,
      beneficiaries: draft.beneficiaries.filter(
        (beneficiary) => beneficiary.name.trim() || beneficiary.relationship.trim(),
      ),
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setError('');
    if (isNew) {
      onCancelNew?.();
      return;
    }

    setDraft(item);
    setIsEditing(false);
  };

  return (
    <article className="estate-card" aria-label={title}>
      <div className="estate-card__header">
        <div>
          <p className="estate-card__eyebrow">{category.label}</p>
          <h3 className="estate-card__title">{title}</h3>
          <p className="estate-card__meta">Last verified: {formatDate(item.lastVerifiedAt)}</p>
        </div>
        <div className="estate-card__actions">
          {!isEditing ? (
            <button
              type="button"
              className="estate-button estate-button--secondary"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
          ) : null}
          <button
            type="button"
            className="estate-button estate-button--ghost"
            onClick={() => onDelete(item.id)}
          >
            Delete
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="estate-card__body">
          <div className="estate-form-grid estate-form-grid--two-columns">
            {category.fields.map((field) => {
              const fieldId = `${item.id}-${field.key}`;
              const value = draft.details[field.key] ?? '';

              if (field.inputType === 'select') {
                return (
                  <label key={field.key} className="estate-field">
                    <span className="estate-field__label">{field.label}</span>
                    <select
                      id={fieldId}
                      className="estate-field__control"
                      value={value}
                      onChange={(event) => handleDetailChange(field.key, event.target.value)}
                    >
                      <option value="">Select…</option>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (field.inputType === 'textarea') {
                return (
                  <label key={field.key} className="estate-field estate-field--full-width">
                    <span className="estate-field__label">{field.label}</span>
                    <textarea
                      id={fieldId}
                      className="estate-field__control estate-field__control--textarea"
                      value={value}
                      onChange={(event) => handleDetailChange(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                    />
                  </label>
                );
              }

              return (
                <label key={field.key} className="estate-field">
                  <span className="estate-field__label">{field.label}</span>
                  <input
                    id={fieldId}
                    className="estate-field__control"
                    type={field.inputType === 'currency' ? 'text' : field.inputType}
                    inputMode={field.inputType === 'currency' ? 'decimal' : undefined}
                    value={value}
                    onChange={(event) => handleDetailChange(field.key, event.target.value)}
                    placeholder={field.placeholder}
                  />
                </label>
              );
            })}

            <label className="estate-field estate-field--full-width">
              <span className="estate-field__label">Document location</span>
              <input
                className="estate-field__control"
                type="text"
                value={draft.documentLocation}
                onChange={(event) => setDraft({ ...draft, documentLocation: event.target.value })}
                placeholder="Fire safe, attorney portal, binder tab, filing cabinet…"
              />
            </label>

            <label className="estate-field">
              <span className="estate-field__label">Last verified</span>
              <input
                className="estate-field__control"
                type="date"
                value={draft.lastVerifiedAt}
                onChange={(event) => setDraft({ ...draft, lastVerifiedAt: event.target.value })}
              />
            </label>

            <label className="estate-field estate-field--full-width">
              <span className="estate-field__label">Notes</span>
              <textarea
                className="estate-field__control estate-field__control--textarea"
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                placeholder="Beneficiary instructions, claim notes, tax basis, cancellation steps…"
                rows={3}
              />
            </label>
          </div>

          <div className="estate-beneficiaries">
            <div className="estate-beneficiaries__header">
              <div>
                <h4 className="estate-beneficiaries__title">Beneficiaries</h4>
                <p className="estate-panel__description">
                  Optional per-account beneficiary details.
                </p>
              </div>
              <button
                type="button"
                className="estate-button estate-button--secondary"
                onClick={addBeneficiary}
              >
                Add beneficiary
              </button>
            </div>

            {draft.beneficiaries.length === 0 ? (
              <p className="estate-beneficiaries__empty">No beneficiaries listed for this entry.</p>
            ) : null}

            {draft.beneficiaries.map((beneficiary, index) => (
              <div key={beneficiary.id} className="estate-beneficiary-row">
                <div className="estate-beneficiary-row__header">
                  <strong>Beneficiary {index + 1}</strong>
                  <button
                    type="button"
                    className="estate-button estate-button--ghost"
                    onClick={() => removeBeneficiary(beneficiary.id)}
                  >
                    Remove
                  </button>
                </div>
                <div className="estate-form-grid estate-form-grid--two-columns">
                  <label className="estate-field">
                    <span className="estate-field__label">Name</span>
                    <input
                      className="estate-field__control"
                      type="text"
                      value={beneficiary.name}
                      onChange={(event) =>
                        handleBeneficiaryChange(beneficiary.id, 'name', event.target.value)
                      }
                    />
                  </label>
                  <label className="estate-field">
                    <span className="estate-field__label">Relationship</span>
                    <input
                      className="estate-field__control"
                      type="text"
                      value={beneficiary.relationship}
                      onChange={(event) =>
                        handleBeneficiaryChange(beneficiary.id, 'relationship', event.target.value)
                      }
                    />
                  </label>
                  <label className="estate-field">
                    <span className="estate-field__label">Share %</span>
                    <input
                      className="estate-field__control"
                      type="text"
                      inputMode="decimal"
                      value={beneficiary.sharePercent}
                      onChange={(event) =>
                        handleBeneficiaryChange(beneficiary.id, 'sharePercent', event.target.value)
                      }
                      placeholder="50"
                    />
                  </label>
                  <label className="estate-field estate-field--full-width">
                    <span className="estate-field__label">Notes</span>
                    <textarea
                      className="estate-field__control estate-field__control--textarea"
                      value={beneficiary.notes}
                      onChange={(event) =>
                        handleBeneficiaryChange(beneficiary.id, 'notes', event.target.value)
                      }
                      rows={2}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {error ? (
            <p className="estate-card__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="estate-card__footer">
            <button type="button" className="estate-button" onClick={handleSave}>
              Save entry
            </button>
            <button
              type="button"
              className="estate-button estate-button--secondary"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="estate-card__body">
          <dl className="estate-card__details">
            {category.fields.map((field) => {
              const value = item.details[field.key]?.trim();
              if (!value) {
                return null;
              }

              return (
                <div key={field.key} className="estate-card__detail-row">
                  <dt>{field.label}</dt>
                  <dd>{renderReadOnlyValue(field, value, maskValue)}</dd>
                </div>
              );
            })}
            {item.documentLocation ? (
              <div className="estate-card__detail-row">
                <dt>Documents</dt>
                <dd>{maskValue(item.documentLocation)}</dd>
              </div>
            ) : null}
            {item.notes ? (
              <div className="estate-card__detail-row">
                <dt>Notes</dt>
                <dd>{maskValue(item.notes)}</dd>
              </div>
            ) : null}
          </dl>

          {item.beneficiaries.length > 0 ? (
            <div className="estate-card__beneficiaries">
              <h4 className="estate-card__subheading">Beneficiaries</h4>
              <ul className="estate-card__beneficiary-list" role="list">
                {item.beneficiaries.map((beneficiary) => (
                  <li key={beneficiary.id}>
                    <strong>{maskValue(beneficiary.name)}</strong>
                    {beneficiary.relationship ? ` — ${maskValue(beneficiary.relationship)}` : ''}
                    {beneficiary.sharePercent ? ` (${beneficiary.sharePercent}%)` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
};

export default InventoryItem;
