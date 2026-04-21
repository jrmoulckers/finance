// SPDX-License-Identifier: BUSL-1.1

/**
 * Content script for the Finance Receipt Capture extension.
 *
 * Runs on all pages and listens for messages from the popup to
 * auto-detect transaction/receipt data from the current page.
 *
 * Detection strategies:
 * 1. Schema.org/JSON-LD structured data (Order, Invoice)
 * 2. Common e-commerce page patterns (totals, merchant names)
 * 3. Page title as fallback merchant name
 */

interface DetectedData {
  payee?: string;
  amount?: string;
  date?: string;
}

// ---------------------------------------------------------------------------
// Detection strategies
// ---------------------------------------------------------------------------

/**
 * Attempt to extract transaction data from JSON-LD structured data.
 */
function detectFromJsonLd(): DetectedData {
  const result: DetectedData = {};

  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent ?? '');
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        // Schema.org Order
        if (item['@type'] === 'Order' || item['@type'] === 'Invoice') {
          if (item.seller?.name) {
            result.payee = item.seller.name;
          }
          if (item.totalPrice || item.totalPaymentDue?.value) {
            const price = item.totalPrice ?? item.totalPaymentDue?.value;
            result.amount = String(parseFloat(String(price)));
          }
          if (item.orderDate || item.paymentDueDate) {
            const dateStr = item.orderDate ?? item.paymentDueDate;
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
              result.date = parsed.toISOString().slice(0, 10);
            }
          }
        }

        // Schema.org Product with price
        if (item['@type'] === 'Product' && item.offers) {
          const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
          for (const offer of offers) {
            if (offer.price && !result.amount) {
              result.amount = String(parseFloat(String(offer.price)));
            }
            if (offer.seller?.name && !result.payee) {
              result.payee = offer.seller.name;
            }
          }
        }
      }
    } catch {
      // Invalid JSON — skip
    }
  }

  return result;
}

/**
 * Attempt to extract data from common page patterns.
 */
function detectFromPageContent(): DetectedData {
  const result: DetectedData = {};

  // Try to find total/amount from common patterns
  const amountPatterns = [
    /total[:\s]*\$?([\d,]+\.?\d*)/i,
    /amount[:\s]*\$?([\d,]+\.?\d*)/i,
    /order total[:\s]*\$?([\d,]+\.?\d*)/i,
    /grand total[:\s]*\$?([\d,]+\.?\d*)/i,
    /payment[:\s]*\$?([\d,]+\.?\d*)/i,
  ];

  const bodyText = document.body.innerText;
  for (const pattern of amountPatterns) {
    const match = bodyText.match(pattern);
    if (match?.[1]) {
      const cleaned = match[1].replace(/,/g, '');
      const value = parseFloat(cleaned);
      if (!isNaN(value) && value > 0 && value < 1000000) {
        result.amount = String(value);
        break;
      }
    }
  }

  // Try to extract merchant from meta tags or page title
  const ogSiteName = document.querySelector('meta[property="og:site_name"]');
  if (ogSiteName) {
    result.payee = ogSiteName.getAttribute('content') ?? undefined;
  } else {
    // Use domain name as fallback
    const hostname = window.location.hostname.replace(/^www\./, '');
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      result.payee = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
  }

  // Try to find date
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s*\d{4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = bodyText.match(pattern);
    if (match?.[1]) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime())) {
        result.date = parsed.toISOString().slice(0, 10);
        break;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: { action: string }, _sender: unknown, sendResponse: (data: DetectedData) => void) => {
    if (message.action === 'DETECT_RECEIPT') {
      // Try structured data first, then fall back to page content
      const jsonLdData = detectFromJsonLd();
      const pageData = detectFromPageContent();

      const merged: DetectedData = {
        payee: jsonLdData.payee ?? pageData.payee,
        amount: jsonLdData.amount ?? pageData.amount,
        date: jsonLdData.date ?? pageData.date,
      };

      sendResponse(merged);
    }

    // Return true to keep the message channel open for async response
    return true;
  },
);
