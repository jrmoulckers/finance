// SPDX-License-Identifier: BUSL-1.1

/** Privacy Mode Context backed by the shared privacy trio state machine. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from 'react';
import {
  createLocalStoragePrivacyStorage,
  MaskingMode,
  PrivacyPersistenceOption,
  PrivacyState,
  PRIVACY_STRINGS,
  type PrivacySnapshot,
} from '../lib/ui/privacy';
import { appendSecurityAuditEvent } from '../lib/security-audit-log';

/** localStorage key for persisting privacy mode state. */
const PRIVACY_STATE_STORAGE_KEY = 'finance-privacy-state-v1';
const LEGACY_PRIVACY_MODE_STORAGE_KEY = 'finance-privacy-mode';

/** Masked replacement for legacy callers. */
export const MASKED_AMOUNT = '•••.••';

/** Masked replacement for generic sensitive labels. */
export const MASKED_LABEL = '••••';

/** Shape of the privacy mode context value. */
export interface PrivacyModeContextValue {
  readonly isPrivacyMode: boolean;
  readonly persistence: PrivacyPersistenceOption;
  readonly firstActivationExplained: boolean;
  readonly firstActivationMessage: string;
  readonly togglePrivacyMode: () => void;
  readonly setPrivacyMode: (enabled: boolean) => void;
  readonly setPersistence: (option: PrivacyPersistenceOption) => void;
  readonly getEffectiveMaskingMode: (surfaceId?: string) => MaskingMode;
  readonly setSurfaceMaskingMode: (surfaceId: string, mode: MaskingMode) => void;
  readonly setCategoryProtection: (categoryId: string, protectedCategory: boolean) => void;
  readonly isCategoryProtected: (categoryId: string) => boolean;
  readonly maskValue: (value: string, replacement?: string) => string;
}

const PrivacyModeContext = createContext<PrivacyModeContextValue | null>(null);

export interface PrivacyModeProviderProps {
  readonly children: ReactNode;
  readonly initialValue?: boolean;
  readonly initialPersistence?: PrivacyPersistenceOption;
}

/** Provides privacy mode state to the component tree. */
export const PrivacyModeProvider: FC<PrivacyModeProviderProps> = ({
  children,
  initialValue,
  initialPersistence,
}) => {
  const stateRef = useRef<PrivacyState | null>(null);
  if (stateRef.current === null) {
    const baseStorage = createLocalStoragePrivacyStorage(PRIVACY_STATE_STORAGE_KEY);
    stateRef.current = new PrivacyState({
      storage: {
        read: () => {
          const stored = baseStorage.read();
          if (stored !== null) return stored;
          try {
            return localStorage.getItem(LEGACY_PRIVACY_MODE_STORAGE_KEY) === 'true'
              ? JSON.stringify({ privacyMode: true, firstActivationExplained: true })
              : null;
          } catch {
            return null;
          }
        },
        write: (value) => {
          baseStorage.write(value);
          try {
            const parsed = JSON.parse(value) as { privacyMode?: boolean };
            localStorage.setItem(
              LEGACY_PRIVACY_MODE_STORAGE_KEY,
              String(parsed.privacyMode === true),
            );
          } catch {
            // Legacy compatibility write is best-effort only.
          }
        },
      },
      initial: {
        ...(initialValue !== undefined ? { privacyMode: initialValue } : {}),
        ...(initialPersistence !== undefined ? { persistence: initialPersistence } : {}),
      },
    });
  }

  const [snapshot, setSnapshot] = useState<PrivacySnapshot>(() => stateRef.current!.getSnapshot());

  useEffect(() => stateRef.current!.subscribe(setSnapshot), []);

  useEffect(() => {
    const onBeforeUnload = () => stateRef.current!.handleAppClose();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const togglePrivacyMode = useCallback(() => {
    const nextEnabled = !stateRef.current!.getSnapshot().privacyMode;
    stateRef.current!.togglePrivacyMode();
    void appendSecurityAuditEvent({
      action: 'privacy_mode_toggled',
      result: 'success',
      metadata: { enabled: nextEnabled, source: 'toggle' },
    });
  }, []);
  const setPrivacyMode = useCallback((enabled: boolean) => {
    stateRef.current!.setPrivacyMode(enabled);
    void appendSecurityAuditEvent({
      action: 'privacy_mode_toggled',
      result: 'success',
      metadata: { enabled, source: 'set' },
    });
  }, []);
  const setPersistence = useCallback(
    (option: PrivacyPersistenceOption) => stateRef.current!.setPersistence(option),
    [],
  );
  const getEffectiveMaskingMode = useCallback(
    (surfaceId?: string) => stateRef.current!.getEffectiveMode(surfaceId),
    [],
  );
  const setSurfaceMaskingMode = useCallback(
    (surfaceId: string, mode: MaskingMode) => stateRef.current!.setSurfaceOverride(surfaceId, mode),
    [],
  );
  const setCategoryProtection = useCallback(
    (categoryId: string, protectedCategory: boolean) =>
      stateRef.current!.setCategoryProtection(categoryId, protectedCategory),
    [],
  );
  const isCategoryProtected = useCallback(
    (categoryId: string) => stateRef.current!.isCategoryProtected(categoryId),
    [],
  );
  const maskValue = useCallback(
    (value: string, replacement: string = MASKED_LABEL) =>
      snapshot.privacyMode ? replacement : value,
    [snapshot.privacyMode],
  );

  const contextValue = useMemo<PrivacyModeContextValue>(
    () => ({
      isPrivacyMode: snapshot.privacyMode,
      persistence: snapshot.persistence,
      firstActivationExplained: snapshot.firstActivationExplained,
      firstActivationMessage: PRIVACY_STRINGS.firstActivation,
      togglePrivacyMode,
      setPrivacyMode,
      setPersistence,
      getEffectiveMaskingMode,
      setSurfaceMaskingMode,
      setCategoryProtection,
      isCategoryProtected,
      maskValue,
    }),
    [
      snapshot,
      togglePrivacyMode,
      setPrivacyMode,
      setPersistence,
      getEffectiveMaskingMode,
      setSurfaceMaskingMode,
      setCategoryProtection,
      isCategoryProtected,
      maskValue,
    ],
  );

  return <PrivacyModeContext.Provider value={contextValue}>{children}</PrivacyModeContext.Provider>;
};

/** Access the privacy mode context. */
export function usePrivacyMode(): PrivacyModeContextValue {
  const ctx = useContext(PrivacyModeContext);
  if (!ctx) {
    throw new Error('usePrivacyMode must be used within a <PrivacyModeProvider>.');
  }
  return ctx;
}

/** Read privacy mode status without throwing when the provider is absent. */
export function useIsPrivacyModeActive(): boolean {
  const ctx = useContext(PrivacyModeContext);
  return ctx?.isPrivacyMode ?? false;
}

/** Resolve the active masking mode without throwing when no provider is present. */
export function useEffectiveMaskingMode(surfaceId?: string): MaskingMode {
  const ctx = useContext(PrivacyModeContext);
  return ctx?.getEffectiveMaskingMode(surfaceId) ?? MaskingMode.Visible;
}

export { MaskingMode, PrivacyPersistenceOption };
