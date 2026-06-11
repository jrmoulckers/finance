// SPDX-License-Identifier: BUSL-1.1

import type { AccessContact, EstateAccessInfo } from './types';

const ESTATE_ACCESS_INFO_STORAGE_KEY = 'finance-estate-access-v1';

function getNowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeAccessContact(value: Partial<AccessContact>): AccessContact {
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : generateId('access-contact'),
    name: typeof value.name === 'string' ? value.name : '',
    relationship: typeof value.relationship === 'string' ? value.relationship : '',
    phone: typeof value.phone === 'string' ? value.phone : '',
    email: typeof value.email === 'string' ? value.email : '',
    knowsAbout: typeof value.knowsAbout === 'string' ? value.knowsAbout : '',
    notes: typeof value.notes === 'string' ? value.notes : '',
    isPrimary: value.isPrimary === true,
  };
}

export function createEmptyAccessContact(): AccessContact {
  return normalizeAccessContact({});
}

export function createDefaultAccessInfo(): EstateAccessInfo {
  return {
    trustedContacts: [],
    instructions: '',
    documentLocation: '',
    safeDepositLocation: '',
    digitalVaultLocation: '',
    updatedAt: getNowIso(),
  };
}

function normalizeAccessInfo(value: Partial<EstateAccessInfo>): EstateAccessInfo {
  const base = createDefaultAccessInfo();
  return {
    trustedContacts: Array.isArray(value.trustedContacts)
      ? value.trustedContacts.map(normalizeAccessContact)
      : base.trustedContacts,
    instructions: typeof value.instructions === 'string' ? value.instructions : base.instructions,
    documentLocation:
      typeof value.documentLocation === 'string' ? value.documentLocation : base.documentLocation,
    safeDepositLocation:
      typeof value.safeDepositLocation === 'string'
        ? value.safeDepositLocation
        : base.safeDepositLocation,
    digitalVaultLocation:
      typeof value.digitalVaultLocation === 'string'
        ? value.digitalVaultLocation
        : base.digitalVaultLocation,
    updatedAt:
      typeof value.updatedAt === 'string' && value.updatedAt ? value.updatedAt : base.updatedAt,
  };
}

export function getAccessInfo(): EstateAccessInfo {
  if (!canUseLocalStorage()) {
    return createDefaultAccessInfo();
  }

  try {
    const raw = window.localStorage.getItem(ESTATE_ACCESS_INFO_STORAGE_KEY);
    if (!raw) {
      return createDefaultAccessInfo();
    }

    return normalizeAccessInfo(JSON.parse(raw) as Partial<EstateAccessInfo>);
  } catch {
    return createDefaultAccessInfo();
  }
}

export function saveAccessInfo(accessInfo: EstateAccessInfo): EstateAccessInfo {
  const normalized = normalizeAccessInfo({ ...accessInfo, updatedAt: getNowIso() });

  if (!canUseLocalStorage()) {
    return normalized;
  }

  try {
    window.localStorage.setItem(ESTATE_ACCESS_INFO_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Best-effort persistence only.
  }

  return normalized;
}

export { ESTATE_ACCESS_INFO_STORAGE_KEY };
