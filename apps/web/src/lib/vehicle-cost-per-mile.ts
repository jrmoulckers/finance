// SPDX-License-Identifier: BUSL-1.1

/**
 * Vehicle operating cost-per-mile and maintenance tracking for gig drivers.
 *
 * Provides:
 *   - quick categorization of vehicle expenses (gas, maintenance, repairs,
 *     tires, washes, insurance, registration, lease/depreciation, phone
 *     allocation, tolls, parking),
 *   - fixed vs. variable cost classification,
 *   - cost-per-mile and cost-per-active-shift metrics,
 *   - odometer-milestone maintenance reminders.
 *
 * Cost data is derived from the locally-modeled transaction stream (tagged
 * vehicle expenses) — no remote data sources. All monetary values are integer
 * cents (never floats). Miles / odometer readings are non-monetary.
 *
 * Reference: issue #2139.
 */

// ---------------------------------------------------------------------------
// Categories & behavior
// ---------------------------------------------------------------------------

export type VehicleCostCategory =
  | 'fuel'
  | 'maintenance'
  | 'repairs'
  | 'tires'
  | 'wash'
  | 'tolls'
  | 'parking'
  | 'insurance'
  | 'registration'
  | 'depreciation'
  | 'lease'
  | 'phone'
  | 'other';

/**
 * Whether a cost varies with usage/mileage (`variable`) or is incurred per
 * period regardless of how much you drive (`fixed`).
 */
export type VehicleCostBehavior = 'fixed' | 'variable';

interface VehicleCategoryRule {
  readonly label: string;
  readonly behavior: VehicleCostBehavior;
  readonly keywords: readonly string[];
}

export const VEHICLE_COST_RULES: Record<VehicleCostCategory, VehicleCategoryRule> = {
  fuel: {
    label: 'Fuel',
    behavior: 'variable',
    keywords: [
      'gas',
      'fuel',
      'gasoline',
      'petrol',
      'shell',
      'chevron',
      'exxon',
      'bp',
      'arco',
      'mobil',
      'costco gas',
    ],
  },
  maintenance: {
    label: 'Maintenance',
    behavior: 'variable',
    keywords: [
      'oil change',
      'maintenance',
      'service',
      'tune-up',
      'tune up',
      'filter',
      'fluids',
      'jiffy lube',
      'valvoline',
    ],
  },
  repairs: {
    label: 'Repairs',
    behavior: 'variable',
    keywords: ['repair', 'mechanic', 'brake', 'transmission', 'engine', 'body shop', 'alignment'],
  },
  tires: {
    label: 'Tires',
    behavior: 'variable',
    keywords: ['tire', 'tires', 'wheel', 'discount tire', 'rotation'],
  },
  wash: {
    label: 'Car wash',
    behavior: 'variable',
    keywords: ['car wash', 'wash', 'detail', 'detailing'],
  },
  tolls: {
    label: 'Tolls',
    behavior: 'variable',
    keywords: ['toll', 'turnpike', 'ezpass', 'e-zpass', 'fastrak', 'sunpass'],
  },
  parking: {
    label: 'Parking',
    behavior: 'variable',
    keywords: ['parking', 'garage', 'meter'],
  },
  insurance: {
    label: 'Insurance',
    behavior: 'fixed',
    keywords: [
      'insurance',
      'geico',
      'progressive',
      'allstate',
      'state farm',
      'rideshare insurance',
    ],
  },
  registration: {
    label: 'Registration',
    behavior: 'fixed',
    keywords: ['registration', 'dmv', 'tags', 'license plate', 'smog', 'emissions'],
  },
  depreciation: {
    label: 'Depreciation',
    behavior: 'fixed',
    keywords: ['depreciation'],
  },
  lease: {
    label: 'Lease / payment',
    behavior: 'fixed',
    keywords: ['lease', 'car payment', 'auto loan', 'vehicle payment'],
  },
  phone: {
    label: 'Phone allocation',
    behavior: 'fixed',
    keywords: ['phone', 'mobile', 'verizon', 'at&t', 't-mobile', 'cell', 'wireless'],
  },
  other: {
    label: 'Other vehicle',
    behavior: 'variable',
    keywords: [],
  },
};

