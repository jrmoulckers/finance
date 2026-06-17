// SPDX-License-Identifier: BUSL-1.1

/**
 * OFX/QFX (Open Financial Exchange) parser.
 *
 * Extracts STMTTRN (statement transaction) records from OFX XML/SGML content.
 * Handles both SGML-style OFX (v1) and XML-style OFX (v2).
 *
 * All monetary values are returned as integer cents.
 * Pure functions — no side effects, no file I/O.
 */

import { ImportError, ImportFormat, ImportResult, ParsedTransaction } from './types';
import { bankersRound } from './utils';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse OFX or QFX content and extract financial transactions.
 *
 * Supports both SGML-style (OFX v1.x) and XML-style (OFX v2.x) formats.
 * Extracts account info, date range, and all STMTTRN records.
 *
 * @param content - Raw OFX/QFX text content.
 * @returns An `ImportResult` with parsed transactions and any errors.
 */
export function parseOfx(content: string): ImportResult {
  const errors: ImportError[] = [];

  // Detect format variant
  const isQfx = content.includes('INTU.BID') || content.includes('INTU.USERID');
  const format = isQfx ? ImportFormat.QFX : ImportFormat.OFX;

  // Extract account ID
  const accountId = extractTagValue(content, 'ACCTID');

  // Extract currency
  const currency =
    extractTagValue(content, 'CURDEF') || extractTagValue(content, 'CURRENCY') || null;

  // Extract date range
  const dtStart = extractTagValue(content, 'DTSTART');
  const dtEnd = extractTagValue(content, 'DTEND');
  const startDate = dtStart ? parseOfxDate(dtStart) : null;
  const endDate = dtEnd ? parseOfxDate(dtEnd) : null;

  // Extract all STMTTRN blocks
  const stmtTrnBlocks = extractBlocks(content, 'STMTTRN');

  if (stmtTrnBlocks.length === 0) {
    errors.push({
      line: null,
      message: 'No STMTTRN (transaction) records found in OFX content',
      severity: 'warning',
      rawValue: null,
    });
  }

  const transactions: ParsedTransaction[] = [];

  for (let i = 0; i < stmtTrnBlocks.length; i++) {
    const block = stmtTrnBlocks[i];
    const result = parseStmtTrn(block, i + 1);

    if (result.error) {
      errors.push(result.error);
    }

    if (result.transaction) {
      transactions.push(result.transaction);
    }
  }

  return {
    format,
    transactions,
    errors,
    totalRecords: stmtTrnBlocks.length,
    accountId: accountId || null,
    startDate,
    endDate,
    currency,
  };
}

// ---------------------------------------------------------------------------
// STMTTRN parsing
// ---------------------------------------------------------------------------

interface StmtTrnResult {
  transaction: ParsedTransaction | null;
  error: ImportError | null;
}

