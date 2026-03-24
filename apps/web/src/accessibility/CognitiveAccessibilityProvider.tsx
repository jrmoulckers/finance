// SPDX-License-Identifier: BUSL-1.1
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { announce } from './aria';

const STORAGE_KEY = 'finance-simplified-mode';
const HTML_ATTR = 'data-simplified';

export const SIMPLIFIED_LABELS: Record<string, string> = {
  Income: 'Money In',
  Expenses: 'Money Out',
  Transactions: 'Money Moves',
  'Net Worth': 'Total Money',
  Budget: 'Spending Plan',
  Budgets: 'Spending Plans',
  Accounts: 'My Money',
  Goals: 'Saving Goals',
  Dashboard: 'Home',
  Settings: 'Settings',
  Categories: 'Groups',
  'Recurring Transactions': 'Regular Payments',
  Balance: 'Money Left',
  Transfer: 'Move Money',
  Deposit: 'Add Money',
  Withdrawal: 'Take Out Money',
};

export const SIMPLIFIED_NAV_PATHS = new Set([
  '/',
  '/dashboard',
  '/transactions',
  '/budgets',
  '/settings',
]);

export interface CognitiveAccessibilityPreferences {
  simplifiedLanguage: boolean;
  reducedNavigation: boolean;
  disableAnimations: boolean;
  largerText: boolean;
  hideSecondaryContent: boolean;
  singleColumnLayout: boolean;
  largerTouchTargets: boolean;
  enhancedContrast: boolean;
}

const DEFAULT_PREFERENCES: CognitiveAccessibilityPreferences = {
  simplifiedLanguage: true,
  reducedNavigation: true,
  disableAnimations: true,
  largerText: true,
  hideSecondaryContent: true,
  singleColumnLayout: true,
  largerTouchTargets: true,
  enhancedContrast: true,
};

export interface CognitiveAccessibilityContextValue {
  isSimplified: boolean;
  toggleSimplified: () => void;
  preferences: CognitiveAccessibilityPreferences;
  getLabel: (original: string) => string;
}

const CognitiveAccessibilityContext = createContext<CognitiveAccessibilityContextValue | null>(
  null,
);

function readPersistedValue(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'true';
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(prefers-reduced-data: reduce)').matches) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export interface CognitiveAccessibilityProviderProps {
  children: ReactNode;
}

export const CognitiveAccessibilityProvider: React.FC<CognitiveAccessibilityProviderProps> = ({
  children,
}) => {
  const [isSimplified, setIsSimplified] = useState<boolean>(readPersistedValue);

  useEffect(() => {
    document.documentElement.setAttribute(HTML_ATTR, String(isSimplified));
    return () => {
      document.documentElement.removeAttribute(HTML_ATTR);
    };
  }, [isSimplified]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isSimplified));
    } catch {
      /* ignore */
    }
  }, [isSimplified]);

  const toggleSimplified = useCallback(() => {
    setIsSimplified((prev) => {
      const next = !prev;
      announce(
        next
          ? 'Simplified mode enabled. The interface now uses simpler language and a reduced layout.'
          : 'Simplified mode disabled. The full interface has been restored.',
        'polite',
      );
      return next;
    });
  }, []);

  const preferences = useMemo(
    () =>
      isSimplified
        ? DEFAULT_PREFERENCES
        : {
            simplifiedLanguage: false,
            reducedNavigation: false,
            disableAnimations: false,
            largerText: false,
            hideSecondaryContent: false,
            singleColumnLayout: false,
            largerTouchTargets: false,
            enhancedContrast: false,
          },
    [isSimplified],
  );

  const getLabel = useCallback(
    (original: string): string => {
      if (!isSimplified) return original;
      return SIMPLIFIED_LABELS[original] ?? original;
    },
    [isSimplified],
  );

  const contextValue = useMemo<CognitiveAccessibilityContextValue>(
    () => ({ isSimplified, toggleSimplified, preferences, getLabel }),
    [isSimplified, toggleSimplified, preferences, getLabel],
  );

  return (
    <CognitiveAccessibilityContext.Provider value={contextValue}>
      {children}
    </CognitiveAccessibilityContext.Provider>
  );
};

export function useCognitiveAccessibility(): CognitiveAccessibilityContextValue {
  const ctx = useContext(CognitiveAccessibilityContext);
  if (ctx === null) {
    throw new Error(
      'useCognitiveAccessibility must be used within a <CognitiveAccessibilityProvider>',
    );
  }
  return ctx;
}

export default CognitiveAccessibilityProvider;
