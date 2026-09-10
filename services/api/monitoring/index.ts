// SPDX-License-Identifier: BUSL-1.1

/**
 * Barrel export for the monitoring module (#1386).
 *
 * Re-exports all public types, functions, and constants from the
 * monitoring sub-modules so consumers can import from a single path:
 *
 * ```ts
 * import { incrementRequestCounter, createAlertManager } from '../monitoring';
 * ```
 *
 * @module
 */

export {
  // Types
  type RequestCounterKey,
  type HistogramBucket,
  type SyncMetrics,
  type StructuredLogEntry,
  // Request counters
  incrementRequestCounter,
  getRequestCount,
  getAllRequestCounts,
  resetRequestCounters,
  // Response-time histogram
  recordResponseTime,
  getResponseTimeHistogram,
  resetResponseTimes,
  // Active connections
  incrementActiveConnections,
  decrementActiveConnections,
  getActiveConnections,
  resetActiveConnections,
  // Error rate
  calculateErrorRate,
  // Sync metrics
  recordSyncOperation,
  getSyncMetrics,
  resetSyncMetrics,
  // Structured logging
  createLogEntry,
  emitLog,
  // Full reset
  resetAllMetrics,
} from './metrics.js';

export {
  // Types
  type AlertSeverity,
  type AlertState,
  type AlertRule,
  type AlertInstance,
  type AlertManager,
  // Constants
  DEFAULT_ALERT_RULES,
  // Factory
  createAlertManager,
} from './alerts.js';

export {
  // Types
  type TimeBucket,
  type BucketedDataPoint,
  type ResponseTimePercentiles,
  type DashboardSnapshot,
  type SyncHealthSummary,
  // Functions
  percentile,
  computeResponseTimePercentiles,
  computeErrorRatePercent,
  computeSyncHealth,
  aggregateByTimeBucket,
  buildDashboardSnapshot,
} from './dashboard.js';

export {
  // Types
  type MonitorType,
  type MonitorTarget,
  type AlertThresholds,
  type NotificationChannelType,
  type NotificationChannel,
  type UptimeKumaConfig,
  type ValidationError,
  // Constants
  DEFAULT_THRESHOLDS,
  DEFAULT_MONITORS,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_CONFIG,
  // Functions
  validateConfig,
} from './uptime-kuma-config.js';

export {
  // Types
  type ComponentStatus,
  type ComponentHealth,
  type HealthCheckResult,
  type ComponentChecker,
  // Factories
  createDatabaseChecker,
  createPowerSyncChecker,
  createEdgeFunctionChecker,
  // Runner
  runHealthCheck,
} from './health-check.js';

export {
  type EntitlementProvider,
  type EntitlementReliabilityMetricName,
  type EntitlementReliabilityMetricUnit,
  type EntitlementProviderReliabilitySample,
  type EntitlementReliabilitySample,
  type EntitlementReliabilityMetricPoint,
  type EntitlementReliabilitySlo,
  ENTITLEMENT_RELIABILITY_SLOS,
  createEntitlementReliabilityMetrics,
} from './entitlement-reliability.js';
