// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessible affordance for seeding the kid/family starter category preset.
 *
 * Rendered lazily by {@link CategoriesPage} so the preset data and supportive
 * coaching copy ship in their own async chunk rather than inflating the main
 * categories route bundle.
 *
 * Data access stays hooks-only: the caller passes `createCategory` / `refresh`
 * from `useCategories` rather than this component reaching into a repository.
 *
 * References: issue #2201
 */

import { useCallback, useMemo, useState } from 'react';

import { ConfirmDialog } from '../common';
import type { CreateCategoryInput } from '../../db/repositories/categories';
import type { Category } from '../../kmp/bridge';
import {
  applyFamilyKidsCategories,
  buildFamilyKidsCategoryPlan,
} from '../../lib/categories/family-kids-categories';
import { selectSupportiveFamilyCopy } from '../../lib/coaching/supportive-family-copy';

/** Props for {@link FamilyKidsCategoryCard}. */
export interface FamilyKidsCategoryCardProps {
  /** Current categories, used to compute which preset entries are missing. */
  readonly categories: readonly Category[];
  /** Household the new categories belong to, or `null` when unknown. */
  readonly householdId: string | null;
  /** Creates a category; returns the created record or `null` on failure. */
  readonly createCategory: (input: CreateCategoryInput) => Category | null;
  /** Invoked after categories are successfully seeded. */
  readonly onApplied: () => void;
  /** Surfaces an error message (or clears it with `null`). */
  readonly onError: (message: string | null) => void;
}

/**
 * Card that previews and applies the kid/family starter category preset.
 */
export function FamilyKidsCategoryCard({
  categories,
  householdId,
  createCategory,
  onApplied,
  onError,
}: FamilyKidsCategoryCardProps) {
  const plan = useMemo(() => buildFamilyKidsCategoryPlan(categories), [categories]);
  const copy = useMemo(
    () => selectSupportiveFamilyCopy({ presetComplete: plan.isComplete }),
    [plan.isComplete],
  );

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleRequest = useCallback(() => {
    onError(null);
    setIsConfirmOpen(true);
  }, [onError]);

  const handleCancel = useCallback(() => {
    setIsConfirmOpen(false);
  }, []);

  const handleConfirm = useCallback(() => {
    setIsConfirmOpen(false);

    if (!householdId) {
      onError('Add a category first so we know which household to set up.');
      return;
    }

    const result = applyFamilyKidsCategories<Category>({
      categories,
      householdId,
      createCategory: (input) =>
        createCategory({
          householdId: input.householdId,
          name: input.name,
          icon: input.icon,
          color: input.color,
          sortOrder: input.sortOrder,
        }),
    });

    if (result.createdCount === 0 && !plan.isComplete) {
      onError('Failed to add family & kids categories.');
      return;
    }

    onError(null);
    onApplied();
  }, [categories, createCategory, householdId, onApplied, onError, plan.isComplete]);

  const confirmMessage =
    plan.missing.length > 0
      ? `Add ${plan.missing.length} family & kids categor${
          plan.missing.length === 1 ? 'y' : 'ies'
        } to your list: ${plan.missing
          .map((definition) => definition.name)
          .join(', ')}. You can rename, set budgets for, or remove any of them later.`
      : 'All family & kids categories are already in your list. Nothing new will be added.';

  return (
    <>
      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Add family & kids categories"
        message={confirmMessage}
        confirmLabel="Add categories"
        cancelLabel="Not now"
        variant="info"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
      <section aria-labelledby="family-kids-setup-heading" className="family-kids-setup">
        <div className="card">
          <div className="family-kids-setup__header">
            <div className="family-kids-setup__intro">
              <h3 id="family-kids-setup-heading" className="card__title">
                Family &amp; kids categories
              </h3>
              <p className="family-kids-setup__lede">
                Seed kid-specific categories for school fees, childcare, activities &amp; sports,
                birthdays &amp; gifts, field trips &amp; supplies, kids&rsquo; clothing, and medical
                co-pays. These are the real costs of raising a family.
              </p>
              <p className="family-kids-setup__status">
                {plan.isComplete
                  ? `All ${plan.definitions.length} family & kids categories are ready.`
                  : `${plan.present.length} of ${plan.definitions.length} ready · ${plan.missing.length} will be added.`}
              </p>
            </div>
            <button
              type="button"
              className="form-button form-button--secondary"
              onClick={handleRequest}
            >
              {plan.isComplete ? 'Family & kids ready' : 'Add family & kids categories'}
            </button>
          </div>
          <p role="note" className="family-kids-setup__note">
            <strong className="family-kids-setup__note-headline">{copy.headline}.</strong>{' '}
            {copy.body} {copy.smallWin}
          </p>
          <ul aria-label="Family and kids categories preview" className="family-kids-setup__list">
            {plan.definitions.map((definition) => {
              const isPresent = plan.present.some((entry) => entry.name === definition.name);
              return (
                <li key={definition.name} className="family-kids-setup__item">
                  <span aria-hidden="true">{definition.icon}</span>
                  <span className="family-kids-setup__name">{definition.name}</span>
                  <span
                    className={`family-kids-setup__badge${
                      isPresent ? ' family-kids-setup__badge--present' : ''
                    }`}
                  >
                    {isPresent ? 'Added' : 'Will be added'}
                  </span>
                  <span className="family-kids-setup__desc">{definition.description}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </>
  );
}

export default FamilyKidsCategoryCard;
