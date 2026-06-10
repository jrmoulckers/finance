// SPDX-License-Identifier: BUSL-1.1

export interface DataChangeMessage {
  readonly type: 'data_change';
  readonly tables: readonly string[];
  readonly timestamp: number;
  readonly origin: string;
}

export interface DataChangeEvent {
  readonly type: 'data_change';
  readonly tables: readonly string[];
  readonly timestamp: number;
  readonly source: 'local' | 'cross-tab' | 'sync';
}

export interface NotifyDataChangeOptions {
  readonly source?: DataChangeEvent['source'];
  readonly broadcast?: boolean;
}

const CHANNEL_NAME = 'finance-live-sync';
const STORAGE_EVENT_KEY = 'finance-live-sync:event';
const TABLE_REFERENCE_PATTERN =
  /\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+(["'`\[]?[a-zA-Z_][\w]*["'`\]]?)/gi;
const MUTATION_SQL_PATTERN = /^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b/i;

const listeners = new Set<(event: DataChangeEvent) => void>();
const tabId =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;

let channel: BroadcastChannel | null = null;
let isInitialized = false;

function normalizeTableName(table: string): string {
  return table
    .replace(/["'`\[\]]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeTables(tables: readonly string[]): string[] {
  return Array.from(
    new Set(tables.map((table) => normalizeTableName(table)).filter((table) => table.length > 0)),
  );
}

export function extractTablesFromSql(sql: string): string[] {
  const tables = new Set<string>();
  const pattern = new RegExp(TABLE_REFERENCE_PATTERN);
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sql)) !== null) {
    const tableName = normalizeTableName(match[1] ?? '');
    if (tableName.length > 0) {
      tables.add(tableName);
    }
  }

  return [...tables];
}

export function isMutationSql(sql: string): boolean {
  return MUTATION_SQL_PATTERN.test(sql);
}

function emit(event: DataChangeEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

function handleIncomingMessage(message: DataChangeMessage | null | undefined): void {
  if (!message || message.type !== 'data_change' || message.origin === tabId) {
    return;
  }

  const tables = normalizeTables(message.tables);
  if (tables.length === 0) {
    return;
  }

  emit({
    type: 'data_change',
    tables,
    timestamp: message.timestamp,
    source: 'cross-tab',
  });
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== STORAGE_EVENT_KEY || !event.newValue) {
    return;
  }

  try {
    handleIncomingMessage(JSON.parse(event.newValue) as DataChangeMessage);
  } catch {
    // Ignore malformed cross-tab payloads.
  }
}

function ensureTransport(): void {
  if (isInitialized || typeof window === 'undefined') {
    return;
  }

  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener('message', (event: MessageEvent<DataChangeMessage>) => {
      handleIncomingMessage(event.data);
    });
  } else {
    window.addEventListener('storage', handleStorageEvent);
  }

  isInitialized = true;
}

function broadcastMessage(message: DataChangeMessage): void {
  if (typeof window === 'undefined') {
    return;
  }

  ensureTransport();

  if (channel !== null) {
    channel.postMessage(message);
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(message));
    window.localStorage.removeItem(STORAGE_EVENT_KEY);
  } catch {
    // localStorage may be unavailable; local notifications still work.
  }
}

export function subscribeToDataChanges(listener: (event: DataChangeEvent) => void): () => void {
  ensureTransport();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeToIncomingCrossTabChanges(
  listener: (event: DataChangeEvent) => void,
): () => void {
  return subscribeToDataChanges((event) => {
    if (event.source === 'cross-tab') {
      listener(event);
    }
  });
}

export function notifyDataChange(
  tables: readonly string[],
  options: NotifyDataChangeOptions = {},
): void {
  const normalizedTables = normalizeTables(tables);
  if (normalizedTables.length === 0) {
    return;
  }

  const timestamp = Date.now();
  const source = options.source ?? 'local';
  emit({
    type: 'data_change',
    tables: normalizedTables,
    timestamp,
    source,
  });

  if (options.broadcast === false) {
    return;
  }

  broadcastMessage({
    type: 'data_change',
    tables: normalizedTables,
    timestamp,
    origin: tabId,
  });
}

export function resetCrossTabSyncForTesting(): void {
  listeners.clear();

  if (channel !== null) {
    channel.close();
    channel = null;
  }

  if (typeof window !== 'undefined') {
    window.removeEventListener('storage', handleStorageEvent);
    try {
      window.localStorage.removeItem(STORAGE_EVENT_KEY);
    } catch {
      // Ignore cleanup failures.
    }
  }

  isInitialized = false;
}
