// SPDX-License-Identifier: BUSL-1.1

/**
 * Peer-to-peer (Venmo / Cash App) import engine.
 *
 * Pure, dependency-light TypeScript. The pipeline is:
 *
 *   1. {@link parseP2PCsv}        — tolerant CSV → {@link P2PParsedRow}[]
 *   2. {@link classifyRow}        — spending vs reimbursement vs transfer
 *   3. {@link netReimbursements}  — fold matched reimbursements into net groups
 *   4. {@link buildP2PImportPlan} — orchestrates 1–3 into a recomputable plan
 *
 * Reimbursements (and transfers) are flagged so callers can keep them out of
 * budget, cash-flow and insight totals. All money is integer cents — never
 * floating point. Banker's rounding is delegated to the shared currency parser.
 */

import { parseCsv } from './csv-parser';
import { parseCurrencyToCents, parseDate } from './import/csv-parser';
import type {
  P2PClassification,
  P2PClassifiedRow,
  P2PClassifyOptions,
  P2PFlowType,
  P2PImportableTransaction,
  P2PImportOptions,
  P2PImportPlan,
  P2PImportSummary,
  P2PNetGroup,
  P2PNetOptions,
  P2POverride,
  P2PParsedRow,
  P2PParseError,
  P2PParseResult,
  P2PProvider,
} from './p2p-import-types';

export type {
  P2PClassification,
  P2PClassifiedRow,
  P2PClassifyOptions,
  P2PFlowType,
  P2PImportableTransaction,
  P2PImportOptions,
  P2PImportPlan,
  P2PImportSummary,
  P2PNetGroup,
  P2PNetOptions,
  P2POverride,
  P2PParsedRow,
  P2PParseError,
  P2PParseResult,
  P2PProvider,
} from './p2p-import-types';

// ---------------------------------------------------------------------------
// Keyword dictionaries (lower-case, normalized)
// ---------------------------------------------------------------------------

/** Strong "you owe me / I owe you / we split this" signals. */
const STRONG_REIMBURSE_KEYWORDS = [
  'split',
  'splitting',
  'splits',
  'split the',
  'share',
  'shared',
  'sharing',
  'my half',
  'your half',
  'my share',
  'your share',
  'my portion',
  'my part',
  'reimburse',
  'reimbursement',
  'reimbursing',
  'owe',
  'owed',
  'you owe',
  'i owe',
  'owe you',
  'pay you back',
  'paid you back',
  'pay me back',
  'paying back',
  'back for',
  'got you',
  'got u',
  'cover for',
  'covered',
  'settle up',
  'settling up',
  'chip in',
  'chipin',
  'iou',
  'venmo me',
  'cash app me',
] as const;

/**
 * Outflow phrases that mean *you are repaying your own share* (a pass-through),
 * as opposed to fronting a shared cost. These reclassify an outflow as a
 * reimbursement so it stays out of the budget.
 */
const OUTFLOW_PASS_THROUGH_KEYWORDS = [
  'pay you back',
  'paid you back',
  'paying back',
  'back for',
  'my half',
  'my share',
  'my portion',
  'my part',
  'i owe',
  'owe you',
  'reimburse',
  'reimbursing',
  'settle up',
  'settling up',
  'iou',
  'cover for',
] as const;

/** Categories that are *often* shared but are not proof of a reimbursement. */
const SHARED_EXPENSE_KEYWORDS = [
  'rent',
  'utilities',
  'utility',
  'electric',
  'electricity',
  'power bill',
  'wifi',
  'internet',
  'water bill',
  'cable',
  'dinner',
  'lunch',
  'brunch',
  'breakfast',
  'pizza',
  'drinks',
  'bar tab',
  'tab',
  'groceries',
  'grocery',
  'uber',
  'lyft',
  'ride',
  'taxi',
  'cab',
  'ticket',
  'tickets',
  'concert',
  'hotel',
  'airbnb',
  'trip',
  'vacation',
  'parking',
] as const;

