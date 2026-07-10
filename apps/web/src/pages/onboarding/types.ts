// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared type definitions for the onboarding flow.
 *
 * Extracted from the former monolithic `OnboardingPage.tsx` (#3712) so step
 * metadata, static content, storage helpers, and step subcomponents can share
 * one vocabulary without importing the page module.
 */

export type OnboardingStep =
  | 'comfort'
  | 'choose'
  | 'privacy'
  | 'newcomer'
  | 'goals'
  | 'template'
  | 'complete';

export type LifeStageId =
  | 'student'
  | 'first-job'
  | 'household'
  | 'caregiver'
  | 'freelancer'
  | 'retiree';

export type GlossaryTermId = 'cashFlow' | 'recurringExpense' | 'savingsGoal' | 'budgetVariance';

export type StoredGoal = {
  id: string;
  name: string;
  goalType: string;
  targetAmount: number;
  startingBalance: number;
  targetDate: string;
  monthlyContribution: number;
};

export type GoalDraft = {
  name: string;
  goalType: string;
  targetAmount: string;
  startingBalance: string;
  targetDate: string;
};

export type LessonChoice = {
  label: string;
  correct: boolean;
  feedback: string;
};

export type Lesson = {
  id: string;
  title: string;
  scenario: string;
  choices: LessonChoice[];
};

export type LifeStageOption = {
  id: LifeStageId;
  label: string;
  setupCopy: string;
  nextStep: string;
  educationPrompt: string;
};

export type NewcomerChoiceOption<TValue extends string> = {
  value: TValue;
  label: string;
  description: string;
};
