// SPDX-License-Identifier: BUSL-1.1

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from 'react';

import { useReducedMotion } from '../hooks/useReducedMotion';
import { formatCurrencyForScreenReader } from '../lib/a11y';

export type AccessibilityMode = 'standard' | 'simplified';
export type AccessibilityFontSize = 'normal' | 'large' | 'extra-large';

export interface AccessibilitySettings {
  readonly accessibilityMode: AccessibilityMode;
  readonly fontSize: AccessibilityFontSize;
  readonly reduceMotion: boolean;
  readonly highContrast: boolean;
  readonly speakAmounts: boolean;
}

export interface AccessibilityContextValue extends AccessibilitySettings {
  readonly effectiveReduceMotion: boolean;
  readonly isSimplified: boolean;
  readonly setAccessibilityMode: (mode: AccessibilityMode) => void;
  readonly toggleAccessibilityMode: () => void;
  readonly setFontSize: (fontSize: AccessibilityFontSize) => void;
  readonly setReduceMotion: (enabled: boolean) => void;
  readonly toggleReduceMotion: () => void;
  readonly setHighContrast: (enabled: boolean) => void;
  readonly toggleHighContrast: () => void;
  readonly setSpeakAmounts: (enabled: boolean) => void;
  readonly toggleSpeakAmounts: () => void;
  readonly resetAccessibility: () => void;
  readonly speakText: (text: string) => boolean;
  readonly speakAmount: (amount: number, currency?: string, context?: string) => boolean;
  readonly stopSpeaking: () => void;
}

export interface AccessibilityProviderProps {
  readonly children: ReactNode;
  readonly initialSettings?: Partial<AccessibilitySettings>;
}

const STORAGE_KEY = 'finance-accessibility-settings-v1';
const ROOT_FONT_SIZES: Record<AccessibilityFontSize, string> = {
  normal: '16px',
  large: '18px',
  'extra-large': '20px',
};

export const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = {
  accessibilityMode: 'standard',
  fontSize: 'normal',
  reduceMotion: false,
  highContrast: false,
  speakAmounts: false,
};

function normaliseSettings(input?: Partial<AccessibilitySettings> | null): AccessibilitySettings {
  return {
    accessibilityMode:
      input?.accessibilityMode === 'simplified'
        ? 'simplified'
        : DEFAULT_ACCESSIBILITY_SETTINGS.accessibilityMode,
    fontSize:
      input?.fontSize === 'large' || input?.fontSize === 'extra-large'
        ? input.fontSize
        : DEFAULT_ACCESSIBILITY_SETTINGS.fontSize,
    reduceMotion: input?.reduceMotion === true,
    highContrast: input?.highContrast === true,
    speakAmounts: input?.speakAmounts === true,
  };
}

function readStoredSettings(): AccessibilitySettings {
  if (typeof window === 'undefined') {
    return DEFAULT_ACCESSIBILITY_SETTINGS;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      return DEFAULT_ACCESSIBILITY_SETTINGS;
    }

    return normaliseSettings(JSON.parse(stored) as Partial<AccessibilitySettings>);
  } catch {
    return DEFAULT_ACCESSIBILITY_SETTINGS;
  }
}

function persistSettings(settings: AccessibilitySettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be unavailable in privacy or embedded contexts.
  }
}

function applyDomSettings(
  settings: AccessibilitySettings,
  effectiveReduceMotion: boolean,
): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const root = document.documentElement;
  const body = document.body;
  const fontSizeClassNames = [
    'accessibility-font-size--normal',
    'accessibility-font-size--large',
    'accessibility-font-size--extra-large',
  ];

  body.classList.toggle('accessibility-simplified', settings.accessibilityMode === 'simplified');
  body.classList.toggle('accessibility-high-contrast', settings.highContrast);
  body.classList.toggle('accessibility-reduced-motion', effectiveReduceMotion);
  body.classList.remove(...fontSizeClassNames);
  body.classList.add(`accessibility-font-size--${settings.fontSize}`);
  body.dataset.accessibilityMode = settings.accessibilityMode;
  body.dataset.accessibilityFontSize = settings.fontSize;
  body.dataset.accessibilityContrast = String(settings.highContrast);
  body.dataset.accessibilityMotion = effectiveReduceMotion ? 'reduced' : 'standard';
  body.dataset.accessibilitySpeech = String(settings.speakAmounts);

  root.dataset.accessibilityMode = settings.accessibilityMode;
  root.dataset.accessibilityFontSize = settings.fontSize;
  root.style.setProperty('--accessibility-root-font-size', ROOT_FONT_SIZES[settings.fontSize]);
  root.style.setProperty(
    '--accessibility-touch-target-size',
    settings.accessibilityMode === 'simplified' ? '56px' : '48px',
  );

  return () => {
    body.classList.remove(
      'accessibility-simplified',
      'accessibility-high-contrast',
      'accessibility-reduced-motion',
      ...fontSizeClassNames,
    );
    delete body.dataset.accessibilityMode;
    delete body.dataset.accessibilityFontSize;
    delete body.dataset.accessibilityContrast;
    delete body.dataset.accessibilityMotion;
    delete body.dataset.accessibilitySpeech;
    delete root.dataset.accessibilityMode;
    delete root.dataset.accessibilityFontSize;
    root.style.removeProperty('--accessibility-root-font-size');
    root.style.removeProperty('--accessibility-touch-target-size');
  };
}

