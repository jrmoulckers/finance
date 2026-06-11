// SPDX-License-Identifier: BUSL-1.1

export type EstateCategoryId =
  | 'bank-accounts'
  | 'investments'
  | 'insurance'
  | 'real-estate'
  | 'debts'
  | 'digital-assets'
  | 'subscriptions'
  | 'important-contacts';

export type EstateFieldInputType =
  | 'text'
  | 'textarea'
  | 'currency'
  | 'select'
  | 'email'
  | 'tel'
  | 'date';

export interface EstateFieldOption {
  readonly value: string;
  readonly label: string;
}

export interface EstateCategoryFieldDefinition {
  readonly key: string;
  readonly label: string;
  readonly inputType: EstateFieldInputType;
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly required?: boolean;
  readonly options?: readonly EstateFieldOption[];
}

export interface EstateCategoryDefinition {
  readonly id: EstateCategoryId;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly emptyState: string;
  readonly summaryFields: readonly string[];
  readonly fields: readonly EstateCategoryFieldDefinition[];
}

export interface Beneficiary {
  readonly id: string;
  readonly name: string;
  readonly relationship: string;
  readonly sharePercent: string;
  readonly notes: string;
}

export interface EstateInventoryItem {
  readonly id: string;
  readonly categoryId: EstateCategoryId;
  readonly details: Record<string, string>;
  readonly beneficiaries: readonly Beneficiary[];
  readonly notes: string;
  readonly documentLocation: string;
  readonly lastVerifiedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AccessContact {
  readonly id: string;
  readonly name: string;
  readonly relationship: string;
  readonly phone: string;
  readonly email: string;
  readonly knowsAbout: string;
  readonly notes: string;
  readonly isPrimary: boolean;
}

export interface EstateAccessInfo {
  readonly trustedContacts: readonly AccessContact[];
  readonly instructions: string;
  readonly documentLocation: string;
  readonly safeDepositLocation: string;
  readonly digitalVaultLocation: string;
  readonly updatedAt: string;
}

export interface EstateInventorySummary {
  readonly totalItems: number;
  readonly documentedCategories: readonly EstateCategoryId[];
  readonly missingCategories: readonly EstateCategoryId[];
  readonly itemsMissingDocuments: number;
  readonly itemsMissingVerification: number;
}
