// SPDX-License-Identifier: BUSL-1.1

export const DATA_ACCESS_SCHEMA_VERSION = '1.0';
export const DATA_ACCESS_EXPIRATION_DAYS = 7;
export const DATA_ACCESS_WARNING_HOURS = 24;

export type DataAccessDomain =
  | 'accounts'
  | 'transactions'
  | 'budgets'
  | 'goals'
  | 'recurring_rules'
  | 'categories'
  | 'tags'
  | 'settings'
  | 'preferences'
  | 'consent_records'
  | 'attachments'
  | 'audit_log'
  | 'sync_metadata'
  | 'mood_tags';

type JsonRecord = Record<string, unknown>;

export const DEFAULT_DATA_ACCESS_DOMAINS: readonly DataAccessDomain[] = [
  'accounts',
  'transactions',
  'budgets',
  'goals',
  'recurring_rules',
  'categories',
  'tags',
  'settings',
  'preferences',
  'consent_records',
  'attachments',
  'audit_log',
  'sync_metadata',
];

export interface DataAccessPackageOptions {
  appVersion: string;
  locale?: string;
  includeProtectedCategories?: boolean;
  includeMoodTags?: boolean;
  includeNotes?: boolean;
  includeAttachmentBinaries?: boolean;
  selectedDomains?: readonly DataAccessDomain[];
  generatedAt?: Date;
  redactionProfile?: 'redacted' | 'full';
  recipient?: string;
  shareMethod?: 'download' | 'web_share' | 'manual' | 'unknown';
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
  consentRecords?: readonly JsonRecord[];
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
    notes_included: boolean;
    attachment_binaries_included: boolean;
    redaction_profile: 'redacted' | 'full';
    selected_domains: DataAccessDomain[];
    omitted_domains: DataAccessDomain[];
    available_on_request: string[];
    household_scope: string;
    recipient: string | null;
    share_method: string;
  };
  coordination_notes: string[];
}

export interface DataAccessPackageResult {
  fileName: string;
  zipBytes: Uint8Array;
  manifest: DataAccessManifest;
}

