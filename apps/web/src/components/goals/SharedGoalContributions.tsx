// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared goal contributions surface for couples saving together (issue #2147).
 *
 * Renders a per-partner contribution breakdown, suggested monthly targets,
 * an ordered milestone checklist, and a detailed/summarized privacy toggle on
 * top of the existing single-goal aggregate. All money maths run through the
 * pure integer-cents engine in `../../lib/goals`; this component only owns
 * presentation, local persistence, and accessibility.
 *
 * The web slice persists the per-partner split locally (the KMP shared `Goal`
 * model gains first-class contributions separately — hence "Refs #2147"). The
 * TypeScript data path for the goal itself is untouched.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import { CurrencyDisplay } from '../common';
import { AppIcon } from '../icons';
import {
  monthsUntil,
  relativeEffortLabel,
  suggestedMonthlyContributions,
  summarizeSharedGoal,
  type GoalContributionPrivacy,
  type GoalContributor,
  type GoalMilestone,
  type MilestoneProgress,
  type SuggestedMonthlyContribution,
} from '../../lib/goals';
import type { Goal } from '../../kmp/bridge';
import './shared-goal-contributions.css';

// ---------------------------------------------------------------------------
// Local persistence (web slice only — keys built from template literals)
// ---------------------------------------------------------------------------

const STORE_NAMESPACE = ['finance', 'shared-goal'].join(':');

function storageKeyFor(goalId: string): string {
  return `${STORE_NAMESPACE}:${goalId}`;
}

interface SharedGoalConfig {
  contributors: GoalContributor[];
  milestones: GoalMilestone[];
  privacy: GoalContributionPrivacy;
  incomeWeighted: boolean;
}

function defaultConfig(goal: Goal): SharedGoalConfig {
  return {
    contributors: [
      {
        id: 'you',
        name: 'You',
        contributedCents: Math.max(0, goal.currentAmount.amount),
        monthlyIncomeCents: null,
      },
    ],
    milestones: [],
    privacy: 'detailed',
    incomeWeighted: false,
  };
}

function isPrivacy(value: unknown): value is GoalContributionPrivacy {
  return value === 'detailed' || value === 'summarized';
}

function loadConfig(goal: Goal, storageKey: string): SharedGoalConfig {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey);
    if (!raw) {
      return defaultConfig(goal);
    }
    const parsed = JSON.parse(raw) as Partial<SharedGoalConfig>;
    const contributors = Array.isArray(parsed.contributors) ? parsed.contributors : [];
    return {
      contributors:
        contributors.length > 0
          ? contributors.map((entry, index) => ({
              id: typeof entry.id === 'string' ? entry.id : `c-${index}`,
              name: typeof entry.name === 'string' ? entry.name : 'Partner',
              contributedCents: Math.max(0, Math.trunc(Number(entry.contributedCents) || 0)),
              monthlyIncomeCents:
                entry.monthlyIncomeCents == null
                  ? null
                  : Math.max(0, Math.trunc(Number(entry.monthlyIncomeCents) || 0)),
            }))
          : defaultConfig(goal).contributors,
      milestones: Array.isArray(parsed.milestones)
        ? parsed.milestones.map((entry, index) => ({
            id: typeof entry.id === 'string' ? entry.id : `m-${index}`,
            label: typeof entry.label === 'string' ? entry.label : 'Milestone',
            amountCents: Math.max(0, Math.trunc(Number(entry.amountCents) || 0)),
          }))
        : [],
      privacy: isPrivacy(parsed.privacy) ? parsed.privacy : 'detailed',
      incomeWeighted: parsed.incomeWeighted === true,
    };
  } catch {
    return defaultConfig(goal);
  }
}

