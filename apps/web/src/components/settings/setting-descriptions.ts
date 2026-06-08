// SPDX-License-Identifier: BUSL-1.1

/**
 * Map of setting keys to human-readable descriptions.
 *
 * Each entry provides context about what the setting controls,
 * how it affects data, and recommended defaults. Structured for
 * future i18n extraction (keys can map to translation IDs).
 */

export interface SettingDescription {
  /** Brief summary of what this setting controls. */
  summary: string;
  /** How this setting affects user data or privacy. */
  impact?: string;
  /** Recommended value or guidance. */
  recommendation?: string;
}

/** Setting descriptions keyed by setting identifier. */
export const SETTING_DESCRIPTIONS: Record<string, SettingDescription> = {
  currency: {
    summary: 'Sets the default display currency for all accounts and transactions.',
    impact:
      'Changing this does not convert existing transaction amounts — it only affects how new transactions are displayed by default.',
    recommendation: 'Choose the currency you use most frequently for daily spending.',
  },
  theme: {
    summary: 'Controls the visual appearance of the app (light, dark, or system preference).',
    impact:
      'No effect on data. The OLED Dark option uses a pure black background to save battery on OLED screens.',
    recommendation: 'Use "System" to follow your device settings automatically.',
  },
  notifications: {
    summary: 'Enables browser notifications for bill reminders, budget alerts, and sync status.',
    impact:
      'When enabled, the app may request notification permission from your browser. No data is sent to external servers.',
    recommendation: 'Enable for timely bill reminders and budget warnings.',
  },
  'bnpl-stacking-threshold': {
    summary: 'Sets the unpaid BNPL installment total that triggers a stacking alert.',
    impact:
      'The threshold is stored locally and only changes when the app warns about overlapping installment obligations.',
    recommendation: 'Use a number that reflects the point where multiple BNPL payments become risky.',
  },
  monitoring: {
    summary: 'Sends anonymous error reports to help improve app stability.',
    impact:
      'Only crash data and performance metrics are collected — never financial data, account names, or transaction details.',
    recommendation:
      'Enable to help the development team fix bugs faster. Disable if you prefer maximum privacy.',
  },
  biometricLock: {
    summary: 'Requires biometric authentication (fingerprint, face) to open the app.',
    impact:
      'Adds a security layer so others cannot access your financial data even if they have your device unlocked.',
    recommendation: 'Enable on shared devices for additional security.',
  },
  passkeys: {
    summary: 'Passwordless sign-in using device biometrics or security keys (WebAuthn).',
    impact:
      'Passkeys are stored securely on your device. They replace passwords and cannot be phished.',
    recommendation: 'Register at least one passkey for secure, convenient sign-in.',
  },
  syncStatus: {
    summary: 'Shows whether your data is synced to the cloud or stored locally only.',
    impact:
      'When offline, all changes are saved locally and will sync automatically when connectivity returns.',
  },
  dataExport: {
    summary: 'Export all your financial data in a portable format (CSV or JSON).',
    impact:
      'Exported files contain all your transactions, accounts, and budgets. Store exports securely.',
    recommendation: 'Export periodically as a backup, especially before major changes.',
  },
  accountDeletion: {
    summary: 'Permanently deletes your account, synced data, and household access.',
    impact: 'This is irreversible after confirmation and also unlinks your sign-in identity.',
    recommendation: 'Export your data before deleting your account.',
  },
  moodTags: {
    summary: 'Allows optional mood tags to be attached to transactions.',
    impact: 'When disabled, mood tag controls are hidden and mood tag sync is turned off.',
    recommendation: 'Enable only if you want to track emotional context alongside spending.',
  },
  moodTagsSync: {
    summary: 'Syncs transaction mood tags across your signed-in devices.',
    impact: 'Mood tag metadata follows the same sync path as other transaction data.',
    recommendation: 'Keep disabled if you only want mood tags on this device.',
  },
  eraseMoodData: {
    summary: 'Removes all saved mood tags and disables mood-tag preferences.',
    impact: 'This destructive action cannot restore erased mood tags later.',
    recommendation: 'Use only when you are sure you no longer need mood history.',
  },
};
