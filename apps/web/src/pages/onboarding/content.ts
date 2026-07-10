// SPDX-License-Identifier: BUSL-1.1

/**
 * Static onboarding content: life-stage options, financial lessons, glossary
 * terms, and the newcomer tax/income choice options. Extracted from
 * `OnboardingPage.tsx` (#3712).
 */

import type { IncomeType, TaxIdStatus } from '../../lib/onboarding/newcomer-tax-profile';

import type {
  GlossaryTermId,
  GoalDraft,
  Lesson,
  LifeStageOption,
  NewcomerChoiceOption,
} from './types';

export const LIFE_STAGE_OPTIONS: LifeStageOption[] = [
  {
    id: 'student',
    label: 'Student',
    setupCopy: 'Keep school expenses, part-time income, and semester timing visible.',
    nextStep: 'Review flexible spending and textbook or supplies categories.',
    educationPrompt: 'Try the needs vs wants lesson before editing categories.',
  },
  {
    id: 'first-job',
    label: 'First full-time job',
    setupCopy: 'Plan around a paycheck rhythm, benefits deductions, and first emergency savings.',
    nextStep: 'Add recurring paycheck and fixed bill estimates first.',
    educationPrompt: 'Start with the cash-flow lesson to see how pay dates and bills line up.',
  },
  {
    id: 'household',
    label: 'Couple or household',
    setupCopy: 'Coordinate shared bills while keeping room for individual spending choices.',
    nextStep: 'List shared fixed expenses before deciding what to track together.',
    educationPrompt:
      'Use the recurring-expenses lesson to separate shared commitments from flexible spending.',
  },
  {
    id: 'caregiver',
    label: 'Caregiver',
    setupCopy: 'Leave space for irregular care costs and reimbursements without judging the plan.',
    nextStep: 'Create a notes-first estimate for medical, travel, or support costs.',
    educationPrompt: 'Review the emergency-fund lesson for unpredictable timing examples.',
  },
  {
    id: 'freelancer',
    label: 'Freelancer',
    setupCopy: 'Expect uneven income, taxes, and business expenses alongside personal categories.',
    nextStep: 'Estimate conservative income and set aside tax or buffer categories.',
    educationPrompt: 'The cash-flow lesson explains why timing matters when income varies.',
  },
  {
    id: 'retiree',
    label: 'Retiree',
    setupCopy: 'Focus on predictable income streams, healthcare, giving, and drawdown timing.',
    nextStep: 'Start with fixed monthly income and essential expenses.',
    educationPrompt:
      'Use the variance lesson to understand why actual spending can drift from plan.',
  },
];

export const FINANCIAL_LESSONS: Lesson[] = [
  {
    id: 'needs-wants',
    title: 'Needs vs wants',
    scenario:
      "You have rent, groceries, streaming, and a concert ticket in this month's plan. Which one is usually flexible?",
    choices: [
      { label: 'Rent', correct: false, feedback: 'Rent is usually a fixed need.' },
      {
        label: 'Groceries',
        correct: false,
        feedback: 'Groceries are a need, though the amount can flex.',
      },
      {
        label: 'Concert ticket',
        correct: true,
        feedback: 'Right. Optional fun spending is easier to adjust first.',
      },
    ],
  },
  {
    id: 'cash-flow',
    title: 'Cash flow timing',
    scenario: 'A bill is due two days before payday. What helps you avoid a shortfall?',
    choices: [
      { label: 'Ignore the due date', correct: false, feedback: 'Due dates are part of the plan.' },
      {
        label: 'Keep a small buffer',
        correct: true,
        feedback: 'Right. A buffer helps bridge timing gaps.',
      },
      {
        label: 'Delete the bill',
        correct: false,
        feedback: 'The bill still exists even if it is not tracked.',
      },
    ],
  },
  {
    id: 'recurring-expenses',
    title: 'Recurring expenses',
    scenario: 'Which item should usually be marked recurring?',
    choices: [
      {
        label: 'Monthly phone bill',
        correct: true,
        feedback: 'Right. Repeated bills belong in the recurring plan.',
      },
      {
        label: 'One-time gift',
        correct: false,
        feedback: 'A one-time gift belongs in this month only.',
      },
      { label: 'Unexpected refund', correct: false, feedback: 'Refunds are not expenses.' },
    ],
  },
];

export const GLOSSARY_TERMS: Record<GlossaryTermId, { title: string; body: string }> = {
  cashFlow: {
    title: 'Cash flow',
    body: 'Cash flow is the timing of money coming in and going out. It is not advice. It simply helps you spot tight weeks before they happen.',
  },
  recurringExpense: {
    title: 'Recurring expense',
    body: 'A recurring expense is a cost that repeats on a schedule, like rent, a phone bill, or a subscription.',
  },
  savingsGoal: {
    title: 'Savings goal',
    body: 'A savings goal is a target you choose to track, such as a buffer or trip fund. Finance shows progress, but you decide what fits your situation.',
  },
  budgetVariance: {
    title: 'Budget variance',
    body: 'Budget variance is the difference between what you planned and what happened. It is a learning signal, not a grade.',
  },
};

export const TAX_ID_STATUS_OPTIONS: Array<NewcomerChoiceOption<TaxIdStatus>> = [
  {
    value: 'ssn',
    label: 'I have an SSN',
    description: 'A Social Security Number.',
  },
  {
    value: 'itin',
    label: 'I use an ITIN',
    description: 'An ITIN is used to file taxes when you do not have an SSN.',
  },
  {
    value: 'none',
    label: 'I do not have one yet',
    description: 'You can still budget and save today.',
  },
  {
    value: 'unspecified',
    label: 'Prefer not to say',
    description: 'Skip this. Nothing here is required.',
  },
];

export const INCOME_TYPE_OPTIONS: Array<NewcomerChoiceOption<IncomeType>> = [
  {
    value: 'w2',
    label: 'W-2 job',
    description: 'Taxes come out of each paycheck for you.',
  },
  {
    value: '1099',
    label: '1099 or contract',
    description: 'You handle your own taxes.',
  },
  {
    value: 'hourly',
    label: 'Hourly',
    description: 'Hours can change week to week.',
  },
  {
    value: 'seasonal',
    label: 'Seasonal',
    description: 'Busy and slow times of year.',
  },
  {
    value: 'mixed',
    label: 'A mix',
    description: 'More than one of these.',
  },
  {
    value: 'unspecified',
    label: 'Prefer not to say',
    description: 'Skip this. It stays optional.',
  },
];

export const DEFAULT_GOAL_DRAFT: GoalDraft = {
  name: 'Emergency buffer',
  goalType: 'Emergency savings',
  targetAmount: '1000',
  startingBalance: '0',
  targetDate: '',
};