const noop = () => {};
const noopBoolean = () => false;

const defaultContextValue: AccessibilityContextValue = {
  ...DEFAULT_ACCESSIBILITY_SETTINGS,
  effectiveReduceMotion: false,
  isSimplified: false,
  setAccessibilityMode: noop,
  toggleAccessibilityMode: noop,
  setFontSize: noop,
  setReduceMotion: noop,
  toggleReduceMotion: noop,
  setHighContrast: noop,
  toggleHighContrast: noop,
  setSpeakAmounts: noop,
  toggleSpeakAmounts: noop,
  resetAccessibility: noop,
  speakText: noopBoolean,
  speakAmount: noopBoolean,
  stopSpeaking: noop,
};

const AccessibilityContext = createContext<AccessibilityContextValue>(defaultContextValue);
AccessibilityContext.displayName = 'AccessibilityContext';

export const AccessibilityProvider: FC<AccessibilityProviderProps> = ({
  children,
  initialSettings,
}) => {
  const systemReducedMotion = useReducedMotion();
  const [settings, setSettings] = useState<AccessibilitySettings>(() =>
    normaliseSettings({ ...readStoredSettings(), ...initialSettings }),
  );

  const effectiveReduceMotion = settings.reduceMotion || systemReducedMotion;
  const isSimplified = settings.accessibilityMode === 'simplified';

  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  useEffect(
    () => applyDomSettings(settings, effectiveReduceMotion),
    [settings, effectiveReduceMotion],
  );

  const setAccessibilityMode = useCallback((mode: AccessibilityMode) => {
    setSettings((current) => {
      if (mode === current.accessibilityMode) {
        return current;
      }

      if (mode === 'simplified') {
        return normaliseSettings({
          ...current,
          accessibilityMode: 'simplified',
          fontSize: current.fontSize === 'normal' ? 'extra-large' : current.fontSize,
          reduceMotion: true,
          highContrast: true,
        });
      }

      return normaliseSettings({ ...current, accessibilityMode: 'standard' });
    });
  }, []);

  const toggleAccessibilityMode = useCallback(() => {
    setAccessibilityMode(isSimplified ? 'standard' : 'simplified');
  }, [isSimplified, setAccessibilityMode]);

  const setFontSize = useCallback((fontSize: AccessibilityFontSize) => {
    setSettings((current) => normaliseSettings({ ...current, fontSize }));
  }, []);

  const setReduceMotion = useCallback((reduceMotion: boolean) => {
    setSettings((current) => normaliseSettings({ ...current, reduceMotion }));
  }, []);

  const toggleReduceMotion = useCallback(() => {
    setSettings((current) =>
      normaliseSettings({ ...current, reduceMotion: !current.reduceMotion }),
    );
  }, []);

  const setHighContrast = useCallback((highContrast: boolean) => {
    setSettings((current) => normaliseSettings({ ...current, highContrast }));
  }, []);

  const toggleHighContrast = useCallback(() => {
    setSettings((current) =>
      normaliseSettings({ ...current, highContrast: !current.highContrast }),
    );
  }, []);

  const setSpeakAmounts = useCallback((speakAmounts: boolean) => {
    setSettings((current) => normaliseSettings({ ...current, speakAmounts }));
  }, []);

  const toggleSpeakAmounts = useCallback(() => {
    setSettings((current) =>
      normaliseSettings({ ...current, speakAmounts: !current.speakAmounts }),
    );
  }, []);

  const resetAccessibility = useCallback(() => {
    setSettings(DEFAULT_ACCESSIBILITY_SETTINGS);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    window.speechSynthesis.cancel();
  }, []);

  const speakText = useCallback(
    (text: string) => {
      if (
        !settings.speakAmounts ||
        typeof window === 'undefined' ||
        !('speechSynthesis' in window) ||
        typeof SpeechSynthesisUtterance === 'undefined'
      ) {
        return false;
      }

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      return true;
    },
    [settings.speakAmounts],
  );

  const speakAmount = useCallback(
    (amount: number, currency = 'USD', context?: string) =>
      speakText(formatCurrencyForScreenReader(amount, currency, context)),
    [speakText],
  );

  const value = useMemo<AccessibilityContextValue>(
    () => ({
      ...settings,
      effectiveReduceMotion,
      isSimplified,
      setAccessibilityMode,
      toggleAccessibilityMode,
      setFontSize,
      setReduceMotion,
      toggleReduceMotion,
      setHighContrast,
      toggleHighContrast,
      setSpeakAmounts,
      toggleSpeakAmounts,
      resetAccessibility,
      speakText,
      speakAmount,
      stopSpeaking,
    }),
    [
      settings,
      effectiveReduceMotion,
      isSimplified,
      setAccessibilityMode,
      toggleAccessibilityMode,
      setFontSize,
      setReduceMotion,
      toggleReduceMotion,
      setHighContrast,
      toggleHighContrast,
      setSpeakAmounts,
      toggleSpeakAmounts,
      resetAccessibility,
      speakText,
      speakAmount,
      stopSpeaking,
    ],
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
};

export function useAccessibilityContext(): AccessibilityContextValue {
  return useContext(AccessibilityContext);
}