const VEHICLE_CATEGORY_ORDER = Object.keys(VEHICLE_COST_RULES) as VehicleCostCategory[];

/** Tag that flags a transaction as a vehicle operating expense. */
export const VEHICLE_EXPENSE_TAG = 'vehicle-expense';

/** Custom-field keys used to persist vehicle-expense metadata on a transaction. */
export const VEHICLE_COST_FIELDS = {
  category: 'vehicleCostCategory',
  odometer: 'vehicleOdometer',
} as const;

export function getVehicleCostBehavior(category: VehicleCostCategory): VehicleCostBehavior {
  return VEHICLE_COST_RULES[category].behavior;
}

export function getVehicleCategoryLabel(category: VehicleCostCategory): string {
  return VEHICLE_COST_RULES[category].label;
}

export function getVehicleCategoryOptions(): Array<{
  value: VehicleCostCategory;
  label: string;
  behavior: VehicleCostBehavior;
}> {
  return VEHICLE_CATEGORY_ORDER.map((category) => ({
    value: category,
    label: getVehicleCategoryLabel(category),
    behavior: getVehicleCostBehavior(category),
  }));
}

// ---------------------------------------------------------------------------
// Expense entries
// ---------------------------------------------------------------------------

export interface VehicleExpenseEntry {
  readonly id: string;
  /** Calendar date (YYYY-MM-DD). */
  readonly date: string;
  readonly category: VehicleCostCategory;
  /** Cost in cents (always stored as a positive magnitude). */
  readonly amountCents: number;
  /** Optional odometer reading captured with the expense. */
  readonly odometer?: number | null;
  readonly note?: string;
}

/** Minimal transaction shape needed to classify a vehicle expense. */
export interface VehicleTransactionInput {
  readonly id: string;
  readonly date: string;
  readonly payee: string | null;
  readonly note: string | null;
  readonly amountCents: number;
  readonly type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  readonly tags: readonly string[];
  readonly customFields: Readonly<Record<string, string>> | null;
  readonly categoryName?: string | null;
}

function parseVehicleCategory(raw: string | undefined): VehicleCostCategory | null {
  if (!raw) {
    return null;
  }
  return VEHICLE_CATEGORY_ORDER.includes(raw as VehicleCostCategory)
    ? (raw as VehicleCostCategory)
    : null;
}

function normalizeText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ')
    .toLowerCase();
}

