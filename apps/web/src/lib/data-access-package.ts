// SPDX-License-Identifier: BUSL-1.1

export const DATA_ACCESS_SCHEMA_VERSION = '1.0';
export const DATA_ACCESS_EXPIRATION_DAYS = 7;
export const DATA_ACCESS_WARNING_HOURS = 24;

type RequiredDomain =
  | 'transactions'
  | 'accounts'
  | 'budgets'
  | 'goals'
  | 'recurring_rules'
  | 'categories'
  | 'tags'
  | 'attachments'
  | 'preferences'
  | 'settings'
  | 'audit_log'
  | 'sync_metadata';
type JsonRecord = Record<string, unknown>;

export interface DataAccessPackageOptions {
  appVersion: string;
  locale?: string;
  includeProtectedCategories?: boolean;
  includeMoodTags?: boolean;
  generatedAt?: Date;
}

export interface DataAccessPackageInput {
  accounts: readonly JsonRecord[];
  transactions: readonly JsonRecord[];
  budgets: readonly JsonRecord[];
  goals: readonly JsonRecord[];
  categories: readonly JsonRecord[];
  recurringRules?: readonly JsonRecord[];
  attachments?: readonly DataAccessAttachment[];
  preferences?: readonly JsonRecord[];
  settings?: readonly JsonRecord[];
  auditLog?: readonly JsonRecord[];
  syncMetadata?: readonly JsonRecord[];
  moodTags?: readonly JsonRecord[];
}

export interface DataAccessAttachment {
  id: string;
  fileName: string;
  contentType: string;
  bytes?: Uint8Array;
  signedUrl?: string;
}

export interface DataAccessManifestEntry {
  domain: string;
  path: string;
  content_type: string;
  record_count: number;
  schema_version: string;
  description: string;
}

export interface DataAccessManifest {
  schema_version: string;
  generated_at: string;
  expires_at: string;
  app_version: string;
  locale: string;
  contents: DataAccessManifestEntry[];
  privacy: {
    protected_categories_included: boolean;
    mood_tags_included: boolean;
    available_on_request: string[];
    household_scope: string;
  };
  coordination_notes: string[];
}

export interface DataAccessPackageResult {
  fileName: string;
  zipBytes: Uint8Array;
  manifest: DataAccessManifest;
}

interface PackageFile {
  path: string;
  bytes: Uint8Array;
  contentType: string;
  recordCount: number;
  domain: string;
  description: string;
}

const encoder = new TextEncoder();

/** Build a GDPR/CCPA ZIP data package entirely in the browser process. */
export function buildDataAccessPackage(
  input: DataAccessPackageInput,
  options: DataAccessPackageOptions,
): DataAccessPackageResult {
  const generatedAt = options.generatedAt ?? new Date();
  const expiresAt = new Date(
    generatedAt.getTime() + DATA_ACCESS_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
  );
  const locale = options.locale ?? navigator.language ?? 'en';
  const includeProtectedCategories = options.includeProtectedCategories ?? true;
  const includeMoodTags = options.includeMoodTags ?? false;
  const domains = buildDomainRecords(input, includeMoodTags);
  const dataFiles = Object.entries(domains).map(([domain, records]) =>
    makeJsonFile(domain, records),
  );
  const attachmentFiles = (input.attachments ?? [])
    .filter((attachment) => attachment.bytes)
    .map((attachment) => ({
      path: `attachments/${sanitizePathSegment(attachment.id)}-${sanitizePathSegment(attachment.fileName)}`,
      bytes: attachment.bytes ?? new Uint8Array(),
      contentType: attachment.contentType,
      recordCount: 1,
      domain: 'attachment_binary',
      description: 'Local attachment binary copied into the package',
    }));
  const manifest = buildManifest({
    appVersion: options.appVersion,
    locale,
    generatedAt,
    expiresAt,
    files: [...dataFiles, ...attachmentFiles],
    includeProtectedCategories,
    includeMoodTags,
  });
  const readme = renderReadme(manifest, locale);
  const zipBytes = buildZip([
    {
      path: 'manifest.json',
      bytes: encodeJson(manifest),
      contentType: 'application/json',
      recordCount: 1,
      domain: 'manifest',
      description: 'Package manifest',
    },
    ...dataFiles,
    ...attachmentFiles,
    {
      path: 'README.md',
      bytes: encoder.encode(readme),
      contentType: 'text/markdown; charset=utf-8',
      recordCount: 1,
      domain: 'readme',
      description: 'Localized package guide',
    },
  ]);

  return {
    fileName: `finance-export-${generatedAt.toISOString().slice(0, 10)}.zip`,
    zipBytes,
    manifest,
  };
}

