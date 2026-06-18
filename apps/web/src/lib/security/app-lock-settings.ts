// SPDX-License-Identifier: BUSL-1.1

export type AppLockEvent = 'manual_lock' | 'unlock_success' | 'activity' | 'idle_check' | 'resume';
export type AppLockAuditEvent =
  | 'app_lock_enabled'
  | 'app_locked'
  | 'app_unlocked'
  | 'app_lock_bypassed';
export type AppLockReason = 'disabled' | 'manual' | 'idle_timeout' | 'resume' | 'unlock_success';

export interface AppLockSettings {
  readonly enabled: boolean;
  readonly idleTimeoutMs: number;
  readonly lockOnResume: boolean;
  readonly requirePasskey: boolean;
}

export interface AppLockRuntimeState {
  readonly locked: boolean;
  readonly reason: AppLockReason;
  readonly lastUnlockedAtMs: number | null;
}

export interface PrivacySafeShell {
  readonly hideSensitiveValues: boolean;
  readonly heading: string;
  readonly body: string;
  readonly primaryAction: 'unlock_app' | 'enable_app_lock' | 'none';
}

export interface AppLockAuditEntry {
  readonly event: AppLockAuditEvent;
  readonly severity: 'info' | 'warning';
  readonly metadata: Readonly<Record<string, string>>;
}

export interface AppLockTransition {
  readonly state: AppLockRuntimeState;
  readonly shell: PrivacySafeShell;
  readonly audit?: AppLockAuditEntry;
}

export const DEFAULT_APP_LOCK_SETTINGS: AppLockSettings = {
  enabled: false,
  idleTimeoutMs: 5 * 60 * 1000,
  lockOnResume: true,
  requirePasskey: true,
};

export const DEFAULT_APP_LOCK_STATE: AppLockRuntimeState = {
  locked: false,
  reason: 'disabled',
  lastUnlockedAtMs: null,
};

export const APP_LOCK_SETTINGS_STORAGE_KEY = 'finance-app-lock-settings-v1';
export const APP_LOCK_SETTINGS_CHANGED_EVENT = 'finance-app-lock-settings-changed';

export function normalizeAppLockSettings(settings: Partial<AppLockSettings>): AppLockSettings {
  return {
    enabled: settings.enabled ?? DEFAULT_APP_LOCK_SETTINGS.enabled,
    idleTimeoutMs: Math.max(
      settings.idleTimeoutMs ?? DEFAULT_APP_LOCK_SETTINGS.idleTimeoutMs,
      30_000,
    ),
    lockOnResume: settings.lockOnResume ?? DEFAULT_APP_LOCK_SETTINGS.lockOnResume,
    requirePasskey: settings.requirePasskey ?? DEFAULT_APP_LOCK_SETTINGS.requirePasskey,
  };
}

export function loadAppLockSettings(): AppLockSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_APP_LOCK_SETTINGS;

  try {
    const raw = localStorage.getItem(APP_LOCK_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_LOCK_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppLockSettings> | null;
    return parsed && typeof parsed === 'object'
      ? normalizeAppLockSettings(parsed)
      : DEFAULT_APP_LOCK_SETTINGS;
  } catch {
    return DEFAULT_APP_LOCK_SETTINGS;
  }
}

export function saveAppLockSettings(settings: Partial<AppLockSettings>): AppLockSettings {
  const normalized = normalizeAppLockSettings(settings);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(APP_LOCK_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Best-effort only; default-off app lock remains safe if persistence fails.
    }
  }
  notifyAppLockSettingsChanged(normalized);
  return normalized;
}

export function reduceAppLockEvent(
  settings: AppLockSettings,
  state: AppLockRuntimeState,
  event: AppLockEvent,
  nowMs: number,
): AppLockTransition {
  if (!settings.enabled) {
    const unlocked = { locked: false, reason: 'disabled', lastUnlockedAtMs: nowMs } as const;
    return {
      state: unlocked,
      shell: buildPrivacySafeShell(unlocked, settings),
      audit:
        event === 'manual_lock'
          ? audit('app_lock_bypassed', { reason: 'disabled' }, 'warning')
          : undefined,
    };
  }

  if (event === 'manual_lock') {
    const locked = {
      locked: true,
      reason: 'manual',
      lastUnlockedAtMs: state.lastUnlockedAtMs,
    } as const;
    return {
      state: locked,
      shell: buildPrivacySafeShell(locked, settings),
      audit: audit('app_locked', { reason: 'manual' }),
    };
  }

  if (event === 'unlock_success' || event === 'activity') {
    const unlocked = { locked: false, reason: 'unlock_success', lastUnlockedAtMs: nowMs } as const;
    return {
      state: unlocked,
      shell: buildPrivacySafeShell(unlocked, settings),
      audit:
        event === 'unlock_success'
          ? audit('app_unlocked', { method: settings.requirePasskey ? 'passkey' : 'local' })
          : undefined,
    };
  }

  if (event === 'resume' && settings.lockOnResume) {
    const locked = {
      locked: true,
      reason: 'resume',
      lastUnlockedAtMs: state.lastUnlockedAtMs,
    } as const;
    return {
      state: locked,
      shell: buildPrivacySafeShell(locked, settings),
      audit: audit('app_locked', { reason: 'resume' }),
    };
  }

  if (state.lastUnlockedAtMs === null || nowMs - state.lastUnlockedAtMs >= settings.idleTimeoutMs) {
    const locked = {
      locked: true,
      reason: 'idle_timeout',
      lastUnlockedAtMs: state.lastUnlockedAtMs,
    } as const;
    return {
      state: locked,
      shell: buildPrivacySafeShell(locked, settings),
      audit: audit('app_locked', { reason: 'idle_timeout' }),
    };
  }

  return { state, shell: buildPrivacySafeShell(state, settings) };
}

export function buildPrivacySafeShell(
  state: AppLockRuntimeState,
  settings: AppLockSettings,
): PrivacySafeShell {
  if (!settings.enabled) {
    return {
      hideSensitiveValues: false,
      heading: 'App lock is off',
      body: 'Use your account session for sign-in; app lock adds a local privacy gate on this device.',
      primaryAction: 'enable_app_lock',
    };
  }

  if (state.locked) {
    return {
      hideSensitiveValues: true,
      heading: 'Finance is locked',
      body: 'Unlock this local app lock to show balances and transactions. This is separate from signing in.',
      primaryAction: 'unlock_app',
    };
  }

  return {
    hideSensitiveValues: false,
    heading: 'Finance is unlocked',
    body: 'Sensitive values are visible until you lock manually, go idle, or resume the app.',
    primaryAction: 'none',
  };
}

function audit(
  event: AppLockAuditEvent,
  metadata: Readonly<Record<string, string>>,
  severity: AppLockAuditEntry['severity'] = 'info',
): AppLockAuditEntry {
  return { event, severity, metadata };
}

function notifyAppLockSettingsChanged(settings: AppLockSettings): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(APP_LOCK_SETTINGS_CHANGED_EVENT, { detail: settings }));
}
