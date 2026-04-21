// SPDX-License-Identifier: BUSL-1.1

/**
 * Popup script for the Finance Receipt Capture extension.
 *
 * Handles form validation, auto-detect via content script messaging,
 * and saving captured receipts to extension storage.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Captured receipt data structure.
 * Amount is stored in cents (integer) to match the main app.
 */
interface CapturedReceipt {
  id: string;
  payee: string;
  /** Amount in cents. */
  amountCents: number;
  date: string;
  category: string;
  note: string;
  sourceUrl: string;
  capturedAt: string;
  synced: boolean;
}

interface AutoDetectResult {
  payee?: string;
  amount?: string;
  date?: string;
}

// ---------------------------------------------------------------------------
// DOM elements
// ---------------------------------------------------------------------------

const form = document.getElementById('receipt-form') as HTMLFormElement;
const payeeInput = document.getElementById('receipt-payee') as HTMLInputElement;
const amountInput = document.getElementById('receipt-amount') as HTMLInputElement;
const dateInput = document.getElementById('receipt-date') as HTMLInputElement;
const categorySelect = document.getElementById('receipt-category') as HTMLSelectElement;
const noteTextarea = document.getElementById('receipt-note') as HTMLTextAreaElement;
const btnAutoFill = document.getElementById('btn-autofill') as HTMLButtonElement;
const btnSave = document.getElementById('btn-save') as HTMLButtonElement;
const statusMessage = document.getElementById('status-message') as HTMLDivElement;
const openAppLink = document.getElementById('open-app-link') as HTMLAnchorElement;
const payeeError = document.getElementById('payee-error') as HTMLSpanElement;
const amountError = document.getElementById('amount-error') as HTMLSpanElement;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

// Set default date to today
dateInput.value = new Date().toISOString().slice(0, 10);

// Focus the payee input on popup open
payeeInput.focus();

// Set the open app link
openAppLink.href = chrome.runtime.getURL('') || 'https://finance.app';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ValidationErrors {
  payee?: string;
  amount?: string;
}

function validate(): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!payeeInput.value.trim()) {
    errors.payee = 'Payee is required';
  }

  const amount = parseFloat(amountInput.value);
  if (isNaN(amount) || amount <= 0) {
    errors.amount = 'Enter a valid amount greater than 0';
  }

  return errors;
}

function showErrors(errors: ValidationErrors): void {
  if (errors.payee) {
    payeeError.textContent = errors.payee;
    payeeInput.setAttribute('aria-invalid', 'true');
    payeeInput.setAttribute('aria-describedby', 'payee-error');
  } else {
    payeeError.textContent = '';
    payeeInput.removeAttribute('aria-invalid');
  }

  if (errors.amount) {
    amountError.textContent = errors.amount;
    amountInput.setAttribute('aria-invalid', 'true');
  } else {
    amountError.textContent = '';
    amountInput.removeAttribute('aria-invalid');
  }
}

function clearErrors(): void {
  payeeError.textContent = '';
  amountError.textContent = '';
  payeeInput.removeAttribute('aria-invalid');
  amountInput.removeAttribute('aria-invalid');
}

// ---------------------------------------------------------------------------
// Status messages
// ---------------------------------------------------------------------------

function showStatus(message: string, type: 'success' | 'error'): void {
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-message--${type}`;
  statusMessage.hidden = false;

  if (type === 'success') {
    setTimeout(() => {
      statusMessage.hidden = true;
    }, 3000);
  }
}

// ---------------------------------------------------------------------------
// Save receipt
// ---------------------------------------------------------------------------

async function saveReceipt(): Promise<void> {
  const errors = validate();
  if (Object.keys(errors).length > 0) {
    showErrors(errors);
    return;
  }

  clearErrors();
  btnSave.disabled = true;
  btnSave.textContent = 'Saving...';
  btnSave.setAttribute('aria-busy', 'true');

  try {
    const amount = parseFloat(amountInput.value);
    const amountCents = Math.round(amount * 100);

    const receipt: CapturedReceipt = {
      id: crypto.randomUUID(),
      payee: payeeInput.value.trim(),
      amountCents,
      date: dateInput.value || new Date().toISOString().slice(0, 10),
      category: categorySelect.value,
      note: noteTextarea.value.trim(),
      sourceUrl: '',
      capturedAt: new Date().toISOString(),
      synced: false,
    };

    // Get the current tab URL
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        receipt.sourceUrl = tab.url;
      }
    } catch {
      // Tab access may fail — not critical
    }

    // Save to extension storage
    const { receipts = [] } = await chrome.storage.local.get('receipts');
    receipts.push(receipt);
    await chrome.storage.local.set({ receipts });

    showStatus('Receipt saved successfully!', 'success');

    // Reset form
    form.reset();
    dateInput.value = new Date().toISOString().slice(0, 10);
    payeeInput.focus();
  } catch {
    showStatus('Failed to save receipt. Please try again.', 'error');
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = 'Save Receipt';
    btnSave.removeAttribute('aria-busy');
  }
}

// ---------------------------------------------------------------------------
// Auto-detect from page
// ---------------------------------------------------------------------------

async function autoDetect(): Promise<void> {
  btnAutoFill.disabled = true;
  btnAutoFill.textContent = '🔍 Detecting...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showStatus('Cannot access current tab.', 'error');
      return;
    }

    const response = (await chrome.tabs.sendMessage(tab.id, {
      action: 'DETECT_RECEIPT',
    })) as AutoDetectResult;

    if (response) {
      if (response.payee && !payeeInput.value) {
        payeeInput.value = response.payee;
      }
      if (response.amount && !amountInput.value) {
        amountInput.value = response.amount;
      }
      if (response.date && !dateInput.value) {
        dateInput.value = response.date;
      }

      showStatus('Auto-detected transaction details from page.', 'success');
    } else {
      showStatus('No transaction details found on this page.', 'error');
    }
  } catch {
    showStatus('Could not detect data from this page.', 'error');
  } finally {
    btnAutoFill.disabled = false;
    btnAutoFill.textContent = '🔍 Auto-detect';
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

form.addEventListener('submit', (e) => {
  e.preventDefault();
  saveReceipt();
});

btnAutoFill.addEventListener('click', () => {
  autoDetect();
});

// Keyboard: Escape closes popup
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.close();
  }
});
