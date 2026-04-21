// SPDX-License-Identifier: BUSL-1.1

/**
 * Background service worker for the Finance Receipt Capture extension.
 *
 * Handles:
 * - Extension installation and update events
 * - Badge updates showing unsynced receipt count
 * - Storage management for captured receipts
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CapturedReceipt {
  id: string;
  payee: string;
  amountCents: number;
  date: string;
  category: string;
  note: string;
  sourceUrl: string;
  capturedAt: string;
  synced: boolean;
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Initialize storage with empty receipts array
    chrome.storage.local.set({ receipts: [] });
  }
});

// ---------------------------------------------------------------------------
// Badge update — show unsynced count
// ---------------------------------------------------------------------------

async function updateBadge(): Promise<void> {
  try {
    const { receipts = [] } = (await chrome.storage.local.get('receipts')) as {
      receipts: CapturedReceipt[];
    };
    const unsyncedCount = receipts.filter((r) => !r.synced).length;

    if (unsyncedCount > 0) {
      await chrome.action.setBadgeText({ text: String(unsyncedCount) });
      await chrome.action.setBadgeBackgroundColor({ color: '#2563EB' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch {
    // Badge API may not be available in all contexts
  }
}

// Listen for storage changes to update badge
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.receipts) {
    updateBadge();
  }
});

// Update badge on service worker startup
updateBadge();

// ---------------------------------------------------------------------------
// Message handling from popup and content scripts
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    message: { action: string; receiptId?: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (data: unknown) => void,
  ) => {
    switch (message.action) {
      case 'GET_RECEIPTS':
        chrome.storage.local.get('receipts').then(({ receipts = [] }) => {
          sendResponse(receipts);
        });
        return true; // Keep channel open for async response

      case 'GET_UNSYNCED_COUNT':
        chrome.storage.local.get('receipts').then(({ receipts = [] }) => {
          const count = (receipts as CapturedReceipt[]).filter((r) => !r.synced).length;
          sendResponse({ count });
        });
        return true;

      case 'MARK_SYNCED':
        if (message.receiptId) {
          chrome.storage.local.get('receipts').then(({ receipts = [] }) => {
            const updated = (receipts as CapturedReceipt[]).map((r) =>
              r.id === message.receiptId ? { ...r, synced: true } : r,
            );
            chrome.storage.local.set({ receipts: updated }).then(() => {
              sendResponse({ success: true });
            });
          });
          return true;
        }
        sendResponse({ success: false, error: 'Missing receiptId' });
        return false;

      case 'CLEAR_SYNCED':
        chrome.storage.local.get('receipts').then(({ receipts = [] }) => {
          const unsynced = (receipts as CapturedReceipt[]).filter((r) => !r.synced);
          chrome.storage.local.set({ receipts: unsynced }).then(() => {
            sendResponse({ success: true, remaining: unsynced.length });
          });
        });
        return true;

      default:
        return false;
    }
  },
);
