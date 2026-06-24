// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { DisplayExchangeRate } from '../display-currency-rollups';
import type { TripBudgetTransaction } from '../trip-country-budget-scope';
import {
  buildTripBudgetView,
  canConvertCurrency,
  collectTripBudgetCountries,
  createTripCountryBudget,
  deleteTripCountryBudget,
  filterTripCountryBudgets,
  getTripBudgetStatus,
  loadTripCountryBudgets,
  parseTripBudgetAmount,
  saveTripCountryBudget,
  setTripCountryBudgetArchived,
  splitTokens,
  TRIP_COUNTRY_BUDGET_STORAGE_KEY,
  type TripBudgetStorageLike,
  type TripCountryBudget,
} from '../trip-country-budgets';

/** In-memory storage double for the localStorage-compatible contract. */
function memoryStorage(initial: Record<string, string> = {}): TripBudgetStorageLike & {
  readonly map: Map<string, string>;
} {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

// 1 THB = 0.03 USD, quoted in MAJOR units. Same precision (2 dp) so minor units
// scale 1:1 in the engine.
const RATES: readonly DisplayExchangeRate[] = [
  { from: 'THB', to: 'USD', rate: 0.03, timestamp: '2026-01-01T00:00:00Z', source: 'static' },
];

function thailandBudget(overrides: Partial<TripCountryBudget> = {}): TripCountryBudget {
  return {
    id: 'trip-thailand',
    name: 'Bangkok Jan–Mar',
    countries: ['TH'],
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    localCurrency: 'THB',
    displayCurrency: 'USD',
    tags: ['trip'],
    budgetLocalCents: 9_000_000,
    archived: false,
    createdAt: '2025-12-01T00:00:00Z',
    ...overrides,
  };
}

function tx(overrides: Partial<TripBudgetTransaction>): TripBudgetTransaction {
  return {
    id: 'tx',
    amountCents: -1_200_000,
    currency: 'THB',
    date: '2026-01-05',
    merchantCountry: 'TH',
    tags: ['trip'],
    kind: 'expense',
    ...overrides,
  };
}

describe('parseTripBudgetAmount', () => {
  it('parses major units into minor units honouring currency decimals', () => {
    expect(parseTripBudgetAmount('1200.50', 'USD')).toBe(120050);
    expect(parseTripBudgetAmount('90000', 'THB')).toBe(9_000_000);
    // JPY has zero fraction digits — no fabricated cents.
    expect(parseTripBudgetAmount('1500', 'JPY')).toBe(1500);
  });

  it('rejects blank or negative values', () => {
    expect(parseTripBudgetAmount('', 'USD')).toBe(0);
    expect(parseTripBudgetAmount('-5', 'USD')).toBe(0);
    expect(parseTripBudgetAmount('abc', 'USD')).toBe(0);
  });
});

describe('splitTokens', () => {
  it('splits comma and newline separated values, trimming blanks', () => {
    expect(splitTokens('TH, vn ,\n  KH ')).toEqual(['TH', 'vn', 'KH']);
    expect(splitTokens('   ')).toEqual([]);
  });
});

describe('createTripCountryBudget', () => {
  it('normalises codes and clamps the target to a non-negative integer', () => {
    const budget = createTripCountryBudget(
      {
        name: '  Vietnam  ',
        countries: ['vn', ' kh '],
        startDate: '2026-04-01',
        endDate: '2026-05-15',
        localCurrency: 'vnd',
        displayCurrency: 'usd',
        budgetLocalCents: 1234.7,
        tags: ['trip'],
      },
      { id: 'id-1', createdAt: '2026-03-01T00:00:00Z' },
    );

    expect(budget.name).toBe('Vietnam');
    expect(budget.countries).toEqual(['VN', 'KH']);
    expect(budget.localCurrency).toBe('VND');
    expect(budget.displayCurrency).toBe('USD');
    expect(budget.budgetLocalCents).toBe(1235);
    expect(budget.archived).toBe(false);
  });
});

describe('trip budget persistence', () => {
  it('saves, loads, archives (preserving history), and deletes', () => {
    const storage = memoryStorage();
    const budget = thailandBudget();

    saveTripCountryBudget(storage, budget);
    expect(loadTripCountryBudgets(storage)).toHaveLength(1);

    const afterArchive = setTripCountryBudgetArchived(storage, budget.id, true);
    expect(afterArchive[0]?.archived).toBe(true);
    // History (target + created timestamp) is preserved through archival.
    expect(afterArchive[0]?.budgetLocalCents).toBe(9_000_000);
    expect(afterArchive[0]?.createdAt).toBe('2025-12-01T00:00:00Z');

    const afterRestore = setTripCountryBudgetArchived(storage, budget.id, false);
    expect(afterRestore[0]?.archived).toBe(false);

    const afterDelete = deleteTripCountryBudget(storage, budget.id);
    expect(afterDelete).toHaveLength(0);
    expect(storage.map.has(TRIP_COUNTRY_BUDGET_STORAGE_KEY)).toBe(false);
  });

  it('returns an empty list for corrupt or missing storage', () => {
    expect(loadTripCountryBudgets(memoryStorage())).toEqual([]);
    expect(
      loadTripCountryBudgets(memoryStorage({ [TRIP_COUNTRY_BUDGET_STORAGE_KEY]: 'not-json' })),
    ).toEqual([]);
  });

  it('keeps budgets sorted by name on save', () => {
    const storage = memoryStorage();
    saveTripCountryBudget(storage, thailandBudget({ id: 'b', name: 'Zanzibar' }));
    saveTripCountryBudget(storage, thailandBudget({ id: 'a', name: 'Argentina' }));
    expect(loadTripCountryBudgets(storage).map((b) => b.name)).toEqual(['Argentina', 'Zanzibar']);
  });
});

describe('filtering', () => {
  const budgets = [
    thailandBudget(),
    thailandBudget({ id: 'vn', name: 'Vietnam', countries: ['VN'], archived: true }),
  ];

  it('collects distinct countries', () => {
    expect(collectTripBudgetCountries(budgets)).toEqual(['TH', 'VN']);
  });

  it('hides archived trips unless explicitly shown', () => {
    expect(
      filterTripCountryBudgets(budgets, { showArchived: false, countryFilter: '' }),
    ).toHaveLength(1);
    expect(
      filterTripCountryBudgets(budgets, { showArchived: true, countryFilter: '' }),
    ).toHaveLength(2);
  });

  it('filters by country code', () => {
    const result = filterTripCountryBudgets(budgets, { showArchived: true, countryFilter: 'vn' });
    expect(result.map((b) => b.id)).toEqual(['vn']);
  });
});

describe('canConvertCurrency', () => {
  it('detects identity and available pairs, and missing rates', () => {
    expect(canConvertCurrency('USD', 'USD', [])).toBe(true);
    expect(canConvertCurrency('THB', 'USD', RATES)).toBe(true);
    expect(canConvertCurrency('USD', 'THB', RATES)).toBe(true); // inverse
    expect(canConvertCurrency('EUR', 'USD', RATES)).toBe(false);
  });
});

describe('buildTripBudgetView', () => {
  it('derives local + display spend from real transactions and a real rate', () => {
    const view = buildTripBudgetView(
      thailandBudget(),
      [
        tx({ id: 'thai', amountCents: -1_200_000 }),
        tx({ id: 'usd', amountCents: -20_00, currency: 'USD' }),
        // excluded — wrong country
        tx({ id: 'other-country', merchantCountry: 'US' }),
      ],
      '2026-01-15',
      RATES,
    );

    expect(view.rollup.includedTransactionIds).toEqual(['thai', 'usd']);
    // ฿12,000.00 + (USD 20 -> THB at inverse 1/0.03 = ฿666.67) = ฿12,666.67
    expect(view.localSpentCents).toBe(1_266_667);
    // ฿12,000 -> $360.00 + $20.00 = $380.00
    expect(view.displaySpentCents).toBe(38_000);
    expect(view.budgetDisplayCents).toBe(270_000); // ฿90,000 -> $2,700
    expect(view.remainingLocalCents).toBe(9_000_000 - 1_266_667);
    expect(view.isOverBudget).toBe(false);
    expect(view.displayConversionAvailable).toBe(true);
    expect(view.unconvertedCurrencies).toEqual([]);
  });

  it('discloses unconvertible transaction currencies instead of dropping them silently', () => {
    const view = buildTripBudgetView(
      thailandBudget({ countries: [] }),
      [tx({ id: 'thai' }), tx({ id: 'eur', currency: 'EUR', merchantCountry: null })],
      '2026-01-15',
      RATES,
    );

    expect(view.rollup.includedTransactionIds).toEqual(['thai']);
    expect(view.unconvertedCurrencies).toEqual(['EUR']);
  });

  it('falls back to local-only when no display rate is available', () => {
    const view = buildTripBudgetView(
      thailandBudget({ displayCurrency: 'EUR' }),
      [tx({ id: 'thai' })],
      '2026-01-15',
      RATES,
    );

    expect(view.displayConversionAvailable).toBe(false);
    expect(view.budgetDisplayCents).toBeNull();
    expect(view.displaySpentCents).toBeNull();
    expect(view.remainingDisplayCents).toBeNull();
    expect(view.localSpentCents).toBe(1_200_000);
  });

  it('flags an over-budget trip', () => {
    const view = buildTripBudgetView(
      thailandBudget({ budgetLocalCents: 1_000_000 }),
      [tx({ id: 'thai', amountCents: -1_200_000 })],
      '2026-01-15',
      RATES,
    );
    expect(view.isOverBudget).toBe(true);
    expect(view.remainingLocalCents).toBeLessThan(0);
    expect(view.percentUsed).toBe(120);
  });
});

describe('getTripBudgetStatus', () => {
  it('derives lifecycle status from dates and archived flag', () => {
    const budget = thailandBudget();
    expect(getTripBudgetStatus(budget, '2025-12-15')).toBe('upcoming');
    expect(getTripBudgetStatus(budget, '2026-02-01')).toBe('active');
    expect(getTripBudgetStatus(budget, '2026-04-15')).toBe('ended');
    expect(getTripBudgetStatus({ ...budget, archived: true }, '2026-02-01')).toBe('archived');
  });
});