function parseOdometer(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Infer a vehicle cost category from a transaction's payee / note / category /
 * tags using keyword matching. Returns `null` when nothing matches.
 */
export function inferVehicleCategory(
  transaction: Pick<VehicleTransactionInput, 'payee' | 'note' | 'tags' | 'categoryName'>,
): VehicleCostCategory | null {
  const text = normalizeText([
    transaction.payee,
    transaction.note,
    transaction.categoryName,
    transaction.tags.join(' '),
  ]);

  if (text.length === 0) {
    return null;
  }

  let best: { category: VehicleCostCategory; score: number } | null = null;
  for (const category of VEHICLE_CATEGORY_ORDER) {
    const score = VEHICLE_COST_RULES[category].keywords.reduce(
      (total, keyword) => total + (text.includes(keyword) ? 1 : 0),
      0,
    );
    if (score > 0 && (best === null || score > best.score)) {
      best = { category, score };
    }
  }

  return best?.category ?? null;
}

/**
 * Build a {@link VehicleExpenseEntry} from a transaction.
 *
 * Only `EXPENSE` transactions are considered. By default a transaction must be
 * explicitly flagged as a vehicle expense (via {@link VEHICLE_EXPENSE_TAG} or a
 * stored {@link VEHICLE_COST_FIELDS.category}) to avoid mis-counting personal
 * spending. Pass `{ inferUntagged: true }` to also classify untagged
 * transactions whose payee/note clearly match a vehicle category.
 */
export function classifyVehicleExpense(
  transaction: VehicleTransactionInput,
  options: { inferUntagged?: boolean } = {},
): VehicleExpenseEntry | null {
  if (transaction.type !== 'EXPENSE') {
    return null;
  }

  const customFields = transaction.customFields ?? {};
  const storedCategory = parseVehicleCategory(customFields[VEHICLE_COST_FIELDS.category]);
  const isFlagged =
    transaction.tags.includes(VEHICLE_EXPENSE_TAG) ||
    customFields[VEHICLE_COST_FIELDS.category] !== undefined;

  if (!isFlagged && !options.inferUntagged) {
    return null;
  }

  const category =
    storedCategory ?? inferVehicleCategory(transaction) ?? (isFlagged ? 'other' : null);
  if (category === null) {
    return null;
  }

  return {
    id: transaction.id,
    date: transaction.date,
    category,
    amountCents: Math.abs(Math.round(transaction.amountCents)),
    odometer: parseOdometer(customFields[VEHICLE_COST_FIELDS.odometer]),
    note: transaction.note?.trim() || transaction.payee?.trim() || '',
  };
}

// ---------------------------------------------------------------------------
// Cost-per-mile summary
// ---------------------------------------------------------------------------

export interface VehicleCategorySummary {
  readonly category: VehicleCostCategory;
  readonly label: string;
  readonly behavior: VehicleCostBehavior;
  readonly amountCents: number;
  readonly transactionCount: number;
  /** Cost per mile for this category (cents); null when miles is 0. */
  readonly costPerMileCents: number | null;
}

export interface VehicleCostSummary {
  readonly totalCostCents: number;
  readonly fixedCostCents: number;
  readonly variableCostCents: number;
  readonly milesDriven: number;
  readonly activeShifts: number;
  /** Total cost per mile (cents); null when miles is 0. */
  readonly costPerMileCents: number | null;
  /** Variable cost per mile (cents); null when miles is 0. */
  readonly variableCostPerMileCents: number | null;
  /** Total cost per active shift (cents); null when shifts is 0. */
  readonly costPerShiftCents: number | null;
  /** Fixed cost per active shift (cents); null when shifts is 0. */
  readonly fixedCostPerShiftCents: number | null;
  readonly byCategory: readonly VehicleCategorySummary[];
}

export interface VehicleCostSummaryInput {
  readonly expenses: readonly VehicleExpenseEntry[];
  /** Total business miles driven for the period (non-monetary). */
  readonly milesDriven: number;
  /** Number of active shifts/sessions worked in the period. */
  readonly activeShifts?: number;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
}

function isWithinPeriod(date: string, startDate?: string | null, endDate?: string | null): boolean {
  if (startDate && date < startDate) {
    return false;
  }
  if (endDate && date > endDate) {
    return false;
  }
  return true;
}

function perUnit(amountCents: number, units: number): number | null {
  return units > 0 ? Math.round(amountCents / units) : null;
}

/**
 * Summarize vehicle operating costs into total / fixed / variable buckets and
 * derive cost-per-mile and cost-per-shift metrics.
 */
export function summarizeVehicleCosts(input: VehicleCostSummaryInput): VehicleCostSummary {
  const milesDriven = Number.isFinite(input.milesDriven) ? Math.max(0, input.milesDriven) : 0;
  const activeShifts =
    Number.isFinite(input.activeShifts) && (input.activeShifts ?? 0) > 0
      ? Math.floor(input.activeShifts as number)
      : 0;

  const inPeriod = input.expenses.filter((expense) =>
    isWithinPeriod(expense.date, input.startDate, input.endDate),
  );

  const totalsByCategory = new Map<VehicleCostCategory, { amountCents: number; count: number }>();
  let totalCostCents = 0;
  let fixedCostCents = 0;
  let variableCostCents = 0;

  for (const expense of inPeriod) {
    const amountCents = Math.abs(Math.round(expense.amountCents));
    totalCostCents += amountCents;

    if (getVehicleCostBehavior(expense.category) === 'fixed') {
      fixedCostCents += amountCents;
    } else {
      variableCostCents += amountCents;
    }

    const existing = totalsByCategory.get(expense.category) ?? { amountCents: 0, count: 0 };
    existing.amountCents += amountCents;
    existing.count += 1;
    totalsByCategory.set(expense.category, existing);
  }

  const byCategory: VehicleCategorySummary[] = VEHICLE_CATEGORY_ORDER.filter((category) =>
    totalsByCategory.has(category),
  ).map((category) => {
    const entry = totalsByCategory.get(category) as { amountCents: number; count: number };
    return {
      category,
      label: getVehicleCategoryLabel(category),
      behavior: getVehicleCostBehavior(category),
      amountCents: entry.amountCents,
      transactionCount: entry.count,
      costPerMileCents: perUnit(entry.amountCents, milesDriven),
    };
  });

  return {
    totalCostCents,
    fixedCostCents,
    variableCostCents,
    milesDriven: Math.round(milesDriven * 10) / 10,
    activeShifts,
    costPerMileCents: perUnit(totalCostCents, milesDriven),
    variableCostPerMileCents: perUnit(variableCostCents, milesDriven),
    costPerShiftCents: perUnit(totalCostCents, activeShifts),
    fixedCostPerShiftCents: perUnit(fixedCostCents, activeShifts),
    byCategory,
  };
}

// ---------------------------------------------------------------------------
// Odometer-milestone maintenance reminders
// ---------------------------------------------------------------------------

/** Default service intervals a gig driver commonly tracks. */
export const DEFAULT_MAINTENANCE_INTERVALS_MILES = {
  oilChange: 5_000,
  tireRotation: 7_500,
  brakeInspection: 20_000,
  tireReplacement: 50_000,
} as const;

export interface MaintenanceInterval {
  readonly id: string;
  readonly label: string;
  /** Miles between services. */
  readonly intervalMiles: number;
  /** Odometer reading at the last completed service. */
  readonly lastServiceOdometer: number;
}

export type MaintenanceStatus = 'ok' | 'due_soon' | 'overdue';

export interface MaintenanceReminder {
  readonly id: string;
  readonly label: string;
  readonly intervalMiles: number;
  readonly lastServiceOdometer: number;
  readonly nextServiceOdometer: number;
  /** Miles until the next service (negative when overdue). */
  readonly milesRemaining: number;
  /** Miles past due (0 when not overdue). */
  readonly milesOverdue: number;
  /** Percent of the interval consumed (0–100+, clamped at 0 minimum). */
  readonly percentUsed: number;
  readonly status: MaintenanceStatus;
}

/**
 * Compute odometer-based maintenance reminders given the current odometer.
 *
 * @param intervals - Tracked service intervals
 * @param currentOdometer - Current odometer reading
 * @param options.dueSoonMiles - Threshold for the `due_soon` status (default 500)
 */
export function computeMaintenanceReminders(
  intervals: readonly MaintenanceInterval[],
  currentOdometer: number,
  options: { dueSoonMiles?: number } = {},
): MaintenanceReminder[] {
  const dueSoonMiles = Math.max(0, options.dueSoonMiles ?? 500);
  const odometer = Number.isFinite(currentOdometer) ? Math.max(0, currentOdometer) : 0;

  return intervals.map((interval) => {
    const intervalMiles = Math.max(1, Math.round(interval.intervalMiles));
    const lastServiceOdometer = Math.max(0, interval.lastServiceOdometer);
    const nextServiceOdometer = lastServiceOdometer + intervalMiles;
    const milesRemaining = Math.round(nextServiceOdometer - odometer);
    const milesOverdue = Math.max(0, -milesRemaining);
    const milesUsed = Math.max(0, odometer - lastServiceOdometer);
    const percentUsed = Math.max(0, Math.round((milesUsed / intervalMiles) * 100));

    let status: MaintenanceStatus;
    if (milesRemaining <= 0) {
      status = 'overdue';
    } else if (milesRemaining <= dueSoonMiles) {
      status = 'due_soon';
    } else {
      status = 'ok';
    }

    return {
      id: interval.id,
      label: interval.label,
      intervalMiles,
      lastServiceOdometer,
      nextServiceOdometer,
      milesRemaining,
      milesOverdue,
      percentUsed,
      status,
    };
  });
}
