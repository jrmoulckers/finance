// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';

import { useAuth } from '../../auth/auth-context';
import { useStorageDiagnostics } from '../../db/DatabaseProvider';
import { isEncryptionSupported } from '../../db/encryption';
import { getPowerSyncConfig } from '../../db/sync/powersync-client';
import { queryAuditLog, type AuditEntry, type AuditSeverity } from '../../lib/security';
import { AppIcon, type IconName } from '../icons';

import './encryption-details.css';

type SectionTone = 'active' | 'info' | 'warning';

interface CheckupItem {
  readonly id: string;
  readonly label: string;
  readonly active: boolean;
}

interface SecuritySection {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly status: string;
  readonly tone: SectionTone;
  readonly summary: string;
  readonly facts: readonly string[];
  readonly note?: string;
  readonly defaultOpen?: boolean;
}

function canUseLocalStorage(): boolean {
  try {
    const probeKey = 'finance.encryption-details.probe';
    localStorage.setItem(probeKey, '1');
    localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

function hostFromUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://finance.local';
    return new URL(value, base).host;
  } catch {
    return null;
  }
}

function isHttpsUrl(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://finance.local';
    return new URL(value, base).protocol === 'https:';
  } catch {
    return false;
  }
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Not recorded yet on this device';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Timestamp unavailable';
  }

  return parsed.toLocaleString();
}

function safeQueryAuditLog(limit = 5): AuditEntry[] {
  try {
    return queryAuditLog({ limit });
  } catch {
    return [];
  }
}

