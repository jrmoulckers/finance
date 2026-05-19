// SPDX-License-Identifier: BUSL-1.1

/**
 * Rule Manager component for creating, editing, and managing tagging rules.
 *
 * Provides a list of existing rules with enable/disable toggles, a form
 * for creating/editing rules with conditions and actions builders, a test
 * button to preview matches, and delete with confirmation.
 *
 * @module components/tagging/RuleManager
 * References: issue #1473
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { useFocusTrap } from '../../accessibility/aria';
import { useTaggingRules } from '../../hooks/useTaggingRules';
import type { Transaction } from '../../kmp/bridge';
import { matchCondition } from '../../lib/tagging/rule-engine';
import type {
  TagAction,
  TagActionType,
  TagCondition,
  TagConditionField,
  TagConditionOperator,
  TaggingRule,
} from '../../lib/tagging/tagging-types';

import './tagging.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Available condition fields with labels. */
const CONDITION_FIELDS: readonly { value: TagConditionField; label: string }[] = [
  { value: 'counterpartyName', label: 'Counterparty' },
  { value: 'description', label: 'Description' },
  { value: 'amount', label: 'Amount' },
  { value: 'type', label: 'Type' },
  { value: 'category', label: 'Category' },
  { value: 'account', label: 'Account' },
];