function saveConfig(storageKey: string, config: SharedGoalConfig): void {
  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(config));
  } catch {
    // Local-only mode: ignore storage failures.
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

let fallbackIdCounter = 0;

function generateId(prefix: string): string {
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === 'function') {
    return `${prefix}-${cryptoObj.randomUUID()}`;
  }
  if (typeof cryptoObj?.getRandomValues === 'function') {
    const buffer = new Uint32Array(2);
    cryptoObj.getRandomValues(buffer);
    return `${prefix}-${buffer[0].toString(36)}${buffer[1].toString(36)}`;
  }
  fallbackIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackIdCounter}`;
}

/** Parse a dollars string into integer cents (never floating-point money). */
function parseDollarsToCents(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (cleaned === '') {
    return 0;
  }
  const dollars = Number.parseFloat(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) {
    return 0;
  }
  return Math.round(dollars * 100);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const MILESTONE_STATUS_TEXT: Record<MilestoneProgress['status'], string> = {
  complete: 'Complete',
  'in-progress': 'In progress',
  upcoming: 'Upcoming',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SharedGoalContributionsProps {
  goal: Goal;
  /** Override the localStorage key (primarily for tests). */
  storageKey?: string;
}

export function SharedGoalContributions({
  goal,
  storageKey,
}: SharedGoalContributionsProps): ReactElement {
  const resolvedKey = storageKey ?? storageKeyFor(goal.id);

  const headingId = useId();
  const visibilityLegendId = useId();

  const [config, setConfig] = useState<SharedGoalConfig>(() => loadConfig(goal, resolvedKey));
  const [showPartnerEditor, setShowPartnerEditor] = useState(false);
  const [showMilestoneEditor, setShowMilestoneEditor] = useState(false);

  // Persist whenever the config changes.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    saveConfig(resolvedKey, config);
  }, [config, resolvedKey]);

  const currency = goal.currency.code;
  const target = Math.max(0, goal.targetAmount.amount);

  const summary = useMemo(
    () => summarizeSharedGoal(target, config.contributors, config.milestones, config.privacy),
    [target, config.contributors, config.milestones, config.privacy],
  );

  const months = goal.targetDate ? monthsUntil(todayIso(), goal.targetDate) : null;
  const plan = useMemo(() => {
    if (months == null) {
      return null;
    }
    return suggestedMonthlyContributions(summary.remainingCents, months, config.contributors, {
      incomeWeighted: config.incomeWeighted,
    });
  }, [months, summary.remainingCents, config.contributors, config.incomeWeighted]);

  const suggestionById = useMemo(() => {
    const map = new Map<string, SuggestedMonthlyContribution>();
    plan?.perPerson.forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [plan]);

  // -- Mutations ------------------------------------------------------------

  const setPrivacy = useCallback((privacy: GoalContributionPrivacy) => {
    setConfig((prev) => ({ ...prev, privacy }));
  }, []);

  const toggleIncomeWeighted = useCallback(() => {
    setConfig((prev) => ({ ...prev, incomeWeighted: !prev.incomeWeighted }));
  }, []);

  const addContributor = useCallback((contributor: GoalContributor) => {
    setConfig((prev) => ({ ...prev, contributors: [...prev.contributors, contributor] }));
    setShowPartnerEditor(false);
  }, []);

  const removeContributor = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      contributors: prev.contributors.filter((entry) => entry.id !== id),
    }));
  }, []);

  const addMilestone = useCallback((milestone: GoalMilestone) => {
    setConfig((prev) => ({ ...prev, milestones: [...prev.milestones, milestone] }));
    setShowMilestoneEditor(false);
  }, []);

  const removeMilestone = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      milestones: prev.milestones.filter((entry) => entry.id !== id),
    }));
  }, []);

  const detailed = config.privacy === 'detailed';

  return (
    <section className="shared-goal" aria-labelledby={headingId}>
      <div className="shared-goal__header">
        <div>
          <h3 id={headingId} className="shared-goal__title">
            Shared contributions
          </h3>
          <p className="shared-goal__subtitle">
            Track how much each partner has put toward {goal.name} and the household total.
          </p>
        </div>

        <fieldset className="shared-goal__visibility" aria-labelledby={visibilityLegendId}>
          <legend id={visibilityLegendId} className="shared-goal__visibility-legend">
            Partner amount visibility
          </legend>
          <div className="shared-goal__visibility-options">
            <label className="shared-goal__radio">
              <input
                type="radio"
                name={`${headingId}-privacy`}
                value="detailed"
                checked={detailed}
                onChange={() => setPrivacy('detailed')}
              />
              <span>Detailed</span>
            </label>
            <label className="shared-goal__radio">
              <input
                type="radio"
                name={`${headingId}-privacy`}
                value="summarized"
                checked={!detailed}
                onChange={() => setPrivacy('summarized')}
              />
              <span>Summarized</span>
            </label>
          </div>
        </fieldset>
      </div>

      {/* Household total */}
      <div className="card" style={{ marginBottom: 'var(--spacing-4)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 'var(--spacing-2)',
          }}
        >
          <span className="shared-goal__name">Household total</span>
          <span>
            <CurrencyDisplay amount={summary.contributedCents} currency={currency} /> of{' '}
            <CurrencyDisplay amount={summary.targetCents} currency={currency} />
          </span>
        </div>
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={summary.targetCents}
          aria-valuenow={Math.min(summary.contributedCents, summary.targetCents)}
          aria-valuetext={`${summary.householdPercentComplete}% of the household target reached`}
          aria-label={`Household savings for ${goal.name}`}
        >
          <div
            className="progress-bar__fill progress-bar__fill--positive"
            style={{ width: `${summary.householdPercentComplete}%` }}
          />
        </div>
        <p className="shared-goal__meta" style={{ marginTop: 'var(--spacing-2)' }}>
          <span>{summary.householdPercentComplete}% of household target</span>
          <span>
            <CurrencyDisplay amount={summary.remainingCents} currency={currency} /> remaining
          </span>
        </p>
      </div>

      {/* Per-partner breakdown */}
      <ul className="shared-goal__list" aria-label="Partner contributions">
        {summary.contributors.map((contributor) => {
          const suggestion = suggestionById.get(contributor.id);
          const effortText = relativeEffortLabel(contributor.relativeEffort);
          const valueText = `${contributor.sharePercent}% of household savings, ${effortText}`;
          return (
            <li className="shared-goal__contributor" key={contributor.id}>
              <div className="shared-goal__contributor-head">
                <span className="shared-goal__name">{contributor.name}</span>
                <span className="shared-goal__effort">
                  <AppIcon name="target" />
                  {effortText}
                </span>
              </div>
              <div
                className="progress-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={contributor.sharePercent}
                aria-valuetext={valueText}
                aria-label={`${contributor.name} share of ${goal.name}`}
              >
                <div
                  className="progress-bar__fill progress-bar__fill--positive"
                  style={{ width: `${Math.min(contributor.sharePercent, 100)}%` }}
                />
              </div>
              <div className="shared-goal__meta">
                <span>
                  {detailed && contributor.contributedCents !== null ? (
                    <>
                      <CurrencyDisplay amount={contributor.contributedCents} currency={currency} />{' '}
                      contributed ({contributor.sharePercent}% of savings)
                    </>
                  ) : (
                    <>{contributor.sharePercent}% of household savings</>
                  )}
                </span>
                {suggestion && (
                  <span>
                    Suggested monthly:{' '}
                    <CurrencyDisplay amount={suggestion.monthlyCents} currency={currency} />
                  </span>
                )}
              </div>
              {config.contributors.length > 1 && (
                <div className="shared-goal__row-actions">
                  <button
                    type="button"
                    className="form-button form-button--secondary"
                    onClick={() => removeContributor(contributor.id)}
                    aria-label={`Remove ${contributor.name} from ${goal.name}`}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {plan && (
        <p className="shared-goal__meta" style={{ marginTop: 'var(--spacing-2)' }}>
          <span>
            Household needs{' '}
            <CurrencyDisplay amount={plan.householdMonthlyCents} currency={currency} /> / month for{' '}
            {plan.months} month{plan.months === 1 ? '' : 's'}
          </span>
          <label className="shared-goal__toggle">
            <input
              type="checkbox"
              checked={config.incomeWeighted}
              onChange={toggleIncomeWeighted}
            />
            <span>Split suggestions by income</span>
          </label>
        </p>
      )}

      <div className="shared-goal__row-actions" style={{ marginTop: 'var(--spacing-3)' }}>
        <button
          type="button"
          className="form-button form-button--secondary"
          aria-expanded={showPartnerEditor}
          onClick={() => setShowPartnerEditor((open) => !open)}
        >
          {showPartnerEditor ? 'Close partner form' : 'Add partner'}
        </button>
      </div>

      {showPartnerEditor && (
        <ContributorEditor onAdd={addContributor} onCancel={() => setShowPartnerEditor(false)} />
      )}

      {/* Milestones */}
      <h4 className="shared-goal__title" style={{ marginTop: 'var(--spacing-5)' }}>
        Milestone plan
      </h4>
      {summary.milestones.length === 0 ? (
        <p className="shared-goal__empty">
          No milestones yet. Add checkpoints like a down payment, closing costs, or an emergency
          buffer to plan the path to {goal.name}.
        </p>
      ) : (
        <ol className="shared-goal__milestones" aria-label="Milestone checklist">
          {summary.milestones.map((milestone) => (
            <li className="shared-goal__milestone" key={milestone.id}>
              <div className="shared-goal__milestone-head">
                <span className="shared-goal__milestone-status">
                  <AppIcon name={milestone.status === 'complete' ? 'check-circle' : 'circle'} />
                  {MILESTONE_STATUS_TEXT[milestone.status]}
                </span>
                <span className="shared-goal__milestone-label">{milestone.label}</span>
                <span className="shared-goal__milestone-amount">
                  <CurrencyDisplay amount={milestone.fundedCents} currency={currency} /> of{' '}
                  <CurrencyDisplay amount={milestone.amountCents} currency={currency} />
                </span>
              </div>
              <div
                className="progress-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={milestone.percentComplete}
                aria-valuetext={`${milestone.label}: ${MILESTONE_STATUS_TEXT[milestone.status]}, ${milestone.percentComplete}%`}
                aria-label={`${milestone.label} progress`}
              >
                <div
                  className="progress-bar__fill progress-bar__fill--positive"
                  style={{ width: `${milestone.percentComplete}%` }}
                />
              </div>
              <div className="shared-goal__row-actions">
                <button
                  type="button"
                  className="form-button form-button--secondary"
                  onClick={() => removeMilestone(milestone.id)}
                  aria-label={`Remove milestone ${milestone.label}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="shared-goal__row-actions" style={{ marginTop: 'var(--spacing-3)' }}>
        <button
          type="button"
          className="form-button form-button--secondary"
          aria-expanded={showMilestoneEditor}
          onClick={() => setShowMilestoneEditor((open) => !open)}
        >
          {showMilestoneEditor ? 'Close milestone form' : 'Add milestone'}
        </button>
      </div>

      {showMilestoneEditor && (
        <MilestoneEditor onAdd={addMilestone} onCancel={() => setShowMilestoneEditor(false)} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Inline editors (non-modal, keyboard accessible)
// ---------------------------------------------------------------------------

interface ContributorEditorProps {
  onAdd: (contributor: GoalContributor) => void;
  onCancel: () => void;
}

function ContributorEditor({ onAdd, onCancel }: ContributorEditorProps): ReactElement {
  const nameId = useId();
  const amountId = useId();
  const incomeId = useId();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [income, setIncome] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Enter a name for this partner.');
      return;
    }
    onAdd({
      id: generateId('partner'),
      name: trimmed,
      contributedCents: parseDollarsToCents(amount),
      monthlyIncomeCents: income.trim() === '' ? null : parseDollarsToCents(income),
    });
  };

  return (
    <form className="shared-goal__editor" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="shared-goal__editor-row">
        <div className="shared-goal__field">
          <label className="shared-goal__field-label" htmlFor={nameId}>
            Partner name
          </label>
          <input
            id={nameId}
            className="form-input"
            type="text"
            value={name}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="shared-goal__field">
          <label className="shared-goal__field-label" htmlFor={amountId}>
            Contributed so far
          </label>
          <input
            id={amountId}
            className="form-input"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            autoComplete="off"
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="shared-goal__field">
          <label className="shared-goal__field-label" htmlFor={incomeId}>
            Monthly income (optional)
          </label>
          <input
            id={incomeId}
            className="form-input"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={income}
            autoComplete="off"
            onChange={(event) => setIncome(event.target.value)}
          />
        </div>
      </div>
      <div className="shared-goal__row-actions">
        <button type="button" className="form-button form-button--secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="form-button form-button--primary">
          Add partner
        </button>
      </div>
    </form>
  );
}

