// SPDX-License-Identifier: BUSL-1.1

export type CheckInPromptCategory = 'money-values' | 'goals' | 'stress' | 'celebration';

export interface CheckInPrompt {
  readonly id: string;
  readonly category: CheckInPromptCategory;
  readonly text: string;
}

export interface CheckInEntry {
  readonly participantId: string;
  readonly text: string;
  readonly private: boolean;
}

export function canStartCheckIn(
  consentByParticipant: Readonly<Record<string, boolean>>,
  lastCheckInDate: string | null,
  today: string,
  cadenceDays: number,
): boolean {
  if (!Object.values(consentByParticipant).every(Boolean)) return false;
  if (lastCheckInDate === null) return true;
  const elapsedDays = Math.floor((Date.parse(today) - Date.parse(lastCheckInDate)) / 86_400_000);
  return elapsedDays >= cadenceDays;
}

export function selectNextPrompt(
  prompts: readonly CheckInPrompt[],
  usedPromptIds: readonly string[],
): CheckInPrompt | null {
  return prompts.find((prompt) => !usedPromptIds.includes(prompt.id)) ?? prompts[0] ?? null;
}

export function buildPrivacySafeCheckInSummary(
  entries: readonly CheckInEntry[],
): readonly string[] {
  return entries.map((entry) =>
    entry.private ? `${entry.participantId}: redacted` : `${entry.participantId}: ${entry.text}`,
  );
}

// ---------------------------------------------------------------------------
// Cadence (#2150)
//
// Couples opt in to a supportive weekly or monthly rhythm. These pure helpers
// translate the chosen cadence into the day count `canStartCheckIn` expects so
// the UI never hard-codes the gating maths.
// ---------------------------------------------------------------------------

export type CheckInCadence = 'weekly' | 'monthly';

export const CHECK_IN_CADENCE_DAYS: Readonly<Record<CheckInCadence, number>> = {
  weekly: 7,
  monthly: 30,
};

export function cadenceToDays(cadence: CheckInCadence): number {
  return CHECK_IN_CADENCE_DAYS[cadence];
}

// ---------------------------------------------------------------------------
// Default discussion prompts (#2150)
//
// Collaborative, non-accusatory prompts that span every prompt category so the
// flow rotates through money values, shared goals, stress, and celebration.
// Ordered so `selectNextPrompt` walks them predictably for unused-first rotation.
// ---------------------------------------------------------------------------

export const DEFAULT_CHECK_IN_PROMPTS: readonly CheckInPrompt[] = [
  {
    id: 'fun-money-boundaries',
    category: 'money-values',
    text: 'How are we each feeling about our personal fun-money boundaries this period?',
  },
  {
    id: 'account-structure',
    category: 'money-values',
    text: 'Is our current mix of shared and individual accounts still working for both of us?',
  },
  {
    id: 'upcoming-shared-expenses',
    category: 'goals',
    text: 'What shared expenses are coming up that we want to plan for together?',
  },
  {
    id: 'money-stress',
    category: 'stress',
    text: 'Is any money topic feeling heavy right now that we can support each other on?',
  },
  {
    id: 'celebrate-a-win',
    category: 'celebration',
    text: 'What is one money win, big or small, we want to celebrate together?',
  },
];

// ---------------------------------------------------------------------------
// Privacy-safe neutral summary (#2150)
//
// Couples see neutral aggregates (category totals, budget drift, shared-spending
// changes such as wedding spending) BEFORE any line-item detail. Each section
// exposes a single `summaryCents` headline plus the underlying `detail` rows so
// the UI can keep detail hidden until a partner explicitly reveals more.
// ---------------------------------------------------------------------------

export type CheckInSummaryType = 'category-totals' | 'budget-drift' | 'shared-spending';

export const ALL_CHECK_IN_SUMMARY_TYPES: readonly CheckInSummaryType[] = [
  'category-totals',
  'budget-drift',
  'shared-spending',
];

export interface CheckInLineItem {
  readonly label: string;
  /** Integer cents. May be signed (e.g. negative budget drift means under budget). */
  readonly amountCents: number;
}

export interface CheckInFacts {
  readonly categoryTotals: readonly CheckInLineItem[];
  readonly budgetDriftByCategory: readonly CheckInLineItem[];
  readonly sharedSpendingChanges: readonly CheckInLineItem[];
}

export interface NeutralSummarySection {
  readonly type: CheckInSummaryType;
  readonly title: string;
  /** Aggregate headline shown first; sum of `detail` amounts in integer cents. */
  readonly summaryCents: number;
  /** Line-item breakdown — kept hidden until a partner opts to reveal more. */
  readonly detail: readonly CheckInLineItem[];
}

const SUMMARY_SECTION_TITLES: Readonly<Record<CheckInSummaryType, string>> = {
  'category-totals': 'Category totals',
  'budget-drift': 'Budget drift',
  'shared-spending': 'Shared-spending changes',
};

function sumLineItems(items: readonly CheckInLineItem[]): number {
  return items.reduce((total, item) => total + item.amountCents, 0);
}

/**
 * Build the neutral, privacy-first summary sections from aggregate facts.
 *
 * The returned sections always carry the neutral `summaryCents` headline so the
 * UI can present totals before exposing the `detail` line items.
 */
export function buildNeutralSummary(facts: CheckInFacts): readonly NeutralSummarySection[] {
  const byType: Readonly<Record<CheckInSummaryType, readonly CheckInLineItem[]>> = {
    'category-totals': facts.categoryTotals,
    'budget-drift': facts.budgetDriftByCategory,
    'shared-spending': facts.sharedSpendingChanges,
  };

  return ALL_CHECK_IN_SUMMARY_TYPES.map((type) => {
    const detail = byType[type];
    return {
      type,
      title: SUMMARY_SECTION_TITLES[type],
      summaryCents: sumLineItems(detail),
      detail,
    };
  });
}

/**
 * Apply a partner's consent choice: keep only the summary sections whose type
 * the partner agreed to share. Order is preserved so the recap stays stable.
 */
export function filterSharedSummary(
  sections: readonly NeutralSummarySection[],
  sharedTypes: readonly CheckInSummaryType[],
): readonly NeutralSummarySection[] {
  return sections.filter((section) => sharedTypes.includes(section.type));
}
