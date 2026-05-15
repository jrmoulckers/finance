// SPDX-License-Identifier: BUSL-1.1

import type React from 'react';
import { EmptyState } from './EmptyState';
import './entity-empty-states.css';

/* --------------------------------------------------------------------------
 * SVG illustration placeholders — accessible, theme-aware
 *
 * Each illustration uses `currentColor` so it inherits the semantic
 * text-disabled token from the parent `.empty-state__icon` container.
 * -------------------------------------------------------------------------- */

const AccountsIllustration = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <rect x="8" y="16" width="48" height="32" rx="4" stroke="currentColor" strokeWidth="2" />
    <line x1="8" y1="26" x2="56" y2="26" stroke="currentColor" strokeWidth="2" />
    <circle cx="44" cy="36" r="6" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const TransactionsIllustration = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <rect x="12" y="8" width="40" height="48" rx="4" stroke="currentColor" strokeWidth="2" />
    <line x1="20" y1="20" x2="44" y2="20" stroke="currentColor" strokeWidth="2" />
    <line x1="20" y1="28" x2="38" y2="28" stroke="currentColor" strokeWidth="2" />
    <line x1="20" y1="36" x2="42" y2="36" stroke="currentColor" strokeWidth="2" />
    <line x1="20" y1="44" x2="34" y2="44" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const BudgetsIllustration = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="2" />
    <path
      d="M32 10 A22 22 0 0 1 54 32"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <circle cx="32" cy="32" r="4" fill="currentColor" />
  </svg>
);

const GoalsIllustration = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <circle cx="32" cy="28" r="18" stroke="currentColor" strokeWidth="2" />
    <circle cx="32" cy="28" r="10" stroke="currentColor" strokeWidth="2" />
    <circle cx="32" cy="28" r="3" fill="currentColor" />
    <line x1="32" y1="46" x2="32" y2="56" stroke="currentColor" strokeWidth="2" />
    <line x1="24" y1="56" x2="40" y2="56" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const WelcomeIllustration = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false">
    <rect x="10" y="20" width="60" height="40" rx="6" stroke="currentColor" strokeWidth="2" />
    <line x1="10" y1="32" x2="70" y2="32" stroke="currentColor" strokeWidth="2" />
    <circle cx="54" cy="44" r="8" stroke="currentColor" strokeWidth="2" />
    <path
      d="M50 44l3 3 5-5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M24 44h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M24 50h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/* --------------------------------------------------------------------------
 * Entity-specific empty state components
 * -------------------------------------------------------------------------- */

/** Props for entity empty state variants. */
export interface EntityEmptyStateProps {
  /** Callback when the primary CTA button is clicked. */
  onAction?: () => void;
  /** Additional CSS class names. */
  className?: string;
}

/**
 * Empty state for the Accounts page.
 */
export const AccountsEmptyState: React.FC<EntityEmptyStateProps> = ({ onAction, className }) => (
  <EmptyState
    icon={<AccountsIllustration />}
    title="No accounts yet"
    description="Add your bank accounts, credit cards, or cash wallets to start tracking your finances."
    action={
      onAction ? (
        <button type="button" className="empty-state__cta" onClick={onAction}>
          Add your first account
        </button>
      ) : undefined
    }
    className={className}
  />
);

/**
 * Empty state for the Transactions page.
 */
export const TransactionsEmptyState: React.FC<EntityEmptyStateProps> = ({
  onAction,
  className,
}) => (
  <EmptyState
    icon={<TransactionsIllustration />}
    title="No transactions yet"
    description="Record your income and expenses to see where your money goes."
    action={
      onAction ? (
        <button type="button" className="empty-state__cta" onClick={onAction}>
          Add a transaction
        </button>
      ) : undefined
    }
    className={className}
  />
);

/**
 * Empty state for the Budgets page.
 */
export const BudgetsEmptyState: React.FC<EntityEmptyStateProps> = ({ onAction, className }) => (
  <EmptyState
    icon={<BudgetsIllustration />}
    title="No budgets yet"
    description="Create budgets to set spending limits and stay on track with your financial goals."
    action={
      onAction ? (
        <button type="button" className="empty-state__cta" onClick={onAction}>
          Create a budget
        </button>
      ) : undefined
    }
    className={className}
  />
);

/**
 * Empty state for the Goals page.
 */
export const GoalsEmptyState: React.FC<EntityEmptyStateProps> = ({ onAction, className }) => (
  <EmptyState
    icon={<GoalsIllustration />}
    title="No goals yet"
    description="Set savings goals to track your progress toward what matters most to you."
    action={
      onAction ? (
        <button type="button" className="empty-state__cta" onClick={onAction}>
          Set a goal
        </button>
      ) : undefined
    }
    className={className}
  />
);

/* --------------------------------------------------------------------------
 * Welcome / First-Run screen
 * -------------------------------------------------------------------------- */

/** Props for the {@link WelcomeScreen} component. */
export interface WelcomeScreenProps {
  /** User's display name (optional). */
  userName?: string;
  /** Callback when the primary CTA is clicked. */
  onGetStarted?: () => void;
  /** Additional CSS class names. */
  className?: string;
}

/**
 * First-run welcome screen shown when the user has no data.
 *
 * Provides an orientation message and a CTA to create the first account.
 * Designed to be used as the `emptyStateProps` in a PageLoader or
 * rendered directly on the Dashboard when no entities exist.
 */
export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  userName,
  onGetStarted,
  className = '',
}) => {
  const greeting = userName ? `Welcome, ${userName}!` : 'Welcome to Finance!';

  return (
    <section
      className={`welcome-screen ${className}`.trim()}
      aria-label="Welcome — first-run setup"
    >
      <div className="welcome-screen__illustration" aria-hidden="true">
        <WelcomeIllustration />
      </div>
      <h1 className="welcome-screen__title">{greeting}</h1>
      <p className="welcome-screen__description">
        Take control of your finances. Track accounts, record transactions, set budgets, and reach
        your savings goals — all in one place.
      </p>
      {onGetStarted && (
        <button type="button" className="welcome-screen__cta" onClick={onGetStarted}>
          Get started
        </button>
      )}
    </section>
  );
};

export default WelcomeScreen;
