// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';

import { ESTATE_CATEGORIES } from '../../lib/estate/categories';
import type { EstateAccessInfo, EstateInventoryItem } from '../../lib/estate/types';

export interface ExportInventoryProps {
  readonly items: readonly EstateInventoryItem[];
  readonly accessInfo: EstateAccessInfo;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value: string): string {
  if (!value) {
    return 'Not recorded';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

function buildExportPayload(
  items: readonly EstateInventoryItem[],
  accessInfo: EstateAccessInfo,
): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      items,
      accessInfo,
    },
    null,
    2,
  );
}

function buildPrintableHtml(
  items: readonly EstateInventoryItem[],
  accessInfo: EstateAccessInfo,
): string {
  const groupedMarkup = ESTATE_CATEGORIES.map((category) => {
    const categoryItems = items.filter((item) => item.categoryId === category.id);
    if (categoryItems.length === 0) {
      return '';
    }

    const itemMarkup = categoryItems
      .map((item) => {
        const detailsMarkup = category.fields
          .map((field) => {
            const value = item.details[field.key]?.trim();
            if (!value) {
              return '';
            }

            return `<li><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(value)}</li>`;
          })
          .join('');

        const beneficiaryMarkup = item.beneficiaries.length
          ? `<h4>Beneficiaries</h4><ul>${item.beneficiaries
              .map(
                (beneficiary) =>
                  `<li>${escapeHtml(beneficiary.name || 'Unnamed beneficiary')} — ${escapeHtml(beneficiary.relationship || 'Relationship not recorded')}${beneficiary.sharePercent ? ` (${escapeHtml(beneficiary.sharePercent)}%)` : ''}${beneficiary.notes ? ` — ${escapeHtml(beneficiary.notes)}` : ''}</li>`,
              )
              .join('')}</ul>`
          : '';

        return `
          <article class="entry">
            <h3>${escapeHtml(item.details[category.summaryFields[0] ?? ''] || category.label)}</h3>
            <ul>${detailsMarkup}</ul>
            ${item.documentLocation ? `<p><strong>Documents:</strong> ${escapeHtml(item.documentLocation)}</p>` : ''}
            ${item.lastVerifiedAt ? `<p><strong>Verified:</strong> ${escapeHtml(formatDate(item.lastVerifiedAt))}</p>` : ''}
            ${item.notes ? `<p><strong>Notes:</strong> ${escapeHtml(item.notes)}</p>` : ''}
            ${beneficiaryMarkup}
          </article>
        `;
      })
      .join('');

    return `
      <section>
        <h2>${escapeHtml(category.label)}</h2>
        ${itemMarkup}
      </section>
    `;
  }).join('');

  const contactsMarkup = accessInfo.trustedContacts.length
    ? `<ul>${accessInfo.trustedContacts
        .map(
          (contact) =>
            `<li><strong>${escapeHtml(contact.name || 'Unnamed contact')}</strong>${contact.isPrimary ? ' (Primary)' : ''}<br/>${escapeHtml(contact.relationship || 'Relationship not recorded')}<br/>${escapeHtml(contact.phone || 'No phone')} · ${escapeHtml(contact.email || 'No email')}<br/>${escapeHtml(contact.knowsAbout || 'No scope recorded')}${contact.notes ? `<br/>${escapeHtml(contact.notes)}` : ''}</li>`,
        )
        .join('')}</ul>`
    : '<p>No trusted contacts saved.</p>';

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Estate Inventory</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 32px; line-height: 1.5; }
          h1, h2, h3, h4 { margin-bottom: 8px; }
          h2 { border-bottom: 1px solid #d1d5db; padding-bottom: 6px; margin-top: 28px; }
          .meta { color: #4b5563; margin-bottom: 24px; }
          .entry { border: 1px solid #d1d5db; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
          ul { margin: 8px 0 0 20px; }
          .instructions { background: #f3f4f6; border-radius: 12px; padding: 16px; }
        </style>
      </head>
      <body>
        <h1>Estate &amp; End-of-Life Financial Inventory</h1>
        <p class="meta">Printed ${escapeHtml(new Date().toLocaleString())}</p>
        <section class="instructions">
          <h2>Emergency access instructions</h2>
          <p><strong>First steps:</strong> ${escapeHtml(accessInfo.instructions || 'No instructions recorded.')}</p>
          <p><strong>Document location:</strong> ${escapeHtml(accessInfo.documentLocation || 'Not recorded')}</p>
          <p><strong>Safe deposit box:</strong> ${escapeHtml(accessInfo.safeDepositLocation || 'Not recorded')}</p>
          <p><strong>Digital vault:</strong> ${escapeHtml(accessInfo.digitalVaultLocation || 'Not recorded')}</p>
          <h3>Trusted contacts</h3>
          ${contactsMarkup}
        </section>
        ${groupedMarkup || '<p>No inventory entries saved yet.</p>'}
      </body>
    </html>
  `;
}

export const ExportInventory: React.FC<ExportInventoryProps> = ({ items, accessInfo }) => {
  const [status, setStatus] = useState<string | null>(null);
  const totalEntries = items.length;
  const payload = useMemo(() => buildExportPayload(items, accessInfo), [items, accessInfo]);

  const downloadSnapshot = useCallback(() => {
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `estate-inventory-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setStatus('Local backup downloaded. Store it somewhere safe.');
    } catch {
      setStatus('Unable to create the backup file.');
    }
  }, [payload]);

  const printSnapshot = useCallback(() => {
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
    if (!popup) {
      setStatus('Your browser blocked the print preview. Allow pop-ups and try again.');
      return;
    }

    popup.document.open();
    popup.document.write(buildPrintableHtml(items, accessInfo));
    popup.document.close();
    popup.focus();
    popup.print();
    setStatus('Print-ready view opened in a new window.');
  }, [accessInfo, items]);

  return (
    <section className="estate-panel estate-export" aria-label="Export inventory">
      <div className="estate-panel__header">
        <div>
          <h2 className="estate-panel__title">Export & print</h2>
          <p className="estate-panel__description">
            Create a safe-deposit-box friendly copy of your inventory.
          </p>
        </div>
        <div className="estate-export__badge">{totalEntries} entries</div>
      </div>

      <p className="estate-export__note">
        Export includes every saved item plus trusted contact and access instructions. Review it
        before printing.
      </p>

      <div className="estate-export__actions">
        <button type="button" className="estate-button" onClick={printSnapshot}>
          Print inventory
        </button>
        <button
          type="button"
          className="estate-button estate-button--secondary"
          onClick={downloadSnapshot}
        >
          Download JSON backup
        </button>
      </div>

      {status ? (
        <p className="estate-export__status" role="status" aria-live="polite">
          {status}
        </p>
      ) : null}

      <div className="estate-export__highlights">
        <div>
          <span className="estate-export__highlight-label">Core categories</span>
          <span className="estate-export__highlight-value">
            {
              ESTATE_CATEGORIES.filter((category) =>
                items.some((item) => item.categoryId === category.id),
              ).length
            }
            /{ESTATE_CATEGORIES.length}
          </span>
        </div>
        <div>
          <span className="estate-export__highlight-label">Primary contact</span>
          <span className="estate-export__highlight-value">
            {accessInfo.trustedContacts.find((contact) => contact.isPrimary)?.name || 'Not set'}
          </span>
        </div>
        <div>
          <span className="estate-export__highlight-label">Latest update</span>
          <span className="estate-export__highlight-value">
            {items[0] ? formatDate(items[0].updatedAt) : formatDate(accessInfo.updatedAt)}
          </span>
        </div>
      </div>
    </section>
  );
};

export default ExportInventory;
