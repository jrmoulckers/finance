// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ESSENTIAL_MODULE_IDS,
  HIDEABLE_MODULES,
  HIDEABLE_MODULE_CATEGORY_ORDER,
  MODULE_VISIBILITY_STORAGE_KEY,
  countHiddenModules,
  filterByModuleVisibility,
  filterDashboardCards,
  getHideableModulesByCategory,
  getStoredHiddenModuleIds,
  isHideableModule,
  isModuleHidden,
  isModuleVisible,
  persistHiddenModuleIds,
  sanitizeHiddenModuleIds,
  saveHiddenModuleIds,
  setModuleHidden,
} from './module-visibility';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('catalogue', () => {
  it('lists only hideable, non-essential modules', () => {
    for (const module of HIDEABLE_MODULES) {
      expect(ESSENTIAL_MODULE_IDS).not.toContain(module.id);
      expect(isHideableModule(module.id)).toBe(true);
    }
  });

  it('uses unique module ids', () => {
    const ids = HIDEABLE_MODULES.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('assigns every module to a known category', () => {
    for (const module of HIDEABLE_MODULES) {
      expect(HIDEABLE_MODULE_CATEGORY_ORDER).toContain(module.category);
    }
  });

  it('groups modules by category without losing any', () => {
    const grouped = HIDEABLE_MODULE_CATEGORY_ORDER.flatMap((category) =>
      getHideableModulesByCategory(category),
    );
    expect(grouped).toHaveLength(HIDEABLE_MODULES.length);
  });
});

describe('isHideableModule', () => {
  it('rejects essential modules', () => {
    for (const id of ESSENTIAL_MODULE_IDS) {
      expect(isHideableModule(id)).toBe(false);
    }
  });

  it('rejects unknown modules', () => {
    expect(isHideableModule('totally-made-up')).toBe(false);
    expect(isHideableModule('')).toBe(false);
  });

  it('accepts a known optional module', () => {
    expect(isHideableModule('bills')).toBe(true);
  });
});

describe('isModuleHidden / isModuleVisible', () => {
  it('treats an empty hidden set as everything visible', () => {
    const hidden = new Set<string>();
    expect(isModuleHidden('bills', hidden)).toBe(false);
    expect(isModuleVisible('bills', hidden)).toBe(true);
  });

  it('hides a hideable module that is in the set', () => {
    const hidden = new Set(['bills']);
    expect(isModuleHidden('bills', hidden)).toBe(true);
    expect(isModuleVisible('bills', hidden)).toBe(false);
  });

  it('never hides essential modules even if present in the set', () => {
    const hidden = new Set(['dashboard', 'settings', 'accounts', 'transactions']);
    for (const id of ESSENTIAL_MODULE_IDS) {
      expect(isModuleHidden(id, hidden)).toBe(false);
      expect(isModuleVisible(id, hidden)).toBe(true);
    }
  });

  it('ignores unknown ids in the hidden set', () => {
    const hidden = new Set(['ghost-module']);
    expect(isModuleHidden('ghost-module', hidden)).toBe(false);
  });
});

describe('filterByModuleVisibility', () => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'bills', label: 'Bills' },
    { id: 'reports', label: 'Reports' },
    { id: 'settings', label: 'Settings' },
  ];

  it('returns a copy of the list when nothing is hidden', () => {
    const result = filterByModuleVisibility(navItems, new Set());
    expect(result).toEqual(navItems);
    expect(result).not.toBe(navItems);
  });

  it('removes hidden modules while preserving order', () => {
    const result = filterByModuleVisibility(navItems, new Set(['bills']));
    expect(result.map((item) => item.id)).toEqual(['dashboard', 'reports', 'settings']);
  });

  it('keeps essentials even when present in the hidden set', () => {
    const result = filterByModuleVisibility(navItems, new Set(['dashboard', 'settings', 'bills']));
    expect(result.map((item) => item.id)).toEqual(['dashboard', 'reports', 'settings']);
  });

  it('handles every hideable item being hidden', () => {
    const allHidden = new Set(HIDEABLE_MODULES.map((module) => module.id));
    const result = filterByModuleVisibility(navItems, allHidden);
    expect(result.map((item) => item.id)).toEqual(['dashboard', 'settings']);
  });
});