export interface DataAccessDomainSummary {
  readonly domain: DataAccessDomain;
  readonly label: string;
  readonly recordCount: number;
  readonly warning: string;
  readonly protectedByDefault: boolean;
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
const ALL_DOMAINS: readonly DataAccessDomain[] = [...DEFAULT_DATA_ACCESS_DOMAINS, 'mood_tags'];

export function buildDataAccessPackage(
  input: DataAccessPackageInput,
  options: DataAccessPackageOptions,
): DataAccessPackageResult {
  const generatedAt = options.generatedAt ?? new Date();
  const expiresAt = new Date(
    generatedAt.getTime() + DATA_ACCESS_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
  );
  const locale = options.locale ?? navigator.language ?? 'en';
  const redactionProfile = options.redactionProfile ?? 'redacted';
  const includeProtectedCategories =
    options.includeProtectedCategories ?? redactionProfile === 'full';
  const includeMoodTags = options.includeMoodTags ?? false;
  const includeNotes = options.includeNotes ?? redactionProfile === 'full';
  const includeAttachmentBinaries =
    options.includeAttachmentBinaries ?? redactionProfile === 'full';
  const selectedDomains = normalizeSelectedDomains(options.selectedDomains, includeMoodTags);
  if (selectedDomains.length === 0) {
    throw new Error('Select at least one data category before generating a GDPR export.');
  }

  const domains = buildDomainRecords(input, {
    includeMoodTags,
    includeNotes,
    includeProtectedCategories,
    includeAttachmentBinaries,
  });
  const selectedSet = new Set<DataAccessDomain>(selectedDomains);
  const dataFiles = Object.entries(domains)
    .filter(([domain]) => selectedSet.has(domain as DataAccessDomain))
    .map(([domain, records]) => makeJsonFile(domain, records));
  const attachmentFiles =
    selectedSet.has('attachments') && includeAttachmentBinaries
      ? (input.attachments ?? [])
          .filter((attachment) => attachment.bytes)
          .map((attachment) => ({
            path:
              'attachments/' +
              sanitizePathSegment(attachment.id) +
              '-' +
              sanitizePathSegment(attachment.fileName),
            bytes: attachment.bytes ?? new Uint8Array(),
            contentType: attachment.contentType,
            recordCount: 1,
            domain: 'attachment_binary',
            description: 'Local attachment binary copied into the package',
          }))
      : [];
  const manifest = buildManifest({
    appVersion: options.appVersion,
    locale,
    generatedAt,
    expiresAt,
    files: [...dataFiles, ...attachmentFiles],
    includeProtectedCategories,
    includeMoodTags,
    includeNotes,
    includeAttachmentBinaries,
    redactionProfile,
    selectedDomains,
    recipient: options.recipient ?? null,
    shareMethod: options.shareMethod ?? 'unknown',
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
    fileName: 'finance-export-' + generatedAt.toISOString().slice(0, 10) + '.zip',
    zipBytes,
    manifest,
  };
}

export function summarizeDataAccessDomains(
  input: DataAccessPackageInput,
): DataAccessDomainSummary[] {
  const domains = buildDomainRecords(input, {
    includeMoodTags: true,
    includeNotes: true,
    includeProtectedCategories: true,
    includeAttachmentBinaries: true,
  });
  return ALL_DOMAINS.map((domain) => ({
    domain,
    label: labelDomain(domain),
    recordCount: domains[domain]?.length ?? 0,
    warning: sensitivityWarning(domain),
    protectedByDefault: ['attachments', 'audit_log', 'mood_tags', 'sync_metadata'].includes(domain),
  }));
}

export function shouldAutoDeletePackage(now: Date, expiresAtIso: string): boolean {
  return now.getTime() >= new Date(expiresAtIso).getTime();
}

export function shouldWarnPackageExpiresSoon(now: Date, expiresAtIso: string): boolean {
  const expiresAt = new Date(expiresAtIso).getTime();
  return (
    now.getTime() >= expiresAt - DATA_ACCESS_WARNING_HOURS * 60 * 60 * 1000 &&
    now.getTime() < expiresAt
  );
}

function normalizeSelectedDomains(
  selectedDomains: readonly DataAccessDomain[] | undefined,
  includeMoodTags: boolean,
): DataAccessDomain[] {
  const source = selectedDomains ?? DEFAULT_DATA_ACCESS_DOMAINS;
  const deduped = Array.from(new Set(source.filter((domain) => ALL_DOMAINS.includes(domain))));
  if (includeMoodTags && !deduped.includes('mood_tags')) deduped.push('mood_tags');
  return includeMoodTags ? deduped : deduped.filter((domain) => domain !== 'mood_tags');
}

function buildDomainRecords(
  input: DataAccessPackageInput,
  options: {
    includeMoodTags: boolean;
    includeNotes: boolean;
    includeProtectedCategories: boolean;
    includeAttachmentBinaries: boolean;
  },
): Record<DataAccessDomain, readonly JsonRecord[]> {
  const transactions = stripSyncFields(input.transactions).map((transaction) =>
    options.includeNotes
      ? transaction
      : redactKeys(transaction, ['note', 'notes', 'memo', 'description']),
  );
  const categories = options.includeProtectedCategories
    ? stripSyncFields(input.categories)
    : stripSyncFields(input.categories).filter((category) => !isProtectedCategory(category));
  return {
    transactions,
    accounts: stripSyncFields(input.accounts),
    budgets: stripSyncFields(input.budgets),
    goals: stripSyncFields(input.goals),
    recurring_rules: stripSyncFields(input.recurringRules ?? []),
    categories,
    tags: Array.from(new Set(input.transactions.flatMap((txn) => normalizeTags(txn.tags)))).map(
      (name) => ({ name }),
    ),
    attachments: (input.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      file_name: attachment.fileName,
      content_type: attachment.contentType,
      package_path:
        options.includeAttachmentBinaries && attachment.bytes
          ? 'attachments/' +
            sanitizePathSegment(attachment.id) +
            '-' +
            sanitizePathSegment(attachment.fileName)
          : null,
      signed_url: options.includeAttachmentBinaries ? (attachment.signedUrl ?? null) : null,
      delivery: options.includeAttachmentBinaries
        ? 'embedded_binary_if_available'
        : 'metadata_only_redacted_default',
    })),
    preferences: stripSyncFields(input.preferences ?? []),
    settings: stripSyncFields(input.settings ?? []),
    consent_records: stripSyncFields(input.consentRecords ?? []),
    audit_log: stripSyncFields(input.auditLog ?? []),
    sync_metadata: stripSyncFields(input.syncMetadata ?? []),
    mood_tags: options.includeMoodTags ? stripSyncFields(input.moodTags ?? []) : [],
  };
}

function normalizeTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];
}

function stripSyncFields(records: readonly JsonRecord[]): JsonRecord[] {
  return records.map((record) =>
    redactKeys(record, ['syncVersion', 'sync_version', 'isSynced', 'is_synced']),
  );
}

function redactKeys(record: JsonRecord, keysToOmit: readonly string[]): JsonRecord {
  const omit = new Set(keysToOmit);
  const next: JsonRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (omit.has(key)) continue;
    next[key] = value;
  }
  return next;
}

function isProtectedCategory(category: JsonRecord): boolean {
  return (
    category.isProtected === true ||
    category.protected === true ||
    category.sensitive === true ||
    category.protectedCategory === true
  );
}

