/**
 * Encryption details center for at-rest, in-transit, and key derivation facts.
 * Closes #1697.
 * @module enhancements/encryption-info
 */

import type {
  EncryptionInfo,
  EncryptionDetail,
  EncryptionCategory,
  ComplianceChecklistItem,
} from './types';

/** Static encryption documentation */
const ENCRYPTION_DETAILS: readonly EncryptionDetail[] = [
  {
    category: 'at_rest',
    algorithm: 'AES-256-GCM',
    description:
      'All locally stored financial data is encrypted using AES-256 in GCM mode via the Web Crypto API (SubtleCrypto). Each database record uses a unique initialization vector (IV).',
    standard: 'NIST SP 800-38D',
  },
  {
    category: 'at_rest',
    algorithm: 'SQLite-WASM with OPFS',
    description:
      'The SQLite database is stored in the Origin Private File System (OPFS) with AES-256-GCM encryption applied at the application layer before writes.',
  },
  {
    category: 'in_transit',
    algorithm: 'TLS 1.3',
    description:
      'All API communication uses TLS 1.3 with forward secrecy. Certificate pinning is enforced for the primary API domain.',
    standard: 'RFC 8446',
  },
  {
    category: 'in_transit',
    algorithm: 'HSTS',
    description:
      'HTTP Strict Transport Security headers are set with a minimum max-age of one year, including subdomains and preload.',
    standard: 'RFC 6797',
  },
  {
    category: 'key_derivation',
    algorithm: 'PBKDF2-SHA-256',
    description:
      'User-derived encryption keys use PBKDF2 with SHA-256 and a minimum of 600,000 iterations, per OWASP recommendations.',
    standard: 'NIST SP 800-132',
  },
  {
    category: 'key_derivation',
    algorithm: 'HKDF-SHA-256',
    description:
      'Session and per-record keys are derived from the master key using HKDF with SHA-256 for domain separation.',
    standard: 'RFC 5869',
  },
];

/** Default compliance checklist items */
const DEFAULT_COMPLIANCE: readonly ComplianceChecklistItem[] = [
  { id: 'enc-at-rest', label: 'Data encrypted at rest with AES-256-GCM', satisfied: true },
  { id: 'enc-in-transit', label: 'TLS 1.3 enforced for all API traffic', satisfied: true },
  { id: 'key-derivation', label: 'Key derivation uses PBKDF2 ≥ 600K iterations', satisfied: true },
  { id: 'no-inline-scripts', label: 'CSP strict — no inline scripts or eval', satisfied: true },
  { id: 'iv-unique', label: 'Unique IV per encryption operation', satisfied: true },
  { id: 'cert-pin', label: 'Certificate pinning for primary API', satisfied: true },
  { id: 'hsts', label: 'HSTS with preload enabled', satisfied: true },
  { id: 'no-plaintext', label: 'No sensitive data stored in plaintext', satisfied: true },
];

/**
 * Get the full encryption info center data.
 * @param lastAuditDate - Optional ISO-8601 date of the last security audit
 * @returns Static encryption documentation
 */
export function getEncryptionInfo(lastAuditDate?: string): EncryptionInfo {
  return {
    details: ENCRYPTION_DETAILS,
    complianceItems: DEFAULT_COMPLIANCE,
    lastAuditDate,
  };
}

/**
 * Get encryption details filtered by category.
 * @param category - The encryption category to filter by
 * @returns Filtered encryption details
 */
export function getDetailsByCategory(category: EncryptionCategory): readonly EncryptionDetail[] {
  return ENCRYPTION_DETAILS.filter((d) => d.category === category);
}

/**
 * Generate a security posture summary.
 * @param info - Encryption info
 * @returns Human-readable summary
 */
export function getSecurityPostureSummary(info: EncryptionInfo): string {
  const total = info.complianceItems.length;
  const satisfied = info.complianceItems.filter((c) => c.satisfied).length;
  if (total === 0) return 'No compliance items defined.';
  const pct = Math.round((satisfied / total) * 100);
  return `Security posture: ${satisfied}/${total} checks passed (${pct}%). ${
    pct === 100 ? 'All requirements met.' : 'Action needed on unmet items.'
  }`;
}

/**
 * Get unsatisfied compliance items that need attention.
 * @param info - Encryption info
 * @returns Compliance items not yet satisfied
 */
export function getUnmetCompliance(info: EncryptionInfo): readonly ComplianceChecklistItem[] {
  return info.complianceItems.filter((c) => !c.satisfied);
}

/**
 * Update the last audit date.
 * @param info - Current encryption info
 * @param auditDate - ISO-8601 audit date
 * @returns Updated encryption info
 */
export function setLastAuditDate(info: EncryptionInfo, auditDate: string): EncryptionInfo {
  return { ...info, lastAuditDate: auditDate };
}

/**
 * Update a compliance item's satisfied status.
 * @param info - Current encryption info
 * @param itemId - Compliance item ID
 * @param satisfied - New satisfied status
 * @returns Updated encryption info
 */
export function updateComplianceItem(
  info: EncryptionInfo,
  itemId: string,
  satisfied: boolean,
): EncryptionInfo {
  return {
    ...info,
    complianceItems: info.complianceItems.map((c) => (c.id === itemId ? { ...c, satisfied } : c)),
  };
}
