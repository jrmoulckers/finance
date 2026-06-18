// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  markFirstBudgetStepComplete,
  pauseFirstBudgetTutorial,
  upsertFirstBudgetEstimate,
} from '../../onboarding/first-budget-tutorial';
import {
  deserializeFirstBudgetTutorialDraft,
  buildFirstBudgetTutorialEntryState,
  serializeFirstBudgetTutorialDraft,
} from '../first-budget-tutorial-entry';

describe('first budget tutorial entry state', () => {
  it('serializes drafts for local persistence and resumes paused steps', () => {
    const draft = pauseFirstBudgetTutorial(
      markFirstBudgetStepComplete(
        upsertFirstBudgetEstimate(
          { estimates: [], completedStepIds: [], confirmedForSave: false },
          {
            id: 'income',
            label: 'Paycheck',
            kind: 'income',
            amountCents: 250_000,
            isRoughEstimate: true,
          },
        ),
        'income',
      ),
      'fixed-expenses',
    );

    const restored = deserializeFirstBudgetTutorialDraft(serializeFirstBudgetTutorialDraft(draft));
    const state = buildFirstBudgetTutorialEntryState({ draft: restored, surface: 'dashboard' });

    expect(state.route).toBe('/budgets/first-budget');
    expect(state.ctaLabel).toBe('Resume first budget');
    expect(state.resumeStepId).toBe('fixed-expenses');
  });

  it('keeps student starter availability separate from tutorial flow', () => {
    const state = buildFirstBudgetTutorialEntryState({
      surface: 'onboarding',
      studentStarterTemplateAvailable: true,
    });

    expect(state.route).toBe('/onboarding/first-budget');
    expect(state.studentStarterTemplateAvailable).toBe(true);
    expect(state.hasSavedDraft).toBe(false);
  });
});
