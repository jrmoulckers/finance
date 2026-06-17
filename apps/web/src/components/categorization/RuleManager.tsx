// SPDX-License-Identifier: BUSL-1.1

import type { Category } from '../../kmp/bridge';
import { useAutoCategorize } from '../../hooks/useAutoCategorize';

import './categorization.css';

export interface RuleManagerProps {
  categories: Category[];
}

export function RuleManager({ categories }: RuleManagerProps) {
  const { learnedRules, updateRule, deleteRule, clearRules } = useAutoCategorize(categories);

  if (learnedRules.length === 0) {
    return (
      <p className="rule-manager__empty">
        No learned rules yet. Recategorize a few transactions to teach the app.
      </p>
    );
  }

  return (
    <div className="rule-manager">
      <div className="rule-manager__header">
        <h4 style={{ margin: 0 }}>Learned rules</h4>
        <button type="button" className="category-confirmation__button" onClick={clearRules}>
          Clear all
        </button>
      </div>
      <div className="rule-manager__list">
        {learnedRules.map((rule) => (
          <div key={rule.id} className="rule-manager__item">
            <div className="rule-manager__row">
              <input
                className="form-input"
                aria-label={`Merchant rule ${rule.merchant}`}
                value={rule.merchant}
                onChange={(event) => updateRule(rule.id, { merchant: event.target.value })}
              />
              <select
                className="form-select"
                aria-label={`Category for ${rule.merchant}`}
                value={rule.categoryId}
                onChange={(event) => updateRule(rule.id, { categoryId: event.target.value })}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="category-confirmation__button"
                onClick={() => deleteRule(rule.id)}
              >
                Delete
              </button>
            </div>
            <div className="rule-manager__meta">
              Learned {new Date(rule.learnedAt).toLocaleDateString()} · used {rule.usageCount} times
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
