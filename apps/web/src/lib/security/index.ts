// SPDX-License-Identifier: BUSL-1.1

/**
 * Security & Privacy — barrel export.
 *
 * Re-exports all types, functions, and constants from the security modules.
 */

export type {
  AuditEntry,
  AuditEventType,
  AuditLogFilter,
  AuditSeverity,
  ConnectionRecord,
  ConnectionStatus,
  DataAccessRequest,
  DataAccessRequestStatus,
  DataCategory,
  DataExportPackage,
  DeviceSession,
  EncryptedMemo,
  ErasableRecordType,
  ErasureRequest,
  ErasureStatus,
  MemoExportOptions,
  NetworkRequestEntry,
  RetentionCheckResult,
  TelemetryCategory,
  TelemetryConfig,
  TransparencyDestination,
  TransparencyReport,
} from './types';

export {
  ALL_DATA_CATEGORIES,
  DATA_CATEGORY_DESCRIPTIONS,
  buildDataInventory,
  createDataAccessRequest,
  generateExportPackage,
  serializeExportPackage,
  updateRequestStatus,
} from './data-access';

export {
  checkRetentionPolicy,
  createErasureRequest,
  determineCascadeActions,
  generateErasureReceipt,
  updateErasureStatus,
} from './record-erasure';

export {
  getActiveSessions,
  isSessionValid,
  loadSessions,
  maskIpAddress,
  parseDeviceName,
  registerSession,
  revokeAllOtherSessions,
  revokeSession,
  touchSession,
} from './device-manager';

export {
  ALL_TELEMETRY_CATEGORIES,
  TELEMETRY_CATEGORY_DESCRIPTIONS,
  clearNetworkLog,
  createDefaultConfig,
  generateTransparencyReport,
  isCategoryEnabled,
  loadNetworkLog,
  loadTelemetryConfig,
  logNetworkRequest,
  saveTelemetryConfig,
  setCategoryEnabled,
  setNoTelemetryMode,
} from './telemetry-config';

export {
  addConnection,
  getActiveConnections,
  getConnectionsByType,
  getScopesSummary,
  loadConnections,
  recordConnectionAccess,
  revokeConnection,
  updateConnectionStatus,
} from './connection-transparency';

export {
  appendAuditEntry,
  clearAuditLog,
  exportAuditLog,
  getEventTypeCounts,
  loadAuditLog,
  queryAuditLog,
} from './audit-log';

export {
  batchProcessMemosForExport,
  decryptMemo,
  encryptMemo,
  isRedacted,
  processMemoForExport,
  redactMemo,
} from './encrypted-memo';
