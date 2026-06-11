// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';

import { ESTATE_CATEGORIES, getEstateCategory } from '../../lib/estate/categories';
import { summarizeInventory } from '../../lib/estate/inventory';
import type { EstateAccessInfo, EstateInventoryItem } from '../../lib/estate/types';

export interface EstateChecklistProps {
  readonly items: readonly EstateInventoryItem[];
  readonly accessInfo: EstateAccessInfo;
}

export const EstateChecklist: React.FC<EstateChecklistProps> = ({ items, accessInfo }) => {
  const summary = useMemo(() => summarizeInventory(items), [items]);
  const documentedCount = summary.documentedCategories.length;
  const completionPercent = Math.round((documentedCount / ESTATE_CATEGORIES.length) * 100);
  const hasPrimaryContact = accessInfo.trustedContacts.some((contact) => contact.isPrimary);
  const hasInstructions = accessInfo.instructions.trim().length > 0;
  const missingLabels = summary.missingCategories.map(
    (categoryId) => getEstateCategory(categoryId).label,
  );

  const checks = [
    {
      id: 'categories',
      label: 'Categories documented',
      detail: `${documentedCount} of ${ESTATE_CATEGORIES.length} categories documented`,
      complete: documentedCount === ESTATE_CATEGORIES.length,
    },
    {
      id: 'documents',
      label: 'Document locations recorded',
      detail:
        summary.itemsMissingDocuments === 0
          ? 'Every entry includes where documents live.'
          : `${summary.itemsMissingDocuments} entr${summary.itemsMissingDocuments === 1 ? 'y is' : 'ies are'} missing a document location.`,
      complete: summary.itemsMissingDocuments === 0,
    },
    {
      id: 'verification',
      label: 'Recently verified',
      detail:
        summary.itemsMissingVerification === 0
          ? 'Every entry has a verification date.'
          : `${summary.itemsMissingVerification} entr${summary.itemsMissingVerification === 1 ? 'y needs' : 'ies need'} a verification date.`,
      complete: summary.itemsMissingVerification === 0,
    },
    {
      id: 'contacts',
      label: 'Trusted contacts assigned',
      detail:
        accessInfo.trustedContacts.length === 0
          ? 'Add at least one trusted contact.'
          : `${accessInfo.trustedContacts.length} trusted contact${accessInfo.trustedContacts.length === 1 ? '' : 's'} saved${hasPrimaryContact ? ', including a primary contact' : ', but no primary contact yet'}.`,
      complete: accessInfo.trustedContacts.length > 0 && hasPrimaryContact,
    },
    {
      id: 'instructions',
      label: 'Emergency instructions captured',
      detail: hasInstructions
        ? 'Access instructions are written down for beneficiaries.'
        : 'Add emergency instructions so trusted helpers know what to do first.',
      complete: hasInstructions,
    },
  ] as const;

  return (
    <section className="estate-panel estate-checklist" aria-label="Estate inventory checklist">
      <div className="estate-panel__header">
        <div>
          <h2 className="estate-panel__title">Completeness checklist</h2>
          <p className="estate-panel__description">
            Use this to spot what beneficiaries would still be missing.
          </p>
        </div>
        <div
          className="estate-checklist__score"
          aria-label={`${completionPercent}% of categories documented`}
        >
          <span className="estate-checklist__score-number">{completionPercent}%</span>
          <span className="estate-checklist__score-label">coverage</span>
        </div>
      </div>

      <ul className="estate-checklist__items" role="list">
        {checks.map((check) => (
          <li
            key={check.id}
            className={`estate-checklist__item ${check.complete ? 'estate-checklist__item--complete' : 'estate-checklist__item--needs-work'}`}
          >
            <div className="estate-checklist__status" aria-hidden="true">
              {check.complete ? '✓' : '!'}
            </div>
            <div>
              <h3 className="estate-checklist__item-title">{check.label}</h3>
              <p className="estate-checklist__item-detail">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="estate-checklist__missing">
        <h3 className="estate-checklist__missing-title">Still missing</h3>
        {missingLabels.length > 0 ? (
          <ul className="estate-checklist__missing-list" role="list">
            {missingLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        ) : (
          <p className="estate-checklist__item-detail">Every core category is documented.</p>
        )}
      </div>
    </section>
  );
};

export default EstateChecklist;
