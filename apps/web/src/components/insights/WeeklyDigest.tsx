// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useMemo, useState } from 'react';

import {
  calculateAlignmentScore,
  createDefaultValuePreferences,
  DECISION_ALIGNMENT_STORAGE_KEY,
  generateMisalignmentAlerts,
  normalizeValuePreferences,
  type UserValuePreference,
} from '../../lib/alignment';
import type { DigestPeriod, GoalProgressUpdate, WealthDigest } from '../../lib/insights';
import { AlignmentRadar, AlignmentScore, MisalignmentAlerts, ValuesSetup } from '../alignment';
import { CurrencyDisplay } from '../common/CurrencyDisplay';
import { AppIcon } from '../icons';
import { HealthScoreBadge } from './HealthScoreBadge';
import { InsightCard } from './InsightCard';
import { NetWorthChart } from './NetWorthChart';
import './insights.css';

export interface WeeklyDigestProps {
  digest: WealthDigest;
  activePeriod: DigestPeriod;
  onPeriodChange: (period: DigestPeriod) => void;
}

function loadAlignmentPreferences(): UserValuePreference[] {
  if (typeof window === 'undefined') {
    return createDefaultValuePreferences();
  }

  try {
    const raw = window.localStorage.getItem(DECISION_ALIGNMENT_STORAGE_KEY);
    return normalizeValuePreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return createDefaultValuePreferences();
  }
}

function formatPercent(value: number): string {
  const absolute = Math.abs(value);
  return Number.isInteger(absolute) ? `${absolute}%` : `${absolute.toFixed(1)}%`;
}

function formatDigestDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getTrendTone(
  direction: 'up' | 'down' | 'flat',
  invert: boolean = false,
): 'up' | 'down' | 'flat' {
  if (!invert || direction === 'flat') {
    return direction;
  }

  return direction === 'up' ? 'down' : 'up';
}

function renderGoalStatus(goal: GoalProgressUpdate): string {
  if (goal.pace === 'completed') {
    return 'Completed';
  }

  if (goal.pace === 'ahead') {
    return 'Ahead of pace';
  }

  if (goal.pace === 'needs-attention') {
    return 'Needs attention';
  }

  return 'On track';
}