function makeJsonFile(domain: string, records: readonly JsonRecord[]): PackageFile {
  return {
    path: 'data/' + domain + '.json',
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
  includeNotes: boolean;
  includeAttachmentBinaries: boolean;
  redactionProfile: 'redacted' | 'full';
  selectedDomains: readonly DataAccessDomain[];
  recipient: string | null;
  shareMethod: string;
}): DataAccessManifest {
  const selected = [...input.selectedDomains];
  const omitted = ALL_DOMAINS.filter((domain) => !selected.includes(domain));
  const availableOnRequest = omitted.map(labelDomain);
  if (!input.includeMoodTags && !availableOnRequest.includes('Mood tags'))
    availableOnRequest.push('Mood tags');
  if (!input.includeNotes) availableOnRequest.push('Transaction notes');
  if (!input.includeAttachmentBinaries) availableOnRequest.push('Attachment binaries');
  if (!input.includeProtectedCategories) availableOnRequest.push('Protected categories');
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
      notes_included: input.includeNotes,
      attachment_binaries_included: input.includeAttachmentBinaries,
      redaction_profile: input.redactionProfile,
      selected_domains: selected,
      omitted_domains: omitted,
      available_on_request: Array.from(new Set(availableOnRequest)),
      household_scope:
        "Only the requesting user's own contributions are included; other household members' data is excluded.",
      recipient: input.recipient,
      share_method: input.shareMethod,
    },
    coordination_notes: input.includeProtectedCategories
      ? ['Protected categories were explicitly included for this export.']
      : [
          'Protected categories, notes, mood tags, and attachment binaries are redacted by default unless explicitly selected.',
        ],
  };
}

function describeDomain(domain: string): string {
  switch (domain) {
    case 'transactions':
      return 'Transactions owned by the requesting user; notes are present only for full exports';
    case 'accounts':
      return 'Accounts and balances owned by the requesting user';
    case 'budgets':
      return 'Budgets and rollover configuration';
    case 'goals':
      return 'Savings goals and progress';
    case 'recurring_rules':
      return 'Recurring transaction rules';
    case 'categories':
      return 'Categories, excluding protected categories unless explicitly opted in';
    case 'tags':
      return 'Transaction tags derived from exported transactions';
    case 'attachments':
      return 'Receipt and attachment metadata; binaries require explicit opt-in';
    case 'preferences':
      return 'User-facing preferences';
    case 'settings':
      return 'Application settings';
    case 'consent_records':
      return 'GDPR consent state and consent-history records';
    case 'audit_log':
      return "Tamper-evident audit events for the requesting user's own actions";
    case 'sync_metadata':
      return 'Device and last-sync metadata';
    case 'mood_tags':
      return 'Mood tag records included only when explicitly requested';
    default:
      return 'Data access package file';
  }
}

function labelDomain(domain: DataAccessDomain): string {
  switch (domain) {
    case 'accounts':
      return 'Accounts';
    case 'transactions':
      return 'Transactions';
    case 'budgets':
      return 'Budgets';
    case 'goals':
      return 'Goals';
    case 'recurring_rules':
      return 'Recurring rules';
    case 'categories':
      return 'Categories/tags';
    case 'tags':
      return 'Tags';
    case 'settings':
      return 'Settings/preferences';
    case 'preferences':
      return 'Preferences';
    case 'consent_records':
      return 'Consent records';
    case 'attachments':
      return 'Attachments';
    case 'audit_log':
      return 'Audit log';
    case 'sync_metadata':
      return 'Sync metadata';
    case 'mood_tags':
      return 'Mood tags';
  }
}

function sensitivityWarning(domain: DataAccessDomain): string {
  switch (domain) {
    case 'accounts':
      return 'Includes account names and balances.';
    case 'transactions':
      return 'Includes spending patterns and merchant names.';
    case 'attachments':
      return 'Attachment metadata is included; binaries require explicit opt-in.';
    case 'audit_log':
      return 'Shows sensitive security actions and timestamps.';
    case 'sync_metadata':
      return 'May include device and offline status metadata.';
    case 'mood_tags':
      return 'Can reveal wellbeing patterns; off by default.';
    default:
      return 'Review before sharing outside Finance.';
  }
}

function renderReadme(manifest: DataAccessManifest, locale: string): string {
  const title = locale.startsWith('es')
    ? '# Paquete de datos de Finance'
    : locale.startsWith('fr')
      ? '# Package de données Finance'
      : '# Finance data package';
  return (
    title +
    '\n\n' +
    'Generated: ' +
    manifest.generated_at +
    '\n' +
    'Expires: ' +
    manifest.expires_at +
    '\n\n' +
    'This ZIP was generated on your device. It contains the selected data categories and should be treated as sensitive financial information.\n\n' +
    '## Privacy choices\n\n' +
    '- Redaction profile: ' +
    manifest.privacy.redaction_profile +
    '\n' +
    '- Selected domains: ' +
    manifest.privacy.selected_domains.join(', ') +
    '\n' +
    '- Omitted domains: ' +
    (manifest.privacy.omitted_domains.join(', ') || 'none') +
    '\n' +
    '- Protected categories included: ' +
    manifest.privacy.protected_categories_included +
    '\n' +
    '- Mood tags included: ' +
    manifest.privacy.mood_tags_included +
    '\n' +
    '- Notes included: ' +
    manifest.privacy.notes_included +
    '\n' +
    '- Attachment binaries included: ' +
    manifest.privacy.attachment_binaries_included +
    '\n' +
    '- Household scope: ' +
    manifest.privacy.household_scope +
    '\n\n' +
    '## Files\n\n' +
    manifest.contents
      .map(
        (entry) =>
          '- ' +
          entry.path +
          ' — ' +
          entry.description +
          ' (' +
          entry.record_count +
          ' record(s)).',
      )
      .join('\n') +
    '\n'
  );
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