function severityTone(severity: AuditSeverity): SectionTone {
  switch (severity) {
    case 'critical':
      return 'warning';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

function eventLabel(entry: AuditEntry): string {
  switch (entry.eventType) {
    case 'login':
      return 'Sign-in';
    case 'logout':
      return 'Sign-out';
    case 'data_access':
      return 'Data access';
    case 'data_export':
      return 'Data export';
    case 'settings_changed':
      return 'Settings change';
    case 'session_revoked':
      return 'Session revoked';
    case 'connection_added':
      return 'Connection added';
    case 'connection_revoked':
      return 'Connection revoked';
    case 'telemetry_changed':
      return 'Telemetry updated';
    case 'memo_encrypted':
      return 'Memo encrypted';
    case 'memo_decrypted':
      return 'Memo decrypted';
    case 'permission_change':
      return 'Permission changed';
    case 'data_erasure':
      return 'Data erased';
    default:
      return 'Security event';
  }
}

export const EncryptionDetails: React.FC = () => {
  const { isAuthenticated, isDemoMode } = useAuth();
  const diagnostics = useStorageDiagnostics();

  const auditEntries = useMemo(() => safeQueryAuditLog(5), []);
  const localStorageAvailable = useMemo(() => canUseLocalStorage(), []);
  const encryptionSupported = isEncryptionSupported();
  const powerSyncConfig = getPowerSyncConfig();

  const lastSyncTime = useMemo(() => {
    if (!localStorageAvailable) {
      return null;
    }

    try {
      return localStorage.getItem('finance-last-sync-time');
    } catch {
      return null;
    }
  }, [localStorageAvailable]);

  const lastLogin = auditEntries.find((entry) => entry.eventType === 'login') ?? null;
  const supabaseUrl = (
    import.meta.env.VITE_SUPABASE_URL ??
    powerSyncConfig.supabaseUrl ??
    ''
  ).trim();
  const supabaseHost = hostFromUrl(supabaseUrl);
  const powerSyncHost = hostFromUrl(powerSyncConfig.instanceUrl);
  const syncConfigured = Boolean(supabaseHost || (powerSyncConfig.enabled && powerSyncHost));
  const transportProtected =
    !syncConfigured ||
    [supabaseUrl, powerSyncConfig.enabled ? powerSyncConfig.instanceUrl : null]
      .filter((value): value is string => Boolean(value))
      .every((value) => isHttpsUrl(value));
  const browserOriginHost = typeof window !== 'undefined' ? window.location.host : 'this origin';
  const browserOriginHttps = typeof window === 'undefined' || window.location.protocol === 'https:';

  const activeChecks: readonly CheckupItem[] = [
    { id: 'device-first', label: 'Primary data copy stays on this device', active: true },
    {
      id: 'sandbox',
      label:
        diagnostics?.backend === 'opfs'
          ? 'OPFS browser sandbox is active'
          : 'Private browser storage is active',
      active: true,
    },
    {
      id: 'fallback-encryption',
      label: 'AES-256-GCM encrypted IndexedDB fallback is available',
      active: encryptionSupported,
    },
    {
      id: 'token-storage',
      label: 'Access tokens avoid localStorage and stay in memory / HttpOnly cookies',
      active: true,
    },
    {
      id: 'transport',
      label: syncConfigured
        ? 'Configured sync endpoints use HTTPS/TLS transport'
        : 'No remote sync endpoint is configured in this build',
      active: transportProtected && (syncConfigured ? true : browserOriginHttps),
    },
    {
      id: 'audit-log',
      label: 'Local append-only security activity log is available',
      active: localStorageAvailable,
    },
    { id: 'pinning', label: 'App-managed certificate pinning', active: false },
    {
      id: 'zero-knowledge',
      label: syncConfigured ? 'Full zero-knowledge sync' : 'Server-blind while local-only',
      active: !syncConfigured,
    },
  ];

  const passedChecks = activeChecks.filter((check) => check.active).length;
  const score = Math.round((passedChecks / activeChecks.length) * 100);
  const pendingChecks = activeChecks.filter((check) => !check.active);

  const sections = useMemo<readonly SecuritySection[]>(() => {
    const storageStatus =
      diagnostics?.backend === 'indexeddb' && encryptionSupported
        ? 'Encrypted IndexedDB fallback active'
        : diagnostics?.backend === 'opfs'
          ? 'OPFS sandbox active'
          : 'Device-local storage active';

    const storageNote = diagnostics
      ? `Detected backend: ${diagnostics.backend.toUpperCase()}${diagnostics.didFallback ? ' after an OPFS fallback.' : '.'}`
      : 'Runtime storage diagnostics appear here once the local database finishes initializing.';

    const transportStatus = syncConfigured
      ? transportProtected
        ? 'HTTPS/TLS transport active'
        : 'Review endpoint security'
      : isDemoMode
        ? 'Local-only demo mode'
        : 'No remote sync configured';

    const syncTargets = [
      supabaseHost ? `Supabase: ${supabaseHost}` : null,
      powerSyncConfig.enabled && powerSyncHost ? `PowerSync: ${powerSyncHost}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' · ');

    const zeroKnowledgeStatus = syncConfigured
      ? 'Not full zero-knowledge yet'
      : 'Server-blind while local-only';
    const dataResidencyStatus = syncConfigured
      ? 'Device + configured sync region'
      : 'On-device only';
    const auditStatus =
      auditEntries.length > 0
        ? `${auditEntries.length} recent local event${auditEntries.length === 1 ? '' : 's'}`
        : 'Local timeline ready';

    return [
      {
        id: 'at-rest',
        title: 'At-Rest Encryption',
        icon: 'database',
        status: storageStatus,
        tone: diagnostics?.backend === 'indexeddb' && encryptionSupported ? 'active' : 'info',
        summary:
          'Your SQLite database lives on the device first. Modern browsers prefer OPFS private storage, and the IndexedDB fallback uses AES-256-GCM before snapshots are persisted.',
        facts: [
          'SQLite-WASM stores finance data in browser-private storage instead of exposing plain files to other websites.',
          'When IndexedDB fallback is used, the app derives a non-extractable AES-256-GCM key and encrypts persisted database snapshots before writing them.',
          'When OPFS is available, the browser origin sandbox isolates the database from other origins and browser profiles.',
          'Encryption secrets are never intentionally written to localStorage or IndexedDB as plaintext.',
        ],
        note: storageNote,
        defaultOpen: true,
      },
      {
        id: 'in-transit',
        title: 'In-Transit Encryption',
        icon: 'globe',
        status: transportStatus,
        tone: transportProtected ? 'active' : 'warning',
        summary:
          'Auth and sync traffic travels through the browser networking stack over HTTPS. The browser negotiates TLS with the server and validates certificates using the OS trust store.',
        facts: [
          syncConfigured
            ? `Configured endpoints: ${syncTargets}`
            : `This build currently runs against ${browserOriginHost} with no external sync endpoint configured.`,
          'The client does not hard-code a TLS version; modern browsers will usually negotiate TLS 1.3 when the server supports it, otherwise they fall back to the strongest shared TLS version.',
          'Certificate validation is browser-managed on the web. This app does not currently add its own certificate pinning layer, so pinning stays marked as pending.',
          'When you are offline, local edits stay on-device until the next sync retry instead of being sent over an insecure channel.',
        ],
        note: browserOriginHttps
          ? 'The current page origin is secure (HTTPS).'
          : 'The current page origin is not HTTPS, which is fine for local development but not for production financial traffic.',
      },
      {
        id: 'key-derivation',
        title: 'Key Derivation',
        icon: 'lock',
        status: 'PBKDF2-SHA-256 · 600K iterations',
        tone: encryptionSupported ? 'active' : 'warning',
        summary:
          'The active web implementation derives AES-256-GCM keys with PBKDF2-SHA-256, a random 16-byte salt, and non-extractable CryptoKey objects.',
        facts: [
          'The current web client uses PBKDF2 with 600,000 iterations and a 256-bit AES-GCM target key for encrypted database persistence.',
          'Every encryption operation uses a fresh 12-byte IV, which protects against nonce reuse for AES-GCM.',
          'The secret material can come from a user-provided secret, an in-memory access token, or a per-tab session secret used before auth is ready.',
          'Argon2id appears in broader architecture docs, but it is not the active web implementation today — this page intentionally reports PBKDF2 as the current behavior.',
        ],
        note: encryptionSupported
          ? 'Web Crypto support detected in this browser.'
          : 'This browser is missing the Web Crypto features required for encrypted persistence.',
      },
      {
        id: 'zero-knowledge',
        title: 'Zero-Knowledge Architecture',
        icon: 'shield',
        status: zeroKnowledgeStatus,
        tone: syncConfigured ? 'warning' : 'active',
        summary:
          'Finance is local-first, but this web build does not currently claim full zero-knowledge sync or end-to-end encrypted cloud payloads for every record.',
        facts: [
          'Data is created and stored locally first, so your device remains the primary source of truth.',
          'The current web sync stack coordinates through Supabase and PowerSync; the browser app does not yet wrap every synced record in a client-side envelope that the server cannot read.',
          'Because of that, this transparency page does not overstate the architecture: transport is encrypted, but the synced server copy is not presented as fully zero-knowledge today.',
          'If sync is disabled, there is no remote server copy to inspect, which is why the checkup can mark the app as server-blind while local-only.',
        ],
        note: syncConfigured
          ? 'Use this section as a trust boundary: local-first is active, full server blindness is still pending for synced data.'
          : 'Remote sync is not configured in this build, so the server never sees your records.',
      },
      {
        id: 'data-residency',
        title: 'Data Residency',
        icon: 'cloud',
        status: dataResidencyStatus,
        tone: 'info',
        summary:
          'Your primary dataset stays in local SQLite on this device. When sync is enabled, data is sent to the configured Supabase and PowerSync deployment rather than an unknown third-party API.',
        facts: [
          'Local-first means the device copy exists even when you are offline or the backend is unreachable.',
          syncConfigured
            ? `This build is configured to talk to: ${syncTargets}.`
            : 'No remote sync region is configured in this build, so all data residency remains on the current device/browser profile.',
          'This page performs no network lookups. It only reads browser state and local runtime configuration to describe where data can live.',
          'Changing deployment region is an environment/configuration decision; the page reflects the region implied by the configured endpoint hosts.',
        ],
      },
      {
        id: 'audit-log',
        title: 'Audit Log',
        icon: 'clipboard',
        status: auditStatus,
        tone: localStorageAvailable ? 'active' : 'warning',
        summary:
          'Recent security activity is kept locally on this device so you can inspect sign-ins, sync milestones, and other user-visible security events without calling an external API.',
        facts: [
          'The audit timeline is append-only in browser storage and is designed to avoid storing raw financial details.',
          'This page also surfaces the latest successful sync timestamp and the current key-storage posture, even if no explicit key-rotation event has been recorded yet.',
          'If you have never triggered security actions on this device, the log starts empty and fills in over time.',
          'Key rotation events are not currently emitted by the web client, so the summary below shows current key state instead of inventing a rotation timestamp.',
        ],
      },
    ];
  }, [
    auditEntries.length,
    browserOriginHost,
    browserOriginHttps,
    diagnostics,
    encryptionSupported,
    isDemoMode,
    localStorageAvailable,
    powerSyncConfig.enabled,
    powerSyncHost,
    syncConfigured,
    supabaseHost,
    transportProtected,
  ]);

  const signalCards = [
    {
      id: 'login',
      label: 'Last sign-in',
      value: lastLogin
        ? formatTimestamp(lastLogin.timestamp)
        : isAuthenticated
          ? 'Current session is authenticated'
          : 'No login event recorded yet',
      detail:
        lastLogin?.description ?? 'Login events appear here once this device records one locally.',
      tone: lastLogin ? severityTone(lastLogin.severity) : 'info',
    },
    {
      id: 'sync',
      label: 'Last successful sync',
      value: lastSyncTime ? formatTimestamp(lastSyncTime) : 'No successful sync recorded yet',
      detail: syncConfigured
        ? 'A successful sync writes its timestamp locally after queued changes are replayed.'
        : 'Sync is not configured in this build, so data remains local-only.',
      tone: lastSyncTime ? 'active' : 'info',
    },
    {
      id: 'key-state',
      label: 'Current key state',
      value:
        diagnostics?.backend === 'indexeddb' && encryptionSupported
          ? 'PBKDF2-derived AES-GCM fallback is armed'
          : diagnostics?.backend === 'opfs'
            ? 'OPFS sandbox active — no separate key rotation event'
            : encryptionSupported
              ? 'Encrypted fallback available when needed'
              : 'Encrypted persistence is unavailable in this browser',
      detail:
        diagnostics?.backend === 'indexeddb'
          ? 'This browser is using the encrypted IndexedDB persistence path.'
          : 'Key lifecycle details are summarized from the active local-storage posture.',
      tone:
        diagnostics?.backend === 'indexeddb' && encryptionSupported
          ? 'active'
          : encryptionSupported
            ? 'info'
            : 'warning',
    },
  ] as const;

  return (
    <div className="encryption-details">
      <section className="page-section" aria-label="Security checkup">
        <div className="encryption-details__hero">
          <div className="encryption-details__card encryption-details__card--intro">
            <div className="encryption-details__eyebrow">
              <AppIcon name="shield" size={16} />
              <span>Transparency page</span>
            </div>
            <h3 className="encryption-details__title">See exactly what protects your data</h3>
            <p className="encryption-details__lead">
              This view is intentionally specific about what is active in the current web app, what
              is browser-managed, and which advanced controls are still pending.
            </p>
            <div
              className="encryption-details__tags"
              role="list"
              aria-label="Security trust indicators"
            >
              <span className="encryption-details__tag" role="listitem">
                <AppIcon name="database" size={14} />
                Local-first SQLite
              </span>
              <span className="encryption-details__tag" role="listitem">
                <AppIcon name="globe" size={14} />
                {syncConfigured ? 'Secure sync endpoints configured' : 'Local-only right now'}
              </span>
              <span className="encryption-details__tag" role="listitem">
                <AppIcon name="lock" size={14} />
                PBKDF2-derived AES-GCM keys
              </span>
            </div>
          </div>

          <div className="encryption-details__card encryption-details__card--score">
            <div className="encryption-details__score-header">
              <div>
                <h3 className="encryption-details__score-title">Security Checkup</h3>
                <p className="encryption-details__score-copy">
                  {passedChecks} of {activeChecks.length} checks are active in this web build.
                </p>
              </div>
              <div
                className="encryption-details__score-value"
                aria-label={`${score}% security checkup score`}
              >
                {score}%
              </div>
            </div>

            <div className="encryption-details__progress" aria-hidden="true">
              <span className="encryption-details__progress-fill" style={{ width: `${score}%` }} />
            </div>

            <ul className="encryption-details__checklist" role="list">
              {activeChecks.map((check) => (
                <li key={check.id} className="encryption-details__check" role="listitem">
                  <AppIcon
                    name={check.active ? 'check-circle' : 'alert-circle'}
                    size={18}
                    className={`encryption-details__check-icon ${check.active ? 'encryption-details__check-icon--active' : 'encryption-details__check-icon--pending'}`}
                  />
                  <span>{check.label}</span>
                </li>
              ))}
            </ul>

            {pendingChecks.length > 0 && (
              <p className="encryption-details__pending-copy">
                Still pending: {pendingChecks.map((check) => check.label).join('; ')}.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="page-section" aria-label="Encryption details topics">
        <div className="encryption-details__accordion-list">
          {sections.map((section) => (
            <details
              key={section.id}
              className="encryption-details__accordion"
              open={section.defaultOpen}
            >
              <summary className="encryption-details__summary">
                <div className="encryption-details__summary-main">
                  <div className="encryption-details__summary-icon">
                    <AppIcon name={section.icon} size={18} />
                  </div>
                  <div className="encryption-details__summary-copy">
                    <div className="encryption-details__summary-heading-row">
                      <h3 className="encryption-details__section-title">{section.title}</h3>
                      <span
                        className={`encryption-details__pill encryption-details__pill--${section.tone}`}
                      >
                        {section.status}
                      </span>
                    </div>
                    <p className="encryption-details__summary-text">{section.summary}</p>
                  </div>
                </div>
                <AppIcon name="chevron-right" size={18} className="encryption-details__chevron" />
              </summary>

              <div className="encryption-details__content">
                <ul className="encryption-details__facts" role="list">
                  {section.facts.map((fact) => (
                    <li key={fact} className="encryption-details__fact" role="listitem">
                      <AppIcon name="check" size={16} className="encryption-details__fact-icon" />
                      <span>{fact}</span>
                    </li>
                  ))}
                </ul>
                {section.note && <p className="encryption-details__note">{section.note}</p>}

                {section.id === 'audit-log' && (
                  <div className="encryption-details__audit-panel">
                    <div className="encryption-details__signals">
                      {signalCards.map((card) => (
                        <div key={card.id} className="encryption-details__signal-card">
                          <span
                            className={`encryption-details__pill encryption-details__pill--${card.tone}`}
                          >
                            {card.label}
                          </span>
                          <strong className="encryption-details__signal-value">{card.value}</strong>
                          <p className="encryption-details__signal-detail">{card.detail}</p>
                        </div>
                      ))}
                    </div>

                    <div className="encryption-details__audit-log">
                      <h4 className="encryption-details__audit-title">
                        Recent local audit entries
                      </h4>
                      {auditEntries.length === 0 ? (
                        <p className="encryption-details__audit-empty">
                          No local audit entries recorded yet. Future sign-ins, exports, and
                          security-sensitive actions will appear here on this device.
                        </p>
                      ) : (
                        <ul className="encryption-details__event-list" role="list">
                          {auditEntries.map((entry) => (
                            <li
                              key={entry.id}
                              className="encryption-details__event"
                              role="listitem"
                            >
                              <div className="encryption-details__event-header">
                                <span
                                  className={`encryption-details__pill encryption-details__pill--${severityTone(entry.severity)}`}
                                >
                                  {eventLabel(entry)}
                                </span>
                                <time
                                  className="encryption-details__event-time"
                                  dateTime={entry.timestamp}
                                >
                                  {formatTimestamp(entry.timestamp)}
                                </time>
                              </div>
                              <p className="encryption-details__event-description">
                                {entry.description}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
};

export default EncryptionDetails;
