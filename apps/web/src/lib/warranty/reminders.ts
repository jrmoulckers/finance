// SPDX-License-Identifier: BUSL-1.1

import type { AppNotification } from '../notifications';
import type {
  ReminderThreshold,
  ReturnWindowState,
  WarrantyDeadline,
  WarrantyDeadlineType,
  WarrantyEntry,
  WarrantyFilterStatus,
  WarrantyReminder,
  WarrantyStatus,
} from './types';

const MS_PER_DAY = 86_400_000;
export const WARRANTY_EXPIRING_SOON_DAYS = 30;
export const WARRANTY_REMINDER_THRESHOLDS: readonly ReminderThreshold[] = [7, 3, 1];

function parseLocalDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function todayLocalDate(): string {
  return formatLocalDate(new Date());
}

export function formatLocalDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: string, days: number): string {
  const next = parseLocalDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return formatLocalDate(next);
}

export function daysUntil(targetDate: string, today: string = todayLocalDate()): number {
  return Math.round(
    (parseLocalDate(targetDate).getTime() - parseLocalDate(today).getTime()) / MS_PER_DAY,
  );
}

function toDeadlineStatus(daysRemaining: number): WarrantyStatus {
  if (daysRemaining < 0) {
    return 'expired';
  }

  if (daysRemaining <= WARRANTY_EXPIRING_SOON_DAYS) {
    return 'expiring-soon';
  }

  return 'active';
}

function buildDeadlinesForEntry(entry: WarrantyEntry, today: string): WarrantyDeadline[] {
  const deadlines: WarrantyDeadline[] = [];

  if (entry.returnWindowEndDate) {
    const daysRemaining = daysUntil(entry.returnWindowEndDate, today);
    deadlines.push({
      entryId: entry.id,
      transactionId: entry.transactionId,
      itemName: entry.itemName,
      merchantName: entry.merchantName,
      type: 'return-window',
      dueDate: entry.returnWindowEndDate,
      daysRemaining,
      status: toDeadlineStatus(daysRemaining),
    });
  }

  if (entry.warrantyExpiryDate) {
    const daysRemaining = daysUntil(entry.warrantyExpiryDate, today);
    deadlines.push({
      entryId: entry.id,
      transactionId: entry.transactionId,
      itemName: entry.itemName,
      merchantName: entry.merchantName,
      type: 'warranty',
      dueDate: entry.warrantyExpiryDate,
      daysRemaining,
      status: toDeadlineStatus(daysRemaining),
    });
  }

  return deadlines.sort((left, right) => left.daysRemaining - right.daysRemaining);
}

export function getWarrantyStatus(
  entry: WarrantyEntry,
  today: string = todayLocalDate(),
): WarrantyStatus {
  const deadlines = buildDeadlinesForEntry(entry, today);

  if (deadlines.length === 0) {
    return 'active';
  }

  const upcomingDeadlines = deadlines.filter((deadline) => deadline.daysRemaining >= 0);
  if (upcomingDeadlines.length === 0) {
    return 'expired';
  }

  return upcomingDeadlines[0]!.daysRemaining <= WARRANTY_EXPIRING_SOON_DAYS
    ? 'expiring-soon'
    : 'active';
}

export function filterWarrantyEntries(
  entries: readonly WarrantyEntry[],
  status: WarrantyFilterStatus,
  today: string = todayLocalDate(),
): WarrantyEntry[] {
  if (status === 'all') {
    return [...entries];
  }

  return entries.filter((entry) => getWarrantyStatus(entry, today) === status);
}

