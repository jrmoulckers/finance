/**
 * Warranty and return-window tracking with reminder generation.
 * Closes #1620.
 * @module enhancements/warranty-tracker
 */

import type { WarrantyItem, WarrantyReminder, ReminderUrgency } from './types';

/** Reminder thresholds in days */
const REMINDER_THRESHOLDS: readonly number[] = [30, 14, 7];

/**
 * Calculate the number of whole days between two ISO-8601 date strings.
 * @param from - Start date (ISO-8601)
 * @param to - End date (ISO-8601)
 * @returns Integer number of days (can be negative if `to` < `from`)
 */
export function daysBetween(from: string, to: string): number {
  const msPerDay = 86_400_000;
  const diff = new Date(to).getTime() - new Date(from).getTime();
  return Math.floor(diff / msPerDay);
}

/**
 * Determine reminder urgency from days remaining.
 * @param daysRemaining - Days until expiry
 * @returns Urgency level
 */
export function getUrgency(daysRemaining: number): ReminderUrgency {
  if (daysRemaining <= 7) return 'high';
  if (daysRemaining <= 14) return 'medium';
  return 'low';
}

/**
 * Create a new warranty item.
 * @param id - Unique identifier
 * @param productName - Product name
 * @param purchaseDate - ISO-8601 purchase date
 * @param warrantyExpiry - ISO-8601 warranty expiry
 * @param costCents - Item cost in integer cents
 * @param receiptId - Optional linked receipt ID
 * @param returnWindowExpiry - Optional ISO-8601 return window expiry
 * @returns A WarrantyItem
 */
export function createWarrantyItem(
  id: string,
  productName: string,
  purchaseDate: string,
  warrantyExpiry: string,
  costCents: number,
  receiptId?: string,
  returnWindowExpiry?: string,
): WarrantyItem {
  return {
    id,
    productName,
    purchaseDate,
    warrantyExpiry,
    costCents,
    receiptId,
    returnWindowExpiry,
  };
}

/**
 * Generate reminders for a single warranty item based on today's date.
 * Produces reminders at 30, 14, and 7-day thresholds.
 * @param item - The warranty item
 * @param today - ISO-8601 current date
 * @returns Array of reminders (may be empty)
 */
export function generateReminders(item: WarrantyItem, today: string): readonly WarrantyReminder[] {
  const reminders: WarrantyReminder[] = [];

  const warrantyDays = daysBetween(today, item.warrantyExpiry);
  for (const threshold of REMINDER_THRESHOLDS) {
    if (warrantyDays > 0 && warrantyDays <= threshold) {
      reminders.push({
        warrantyItemId: item.id,
        productName: item.productName,
        type: 'warranty',
        daysRemaining: warrantyDays,
        urgency: getUrgency(warrantyDays),
        expiryDate: item.warrantyExpiry,
        message: `Warranty for "${item.productName}" expires in ${warrantyDays} day${warrantyDays === 1 ? '' : 's'}.`,
      });
      break; // only the tightest matching threshold
    }
  }

  if (item.returnWindowExpiry) {
    const returnDays = daysBetween(today, item.returnWindowExpiry);
    for (const threshold of REMINDER_THRESHOLDS) {
      if (returnDays > 0 && returnDays <= threshold) {
        reminders.push({
          warrantyItemId: item.id,
          productName: item.productName,
          type: 'return_window',
          daysRemaining: returnDays,
          urgency: getUrgency(returnDays),
          expiryDate: item.returnWindowExpiry,
          message: `Return window for "${item.productName}" closes in ${returnDays} day${returnDays === 1 ? '' : 's'}.`,
        });
        break;
      }
    }
  }

  return reminders;
}

/**
 * Generate reminders for all items in a collection.
 * @param items - Warranty items
 * @param today - ISO-8601 current date
 * @returns All generated reminders
 */
export function generateAllReminders(
  items: readonly WarrantyItem[],
  today: string,
): readonly WarrantyReminder[] {
  return items.flatMap((item) => generateReminders(item, today));
}

/**
 * Get active (non-expired) warranty items.
 * @param items - All warranty items
 * @param today - ISO-8601 current date
 * @returns Items whose warranty has not yet expired
 */
export function getActiveWarranties(
  items: readonly WarrantyItem[],
  today: string,
): readonly WarrantyItem[] {
  return items.filter((item) => daysBetween(today, item.warrantyExpiry) > 0);
}

/**
 * Get expired warranty items eligible for cleanup.
 * @param items - All warranty items
 * @param today - ISO-8601 current date
 * @returns Items whose warranty has expired
 */
export function getExpiredWarranties(
  items: readonly WarrantyItem[],
  today: string,
): readonly WarrantyItem[] {
  return items.filter((item) => daysBetween(today, item.warrantyExpiry) <= 0);
}

/**
 * Summarize active warranties: count and total covered value.
 * @param items - All warranty items
 * @param today - ISO-8601 current date
 * @returns Object with count and totalCoveredCents
 */
export function activeWarrantySummary(
  items: readonly WarrantyItem[],
  today: string,
): { readonly count: number; readonly totalCoveredCents: number } {
  const active = getActiveWarranties(items, today);
  return {
    count: active.length,
    totalCoveredCents: active.reduce((sum, i) => sum + i.costCents, 0),
  };
}

/**
 * Link a receipt to a warranty item.
 * @param item - The warranty item
 * @param receiptId - Receipt identifier
 * @returns Updated warranty item with linked receipt
 */
export function linkReceipt(item: WarrantyItem, receiptId: string): WarrantyItem {
  return { ...item, receiptId };
}
