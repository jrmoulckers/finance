// SPDX-License-Identifier: BUSL-1.1

/**
 * Telemetry Configuration — no-telemetry mode, network request auditing,
 * and transparency reporting.
 *
 * Provides granular control over telemetry categories, logs all outbound
 * network requests for user inspection, and generates transparency reports
 * showing what data goes where.
 *
 * References: issue #1668
 */

import type {
  NetworkRequestEntry,
  TelemetryCategory,
  TelemetryConfig,
  TransparencyDestination,
  TransparencyReport,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for telemetry config. */
const TELEMETRY_CONFIG_KEY = 'finance-telemetry-config';

/** localStorage key for network request log. */
const NETWORK_LOG_KEY = 'finance-network-log';

/** Maximum network log entries to retain. */
const MAX_NETWORK_LOG_ENTRIES = 1000;

/** All telemetry categories. */
export const ALL_TELEMETRY_CATEGORIES: readonly TelemetryCategory[] = [
  'crash_reports',
  'usage_analytics',
  'performance_metrics',
  'feature_flags',
] as const;

/** Human-readable descriptions for each telemetry category. */
export const TELEMETRY_CATEGORY_DESCRIPTIONS: Readonly<Record<TelemetryCategory, string>> = {
  crash_reports: 'Anonymous crash and error reports to help fix bugs',
  usage_analytics: 'Feature usage patterns (no financial data included)',
  performance_metrics: 'Page load times and app performance measurements',
  feature_flags: 'Feature flag sync for enabling/disabling app features',
};

// ---------------------------------------------------------------------------
// Configuration management
// ---------------------------------------------------------------------------

/**
 * Create a default telemetry configuration with everything disabled.
 *
 * @returns A TelemetryConfig with no-telemetry mode enabled.
 */
export function createDefaultConfig(): TelemetryConfig {
  return {
    noTelemetryMode: true,
    categorySettings: {
      crash_reports: false,
      usage_analytics: false,
      performance_metrics: false,
      feature_flags: false,
    },
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Load telemetry configuration from localStorage.
 *
 * Returns the default (all-off) configuration if none is stored.
 *
 * @returns The current TelemetryConfig.
 */
export function loadTelemetryConfig(): TelemetryConfig {
  try {
    const raw = localStorage.getItem(TELEMETRY_CONFIG_KEY);
    if (!raw) return createDefaultConfig();

    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return createDefaultConfig();

    const config = parsed as Record<string, unknown>;
    if (typeof config.noTelemetryMode !== 'boolean') return createDefaultConfig();

    return parsed as TelemetryConfig;
  } catch {
    return createDefaultConfig();
  }
}

/**
 * Save telemetry configuration to localStorage.
 *
 * @param config - The configuration to persist.
 */
export function saveTelemetryConfig(config: TelemetryConfig): void {
  localStorage.setItem(TELEMETRY_CONFIG_KEY, JSON.stringify(config));
}

/**
 * Toggle the master no-telemetry mode.
 *
 * When enabled, all telemetry is disabled regardless of category settings.
 *
 * @param enabled - Whether no-telemetry mode should be active.
 * @returns The updated TelemetryConfig.
 */
export function setNoTelemetryMode(enabled: boolean): TelemetryConfig {
  const current = loadTelemetryConfig();
  const updated: TelemetryConfig = {
    ...current,
    noTelemetryMode: enabled,
    lastUpdatedAt: new Date().toISOString(),
  };
  saveTelemetryConfig(updated);
  return updated;
}

/**
 * Update a specific telemetry category setting.
 *
 * @param category - The category to update.
 * @param enabled - Whether the category should be enabled.
 * @returns The updated TelemetryConfig.
 */
export function setCategoryEnabled(category: TelemetryCategory, enabled: boolean): TelemetryConfig {
  const current = loadTelemetryConfig();
  const updated: TelemetryConfig = {
    ...current,
    categorySettings: {
      ...current.categorySettings,
      [category]: enabled,
    },
    lastUpdatedAt: new Date().toISOString(),
  };
  saveTelemetryConfig(updated);
  return updated;
}

/**
 * Check if a specific telemetry category is effectively enabled.
 *
 * Returns false if no-telemetry mode is on, regardless of category setting.
 *
 * @param category - The category to check.
 * @returns True if the category is active and allowed.
 */
export function isCategoryEnabled(category: TelemetryCategory): boolean {
  const config = loadTelemetryConfig();
  if (config.noTelemetryMode) return false;
  return config.categorySettings[category] ?? false;
}

// ---------------------------------------------------------------------------
// Network request auditing
// ---------------------------------------------------------------------------

/**
 * Load the network request log from localStorage.
 *
 * @returns An array of NetworkRequestEntry objects.
 */
export function loadNetworkLog(): NetworkRequestEntry[] {
  try {
    const raw = localStorage.getItem(NETWORK_LOG_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (e: unknown): e is NetworkRequestEntry =>
        typeof e === 'object' && e !== null && 'id' in e && 'destination' in e,
    );
  } catch {
    return [];
  }
}

/**
 * Log an outbound network request.
 *
 * @param destination - The destination domain.
 * @param method - HTTP method.
 * @param purpose - Human-readable purpose description.
 * @param blocked - Whether the request was blocked by telemetry settings.
 * @returns The logged NetworkRequestEntry.
 */
export function logNetworkRequest(
  destination: string,
  method: string,
  purpose: string,
  blocked: boolean,
): NetworkRequestEntry {
  const entry: NetworkRequestEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    destination,
    method,
    purpose,
    blocked,
  };

  const log = loadNetworkLog();
  log.push(entry);

  const trimmed = log.length > MAX_NETWORK_LOG_ENTRIES ? log.slice(-MAX_NETWORK_LOG_ENTRIES) : log;
  localStorage.setItem(NETWORK_LOG_KEY, JSON.stringify(trimmed));

  return entry;
}

/**
 * Clear the network request log.
 */
export function clearNetworkLog(): void {
  localStorage.removeItem(NETWORK_LOG_KEY);
}

// ---------------------------------------------------------------------------
// Transparency reporting
// ---------------------------------------------------------------------------

/**
 * Generate a transparency report from the network request log.
 *
 * Aggregates all logged requests by destination and summarizes what data
 * goes where, how many requests were made, and how many were blocked.
 *
 * @returns A TransparencyReport.
 */
export function generateTransparencyReport(): TransparencyReport {
  const log = loadNetworkLog();
  const destinationMap = new Map<string, { purposes: Set<string>; count: number }>();
  let totalBlocked = 0;

  for (const entry of log) {
    if (entry.blocked) totalBlocked++;

    const existing = destinationMap.get(entry.destination);
    if (existing) {
      existing.purposes.add(entry.purpose);
      existing.count++;
    } else {
      destinationMap.set(entry.destination, {
        purposes: new Set([entry.purpose]),
        count: 1,
      });
    }
  }

  const destinations: TransparencyDestination[] = [];
  for (const [domain, info] of destinationMap) {
    destinations.push({
      domain,
      service: domain,
      dataSent: 'See purpose description',
      purpose: Array.from(info.purposes).join('; '),
      requestCount: info.count,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    destinations,
    totalRequests: log.length,
    totalBlocked,
  };
}