/** Phrases that indicate a bank cash-out / top-up rather than spending. */
const TRANSFER_KEYWORDS = [
  'cash out',
  'cashout',
  'cash in',
  'cashin',
  'transfer to bank',
  'transfer from bank',
  'bank transfer',
  'instant transfer',
  'standard transfer',
  'add cash',
  'add money',
  'added money',
  'reload',
  'top up',
  'top-up',
  'atm',
  'withdraw',
  'withdrawal',
  'to bank',
  'from bank',
] as const;

/** Tokens ignored when comparing notes for netting. */
const NOTE_STOPWORDS = new Set([
  'the',
  'for',
  'and',
  'you',
  'your',
  'our',
  'with',
  'this',
  'that',
  'from',
  'was',
  'are',
  'but',
  'split',
  'share',
  'back',
  'pay',
  'paid',
  'owe',
]);

const DEFAULT_NET_WINDOW_DAYS = 30;
const NET_MATCH_THRESHOLD = 30;

// ---------------------------------------------------------------------------
// Column resolution
// ---------------------------------------------------------------------------

interface ColumnMap {
  date: number;
  type: number;
  note: number;
  from: number;
  to: number;
  name: number;
  amount: number;
  fee: number;
}

const VENMO_HINTS = ['datetime', 'note', 'amount total'] as const;
const CASHAPP_HINTS = ['transaction type', 'net amount', 'notes'] as const;

/** Lower-case + collapse non-alphanumerics to single spaces. */
function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Find a column index by trying each alias as an exact then partial match. */
function findColumn(headers: readonly string[], aliases: readonly string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const exact = normalized.indexOf(alias);
    if (exact >= 0) return exact;
  }
  for (const alias of aliases) {
    const partial = normalized.findIndex((header) => header.includes(alias));
    if (partial >= 0) return partial;
  }
  return -1;
}

/**
 * Detect which P2P provider a header row came from. Returns `generic` for any
 * file that at least exposes a date and an amount column, or null otherwise.
 */
export function detectP2PProvider(headers: readonly string[]): P2PProvider | null {
  const normalized = headers.map(normalizeHeader);
  const has = (alias: string): boolean => normalized.some((header) => header.includes(alias));

  const venmoScore = VENMO_HINTS.filter((hint) => has(hint)).length;
  const cashAppScore = CASHAPP_HINTS.filter((hint) => has(hint)).length;

  if (venmoScore >= 2 && venmoScore >= cashAppScore) return 'venmo';
  if (cashAppScore >= 2) return 'cashapp';

  const hasDate = findColumn(headers, ['date', 'datetime', 'time']) >= 0;
  const hasAmount = findColumn(headers, ['amount', 'amount total', 'net amount', 'total']) >= 0;
  if (hasDate && hasAmount) return 'generic';

  return null;
}

function resolveColumns(headers: readonly string[]): ColumnMap {
  return {
    date: findColumn(headers, ['datetime', 'date', 'transaction date', 'time']),
    type: findColumn(headers, ['transaction type', 'type']),
    note: findColumn(headers, ['note', 'notes', 'description', 'memo']),
    from: findColumn(headers, ['from']),
    to: findColumn(headers, ['to']),
    name: findColumn(headers, [
      'name',
      'name of sender receiver',
      'counterparty',
      'payee',
      'sender',
      'recipient',
    ]),
    amount: findColumn(headers, ['amount total', 'amount', 'net amount', 'total']),
    fee: findColumn(headers, ['amount fee', 'fee', 'fees']),
  };
}

// ---------------------------------------------------------------------------
// Flow type & direction
// ---------------------------------------------------------------------------

function deriveFlowType(typeText: string, note: string): P2PFlowType {
  const haystack = `${normalizeHeader(typeText)} ${normalizeHeader(note)}`;
  if (/\b(transfer|cash out|cashout|cash in|cashin|withdraw|reload|atm)\b/.test(haystack)) {
    return 'transfer';
  }
  if (/\b(request|charge)\b/.test(normalizeHeader(typeText))) {
    return 'request';
  }
  return 'payment';
}

