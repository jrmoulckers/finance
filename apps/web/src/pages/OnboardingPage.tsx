// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAccounts } from '../hooks/useAccounts';
import { useOnboarding } from '../hooks/useOnboarding';
import type { AccountType } from '../kmp/bridge';
import { Currencies } from '../kmp/bridge';

import '../styles/onboarding.css';

// ---------------------------------------------------------------------------
// Currency data
// ---------------------------------------------------------------------------

interface CurrencyOption {
  code: string;
  label: string;
  symbol: string;
}

const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'GBP', label: 'British Pound', symbol: '£' },
  { code: 'CAD', label: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', label: 'Japanese Yen', symbol: '¥' },
];

// ---------------------------------------------------------------------------
// Account type options
// ---------------------------------------------------------------------------

interface AccountTypeOption {
  value: AccountType;
  label: string;
}

const ACCOUNT_TYPES: AccountTypeOption[] = [
  { value: 'CHECKING', label: 'Checking' },
  { value: 'SAVINGS', label: 'Savings' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'CASH', label: 'Cash' },
  { value: 'INVESTMENT', label: 'Investment' },
  { value: 'LOAN', label: 'Loan' },
  { value: 'OTHER', label: 'Other' },
];

const TOTAL_STEPS = 4;

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep, totalSteps }) => (
  <div
    className="onboarding-steps"
    role="group"
    aria-label={`Step ${currentStep + 1} of ${totalSteps}`}
  >
    {Array.from({ length: totalSteps }, (_, i) => (
      <span
        key={i}
        className={`onboarding-steps__dot${i === currentStep ? ' onboarding-steps__dot--active' : ''}${i < currentStep ? ' onboarding-steps__dot--completed' : ''}`}
        aria-hidden="true"
      />
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// OnboardingPage
// ---------------------------------------------------------------------------

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentStep,
    selectedCurrency,
    setSelectedCurrency,
    nextStep,
    prevStep,
    skipOnboarding,
    completeOnboarding,
  } = useOnboarding();

  const { createAccount } = useAccounts();

  // Account form state (Step 2)
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('CHECKING');
  const [startingBalance, setStartingBalance] = useState('');

  // Focus management
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    skipOnboarding();
    navigate('/dashboard', { replace: true });
  }, [skipOnboarding, navigate]);

  const handleComplete = useCallback(() => {
    completeOnboarding();
    navigate('/dashboard', { replace: true });
  }, [completeOnboarding, navigate]);

  const handleCreateAccount = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (!accountName.trim()) return;

      const balance = parseFloat(startingBalance) || 0;

      createAccount({
        householdId: 'default',
        name: accountName.trim(),
        type: accountType,
        currency: Currencies.USD,
        currentBalance: { amount: Math.round(balance * 100) },
      });

      nextStep();
    },
    [accountName, accountType, startingBalance, createAccount, nextStep],
  );

  return (
    <div className="onboarding">
      <div className="onboarding__container">
        <StepIndicator currentStep={currentStep} totalSteps={TOTAL_STEPS} />

        {/* Step 0: Welcome */}
        {currentStep === 0 && (
          <section className="onboarding__step" aria-labelledby="onboarding-welcome-heading">
            <h1
              ref={headingRef}
              id="onboarding-welcome-heading"
              className="onboarding__heading"
              tabIndex={-1}
            >
              Welcome to Finance
            </h1>
            <p className="onboarding__description">
              Track your spending, set budgets, and reach your financial goals — all in one place.
            </p>

            <div className="onboarding__cards">
              <button type="button" className="onboarding__card" onClick={handleSkip}>
                <span className="onboarding__card-icon" aria-hidden="true">
                  🚀
                </span>
                <span className="onboarding__card-title">Just let me in</span>
                <span className="onboarding__card-desc">Skip setup and explore on your own.</span>
              </button>

              <button
                type="button"
                className="onboarding__card onboarding__card--primary"
                onClick={nextStep}
              >
                <span className="onboarding__card-icon" aria-hidden="true">
                  ✨
                </span>
                <span className="onboarding__card-title">Help me set up</span>
                <span className="onboarding__card-desc">A quick guided setup to get started.</span>
              </button>
            </div>
          </section>
        )}

        {/* Step 1: Currency Selection */}
        {currentStep === 1 && (
          <section className="onboarding__step" aria-labelledby="onboarding-currency-heading">
            <h1
              ref={headingRef}
              id="onboarding-currency-heading"
              className="onboarding__heading"
              tabIndex={-1}
            >
              Choose your currency
            </h1>
            <p className="onboarding__description">
              Select the primary currency for your accounts. You can change this later in Settings.
            </p>

            <div
              className="onboarding__currency-grid"
              role="radiogroup"
              aria-label="Currency selection"
            >
              {CURRENCY_OPTIONS.map((currency) => (
                <button
                  key={currency.code}
                  type="button"
                  className={`onboarding__currency-option${selectedCurrency === currency.code ? ' onboarding__currency-option--selected' : ''}`}
                  role="radio"
                  aria-checked={selectedCurrency === currency.code}
                  onClick={() => setSelectedCurrency(currency.code)}
                >
                  <span className="onboarding__currency-symbol" aria-hidden="true">
                    {currency.symbol}
                  </span>
                  <span className="onboarding__currency-code">{currency.code}</span>
                  <span className="onboarding__currency-label">{currency.label}</span>
                </button>
              ))}
            </div>

            <div className="onboarding__actions">
              <button
                type="button"
                className="onboarding__btn onboarding__btn--secondary"
                onClick={prevStep}
              >
                Back
              </button>
              <button
                type="button"
                className="onboarding__btn onboarding__btn--text"
                onClick={handleSkip}
              >
                Skip
              </button>
              <button
                type="button"
                className="onboarding__btn onboarding__btn--primary"
                disabled={!selectedCurrency}
                onClick={nextStep}
              >
                Continue
              </button>
            </div>
          </section>
        )}

        {/* Step 2: Add First Account */}
        {currentStep === 2 && (
          <section className="onboarding__step" aria-labelledby="onboarding-account-heading">
            <h1
              ref={headingRef}
              id="onboarding-account-heading"
              className="onboarding__heading"
              tabIndex={-1}
            >
              Add your first account
            </h1>
            <p className="onboarding__description">
              Set up a bank account, credit card, or cash wallet to start tracking.
            </p>

            <form className="onboarding__form" onSubmit={handleCreateAccount} noValidate>
              <div className="form-group">
                <label
                  className="form-group__label form-group__label--required"
                  htmlFor="onboarding-account-name"
                >
                  Account name
                </label>
                <input
                  id="onboarding-account-name"
                  className="form-input"
                  type="text"
                  placeholder="e.g. Main Checking"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  required
                  aria-required="true"
                />
              </div>

              <div className="form-group">
                <label className="form-group__label" htmlFor="onboarding-account-type">
                  Account type
                </label>
                <select
                  id="onboarding-account-type"
                  className="form-input"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as AccountType)}
                >
                  {ACCOUNT_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-group__label" htmlFor="onboarding-starting-balance">
                  Starting balance
                </label>
                <input
                  id="onboarding-starting-balance"
                  className="form-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                />
              </div>

              <div className="onboarding__actions">
                <button
                  type="button"
                  className="onboarding__btn onboarding__btn--secondary"
                  onClick={prevStep}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="onboarding__btn onboarding__btn--text"
                  onClick={handleSkip}
                >
                  Skip
                </button>
                <button
                  type="submit"
                  className="onboarding__btn onboarding__btn--primary"
                  disabled={!accountName.trim()}
                >
                  Continue
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Step 3: Done */}
        {currentStep === 3 && (
          <section className="onboarding__step" aria-labelledby="onboarding-done-heading">
            <h1
              ref={headingRef}
              id="onboarding-done-heading"
              className="onboarding__heading"
              tabIndex={-1}
            >
              You&#39;re all set!
            </h1>
            <p className="onboarding__description">
              Your account is ready. Start tracking your finances and stay on top of your goals.
            </p>

            <ul className="onboarding__summary">
              {selectedCurrency && (
                <li className="onboarding__summary-item">
                  <strong>Currency:</strong> {selectedCurrency}
                </li>
              )}
              {accountName.trim() && (
                <li className="onboarding__summary-item">
                  <strong>Account:</strong> {accountName.trim()}
                </li>
              )}
            </ul>

            <div className="onboarding__actions onboarding__actions--center">
              <button
                type="button"
                className="onboarding__btn onboarding__btn--primary onboarding__btn--large"
                onClick={handleComplete}
              >
                Go to Dashboard
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default OnboardingPage;
