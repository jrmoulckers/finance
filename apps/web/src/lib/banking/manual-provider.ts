// SPDX-License-Identifier: BUSL-1.1

/**
 * Manual import provider — implements {@link BankConnectionProvider} for
 * file-based imports (CSV, OFX, QIF).
 *
 * This provider wraps the existing `lib/csv-parser` to allow CSV data
 * to flow through the same provider abstraction as automated aggregators.
 * It also includes lightweight inline parsers for OFX and QIF so the
 * provider works standalone without external dependencies.
 *
 * **No network calls** — all data originates from user-supplied file content.
 *
 * @module banking/manual-provider
 */

import type {
  AccountBalance,
  BankAccount,
  BankConnection,
  BankConnectionProvider,
  BankTransaction,
  ConnectionConfig,
  ConnectionSession,
  ConnectionStatus,
  DateRange,
  ProviderFeatures,
  ProviderHealth,
  RefreshResult,
} from './types';
import { dollarsToCents, mapCategory, normalizeDate } from './transaction-normalizer';

// ---------------------------------------------------------------------------
// Internal storage (in-memory, per-instance)
// ---------------------------------------------------------------------------

interface ImportedData {
  accounts: BankAccount[];
  transactions: BankTransaction[];
}

/** Supported file formats. */
export type ImportFormat = 'csv' | 'ofx' | 'qif';

// ---------------------------------------------------------------------------
// Lightweight inline parsers
// ---------------------------------------------------------------------------

/**
 * Parse CSV content into raw transaction-like rows.
 *
 * This is a simplified parser for the provider interface. For full RFC 4180
 * compliance, use `lib/csv-parser`.
 *
 * @internal
 */
function parseCsv(content: string): Array<{ date: string; amount: string; description: string }> {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  // Assume first line is header
  const headerLine = lines[0].toLowerCase();
  const delimiter = headerLine.includes('\t') ? '\t' : ',';
  const headers = headerLine.split(delimiter).map((h) => h.trim());

  const dateIdx = headers.findIndex((h) => ['date', 'transaction date', 'posted date'].includes(h));
  const amountIdx = headers.findIndex((h) => ['amount', 'value', 'transaction amount'].includes(h));
  const descIdx = headers.findIndex((h) =>
    ['description', 'memo', 'payee', 'name', 'transaction description'].includes(h),
  );

  return lines.slice(1).map((line) => {
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
    return {
      date: cols[dateIdx] ?? '',
      amount: cols[amountIdx] ?? '0',
      description: cols[descIdx] ?? '',
    };
  });
}

/**
 * Parse OFX/QFX content into raw transaction-like rows.
 *
 * This parser handles the SGML-ish subset of OFX 1.x used by most banks.
 *
 * @internal
 */
function parseOfx(
  content: string,
): Array<{ date: string; amount: string; description: string; id?: string }> {
  const results: Array<{
    date: string;
    amount: string;
    description: string;
    id?: string;
  }> = [];

  // Split on STMTTRN blocks
  const txBlocks = content.split(/<STMTTRN>/i).slice(1);

  for (const block of txBlocks) {
    const endIdx = block.search(/<\/STMTTRN>/i);
    const txContent = endIdx >= 0 ? block.slice(0, endIdx) : block;

    const getTag = (tag: string): string => {
      const re = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
      const m = txContent.match(re);
      return m?.[1]?.trim() ?? '';
    };

    const rawDate = getTag('DTPOSTED');
    // OFX dates are YYYYMMDD or YYYYMMDDHHMMSS
    const date =
      rawDate.length >= 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : rawDate;

    results.push({
      date,
      amount: getTag('TRNAMT'),
      description: getTag('NAME') || getTag('MEMO'),
      id: getTag('FITID') || undefined,
    });
  }

  return results;
}

/**
 * Parse QIF content into raw transaction-like rows.
 *
 * QIF records are delimited by `^` lines.
 *
 * @internal
 */