export const WeeklyDigest: React.FC<WeeklyDigestProps> = ({
  digest,
  activePeriod,
  onPeriodChange,
}) => {
  const [alignmentPreferences, setAlignmentPreferences] =
    useState<UserValuePreference[]>(loadAlignmentPreferences);
  const periodLabel = activePeriod === 'weekly' ? 'Weekly' : 'Monthly';
  const netWorthTrendIcon =
    digest.netWorth.change.direction === 'down'
      ? 'trending-down'
      : digest.netWorth.change.direction === 'up'
        ? 'trending-up'
        : 'wallet';
  const alignmentResult = useMemo(
    () => calculateAlignmentScore(digest.alignmentSnapshot, alignmentPreferences),
    [alignmentPreferences, digest.alignmentSnapshot],
  );
  const misalignmentAlerts = useMemo(
    () =>
      generateMisalignmentAlerts(digest.alignmentSnapshot, alignmentPreferences, alignmentResult),
    [alignmentPreferences, alignmentResult, digest.alignmentSnapshot],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(
        DECISION_ALIGNMENT_STORAGE_KEY,
        JSON.stringify(alignmentPreferences),
      );
    } catch {
      // Ignore storage failures in constrained browsers.
    }
  }, [alignmentPreferences]);

  return (
    <div className="wealth-digest">
      <header className="wealth-digest__header">
        <div>
          <p className="wealth-digest__eyebrow">Personalized wealth insights</p>
          <h2 className="wealth-digest__title">{periodLabel} digest</h2>
          <p className="wealth-digest__subtitle">
            Generated from your local accounts, transactions, budgets, goals, and values on{' '}
            {formatDigestDate(digest.generatedAt)}.
          </p>
        </div>
        <div className="wealth-digest__period-switch" role="group" aria-label="Digest period">
          {(['weekly', 'monthly'] as const).map((period) => (
            <button
              key={period}
              type="button"
              className={`wealth-digest__period-button${period === activePeriod ? ' wealth-digest__period-button--active' : ''}`}
              onClick={() => onPeriodChange(period)}
              aria-pressed={period === activePeriod}
            >
              {period === 'weekly' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
      </header>

      <section className="wealth-digest__hero" aria-label="Overview">
        <article className="wealth-digest__panel wealth-digest__panel--wide">
          <div className="wealth-digest__panel-header">
            <div>
              <p className="wealth-digest__panel-eyebrow">Net worth trend</p>
              <h3>Current net worth</h3>
            </div>
            <span
              className={`wealth-digest__trend wealth-digest__trend--${digest.netWorth.change.direction}`}
            >
              <AppIcon name={netWorthTrendIcon} size={16} />
              {formatPercent(digest.netWorth.change.percent)}
            </span>
          </div>
          <div className="wealth-digest__currency-row">
            <CurrencyDisplay
              amount={digest.netWorth.current}
              currency={digest.currencyCode}
              colorize
              context="net worth"
            />
            <span className="wealth-digest__comparison-copy">
              <CurrencyDisplay
                amount={digest.netWorth.change.amount}
                currency={digest.currencyCode}
                colorize
                showSign
                context="net worth change"
              />{' '}
              vs last {activePeriod === 'weekly' ? 'week' : 'month'}
            </span>
          </div>
          <NetWorthChart history={digest.netWorth.history} />
          <div className="wealth-digest__totals-grid">
            <div>
              <span>Assets</span>
              <CurrencyDisplay
                amount={digest.netWorth.assets}
                currency={digest.currencyCode}
                context="assets"
              />
            </div>
            <div>
              <span>Liabilities</span>
              <CurrencyDisplay
                amount={-digest.netWorth.liabilities}
                currency={digest.currencyCode}
                colorize
                context="liabilities"
              />
            </div>
          </div>
        </article>

        <article className="wealth-digest__panel wealth-digest__panel--score">
          <div className="wealth-digest__panel-header">
            <div>
              <p className="wealth-digest__panel-eyebrow">Financial health score</p>
              <h3>{digest.healthScore.label}</h3>
            </div>
          </div>
          <HealthScoreBadge score={digest.healthScore.score} label={digest.healthScore.label} />
          <ul className="wealth-digest__score-list" role="list">
            <li>
              <span>Savings rate</span>
              <strong>{digest.healthScore.breakdown.savingsRate}/25</strong>
            </li>
            <li>
              <span>Budget adherence</span>
              <strong>{digest.healthScore.breakdown.budgetAdherence}/25</strong>
            </li>
            <li>
              <span>Emergency fund</span>
              <strong>{digest.healthScore.breakdown.emergencyFund}/25</strong>
            </li>
            <li>
              <span>Debt-to-income</span>
              <strong>{digest.healthScore.breakdown.debtToIncome}/25</strong>
            </li>
          </ul>
        </article>
      </section>

      <section className="wealth-digest__metrics" aria-label="Core metrics">
        <article className="wealth-digest__metric-card">
          <p>Savings rate</p>
          <strong>{digest.savingsRate.currentRate}%</strong>
          <span>
            <CurrencyDisplay
              amount={digest.savingsRate.currentSavings}
              currency={digest.currencyCode}
              colorize
              context="current savings"
            />{' '}
            saved from{' '}
            <CurrencyDisplay
              amount={digest.savingsRate.currentIncome}
              currency={digest.currencyCode}
              context="income"
            />
          </span>
        </article>
        <article className="wealth-digest__metric-card">
          <p>Spending this month</p>
          <strong>
            <CurrencyDisplay
              amount={digest.spending.totalCurrentSpending}
              currency={digest.currencyCode}
              context="month spending"
            />
          </strong>
          <span
            className={`wealth-digest__trend wealth-digest__trend--${getTrendTone(digest.spending.change.direction, true)}`}
          >
            <AppIcon
              name={
                digest.spending.change.direction === 'down'
                  ? 'trending-down'
                  : digest.spending.change.direction === 'up'
                    ? 'trending-up'
                    : 'wallet'
              }
              size={14}
            />
            {formatPercent(digest.spending.change.percent)} vs last month
          </span>
        </article>
        <article className="wealth-digest__metric-card">
          <p>Emergency runway</p>
          <strong>{digest.healthScore.metrics.monthsOfExpensesSaved} months</strong>
          <span>{digest.healthScore.metrics.debtToIncomeRatio}% debt-to-income ratio</span>
        </article>
      </section>

      <section className="wealth-digest__section" aria-label="Decision alignment">
        <div className="wealth-digest__section-header">
          <h3>Financial decision alignment</h3>
          <span>Local-first score based on your stated values and this month's cash flow</span>
        </div>
        <div className="wealth-digest__alignment-grid">
          <ValuesSetup
            preferences={alignmentPreferences}
            onChange={setAlignmentPreferences}
            onReset={() => setAlignmentPreferences(createDefaultValuePreferences())}
          />
          <AlignmentScore result={alignmentResult} currencyCode={digest.currencyCode} />
        </div>
        <div className="wealth-digest__alignment-grid wealth-digest__alignment-grid--secondary">
          <AlignmentRadar result={alignmentResult} />
          <MisalignmentAlerts alerts={misalignmentAlerts} />
        </div>
      </section>

      <section className="wealth-digest__section" aria-label="Top spending categories">
        <div className="wealth-digest__section-header">
          <h3>Top spending categories</h3>
          <span>Month-over-month comparison</span>
        </div>
        <div className="wealth-digest__category-list" role="list">
          {digest.spending.topCategories.length > 0 ? (
            digest.spending.topCategories.map((category) => (
              <div
                key={category.categoryId ?? category.categoryName}
                className="wealth-digest__category-item"
                role="listitem"
              >
                <div>
                  <strong>{category.categoryName}</strong>
                  <span>{category.shareOfSpending}% of current spending</span>
                </div>
                <div className="wealth-digest__category-meta">
                  <CurrencyDisplay
                    amount={category.currentAmount}
                    currency={digest.currencyCode}
                    context={`${category.categoryName} spending`}
                  />
                  <span
                    className={`wealth-digest__trend wealth-digest__trend--${getTrendTone(category.change.direction, true)}`}
                  >
                    <AppIcon
                      name={
                        category.change.direction === 'down'
                          ? 'trending-down'
                          : category.change.direction === 'up'
                            ? 'trending-up'
                            : 'wallet'
                      }
                      size={14}
                    />
                    {formatPercent(category.change.percent)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="wealth-digest__empty-copy">
              Add a few categorized expenses to see what is driving your monthly spend.
            </p>
          )}
        </div>
      </section>

      <section className="wealth-digest__section" aria-label="Goal progress updates">
        <div className="wealth-digest__section-header">
          <h3>Goal progress updates</h3>
          <span>Stay focused on the next milestone</span>
        </div>
        <div className="wealth-digest__goal-list" role="list">
          {digest.goals.length > 0 ? (
            digest.goals.map((goal) => (
              <article key={goal.id} className="wealth-digest__goal-card" role="listitem">
                <div className="wealth-digest__goal-header">
                  <div>
                    <h4>{goal.name}</h4>
                    <p>{renderGoalStatus(goal)}</p>
                  </div>
                  <strong>{goal.progressPercent}%</strong>
                </div>
                <div
                  className="wealth-digest__goal-progress"
                  role="progressbar"
                  aria-valuenow={goal.progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${goal.name} progress ${goal.progressPercent} percent`}
                >
                  <div
                    className="wealth-digest__goal-progress-fill"
                    style={{ width: `${goal.progressPercent}%` }}
                  />
                </div>
                <div className="wealth-digest__goal-meta">
                  <span>
                    <CurrencyDisplay
                      amount={goal.currentAmount}
                      currency={digest.currencyCode}
                      context={`${goal.name} current progress`}
                    />{' '}
                    of{' '}
                    <CurrencyDisplay
                      amount={goal.targetAmount}
                      currency={digest.currencyCode}
                      context={`${goal.name} target amount`}
                    />
                  </span>
                  {goal.monthlyContributionNeeded !== null && goal.monthlyContributionNeeded > 0 ? (
                    <span>
                      Need about{' '}
                      <CurrencyDisplay
                        amount={goal.monthlyContributionNeeded}
                        currency={digest.currencyCode}
                        context={`${goal.name} monthly contribution needed`}
                      />{' '}
                      /month
                    </span>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <p className="wealth-digest__empty-copy">
              Add a savings goal to start receiving progress updates in your digest.
            </p>
          )}
        </div>
      </section>

      <section className="wealth-digest__section" aria-label="Did you know insights">
        <div className="wealth-digest__section-header">
          <h3>Did you know?</h3>
          <span>Actionable ideas generated from your local data</span>
        </div>
        <div className="wealth-digest__insights-grid">
          {digest.highlights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      </section>
    </div>
  );
};