/** Parse a single STMTTRN block into a ParsedTransaction. */
function parseStmtTrn(block: string, recordNumber: number): StmtTrnResult {
  const dtPosted = extractTagValue(block, 'DTPOSTED');
  const trnAmt = extractTagValue(block, 'TRNAMT');
  const fitId = extractTagValue(block, 'FITID') || extractTagValue(block, 'REFNUM');
  const name = extractTagValue(block, 'NAME');
  const memo = extractTagValue(block, 'MEMO');
  const trnType = extractTagValue(block, 'TRNTYPE');
  const checkNum = extractTagValue(block, 'CHECKNUM');

  if (!dtPosted) {
    return {
      transaction: null,
      error: {
        line: recordNumber,
        message: `STMTTRN #${recordNumber}: Missing DTPOSTED (date)`,
        severity: 'error',
        rawValue: block.slice(0, 100),
      },
    };
  }

  if (!trnAmt) {
    return {
      transaction: null,
      error: {
        line: recordNumber,
        message: `STMTTRN #${recordNumber}: Missing TRNAMT (amount)`,
        severity: 'error',
        rawValue: block.slice(0, 100),
      },
    };
  }

  const date = parseOfxDate(dtPosted);
  if (!date) {
    return {
      transaction: null,
      error: {
        line: recordNumber,
        message: `STMTTRN #${recordNumber}: Invalid DTPOSTED: "${dtPosted}"`,
        severity: 'error',
        rawValue: dtPosted,
      },
    };
  }

  const parsedAmountCents = parseOfxAmount(trnAmt);
  const amountCents = parsedAmountCents === null ? null : normalizeAmountSign(parsedAmountCents, trnType);
  if (amountCents === null) {
    return {
      transaction: null,
      error: {
        line: recordNumber,
        message: `STMTTRN #${recordNumber}: Invalid TRNAMT: "${trnAmt}"`,
        severity: 'error',
        rawValue: trnAmt,
      },
    };
  }

  const rawFields: Record<string, string> = {};
  for (const tag of ['DTPOSTED', 'TRNAMT', 'FITID', 'NAME', 'MEMO', 'TRNTYPE', 'CHECKNUM', 'REFNUM']) {
    const val = extractTagValue(block, tag);
    if (val) rawFields[tag] = val;
  }

  return {
    transaction: {
      date,
      amountCents,
      description: name || memo || '',
      sourceId: fitId || null,
      category: null,
      checkNumber: checkNum || null,
      type: trnType || null,
      memo: memo || null,
      balanceCents: null,
      rawFields,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// OFX extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract the text content of an OFX tag.
 *
 * Handles both SGML style (`<TAG>value`) and XML style (`<TAG>value</TAG>`).
 *
 * @param content - The OFX text to search.
 * @param tag - The tag name (e.g., "ACCTID", "TRNAMT").
 * @returns The tag value, or null if not found.
 */
export function extractTagValue(content: string, tag: string): string | null {
  const tagPattern = `${escapeRegex(tag)}|[A-Z0-9_]+:${escapeRegex(tag)}`;
  // XML-style: <TAG>value</TAG>, allowing lowercase, namespaces, and attributes.
  const xmlPattern = new RegExp(
    `<(?:${tagPattern})(?:\\s+[^>]*)?>\\s*([^<]+?)\\s*</(?:${tagPattern})>`,
    'i',
  );
  const xmlMatch = content.match(xmlPattern);
  if (xmlMatch) return decodeOfxEntities(xmlMatch[1].trim());

  // SGML-style: <TAG>value (terminated by newline or next tag)
  const sgmlPattern = new RegExp(`<(?:${tagPattern})(?:\\s+[^>]*)?>\\s*([^<\\r\\n]+)`, 'i');
  const sgmlMatch = content.match(sgmlPattern);
  if (sgmlMatch) return decodeOfxEntities(sgmlMatch[1].trim());

  return null;
}

/**
 * Extract all blocks between `<TAG>` and `</TAG>` (or the next `<TAG>`).
 *
 * @param content - The OFX text to search.
 * @param tag - The block tag name (e.g., "STMTTRN").
 * @returns Array of block content strings.
 */
export function extractBlocks(content: string, tag: string): string[] {
  const blocks: string[] = [];
  const tagPattern = `${escapeRegex(tag)}|[A-Z0-9_]+:${escapeRegex(tag)}`;
  const openPattern = new RegExp(`<(?:${tagPattern})(?:\\s+[^>]*)?>`, 'gi');
  const closePattern = new RegExp(`</(?:${tagPattern})>`, 'i');

  let openMatch: RegExpExecArray | null;
  while ((openMatch = openPattern.exec(content)) !== null) {
    const contentStart = openMatch.index + openMatch[0].length;
    const remainder = content.slice(contentStart);
    const closeMatch = remainder.match(closePattern);
    const nextOpenIndex = content.slice(contentStart).search(openPattern);
    let endIdx = closeMatch ? contentStart + (closeMatch.index ?? 0) : -1;

    if (endIdx < 0 || (nextOpenIndex >= 0 && contentStart + nextOpenIndex < endIdx)) {
      endIdx = nextOpenIndex >= 0 ? contentStart + nextOpenIndex : content.length;
    }

    blocks.push(content.slice(contentStart, endIdx).trim());
    openPattern.lastIndex = endIdx;
  }

  return blocks;
}

/**
 * Parse an OFX date string into ISO 8601 format (YYYY-MM-DD).
 *
 * OFX dates are in the format YYYYMMDD or YYYYMMDDHHMMSS[.XXX[:tz]].
 *
 * @param ofxDate - OFX date string.
 * @returns ISO 8601 date string, or null if parsing fails.
 */
export function parseOfxDate(ofxDate: string): string | null {
  const cleaned = ofxDate
    .trim()
    .replace(/\[[^\]]*\]$/, '')
    .replace(/[+-]\d{4}$/, '')
    .replace(/\.\d+$/, '')
    .replace(/[^0-9]/g, '');

  if (cleaned.length < 8) return null;

  const year = parseInt(cleaned.slice(0, 4), 10);
  const month = parseInt(cleaned.slice(4, 6), 10);
  const day = parseInt(cleaned.slice(6, 8), 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

/**
 * Parse an OFX amount string into integer cents.
 *
 * OFX amounts are decimal strings (e.g., "-123.45", "50.00").
 * Uses Banker's rounding for fractional cents.
 *
 * @param ofxAmount - OFX amount string.
 * @returns Integer cents, or null if parsing fails.
 */
export function parseOfxAmount(ofxAmount: string): number | null {
  const cleaned = ofxAmount.trim().replace(/,/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return bankersRound(num * 100);
}

function normalizeAmountSign(amountCents: number, transactionType: string | null): number {
  const type = transactionType?.trim().toUpperCase() ?? '';
  if (
    amountCents > 0 &&
    ['DEBIT', 'CHECK', 'PAYMENT', 'POS', 'ATM', 'FEE', 'SRVCHG', 'WITHDRAWAL'].includes(type)
  ) {
    return -amountCents;
  }
  if (amountCents < 0 && ['CREDIT', 'DEP', 'DIRECTDEP', 'INT', 'DIV'].includes(type)) {
    return Math.abs(amountCents);
  }
  return amountCents;
}

function decodeOfxEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