function parseQif(content: string): Array<{ date: string; amount: string; description: string }> {
  const results: Array<{
    date: string;
    amount: string;
    description: string;
  }> = [];

  const records = content.split('^').filter((r) => r.trim());

  for (const record of records) {
    const lines = record
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    let date = '';
    let amount = '0';
    let description = '';

    for (const line of lines) {
      const code = line[0];
      const value = line.slice(1).trim();
      switch (code) {
        case 'D':
          date = value;
          break;
        case 'T':
        case '$':
          amount = value.replace(/,/g, '');
          break;
        case 'P':
        case 'M':
          if (!description) description = value;
          break;
      }
    }

    if (date || amount !== '0') {
      results.push({ date, amount, description });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// ManualImportProvider
// ---------------------------------------------------------------------------

/**
 * Banking provider that imports transactions from user-uploaded files.
 *
 * Usage:
 * ```ts
 * const provider = new ManualImportProvider();
 * const session = await provider.initializeConnection({
 *   metadata: { content: csvString, format: 'csv', institutionName: 'My Bank' },
 * });
 * const connection = await provider.completeConnection(session.sessionId);
 * const txs = await provider.getTransactions(connection.id, { from: '2024-01-01', to: '2024-12-31' });
 * ```
 */
export class ManualImportProvider implements BankConnectionProvider {
  readonly id = 'manual';
  readonly name = 'Manual Import';
  readonly supportedCountries: readonly string[] = []; // Format-agnostic
  readonly features: ProviderFeatures = {
    realTimeBalance: false,
    transactionWebhooks: false,
    investmentAccounts: false,
    creditCards: false,
    loans: false,
    bnpl: false,
    crypto: false,
    internationalBanks: false,
  };

  /** @internal session staging area */
  private readonly sessions = new Map<
    string,
    { content: string; format: ImportFormat; institutionName: string }
  >();

  /** @internal imported data per connection */
  private readonly data = new Map<string, ImportedData>();

  /**
   * Initialize a manual import "connection".
   *
   * Expects `config.metadata` to contain:
   * - `content` — raw file content as a string
   * - `format` — `"csv"`, `"ofx"`, or `"qif"`
   * - `institutionName` (optional) — display name for the institution
   */
  async initializeConnection(config: ConnectionConfig): Promise<ConnectionSession> {
    const meta = config.metadata ?? {};
    const content = meta.content as string | undefined;
    const format = (meta.format as ImportFormat | undefined) ?? 'csv';
    const institutionName = (meta.institutionName as string | undefined) ?? 'Manual Import';

    if (!content || typeof content !== 'string') {
      throw new Error('Manual import requires "content" in metadata.');
    }

    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, { content, format, institutionName });

    return { sessionId };
  }

  /**
   * Complete the import by parsing the staged file content.
   */
  async completeConnection(sessionId: string): Promise<BankConnection> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No manual import session found for "${sessionId}".`);
    }

    const connectionId = crypto.randomUUID();
    const accountId = crypto.randomUUID();

    // Parse based on format
    let rawTxs: Array<{
      date: string;
      amount: string;
      description: string;
      id?: string;
    }>;

    switch (session.format) {
      case 'ofx':
        rawTxs = parseOfx(session.content);
        break;
      case 'qif':
        rawTxs = parseQif(session.content);
        break;
      case 'csv':
      default:
        rawTxs = parseCsv(session.content);
        break;
    }

    const transactions: BankTransaction[] = rawTxs.map((raw, idx) => ({
      id: crypto.randomUUID(),
      providerTransactionId: raw.id ?? `manual-${sessionId}-${idx}`,
      accountId,
      date: normalizeDate(raw.date),
      amountCents: dollarsToCents(parseFloat(raw.amount) || 0),
      description: raw.description || 'Imported Transaction',
      category: mapCategory(undefined),
      pending: false,
    }));

    const account: BankAccount = {
      id: accountId,
      providerAccountId: `manual-${accountId}`,
      name: `${session.institutionName} Account`,
      type: 'checking',
      currency: 'USD',
      institution: session.institutionName,
    };

    this.data.set(connectionId, { accounts: [account], transactions });
    this.sessions.delete(sessionId);

    return {
      id: connectionId,
      providerId: this.id,
      providerConnectionId: `manual-${connectionId}`,
      institutionName: session.institutionName,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  /** Manual connections cannot be refreshed. */
  async refreshConnection(connectionId: string): Promise<RefreshResult> {
    return { connectionId, success: true, newTransactions: 0 };
  }

  /** Remove stored import data. */
  async removeConnection(connectionId: string): Promise<void> {
    this.data.delete(connectionId);
  }

  /** Return accounts for the imported connection. */
  async getAccounts(connectionId: string): Promise<BankAccount[]> {
    return this.data.get(connectionId)?.accounts ?? [];
  }

  /** Return transactions within the specified date range. */
  async getTransactions(connectionId: string, dateRange: DateRange): Promise<BankTransaction[]> {
    const all = this.data.get(connectionId)?.transactions ?? [];
    return all.filter((tx) => tx.date >= dateRange.from && tx.date <= dateRange.to);
  }

  /** Manual imports do not track balances. */
  async getBalances(connectionId: string): Promise<AccountBalance[]> {
    const accounts = this.data.get(connectionId)?.accounts ?? [];
    return accounts.map((a) => ({
      accountId: a.id,
      currentCents: 0,
      availableCents: 0,
      currency: a.currency,
      asOf: new Date().toISOString(),
    }));
  }

  /** Manual connections are always "active" once imported. */
  async getConnectionStatus(_connectionId: string): Promise<ConnectionStatus> {
    return { status: 'active', message: 'Manual import is always active.' };
  }

  /** Manual provider is always healthy (no external dependency). */
  async getProviderHealth(): Promise<ProviderHealth> {
    return {
      isHealthy: true,
      message: 'Manual import provider with no external dependency.',
      checkedAt: new Date().toISOString(),
    };
  }
}