export function searchWarrantyEntries(
  entries: readonly WarrantyEntry[],
  query: string,
): WarrantyEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [...entries];
  }

  return entries.filter((entry) =>
    [entry.itemName, entry.merchantName ?? '', entry.notes ?? '', entry.receiptPhotoUrl ?? '']
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

export function getUpcomingDeadlines(
  entries: readonly WarrantyEntry[],
  today: string = todayLocalDate(),
  lookaheadDays = WARRANTY_EXPIRING_SOON_DAYS,
): WarrantyDeadline[] {
  return entries
    .flatMap((entry) => buildDeadlinesForEntry(entry, today))
    .filter((deadline) => deadline.daysRemaining >= 0 && deadline.daysRemaining <= lookaheadDays)
    .sort((left, right) => {
      if (left.daysRemaining !== right.daysRemaining) {
        return left.daysRemaining - right.daysRemaining;
      }

      if (left.type !== right.type) {
        return left.type === 'return-window' ? -1 : 1;
      }

      return left.itemName.localeCompare(right.itemName);
    });
}

export function getReturnWindowState(
  entry: WarrantyEntry,
  today: string = todayLocalDate(),
): ReturnWindowState {
  if (!entry.returnWindowEndDate) {
    return {
      daysRemaining: null,
      isEligible: false,
      isClosingSoon: false,
      isClosed: false,
    };
  }

  const daysRemaining = daysUntil(entry.returnWindowEndDate, today);
  return {
    daysRemaining,
    isEligible: daysRemaining >= 0,
    isClosingSoon: daysRemaining >= 0 && daysRemaining <= 3,
    isClosed: daysRemaining < 0,
  };
}

function resolveReminderThreshold(daysRemaining: number): ReminderThreshold | null {
  if (daysRemaining <= 0 || daysRemaining > 7) {
    return null;
  }

  if (daysRemaining === 1) {
    return 1;
  }

  if (daysRemaining <= 3) {
    return 3;
  }

  return 7;
}

function reminderSeverity(threshold: ReminderThreshold): AppNotification['severity'] {
  switch (threshold) {
    case 1:
      return 'critical';
    case 3:
      return 'warning';
    case 7:
      return 'info';
  }
}

function reminderTitle(type: WarrantyDeadlineType, daysRemaining: number): string {
  if (type === 'return-window') {
    return daysRemaining === 1 ? 'Return window closes tomorrow' : 'Return window closing soon';
  }

  return daysRemaining === 1 ? 'Warranty expires tomorrow' : 'Warranty expiration coming up';
}

function reminderMessage(
  itemName: string,
  type: WarrantyDeadlineType,
  daysRemaining: number,
  dueDate: string,
): string {
  const deadlineLabel = type === 'return-window' ? 'Return window' : 'Warranty';
  const daysLabel = daysRemaining === 1 ? '1 day' : `${daysRemaining} days`;
  return `${deadlineLabel} for ${itemName} is due in ${daysLabel} on ${dueDate}.`;
}

export function buildWarrantyReminders(
  entries: readonly WarrantyEntry[],
  today: string = todayLocalDate(),
  existingDeduplicationKeys: ReadonlySet<string> = new Set(),
): WarrantyReminder[] {
  const reminders: WarrantyReminder[] = [];

  for (const deadline of getUpcomingDeadlines(entries, today, 7)) {
    const thresholdDays = resolveReminderThreshold(deadline.daysRemaining);
    if (!thresholdDays) {
      continue;
    }

    const deduplicationKey = `warranty:${deadline.transactionId}:${deadline.type}:${thresholdDays}`;
    if (existingDeduplicationKeys.has(deduplicationKey)) {
      continue;
    }

    reminders.push({
      id: crypto.randomUUID(),
      entryId: deadline.entryId,
      transactionId: deadline.transactionId,
      itemName: deadline.itemName,
      type: deadline.type,
      thresholdDays,
      dueDate: deadline.dueDate,
      daysRemaining: deadline.daysRemaining,
      severity: reminderSeverity(thresholdDays),
      title: reminderTitle(deadline.type, deadline.daysRemaining),
      message: reminderMessage(
        deadline.itemName,
        deadline.type,
        deadline.daysRemaining,
        deadline.dueDate,
      ),
      deduplicationKey,
    });
  }

  return reminders;
}

export function buildWarrantyReminderNotifications(
  reminders: readonly WarrantyReminder[],
): AppNotification[] {
  return reminders.map((reminder) => ({
    id: reminder.id,
    type: reminder.type === 'warranty' ? 'warranty_deadline' : 'return_window_deadline',
    severity: reminder.severity,
    title: reminder.title,
    message: reminder.message,
    createdAt: new Date().toISOString(),
    status: 'unread',
    entityId: reminder.transactionId,
    entityType: 'transaction',
    actionLabel: 'View transaction',
    deduplicationKey: reminder.deduplicationKey,
  }));
}