/** True once an in-app package should be auto-deleted. */
export function shouldAutoDeletePackage(now: Date, expiresAtIso: string): boolean {
  return now.getTime() >= new Date(expiresAtIso).getTime();
}

/** True during the final 24 hours before package expiration. */
export function shouldWarnPackageExpiresSoon(now: Date, expiresAtIso: string): boolean {
  const expiresAt = new Date(expiresAtIso).getTime();
  return (
    now.getTime() >= expiresAt - DATA_ACCESS_WARNING_HOURS * 60 * 60 * 1000 &&
    now.getTime() < expiresAt
  );
}

function buildDomainRecords(input: DataAccessPackageInput, includeMoodTags: boolean) {
  const domains: Record<RequiredDomain | 'mood_tags', readonly JsonRecord[]> = {
    transactions: stripSyncFields(input.transactions),
    accounts: stripSyncFields(input.accounts),
    budgets: stripSyncFields(input.budgets),
    goals: stripSyncFields(input.goals),
    recurring_rules: stripSyncFields(input.recurringRules ?? []),
    categories: stripSyncFields(input.categories),
    tags: Array.from(new Set(input.transactions.flatMap((txn) => normalizeTags(txn.tags)))).map(
      (name) => ({
        name,
      }),
    ),
    attachments: (input.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      file_name: attachment.fileName,
      content_type: attachment.contentType,
      package_path: attachment.bytes
        ? `attachments/${sanitizePathSegment(attachment.id)}-${sanitizePathSegment(attachment.fileName)}`
        : null,
      signed_url: attachment.signedUrl ?? null,
      delivery: attachment.bytes ? 'embedded_binary' : 'signed_url_reference',
    })),
    preferences: stripSyncFields(input.preferences ?? []),
    settings: stripSyncFields(input.settings ?? []),
    audit_log: stripSyncFields(input.auditLog ?? []),
    sync_metadata: stripSyncFields(input.syncMetadata ?? []),
    mood_tags: includeMoodTags ? stripSyncFields(input.moodTags ?? []) : [],
  };

  if (!includeMoodTags) {
    const { mood_tags: _moodTags, ...requiredDomains } = domains;
    return requiredDomains;
  }
  return domains;
}

function normalizeTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];
}

function stripSyncFields(records: readonly JsonRecord[]): JsonRecord[] {
  return records.map((record) => {
    const next: JsonRecord = {};
    for (const [key, value] of Object.entries(record)) {
      if (
        key === 'syncVersion' ||
        key === 'sync_version' ||
        key === 'isSynced' ||
        key === 'is_synced'
      ) {
        continue;
      }
      next[key] = value;
    }
    return next;
  });
}

function makeJsonFile(domain: string, records: readonly JsonRecord[]): PackageFile {
  return {
    path: `data/${domain}.json`,
    bytes: encodeJson({
      schema_version: DATA_ACCESS_SCHEMA_VERSION,
      record_count: records.length,
      records,
    }),
    contentType: 'application/json',
    recordCount: records.length,
    domain,
    description: describeDomain(domain),
  };
}

function buildManifest(input: {
  appVersion: string;
  locale: string;
  generatedAt: Date;
  expiresAt: Date;
  files: readonly PackageFile[];
  includeProtectedCategories: boolean;
  includeMoodTags: boolean;
}): DataAccessManifest {
  return {
    schema_version: DATA_ACCESS_SCHEMA_VERSION,
    generated_at: input.generatedAt.toISOString(),
    expires_at: input.expiresAt.toISOString(),
    app_version: input.appVersion,
    locale: input.locale,
    contents: input.files.map((file) => ({
      domain: file.domain,
      path: file.path,
      content_type: file.contentType,
      record_count: file.recordCount,
      schema_version: DATA_ACCESS_SCHEMA_VERSION,
      description: file.description,
    })),
    privacy: {
      protected_categories_included: input.includeProtectedCategories,
      mood_tags_included: input.includeMoodTags,
      available_on_request: input.includeMoodTags
        ? ['caregiver_mode_audit_trail', 'accountability_partner_shared_snapshots']
        : ['mood_tags', 'caregiver_mode_audit_trail', 'accountability_partner_shared_snapshots'],
      household_scope:
        "Only the requesting user's own contributions are included; other household members' data is excluded.",
    },
    coordination_notes: [
      'Needs Coordination: #1719 protected-category metadata is not yet available in shared web repositories; callers must pass pre-filtered categories when users opt out.',
    ],
  };
}

