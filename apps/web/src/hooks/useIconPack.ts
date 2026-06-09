// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  FLUENT_FILLED,
  FLUENT_REGULAR,
  ICON_PACK_PREFERENCE_KEY,
  IOS_SF_SYMBOLS,
  MATERIAL_SYMBOLS_OUTLINED,
  MATERIAL_SYMBOLS_ROUNDED,
  MATERIAL_SYMBOLS_SHARP,
  STANDARD_LUCIDE,
  type IconPackId,
} from '../icons/tokens';

export type WebIconPackId = Exclude<IconPackId, typeof IOS_SF_SYMBOLS>;

export interface UserSettings {
  iconPackId: WebIconPackId;
}

export interface IconPackOption {
  id: WebIconPackId;
  label: string;
  description: string;
}

export const DEFAULT_ICON_PACK_ID: WebIconPackId = STANDARD_LUCIDE;

export const WEB_ICON_PACK_OPTIONS: readonly IconPackOption[] = [
  {
    id: STANDARD_LUCIDE,
    label: 'Standard (Lucide)',
    description: 'Balanced open-source line icons for every platform.',
  },
  {
    id: MATERIAL_SYMBOLS_OUTLINED,
    label: 'Material Symbols (Outlined)',
    description: 'Google Material icons with crisp outlined forms.',
  },
  {
    id: MATERIAL_SYMBOLS_ROUNDED,
    label: 'Material Symbols (Rounded)',
    description: 'Friendly Material icons with rounded corners.',
  },
  {
    id: MATERIAL_SYMBOLS_SHARP,
    label: 'Material Symbols (Sharp)',
    description: 'Angular Material icons with a precise silhouette.',
  },
  {
    id: FLUENT_REGULAR,
    label: 'Fluent (Regular)',
    description: 'Microsoft Fluent regular icons for a Windows-like feel.',
  },
  {
    id: FLUENT_FILLED,
    label: 'Fluent (Filled)',
    description: 'Microsoft Fluent filled icons with stronger emphasis.',
  },
];

export const DEFAULT_USER_SETTINGS: UserSettings = {
  iconPackId: DEFAULT_ICON_PACK_ID,
};

const WEB_ICON_PACK_IDS = new Set<WebIconPackId>(WEB_ICON_PACK_OPTIONS.map((option) => option.id));
const ICON_PACK_CHANGE_EVENT = 'finance:icon-pack-change';

export function normalizeIconPackId(value: unknown): WebIconPackId {
  if (typeof value === 'string' && WEB_ICON_PACK_IDS.has(value as WebIconPackId)) {
    return value as WebIconPackId;
  }
  return DEFAULT_ICON_PACK_ID;
}

export function loadIconPackPreference(): WebIconPackId {
  try {
    return normalizeIconPackId(localStorage.getItem(ICON_PACK_PREFERENCE_KEY));
  } catch {
    return DEFAULT_ICON_PACK_ID;
  }
}

export function saveIconPackPreference(iconPackId: WebIconPackId): void {
  try {
    localStorage.setItem(ICON_PACK_PREFERENCE_KEY, iconPackId);
  } catch {
    // localStorage can be unavailable in private browsing; keep the in-memory state.
  }
  window.dispatchEvent(new Event(ICON_PACK_CHANGE_EVENT));
}

export function resetIconPackPreference(): void {
  try {
    localStorage.removeItem(ICON_PACK_PREFERENCE_KEY);
  } catch {
    // localStorage unavailable; reset in-memory consumers via the event below.
  }
  window.dispatchEvent(new Event(ICON_PACK_CHANGE_EVENT));
}

export interface UseIconPackResult {
  iconPackId: WebIconPackId;
  setIconPack: (iconPackId: WebIconPackId) => void;
  resetIconPack: () => void;
  options: readonly IconPackOption[];
}

export function useIconPack(): UseIconPackResult {
  const [iconPackId, setIconPackId] = useState<WebIconPackId>(loadIconPackPreference);

  useEffect(() => {
    const syncFromStorage = () => setIconPackId(loadIconPackPreference());
    window.addEventListener('storage', syncFromStorage);
    window.addEventListener(ICON_PACK_CHANGE_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener(ICON_PACK_CHANGE_EVENT, syncFromStorage);
    };
  }, []);

  const setIconPack = useCallback((nextIconPackId: WebIconPackId) => {
    const normalized = normalizeIconPackId(nextIconPackId);
    setIconPackId(normalized);
    saveIconPackPreference(normalized);
  }, []);

  const resetIconPack = useCallback(() => {
    setIconPackId(DEFAULT_ICON_PACK_ID);
    resetIconPackPreference();
  }, []);

  return useMemo(
    () => ({ iconPackId, setIconPack, resetIconPack, options: WEB_ICON_PACK_OPTIONS }),
    [iconPackId, resetIconPack, setIconPack],
  );
}