/** Available operators with labels. */
const CONDITION_OPERATORS: readonly { value: TagConditionOperator; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'startsWith', label: 'Starts with' },
  { value: 'endsWith', label: 'Ends with' },
  { value: 'greaterThan', label: 'Greater than' },
  { value: 'lessThan', label: 'Less than' },
  { value: 'between', label: 'Between' },
  { value: 'matches', label: 'Matches (regex)' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for {@link RuleManager}. */
export interface RuleManagerProps {
  /** Recent transactions for rule testing. */
  readonly recentTransactions?: readonly Transaction[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Rule management UI for the auto-tagging system. */
export function RuleManager({ recentTransactions = [] }: RuleManagerProps) {
  const { rules, loading, error, addRule, editRule, removeRule, toggleRule } = useTaggingRules();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TaggingRule | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Map<string, number>>(new Map());

  // Form state
  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<TagCondition[]>([]);
  const [actions, setActions] = useState<TagAction[]>([]);
  const [priority, setPriority] = useState(50);
  const [formError, setFormError] = useState<string | null>(null);

  const formRef = useRef<HTMLDivElement>(null);
  useFocusTrap(formRef, { active: isFormOpen });

  // Reset form when opening/closing
  useEffect(() => {
    if (isFormOpen && editingRule) {
      setName(editingRule.name);
      setConditions([...editingRule.conditions]);
      setActions([...editingRule.actions]);
      setPriority(editingRule.priority);
    } else if (isFormOpen) {
      setName('');
      setConditions([{ field: 'counterpartyName', operator: 'contains', value: '' }]);
      setActions([{ type: 'addTag', value: '' }]);
      setPriority(50);
    }
    setFormError(null);
  }, [isFormOpen, editingRule]);

  // Focus first input when form opens
  useEffect(() => {
    if (isFormOpen) {
      requestAnimationFrame(() => {
        const input = formRef.current?.querySelector<HTMLInputElement>('input[name="rule-name"]');
        input?.focus();
      });
    }
  }, [isFormOpen]);

  const handleOpenCreate = useCallback(() => {
    setEditingRule(null);
    setIsFormOpen(true);
  }, []);

  const handleOpenEdit = useCallback((rule: TaggingRule) => {
    setEditingRule(rule);
    setIsFormOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsFormOpen(false);
    setEditingRule(null);
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();

      if (!name.trim()) {
        setFormError('Rule name is required.');
        return;
      }

      const validConditions = conditions.filter((c) => c.value.trim());
      if (validConditions.length === 0) {
        setFormError('At least one condition with a value is required.');
        return;
      }

      const validActions = actions.filter((a) => a.value.trim());
      if (validActions.length === 0) {
        setFormError('At least one action with a value is required.');
        return;
      }

      if (editingRule) {
        editRule(editingRule.id, {
          name: name.trim(),
          conditions: validConditions,
          actions: validActions,
          priority,
        });
      } else {
        addRule({
          name: name.trim(),
          enabled: true,
          conditions: validConditions,
          actions: validActions,
          priority,
        });
      }

      handleClose();
    },
    [name, conditions, actions, priority, editingRule, editRule, addRule, handleClose],
  );

  const handleDelete = useCallback(
    (id: string) => {
      removeRule(id);
      setDeleteConfirmId(null);
    },
    [removeRule],
  );

  const handleTestRule = useCallback(
    (rule: TaggingRule) => {
      let matchCount = 0;
      for (const txn of recentTransactions) {
        const allMatch =
          rule.conditions.length > 0 && rule.conditions.every((c) => matchCondition(txn, c));
        if (allMatch) matchCount++;
      }

      setTestResults((prev) => {
        const next = new Map(prev);
        next.set(rule.id, matchCount);
        return next;
      });
    },
    [recentTransactions],
  );

  // Condition row management
  const addCondition = useCallback(() => {
    setConditions((prev) => [
      ...prev,
      {
        field: 'counterpartyName' as TagConditionField,
        operator: 'contains' as TagConditionOperator,
        value: '',
      },
    ]);
  }, []);

  const updateCondition = useCallback((index: number, updates: Partial<TagCondition>) => {
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  }, []);

  const removeCondition = useCallback((index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Action row management
  const addAction = useCallback(() => {
    setActions((prev) => [...prev, { type: 'addTag' as TagActionType, value: '' }]);
  }, []);

  const updateAction = useCallback((index: number, updates: Partial<TagAction>) => {
    setActions((prev) => prev.map((a, i) => (i === index ? { ...a, ...updates } : a)));
  }, []);

  const removeAction = useCallback((index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    },
    [handleClose],
  );

  if (loading) {
    return (
      <div className="tagging-manager" role="status" aria-label="Loading tagging rules">
        <p className="tagging-manager__loading">Loading rules…</p>
      </div>
    );
  }

  return (
    <div className="tagging-manager">
      <div className="tagging-manager__header">
        <h2 className="tagging-manager__title">Auto-Tagging Rules</h2>
        <button
          type="button"
          className="tagging-manager__add-btn"
          onClick={handleOpenCreate}
          aria-label="Create new tagging rule"
        >
          + New Rule
        </button>
      </div>

      {error && (
        <div className="tagging-manager__error" role="alert">
          {error}
        </div>
      )}

      {rules.length === 0 ? (
        <p className="tagging-manager__empty">
          No tagging rules yet. Create one to automatically tag transactions.
        </p>
      ) : (
        <ul className="tagging-rules-list" role="list" aria-label="Tagging rules">
          {rules.map((rule) => (
            <li key={rule.id} className="tagging-rule-item" role="listitem">
              <div className="tagging-rule-item__header">
                <label className="tagging-rule-item__toggle">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={() => toggleRule(rule.id)}
                    aria-label={`${rule.enabled ? 'Disable' : 'Enable'} rule: ${rule.name}`}
                  />
                  <span className="tagging-rule-item__name">{rule.name}</span>
                </label>
                <span className="tagging-rule-item__meta">
                  Priority: {rule.priority} · Matched: {rule.matchCount}
                </span>
              </div>

              <div className="tagging-rule-item__conditions">
                {rule.conditions.map((c, i) => (
                  <span key={i} className="tagging-rule-item__condition-chip">
                    {CONDITION_FIELDS.find((f) => f.value === c.field)?.label ?? c.field}{' '}
                    {c.operator} &quot;{c.value}&quot;
                    {c.value2 ? ` – "${c.value2}"` : ''}
                  </span>
                ))}
              </div>

              <div className="tagging-rule-item__actions-row">
                {rule.actions.map((a, i) => (
                  <span key={i} className="tagging-rule-item__action-chip">
                    {a.type === 'addTag' ? `🏷️ ${a.value}` : `📂 ${a.value}`}
                  </span>
                ))}
              </div>

              <div className="tagging-rule-item__buttons">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(rule)}
                  aria-label={`Edit rule: ${rule.name}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleTestRule(rule)}
                  aria-label={`Test rule: ${rule.name}`}
                >
                  Test
                </button>
                {deleteConfirmId === rule.id ? (
                  <>
                    <span className="tagging-rule-item__confirm-text">Delete?</span>
                    <button
                      type="button"
                      className="tagging-rule-item__confirm-yes"
                      onClick={() => handleDelete(rule.id)}
                      aria-label={`Confirm delete rule: ${rule.name}`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(null)}
                      aria-label="Cancel delete"
                    >
                      No
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="tagging-rule-item__delete-btn"
                    onClick={() => setDeleteConfirmId(rule.id)}
                    aria-label={`Delete rule: ${rule.name}`}
                  >
                    Delete
                  </button>
                )}
              </div>

              {testResults.has(rule.id) && (
                <div className="tagging-rule-item__test-result" role="status">
                  Matched {testResults.get(rule.id)} of {recentTransactions.length} recent
                  transactions
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Rule creation/editing form dialog */}
      {isFormOpen && (
        <div className="form-dialog" onKeyDown={handleKeyDown} role="presentation">
          <div className="form-dialog__backdrop" onClick={handleClose} aria-hidden="true" />
          <div
            ref={formRef}
            className="form-dialog__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rule-form-title"
          >
            <h3 id="rule-form-title" className="form-dialog__title">
              {editingRule ? 'Edit Rule' : 'Create Rule'}
            </h3>

            {formError && (
              <div className="form-banner-error" role="alert">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="form-fields">
              {/* Rule name */}
              <div className="form-group">
                <label
                  htmlFor="rule-name"
                  className="form-group__label form-group__label--required"
                >
                  Name
                </label>
                <input
                  id="rule-name"
                  name="rule-name"
                  type="text"
                  className="form-group__input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Coffee shops"
                  aria-required="true"
                />
              </div>

              {/* Priority */}
              <div className="form-group">
                <label htmlFor="rule-priority" className="form-group__label">
                  Priority (higher = evaluated first)
                </label>
                <input
                  id="rule-priority"
                  name="rule-priority"
                  type="number"
                  className="form-group__input"
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                  min={0}
                  max={100}
                />
              </div>

              {/* Conditions */}
              <fieldset className="tagging-form__section">
                <legend className="tagging-form__legend">Conditions (all must match)</legend>
                {conditions.map((condition, index) => (
                  <div key={index} className="tagging-form__condition-row">
                    <select
                      value={condition.field}
                      onChange={(e) =>
                        updateCondition(index, { field: e.target.value as TagConditionField })
                      }
                      aria-label={`Condition ${index + 1} field`}
                      className="form-group__select"
                    >
                      {CONDITION_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={condition.operator}
                      onChange={(e) =>
                        updateCondition(index, { operator: e.target.value as TagConditionOperator })
                      }
                      aria-label={`Condition ${index + 1} operator`}
                      className="form-group__select"
                    >
                      {CONDITION_OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={condition.value}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                      placeholder="Value"
                      aria-label={`Condition ${index + 1} value`}
                      className="form-group__input"
                    />

                    {condition.operator === 'between' && (
                      <input
                        type="text"
                        value={condition.value2 ?? ''}
                        onChange={(e) => updateCondition(index, { value2: e.target.value })}
                        placeholder="Upper value"
                        aria-label={`Condition ${index + 1} upper value`}
                        className="form-group__input"
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => removeCondition(index)}
                      aria-label={`Remove condition ${index + 1}`}
                      className="tagging-form__remove-btn"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addCondition}
                  className="tagging-form__add-row-btn"
                  aria-label="Add condition"
                >
                  + Add Condition
                </button>
              </fieldset>

              {/* Actions */}
              <fieldset className="tagging-form__section">
                <legend className="tagging-form__legend">Actions</legend>
                {actions.map((action, index) => (
                  <div key={index} className="tagging-form__action-row">
                    <select
                      value={action.type}
                      onChange={(e) =>
                        updateAction(index, { type: e.target.value as TagActionType })
                      }
                      aria-label={`Action ${index + 1} type`}
                      className="form-group__select"
                    >
                      <option value="addTag">Add Tag</option>
                      <option value="setCategory">Set Category</option>
                    </select>

                    <input
                      type="text"
                      value={action.value}
                      onChange={(e) => updateAction(index, { value: e.target.value })}
                      placeholder={action.type === 'addTag' ? 'Tag name' : 'Category name'}
                      aria-label={`Action ${index + 1} value`}
                      className="form-group__input"
                    />

                    <button
                      type="button"
                      onClick={() => removeAction(index)}
                      aria-label={`Remove action ${index + 1}`}
                      className="tagging-form__remove-btn"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addAction}
                  className="tagging-form__add-row-btn"
                  aria-label="Add action"
                >
                  + Add Action
                </button>
              </fieldset>

              {/* Form buttons */}
              <div className="form-actions">
                <button type="button" onClick={handleClose} className="form-actions__cancel">
                  Cancel
                </button>
                <button type="submit" className="form-actions__submit">
                  {editingRule ? 'Save Changes' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