function describeDomain(domain: string): string {
  switch (domain) {
    case 'transactions':
      return 'Transactions with full detail owned by the requesting user';
    case 'accounts':
      return 'Accounts and balances owned by the requesting user';
    case 'budgets':
      return 'Budgets and rollover configuration';
    case 'goals':
      return 'Savings goals and progress';
    case 'recurring_rules':
      return 'Recurring transaction rules';
    case 'categories':
      return 'Categories, including protected categories unless opted out';
    case 'tags':
      return 'Transaction tags derived from exported transactions';
    case 'attachments':
      return 'Receipt and attachment metadata with binary file references';
    case 'preferences':
      return 'User-facing preferences';
    case 'settings':
      return 'Application settings';
    case 'audit_log':
      return "Audit events for the requesting user's own actions";
    case 'sync_metadata':
      return 'Device and last-sync metadata';
    case 'mood_tags':
      return 'Mood tag records included only when explicitly requested';
    default:
      return 'Data access package file';
  }
}

function renderReadme(manifest: DataAccessManifest, locale: string): string {
  const title = locale.startsWith('es')
    ? '# Paquete de datos de Finance'
    : locale.startsWith('fr')
      ? '# Package de données Finance'
      : '# Finance data package';
  return `${title}

Generated: ${manifest.generated_at}
Expires: ${manifest.expires_at}

This ZIP was generated on your device. It contains the data Finance stores for your account and should be treated as sensitive financial information.

## Privacy choices

- Protected categories included: ${manifest.privacy.protected_categories_included}
- Mood tags included: ${manifest.privacy.mood_tags_included}
- Household scope: ${manifest.privacy.household_scope}

## Files

${manifest.contents.map((entry) => `- \`${entry.path}\` — ${entry.description} (${entry.record_count} record(s)).`).join('\n')}
`;
}

function encodeJson(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value, null, 2));
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_') || 'attachment';
}

/**
 * Entry in a ZIP archive built by {@link buildZipArchive}.
 *
 * @public
 */
export interface ZipEntry {
  path: string;
  bytes: Uint8Array;
}

/**
 * Build a minimal, store-only (uncompressed) ZIP archive. Shared zip utility
 * used by both the data-access package and the per-entity CSV export.
 *
 * @public
 */
export function buildZipArchive(files: readonly ZipEntry[]): Uint8Array {
  return buildZip(files);
}

function buildZip(files: readonly ZipEntry[]): Uint8Array {
  const writer = new ByteWriter();
  const central: Array<{ path: string; bytes: Uint8Array; crc: number; offset: number }> = [];

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const offset = writer.length;
    const crc = crc32(file.bytes);
    writer.u32(0x04034b50);
    writer.u16(20);
    writer.u16(0x0800);
    writer.u16(0);
    writer.u16(0);
    writer.u16(33);
    writer.u32(crc);
    writer.u32(file.bytes.length);
    writer.u32(file.bytes.length);
    writer.u16(nameBytes.length);
    writer.u16(0);
    writer.bytes(nameBytes);
    writer.bytes(file.bytes);
    central.push({ path: file.path, bytes: file.bytes, crc, offset });
  }

  const centralOffset = writer.length;
  for (const file of central) {
    const nameBytes = encoder.encode(file.path);
    writer.u32(0x02014b50);
    writer.u16(20);
    writer.u16(20);
    writer.u16(0x0800);
    writer.u16(0);
    writer.u16(0);
    writer.u16(33);
    writer.u32(file.crc);
    writer.u32(file.bytes.length);
    writer.u32(file.bytes.length);
    writer.u16(nameBytes.length);
    writer.u16(0);
    writer.u16(0);
    writer.u16(0);
    writer.u16(0);
    writer.u32(0);
    writer.u32(file.offset);
    writer.bytes(nameBytes);
  }

  const centralSize = writer.length - centralOffset;
  writer.u32(0x06054b50);
  writer.u16(0);
  writer.u16(0);
  writer.u16(central.length);
  writer.u16(central.length);
  writer.u32(centralSize);
  writer.u32(centralOffset);
  writer.u16(0);
  return writer.toUint8Array();
}

class ByteWriter {
  private buffer = new Uint8Array(4096);
  length = 0;

  u16(value: number): void {
    this.byte(value & 0xff);
    this.byte((value >>> 8) & 0xff);
  }

  u32(value: number): void {
    this.byte(value & 0xff);
    this.byte((value >>> 8) & 0xff);
    this.byte((value >>> 16) & 0xff);
    this.byte((value >>> 24) & 0xff);
  }

  bytes(bytes: Uint8Array): void {
    this.ensure(this.length + bytes.length);
    this.buffer.set(bytes, this.length);
    this.length += bytes.length;
  }

  toUint8Array(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }

  private byte(value: number): void {
    this.ensure(this.length + 1);
    this.buffer[this.length] = value;
    this.length += 1;
  }

  private ensure(required: number): void {
    if (required <= this.buffer.length) return;
    let next = this.buffer.length;
    while (next < required) next *= 2;
    const expanded = new Uint8Array(next);
    expanded.set(this.buffer);
    this.buffer = expanded;
  }
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