/** Direction hint from an explicit type phrase: +1 inflow, -1 outflow, 0 none. */
function directionHintFromType(typeText: string): -1 | 0 | 1 {
  const normalized = normalizeHeader(typeText);
  if (/\b(received|cash in|cashin|deposit|incoming|refund)\b/.test(normalized)) return 1;
  if (/\b(sent|cash out|cashout|withdraw|outgoing|paid out)\b/.test(normalized)) return -1;
  return 0;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Tolerantly parse a Venmo / Cash App (or generic) CSV export into structured
 * rows. Malformed rows (missing date or unparseable amount) are collected as
 * errors instead of throwing.
 */
export function parseP2PCsv(content: string, providerHint?: P2PProvider): P2PParseResult {
  const { headers, rows } = parseCsv(content);
  const provider = providerHint ?? detectP2PProvider(headers);

  if (provider === null) {
    return {
      provider: null,
      rows: [],
      errors: [{ line: 0, message: 'Unrecognized P2P CSV: no date/amount columns found', raw: '' }],
    };
  }

  const columns = resolveColumns(headers);
  const parsed: P2PParsedRow[] = [];
  const errors: P2PParseError[] = [];

  rows.forEach((row, rowIndex) => {
    const line = rowIndex + 1;
    const cell = (col: number): string => (col >= 0 ? (row[col] ?? '').trim() : '');

    const dateRaw = cell(columns.date);
    const amountRaw = cell(columns.amount);

    const date = parseDate(dateRaw);
    if (!date) {
      errors.push({ line, message: 'Missing or invalid date', raw: row.join(',') });
      return;
    }

    const parsedAmount = parseCurrencyToCents(amountRaw);
    if (parsedAmount === null) {
      errors.push({ line, message: 'Missing or invalid amount', raw: row.join(',') });
      return;
    }

    const typeText = cell(columns.type);
    const note = cell(columns.note);
    const flowType = deriveFlowType(typeText, note);

    // Resolve a signed amount. Trust an explicit type direction hint when it
    // conflicts with the parsed sign (e.g. Cash App "Sent" rows that are
    // exported as positive numbers).
    let amountCents = parsedAmount;
    const hint = directionHintFromType(typeText);
    if (hint !== 0 && amountCents !== 0 && Math.sign(amountCents) !== hint) {
      amountCents = hint * Math.abs(amountCents);
    }

    // Counterparty: Venmo splits across From/To by direction; everyone else
    // uses a single name column.
    let counterparty = cell(columns.name);
    if (!counterparty) {
      counterparty = amountCents < 0 ? cell(columns.to) : cell(columns.from);
    }
    if (!counterparty) {
      counterparty = amountCents < 0 ? cell(columns.from) : cell(columns.to);
    }

    const feeCents = Math.abs(parseCurrencyToCents(cell(columns.fee)) ?? 0);

    parsed.push({
      index: rowIndex,
      provider,
      date,
      note,
      counterparty,
      amountCents,
      feeCents,
      flowType,
      rawFields: buildRawFields(headers, row),
    });
  });

  return { provider, rows: parsed, errors };
}

function buildRawFields(
  headers: readonly string[],
  row: readonly string[],
): Record<string, string> {
  const fields: Record<string, string> = {};
  const width = Math.max(headers.length, row.length);
  for (let i = 0; i < width; i++) {
    const key = i < headers.length && headers[i] ? headers[i] : `col_${i}`;
    fields[key] = row[i] ?? '';
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

interface ClassificationResult {
  readonly classification: P2PClassification;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classify a single parsed row as spending, reimbursement, or transfer using
 * note keywords, the flow type, the amount direction, and (optionally) the
 * user's own names to spot self-transfers. Pure and deterministic.
 */
export function classifyRow(row: P2PParsedRow, options?: P2PClassifyOptions): ClassificationResult {
  const note = normalizeName(row.note);

  // --- Transfers (highest priority) ---------------------------------------
  if (row.flowType === 'transfer') {
    return { classification: 'transfer', confidence: 95, reasons: ['Marked as a bank transfer'] };
  }
  if (includesAny(note, TRANSFER_KEYWORDS)) {
    return {
      classification: 'transfer',
      confidence: 85,
      reasons: ['Note describes a bank cash-out or top-up'],
    };
  }
  const selfNames = (options?.selfNames ?? []).map(normalizeName).filter(Boolean);
  const counterparty = normalizeName(row.counterparty);
  if (counterparty && selfNames.includes(counterparty)) {
    return {
      classification: 'transfer',
      confidence: 80,
      reasons: ['Counterparty matches one of your own accounts (self-transfer)'],
    };
  }

  const hasStrong = includesAny(note, STRONG_REIMBURSE_KEYWORDS);
  const hasSharedNoun = includesAny(note, SHARED_EXPENSE_KEYWORDS);

  // --- Inflows ------------------------------------------------------------
  if (row.amountCents > 0) {
    if (hasStrong) {
      return {
        classification: 'reimbursement',
        confidence: 90,
        reasons: ['Incoming payment with a split / owe note'],
      };
    }
    if (row.flowType === 'request') {
      return {
        classification: 'reimbursement',
        confidence: 82,
        reasons: ['You requested this money — collecting a shared cost'],
      };
    }
    if (hasSharedNoun) {
      return {
        classification: 'reimbursement',
        confidence: 72,
        reasons: ['Incoming payment references a commonly-shared expense'],
      };
    }
    return {
      classification: 'reimbursement',
      confidence: 55,
      reasons: ['Incoming P2P payment treated as a reimbursement by default'],
    };
  }

  // --- Outflows -----------------------------------------------------------
  if (row.amountCents < 0) {
    if (includesAny(note, OUTFLOW_PASS_THROUGH_KEYWORDS)) {
      return {
        classification: 'reimbursement',
        confidence: 76,
        reasons: ['Outgoing payment looks like repaying your own share'],
      };
    }
    if (hasStrong) {
      return {
        classification: 'spending',
        confidence: 65,
        reasons: ['Outgoing shared payment — incoming repayments will be netted against it'],
      };
    }
    if (hasSharedNoun) {
      return {
        classification: 'spending',
        confidence: 60,
        reasons: ['Outgoing payment for a commonly-shared category — review for splits'],
      };
    }
    return {
      classification: 'spending',
      confidence: 75,
      reasons: ['Outgoing payment treated as spending'],
    };
  }

  // --- Zero amount --------------------------------------------------------
  return { classification: 'transfer', confidence: 50, reasons: ['Zero-amount entry'] };
}

/**
 * Resolve an override to an effective classification. `split-with-friends`
 * depends on direction: an outflow you made is a shared cost you fronted (kept
 * as spending so repayments net against it), while an inflow is a friend
 * repaying you (a reimbursement).
 */
function overrideToClassification(override: P2POverride, amountCents: number): P2PClassification {
  switch (override) {
    case 'split-with-friends':
      return amountCents < 0 ? 'spending' : 'reimbursement';
    case 'roommate-reimbursement':
      return 'reimbursement';
    case 'transfer':
      return 'transfer';
    case 'spending':
      return 'spending';
    default:
      return 'spending';
  }
}

// ---------------------------------------------------------------------------
// Netting / pairing
// ---------------------------------------------------------------------------

interface NettableRow {
  readonly index: number;
  readonly date: string;
  readonly note: string;
  readonly counterparty: string;
  readonly amountCents: number;
  readonly effectiveClassification: P2PClassification;
}

function noteTokens(note: string): Set<string> {
  const tokens = normalizeName(note)
    .split(' ')
    .filter((token) => token.length >= 3 && !NOTE_STOPWORDS.has(token));
  return new Set(tokens);
}

function noteOverlap(a: string, b: string): number {
  const setA = noteTokens(a);
  const setB = noteTokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function daysApart(a: string, b: string): number {
  const msPerDay = 86_400_000;
  const ta = new Date(`${a}T00:00:00Z`).getTime();
  const tb = new Date(`${b}T00:00:00Z`).getTime();
  return Math.abs(Math.round((ta - tb) / msPerDay));
}

/**
 * Match reimbursement inflows to spending outflows and fold them into net
 * groups. A reimbursement is paired to the best-scoring spend that occurred no
 * later than the reimbursement (within `windowDays`), sharing either the same
 * counterparty or overlapping note tokens.
 *
 * Returns the net groups plus a map of every row index to its group id.
 */
export function netReimbursements(
  rows: readonly NettableRow[],
  options?: P2PNetOptions,
): { groups: P2PNetGroup[]; groupByIndex: Map<number, string> } {
  const windowDays = options?.windowDays ?? DEFAULT_NET_WINDOW_DAYS;

  const anchors = rows
    .filter((row) => row.effectiveClassification === 'spending' && row.amountCents < 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);

  const reimbursements = rows
    .filter((row) => row.effectiveClassification === 'reimbursement' && row.amountCents > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);

  const membersByAnchor = new Map<number, number[]>();
  const reimbursedByAnchor = new Map<number, number>();

  for (const inflow of reimbursements) {
    let bestAnchor: NettableRow | null = null;
    let bestScore = -1;

    for (const anchor of anchors) {
      // Reimbursements should not precede the spend they offset.
      if (anchor.date > inflow.date) continue;
      const dd = daysApart(anchor.date, inflow.date);
      if (dd > windowDays) continue;

      const sameCounterparty =
        normalizeName(anchor.counterparty).length > 0 &&
        normalizeName(anchor.counterparty) === normalizeName(inflow.counterparty);
      const overlap = noteOverlap(anchor.note, inflow.note);

      if (!sameCounterparty && overlap === 0) continue;

      let score = 0;
      if (sameCounterparty) score += 60;
      score += Math.round(overlap * 50);
      score += Math.max(0, 10 - dd); // recency bonus

      if (score > bestScore) {
        bestScore = score;
        bestAnchor = anchor;
      }
    }

    if (bestAnchor && bestScore >= NET_MATCH_THRESHOLD) {
      const list = membersByAnchor.get(bestAnchor.index) ?? [];
      list.push(inflow.index);
      membersByAnchor.set(bestAnchor.index, list);
      reimbursedByAnchor.set(
        bestAnchor.index,
        (reimbursedByAnchor.get(bestAnchor.index) ?? 0) + inflow.amountCents,
      );
    }
  }

  const groups: P2PNetGroup[] = [];
  const groupByIndex = new Map<number, string>();

  for (const anchor of anchors) {
    const members = membersByAnchor.get(anchor.index);
    if (!members || members.length === 0) continue;

    const gross = Math.abs(anchor.amountCents);
    const reimbursed = reimbursedByAnchor.get(anchor.index) ?? 0;
    const net = Math.max(0, gross - reimbursed);
    const over = Math.max(0, reimbursed - gross);
    const id = `net-${anchor.index}`;

    groups.push({
      id,
      anchorIndex: anchor.index,
      memberIndices: members.slice().sort((a, b) => a - b),
      counterparty: anchor.counterparty,
      note: anchor.note,
      date: anchor.date,
      grossSpendingCents: gross,
      reimbursedCents: reimbursed,
      netSpendingCents: net,
      overReimbursedCents: over,
    });

    groupByIndex.set(anchor.index, id);
    for (const memberIndex of members) {
      groupByIndex.set(memberIndex, id);
    }
  }

  return { groups, groupByIndex };
}

// ---------------------------------------------------------------------------
// Plan assembly
// ---------------------------------------------------------------------------

function summarize(
  rows: readonly P2PClassifiedRow[],
  groups: readonly P2PNetGroup[],
): P2PImportSummary {
  let spendingCount = 0;
  let reimbursementCount = 0;
  let transferCount = 0;
  let grossSpendingCents = 0;
  let reimbursementCents = 0;
  let excludedFromBudgetCents = 0;

  const netByAnchor = new Map<number, number>();
  const anchoredMagnitude = new Map<number, number>();
  for (const group of groups) {
    netByAnchor.set(group.anchorIndex, group.netSpendingCents);
    anchoredMagnitude.set(group.anchorIndex, group.grossSpendingCents);
  }

  let netSpendingCents = 0;

  for (const row of rows) {
    switch (row.effectiveClassification) {
      case 'spending': {
        spendingCount++;
        if (row.amountCents < 0) {
          grossSpendingCents += Math.abs(row.amountCents);
          netSpendingCents += netByAnchor.has(row.index)
            ? (netByAnchor.get(row.index) ?? 0)
            : Math.abs(row.amountCents);
        }
        break;
      }
      case 'reimbursement': {
        reimbursementCount++;
        excludedFromBudgetCents += Math.abs(row.amountCents);
        if (row.amountCents > 0) reimbursementCents += row.amountCents;
        break;
      }
      case 'transfer': {
        transferCount++;
        break;
      }
    }
  }

  return {
    totalRows: rows.length,
    spendingCount,
    reimbursementCount,
    transferCount,
    netGroupCount: groups.length,
    grossSpendingCents,
    reimbursementCents,
    netSpendingCents,
    excludedFromBudgetCents,
  };
}

function assemblePlan(parsed: P2PParseResult, options?: P2PImportOptions): P2PImportPlan {
  const overrides = options?.overrides ?? {};

  // First pass: classification + override resolution.
  const classifications = parsed.rows.map((row) => {
    const result = classifyRow(row, options);
    const override = overrides[row.index] ?? null;
    const effectiveClassification = override
      ? overrideToClassification(override, row.amountCents)
      : result.classification;
    return { row, result, override, effectiveClassification };
  });

  const nettable: NettableRow[] = classifications.map(({ row, effectiveClassification }) => ({
    index: row.index,
    date: row.date,
    note: row.note,
    counterparty: row.counterparty,
    amountCents: row.amountCents,
    effectiveClassification,
  }));

  const { groups, groupByIndex } = netReimbursements(nettable, options);

  const rows: P2PClassifiedRow[] = classifications.map(
    ({ row, result, override, effectiveClassification }) => ({
      ...row,
      classification: result.classification,
      confidence: result.confidence,
      reasons: result.reasons,
      override,
      effectiveClassification,
      excludedFromBudget: effectiveClassification !== 'spending',
      netGroupId: groupByIndex.get(row.index) ?? null,
    }),
  );

  return {
    provider: parsed.provider,
    rows,
    groups,
    errors: parsed.errors,
    summary: summarize(rows, groups),
  };
}

/**
 * Parse, classify, and net a P2P CSV export into a recomputable import plan.
 */
export function buildP2PImportPlan(content: string, options?: P2PImportOptions): P2PImportPlan {
  const parsed = parseP2PCsv(content, options?.provider);
  return assemblePlan(parsed, options);
}

/**
 * Recompute a plan after the user changes overrides, without re-parsing the
 * source file. The plan's parsed rows are reused verbatim.
 */
export function applyOverrides(
  plan: P2PImportPlan,
  overrides: Readonly<Record<number, P2POverride>>,
  options?: P2PClassifyOptions & P2PNetOptions,
): P2PImportPlan {
  const parsed: P2PParseResult = {
    provider: plan.provider,
    rows: plan.rows.map(stripClassification),
    errors: plan.errors,
  };
  return assemblePlan(parsed, { ...options, overrides });
}

function stripClassification(row: P2PClassifiedRow): P2PParsedRow {
  return {
    index: row.index,
    provider: row.provider,
    date: row.date,
    note: row.note,
    counterparty: row.counterparty,
    amountCents: row.amountCents,
    feeCents: row.feeCents,
    flowType: row.flowType,
    rawFields: row.rawFields,
  };
}

/**
 * Produce the budget-affecting transactions to save. Each spending outflow
 * becomes one expense at its net (post-reimbursement) amount; reimbursements
 * and transfers are excluded so they never distort the budget. Fully
 * reimbursed spends (net zero) are omitted.
 */
export function buildImportableTransactions(plan: P2PImportPlan): P2PImportableTransaction[] {
  const netByAnchor = new Map<number, P2PNetGroup>();
  for (const group of plan.groups) {
    netByAnchor.set(group.anchorIndex, group);
  }

  const importable: P2PImportableTransaction[] = [];

  for (const row of plan.rows) {
    if (row.effectiveClassification !== 'spending' || row.amountCents >= 0) continue;

    const group = netByAnchor.get(row.index);
    const gross = Math.abs(row.amountCents);
    const net = group ? group.netSpendingCents : gross;
    if (net <= 0) continue;

    importable.push({
      anchorIndex: row.index,
      date: row.date,
      payee: row.counterparty,
      note: row.note,
      amountCents: -net,
      reimbursedCents: group ? group.reimbursedCents : 0,
      isNetted: group != null,
    });
  }

  return importable;
}
