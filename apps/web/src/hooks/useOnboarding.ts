// SPDX-License-Identifier: BUSL-1.1

import { useState, useCallback } from 'react';

export interface UseOnboardingResult {
  isComplete: boolean;
  currentStep: number;
  selectedCurrency: string | null;
  setSelectedCurrency: (code: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipOnboarding: () => void;
  completeOnboarding: () => void;
}

const STORAGE_KEY = 'finance-onboarding-complete';
const CURRENCY_KEY = 'finance-settings-currency';

export function useOnboarding(): UseOnboardingResult {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedCurrency, setSelectedCurrencyState] = useState<string | null>(() =>
    localStorage.getItem(CURRENCY_KEY),
  );

  const isComplete = localStorage.getItem(STORAGE_KEY) === 'true';

  const setSelectedCurrency = useCallback((code: string) => {
    setSelectedCurrencyState(code);
    localStorage.setItem(CURRENCY_KEY, code);
  }, []);

  const nextStep = useCallback(() => setCurrentStep((s) => s + 1), []);
  const prevStep = useCallback(() => setCurrentStep((s) => Math.max(0, s - 1)), []);

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  const skipOnboarding = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  return {
    isComplete,
    currentStep,
    selectedCurrency,
    setSelectedCurrency,
    nextStep,
    prevStep,
    skipOnboarding,
    completeOnboarding,
  };
}
