// SPDX-License-Identifier: BUSL-1.1

/**
 * Receipt data detection utilities.
 *
 * Extracted from content.ts for testability. Pure functions that detect
 * transaction data from text content.
 */

export interface DetectedData {
  payee?: string;
  amount?: string;
  date?: string;
}

/**
 * Parse amount from text using common patterns.
 */
export function detectAmountFromText(text: string): string | undefined {
  const amountPatterns = [
    /total[:\s]*\$?([\d,]+\.?\d*)/i,
    /amount[:\s]*\$?([\d,]+\.?\d*)/i,
    /order total[:\s]*\$?([\d,]+\.?\d*)/i,
    /grand total[:\s]*\$?([\d,]+\.?\d*)/i,
    /payment[:\s]*\$?([\d,]+\.?\d*)/i,
  ];

  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const cleaned = match[1].replace(/,/g, '');
      const value = parseFloat(cleaned);
      if (!isNaN(value) && value > 0 && value < 1000000) {
        return String(value);
      }
    }
  }

  return undefined;
}

/**
 * Parse date from text using common patterns.
 */
export function detectDateFromText(text: string): string | undefined {
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s*\d{4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
    }
  }

  return undefined;
}

/**
 * Extract merchant/payee name from hostname.
 */
export function extractMerchantFromHostname(hostname: string): string | undefined {
  const cleaned = hostname.replace(/^www\./, '');
  const parts = cleaned.split('.');
  if (parts.length >= 2) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  return undefined;
}

/**
 * Validate a captured receipt form input.
 */
export interface ReceiptFormData {
  payee: string;
  amount: string;
  date: string;
  category: string;
  note: string;
}

export interface ReceiptFormErrors {
  payee?: string;
  amount?: string;
}

export function validateReceiptForm(data: ReceiptFormData): ReceiptFormErrors {
  const errors: ReceiptFormErrors = {};

  if (!data.payee.trim()) {
    errors.payee = 'Payee is required';
  }

  const amount = parseFloat(data.amount);
  if (isNaN(amount) || amount <= 0) {
    errors.amount = 'Enter a valid amount greater than 0';
  }

  return errors;
}

/**
 * Convert a dollar amount string to cents (integer).
 */
export function dollarsToCents(dollars: string): number {
  return Math.round(parseFloat(dollars) * 100);
}
