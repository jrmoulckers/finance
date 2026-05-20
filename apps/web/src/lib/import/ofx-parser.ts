// SPDX-License-Identifier: BUSL-1.1

/**
 * OFX/QFX file format parser.
 *
 * Parses Open Financial Exchange (OFX) and Quicken Financial Exchange (QFX)
 * files into a normalised transaction format. QFX is a subset of OFX with
 * Intuit-specific extensions — the parser handles both identically.
 *
 * Runs entirely client-side to preserve user financial data privacy.
 * No data is sent to any server during parsing.
 *
 * @see https://www.ofx.net/downloads.html OFX specification
 * @module lib/import/ofx-parser
 * References: #1602
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single parsed OFX transaction. */
export interface OfxTransaction {
  /** Transaction type (DEBIT, CREDIT, etc.). */
  type: string;
  /** Posted date as ISO 8601 string (YYYY-MM-DD). */
  datePosted: string;
  /** User-initiated date (if available), ISO 8601. */
  dateUser: string | null;
  /** Transaction amount in decimal string (e.g., "-42.50"). */
  amount: string;
  /** Financial institution transaction ID. */
  fitId: string;
  /** Payee / description name. */
  name: string;
  /** Memo field (optional). */
  memo: string | null;
  /** Check number (optional). */
  checkNum: string | null;
  /** Reference number (optional). */
  refNum: string | null;
}

/** Parsed OFX account information. */
export interface OfxAccount {
  /** Bank ID / routing number. */
  bankId: string | null;
  /** Account ID (masked for display — NEVER store full account numbers). */
  accountId: string;
  /** Account type (CHECKING, SAVINGS, CREDITLINE, etc.). */
  accountType: string | null;
}

/** Result of parsing an OFX/QFX file. */
export interface OfxParseResult {
  /** Account information (if present). */
  account: OfxAccount | null;
  /** Parsed transactions. */
  transactions: OfxTransaction[];
  /** Currency code (ISO 4217). */
  currency: string;
  /** Statement date range start. */
  dateStart: string | null;
  /** Statement date range end. */
  dateEnd: string | null;
  /** Total number of transactions parsed. */
  totalCount: number;
  /** Errors encountered during parsing. */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse an OFX date string to ISO 8601 (YYYY-MM-DD).
 * OFX dates can be: YYYYMMDD, YYYYMMDDHHMMSS, YYYYMMDDHHMMSS.XXX[GMT:offset]
 */
function parseOfxDate(raw: string | null): string | null {
  if (!raw) return null;

  // Strip timezone info in brackets
  const cleaned = raw.replace(/\[.*\]/, '').trim();

  if (cleaned.length < 8) return null;

  const year = cleaned.substring(0, 4);
  const month = cleaned.substring(4, 6);
  const day = cleaned.substring(6, 8);

  // Validate ranges
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);

  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  return `${year}-${month}-${day}`;
}

/**
 * Extract the text content between OFX tags.
 * OFX uses SGML-style tags: <TAG>value (no closing tag for simple values).
 */
function extractTag(content: string, tag: string): string | null {
  // Try self-closing style: <TAG>value</TAG>
  const closingRegex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const closingMatch = content.match(closingRegex);
  if (closingMatch) return closingMatch[1].trim();

  // Try SGML style: <TAG>value\n (value runs to next tag or newline)
  const sgmlRegex = new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i');
  const sgmlMatch = content.match(sgmlRegex);
  if (sgmlMatch) return sgmlMatch[1].trim();

  return null;
}

/**
 * Extract all occurrences of an aggregate tag (e.g., <STMTTRN>...</STMTTRN>).
 */
function extractAllBlocks(content: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi');
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse an OFX or QFX file content string into structured data.
 *
 * Handles both SGML-based OFX 1.x and XML-based OFX 2.x formats.
 * All parsing is done client-side — no data leaves the browser.
 *
 * @param content Raw file content as a string.
 * @returns Parsed OFX result with transactions and account info.
 */
export function parseOfx(content: string): OfxParseResult {
  const errors: string[] = [];
  const transactions: OfxTransaction[] = [];

  // Normalise line endings
  const normalised = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Extract currency
  const currency = extractTag(normalised, 'CURDEF') ?? 'USD';

  // Extract account info
  let account: OfxAccount | null = null;
  const bankAcctBlock =
    extractAllBlocks(normalised, 'BANKACCTFROM')[0] ??
    extractAllBlocks(normalised, 'CCACCTFROM')[0];

  if (bankAcctBlock) {
    const accountId = extractTag(bankAcctBlock, 'ACCTID');
    if (accountId) {
      account = {
        bankId: extractTag(bankAcctBlock, 'BANKID'),
        // Mask account ID for display — show last 4 only
        accountId: accountId.length > 4 ? `****${accountId.slice(-4)}` : accountId,
        accountType: extractTag(bankAcctBlock, 'ACCTTYPE'),
      };
    }
  }

  // Extract date range
  const dateStart = parseOfxDate(extractTag(normalised, 'DTSTART'));
  const dateEnd = parseOfxDate(extractTag(normalised, 'DTEND'));

  // Extract transactions
  const transBlocks = extractAllBlocks(normalised, 'STMTTRN');

  for (let i = 0; i < transBlocks.length; i++) {
    const block = transBlocks[i];

    const type = extractTag(block, 'TRNTYPE') ?? 'OTHER';
    const datePosted = parseOfxDate(extractTag(block, 'DTPOSTED'));
    const dateUser = parseOfxDate(extractTag(block, 'DTUSER'));
    const amount = extractTag(block, 'TRNAMT');
    const fitId = extractTag(block, 'FITID') ?? '';
    const name = extractTag(block, 'NAME') ?? extractTag(block, 'PAYEE') ?? '';
    const memo = extractTag(block, 'MEMO');
    const checkNum = extractTag(block, 'CHECKNUM');
    const refNum = extractTag(block, 'REFNUM');

    if (!datePosted) {
      errors.push(`Row ${i + 1}: Missing or invalid posted date`);
      continue;
    }

    if (!amount) {
      errors.push(`Row ${i + 1}: Missing transaction amount`);
      continue;
    }

    transactions.push({
      type,
      datePosted,
      dateUser,
      amount,
      fitId,
      name,
      memo,
      checkNum,
      refNum,
    });
  }

  return {
    account,
    transactions,
    currency,
    dateStart,
    dateEnd,
    totalCount: transactions.length,
    errors,
  };
}

/**
 * Parse a QFX file. QFX is functionally identical to OFX for our purposes.
 *
 * @param content Raw QFX file content.
 * @returns Parsed result (same structure as OFX).
 */
export function parseQfx(content: string): OfxParseResult {
  return parseOfx(content);
}