interface MilestoneEditorProps {
  onAdd: (milestone: GoalMilestone) => void;
  onCancel: () => void;
}

function MilestoneEditor({ onAdd, onCancel }: MilestoneEditorProps): ReactElement {
  const labelId = useId();
  const amountId = useId();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = label.trim();
    if (trimmed === '') {
      setError('Enter a label for this milestone.');
      return;
    }
    const amountCents = parseDollarsToCents(amount);
    if (amountCents <= 0) {
      setError('Enter a milestone amount greater than zero.');
      return;
    }
    onAdd({ id: generateId('milestone'), label: trimmed, amountCents });
  };

  return (
    <form className="shared-goal__editor" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="shared-goal__editor-row">
        <div className="shared-goal__field">
          <label className="shared-goal__field-label" htmlFor={labelId}>
            Milestone label
          </label>
          <input
            id={labelId}
            className="form-input"
            type="text"
            placeholder="Down payment"
            value={label}
            autoComplete="off"
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div className="shared-goal__field">
          <label className="shared-goal__field-label" htmlFor={amountId}>
            Amount
          </label>
          <input
            id={amountId}
            className="form-input"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            autoComplete="off"
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
      </div>
      <div className="shared-goal__row-actions">
        <button type="button" className="form-button form-button--secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="form-button form-button--primary">
          Add milestone
        </button>
      </div>
    </form>
  );
}

