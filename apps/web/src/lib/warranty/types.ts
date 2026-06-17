// SPDX-License-Identifier: BUSL-1.1

import type { LocalDate, SyncId } from '../../kmp/bridge';
import type { NotificationSeverity } from '../notifications';

export type WarrantyDeadlineType = 'warranty' | 'return-window';
export type WarrantyStatus = 'active' | 'expiring-soon' | 'expired';
export type WarrantyFilterStatus = 'all' | WarrantyStatus;
export type ReminderThreshold = 7 | 3 | 1;

export interface WarrantyEntry {
  readonly id: string;
  readonly transactionId: SyncId;
  readonly merchantName: string | null;
  readonly itemName: string;
  readonly purchaseDate: LocalDate;
  readonly amountCents: number;
  readonly currencyCode: string;
  readonly warrantyExpiryDate: LocalDate | null;
  readonly returnWindowEndDate: LocalDate | null;
  readonly receiptPhotoUrl: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WarrantyEntryDraft {
  readonly transactionId: SyncId;
  readonly merchantName?: string | null;
  readonly itemName: string;
  readonly purchaseDate: LocalDate;
  readonly amountCents: number;
  readonly currencyCode: string;
  readonly warrantyExpiryDate?: LocalDate | null;
  readonly returnWindowEndDate?: LocalDate | null;
  readonly receiptPhotoUrl?: string | null;
  readonly notes?: string | null;
}

export interface ReturnWindowRule {
  readonly label: string;
  readonly days: number;
  readonly matchTerms: readonly string[];
}

export interface ReturnWindowSuggestion {
  readonly label: string;
  readonly days: number;
  readonly source: 'merchant' | 'category' | 'default';
  readonly matchedTerm: string | null;
  readonly endDate: LocalDate;
}

export interface WarrantyDeadline {
  readonly entryId: string;
  readonly transactionId: SyncId;
  readonly itemName: string;
  readonly merchantName: string | null;
  readonly type: WarrantyDeadlineType;
  readonly dueDate: LocalDate;
  readonly daysRemaining: number;
  readonly status: WarrantyStatus;
}

export interface WarrantyReminder {
  readonly id: string;
  readonly entryId: string;
  readonly transactionId: SyncId;
  readonly itemName: string;
  readonly type: WarrantyDeadlineType;
  readonly thresholdDays: ReminderThreshold;
  readonly dueDate: LocalDate;
  readonly daysRemaining: number;
  readonly severity: NotificationSeverity;
  readonly title: string;
  readonly message: string;
  readonly deduplicationKey: string;
}

export interface ReturnWindowState {
  readonly daysRemaining: number | null;
  readonly isEligible: boolean;
  readonly isClosingSoon: boolean;
  readonly isClosed: boolean;
}