describe('filterDashboardCards', () => {
  const cards = [
    { moduleId: 'net-worth', title: 'Net Worth' },
    { moduleId: 'budgets', title: 'Budget Health' },
    { moduleId: 'debt', title: 'Debt Payoff' },
  ];

  it('drops cards whose module is hidden', () => {
    const result = filterDashboardCards(cards, new Set(['budgets']));
    expect(result.map((card) => card.moduleId)).toEqual(['net-worth', 'debt']);
  });

  it('returns a copy when nothing is hidden', () => {
    const result = filterDashboardCards(cards, new Set());
    expect(result).toEqual(cards);
    expect(result).not.toBe(cards);
  });
});

describe('sanitizeHiddenModuleIds', () => {
  it('drops unknown and essential ids', () => {
    const sanitized = sanitizeHiddenModuleIds(['bills', 'dashboard', 'ghost', 'reports']);
    expect([...sanitized].sort()).toEqual(['bills', 'reports']);
  });

  it('deduplicates ids', () => {
    const sanitized = sanitizeHiddenModuleIds(['bills', 'bills']);
    expect(sanitized.size).toBe(1);
  });
});

describe('setModuleHidden', () => {
  it('adds a hideable id without mutating the input', () => {
    const current = new Set<string>();
    const next = setModuleHidden(current, 'bills', true);
    expect(next.has('bills')).toBe(true);
    expect(current.size).toBe(0);
  });

  it('removes an id when shown', () => {
    const next = setModuleHidden(new Set(['bills', 'reports']), 'bills', false);
    expect(next.has('bills')).toBe(false);
    expect(next.has('reports')).toBe(true);
  });

  it('refuses to hide an essential module', () => {
    const next = setModuleHidden(new Set(), 'dashboard', true);
    expect(next.has('dashboard')).toBe(false);
  });

  it('refuses to hide an unknown module', () => {
    const next = setModuleHidden(new Set(), 'ghost-module', true);
    expect(next.size).toBe(0);
  });
});

describe('countHiddenModules', () => {
  it('counts only hideable ids', () => {
    const hidden = new Set(['bills', 'reports', 'dashboard', 'ghost']);
    expect(countHiddenModules(hidden)).toBe(2);
  });
});

describe('persistence round-trip', () => {
  it('returns an empty set when nothing is stored', () => {
    expect(getStoredHiddenModuleIds().size).toBe(0);
  });

  it('round-trips a hidden set through localStorage', () => {
    saveHiddenModuleIds(new Set(['reports', 'bills']));
    const restored = getStoredHiddenModuleIds();
    expect([...restored].sort()).toEqual(['bills', 'reports']);
  });

  it('persists deterministically as a sorted array', () => {
    saveHiddenModuleIds(new Set(['reports', 'bills', 'goals']));
    const raw = localStorage.getItem(MODULE_VISIBILITY_STORAGE_KEY);
    expect(raw).toBe(JSON.stringify(['bills', 'goals', 'reports']));
  });

  it('drops unknown / essential ids when saving', () => {
    saveHiddenModuleIds(new Set(['bills', 'dashboard', 'ghost']));
    expect([...getStoredHiddenModuleIds()].sort()).toEqual(['bills']);
  });

  it('returns an empty set for malformed JSON', () => {
    localStorage.setItem(MODULE_VISIBILITY_STORAGE_KEY, 'not-json');
    expect(getStoredHiddenModuleIds().size).toBe(0);
  });

  it('returns an empty set when the stored value is not an array', () => {
    localStorage.setItem(MODULE_VISIBILITY_STORAGE_KEY, JSON.stringify({ bills: true }));
    expect(getStoredHiddenModuleIds().size).toBe(0);
  });

  it('ignores non-string array entries', () => {
    localStorage.setItem(MODULE_VISIBILITY_STORAGE_KEY, JSON.stringify(['bills', 42, null]));
    expect([...getStoredHiddenModuleIds()]).toEqual(['bills']);
  });
});

describe('persistHiddenModuleIds', () => {
  it('stores the sanitized set and dispatches a change event', () => {
    const events: string[][] = [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent<string[]>).detail);
    };
    window.addEventListener('finance:module-visibility-change', listener);

    const stored = persistHiddenModuleIds(new Set(['bills', 'dashboard', 'ghost']));

    window.removeEventListener('finance:module-visibility-change', listener);

    expect([...stored]).toEqual(['bills']);
    expect([...getStoredHiddenModuleIds()]).toEqual(['bills']);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(['bills']);
  });
});