export default SharedGoalContributions;

// ---------------------------------------------------------------------------
// Compact indicator for the Goals list page
// ---------------------------------------------------------------------------

/** Read a stored shared-goal config without applying defaults (peek only). */
function peekStoredConfig(goalId: string): SharedGoalConfig | null {
  try {
    const raw = globalThis.localStorage?.getItem(storageKeyFor(goalId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SharedGoalConfig>;
    if (!Array.isArray(parsed.contributors) || parsed.contributors.length === 0) {
      return null;
    }
    return {
      contributors: parsed.contributors.map((entry, index) => ({
        id: typeof entry.id === 'string' ? entry.id : `c-${index}`,
        name: typeof entry.name === 'string' ? entry.name : 'Partner',
        contributedCents: Math.max(0, Math.trunc(Number(entry.contributedCents) || 0)),
        monthlyIncomeCents:
          entry.monthlyIncomeCents == null
            ? null
            : Math.max(0, Math.trunc(Number(entry.monthlyIncomeCents) || 0)),
      })),
      milestones: Array.isArray(parsed.milestones) ? (parsed.milestones as GoalMilestone[]) : [],
      privacy: isPrivacy(parsed.privacy) ? parsed.privacy : 'detailed',
      incomeWeighted: parsed.incomeWeighted === true,
    };
  } catch {
    return null;
  }
}

export interface SharedGoalBadgeProps {
  goalId: string;
  goalName: string;
}

/**
 * Compact, text-first indicator shown on a goal card when more than one partner
 * is contributing. Conveys partner count and who is leading without colour and
 * without exposing exact amounts.
 */
export function SharedGoalBadge({ goalId, goalName }: SharedGoalBadgeProps): ReactElement | null {
  const config = peekStoredConfig(goalId);
  if (!config || config.contributors.length < 2) {
    return null;
  }

  const progress = summarizeSharedGoal(0, config.contributors, [], config.privacy).contributors;
  const leader = progress.reduce((best, current) =>
    current.shareBps > best.shareBps ? current : best,
  );
  const allEven = progress.every((entry) => entry.relativeEffort === 'on-track');

  return (
    <p className="shared-goal-badge" aria-label={`Shared goal: ${goalName}`}>
      <span className="shared-goal-badge__chip">
        <AppIcon name="account" />
        {config.contributors.length} partners
      </span>
      <span className="shared-goal-badge__chip">
        {allEven ? 'Even split' : `${leader.name} leads (${leader.sharePercent}%)`}
      </span>
    </p>
  );
}
