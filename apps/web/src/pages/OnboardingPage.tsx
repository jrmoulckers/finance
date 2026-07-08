// SPDX-License-Identifier: BUSL-1.1

/**
 * OnboardingPage — first-run onboarding for the web app.
 *
 * Before signup it offers a genuine welcome/get-started experience:
 *   1. Comfort settings (accessibility — no account details)
 *   2. A path choice: Local Only vs Create Account
 *
 * The financial-education and starter-budget-template content is deferred until
 * AFTER signup for the account path (#3089): "Create Account" navigates to
 * `/signup` without completing onboarding, and once the user is authenticated the
 * app re-launches onboarding starting at the template/education step. Local-only
 * users (who decline signup) see that content right after the privacy step.
 *
 * References: issue #1621, #2148, #3089
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { AppIcon } from '../components/icons';
import { Checkbox } from '../components/common/Checkbox';
import { useDatabase } from '../db/DatabaseProvider';
import { getPrimaryHouseholdId } from '../db/repositories/household';
import { useBudgets } from '../hooks/useBudgets';
import { useConsent } from '../hooks/useConsent';
import { useConsentHistory } from '../hooks/useConsentHistory';
import { useGoals } from '../hooks/useGoals';
import {
  DEFAULT_FONT_SCALE_PREFERENCE,
  FONT_SCALE_OPTIONS,
  getFontScaleOption,
  setFontScalePreference,
} from '../hooks/useFontScale';
import { useLocalOnlyMode } from '../hooks/useLocalOnlyMode';
import { setReducedMotionPreference } from '../hooks/useReducedMotion';
import { applyTheme, THEME_STORAGE_KEY } from '../hooks/useTheme';
import { setSimplifiedModePreference } from '../lib/accessibility-preferences';
import { formatCurrencyValue } from '../lib/currency';
import { buildOnboardingProgressAnnouncement } from '../lib/a11y/onboarding-progress';
import { getBudgetStarterTemplates } from '../lib/budgeting/starter-budget-templates';
import {
  newcomerExplainers,
  type NewcomerExplainerKey,
} from '../lib/education/newcomer-explainers';
import {
  getNewcomerGuidance,
  isIncomeType,
  isTaxIdStatus,
  type IncomeType,
  type TaxIdStatus,
} from '../lib/onboarding/newcomer-tax-profile';
import type { FeatureAvailability } from '../lib/local-only-mode';

import './OnboardingPage.css';

const DEFAULT_FONT_SCALE_INDEX = Math.max(
  FONT_SCALE_OPTIONS.findIndex((option) => option.value === DEFAULT_FONT_SCALE_PREFERENCE),
  0,
);
const SIMPLE_MODE_FONT_SCALE_INDEX = Math.max(
  FONT_SCALE_OPTIONS.findIndex((option) => option.value === 'large'),
  DEFAULT_FONT_SCALE_INDEX,
);

type OnboardingStep =
  'comfort' | 'choose' | 'privacy' | 'newcomer' | 'goals' | 'template' | 'complete';

const ONBOARDING_STEP_ORDER: readonly OnboardingStep[] = [
  'comfort',
  'choose',
  'privacy',
  'newcomer',
  'goals',
  'template',
  'complete',
];

const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  comfort: 'Comfort preferences',
  choose: 'Choose setup path',
  privacy: 'Privacy preferences',
  newcomer: 'Personalize your setup',
  goals: 'Set a savings goal',
  template: 'Starter budget template',
  complete: 'Setup complete',
};

// The deferred education/setup sequence (#3118) that runs after the privacy step
// for local-only users, and as the resume point for authenticated post-signup
// visitors (#3089).
const DEFERRED_SETUP_START_STEP: OnboardingStep = 'newcomer';

type LifeStageId = 'student' | 'first-job' | 'household' | 'caregiver' | 'freelancer' | 'retiree';
type GlossaryTermId = 'cashFlow' | 'recurringExpense' | 'savingsGoal' | 'budgetVariance';

type StoredGoal = {
  id: string;
  name: string;
  goalType: string;
  targetAmount: number;
  startingBalance: number;
  targetDate: string;
  monthlyContribution: number;
};

type GoalDraft = {
  name: string;
  goalType: string;
  targetAmount: string;
  startingBalance: string;
  targetDate: string;
};

type LessonChoice = {
  label: string;
  correct: boolean;
  feedback: string;
};

type Lesson = {
  id: string;
  title: string;
  scenario: string;
  choices: LessonChoice[];
};

const LIFE_STAGE_STORAGE_KEY = 'finance-onboarding-life-stages';
const LESSONS_STORAGE_KEY = 'finance-onboarding-completed-lessons';
const TEMPLATE_GUIDANCE_ANCHOR = 'onboarding-life-stage-guidance';
const TEMPLATE_LESSONS_ANCHOR = 'onboarding-financial-lessons';
const GOALS_STORAGE_KEY = 'finance-onboarding-goals';
const COACH_MARKS_STORAGE_KEY = 'finance-onboarding-coach-marks-dismissed';
const CHECKLIST_HIDDEN_STORAGE_KEY = 'finance-onboarding-checklist-hidden';
const ANALYTICS_EVENTS_STORAGE_KEY = 'finance-onboarding-analytics-events';

const ONBOARDING_STORAGE_PREFIX = 'finance-onboarding';
const TAX_ID_STATUS_STORAGE_KEY = `${ONBOARDING_STORAGE_PREFIX}-tax-id-status`;
const INCOME_TYPE_STORAGE_KEY = `${ONBOARDING_STORAGE_PREFIX}-income-type`;

const LIFE_STAGE_OPTIONS: Array<{
  id: LifeStageId;
  label: string;
  setupCopy: string;
  nextStep: string;
  educationPrompt: string;
}> = [
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

const FINANCIAL_LESSONS: Lesson[] = [
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

const GLOSSARY_TERMS: Record<GlossaryTermId, { title: string; body: string }> = {
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

type NewcomerChoiceOption<TValue extends string> = {
  value: TValue;
  label: string;
  description: string;
};

const TAX_ID_STATUS_OPTIONS: Array<NewcomerChoiceOption<TaxIdStatus>> = [
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

const INCOME_TYPE_OPTIONS: Array<NewcomerChoiceOption<IncomeType>> = [
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

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode / disabled); values simply do not persist.
  }
}

function readTaxIdStatus(): TaxIdStatus {
  try {
    const raw = localStorage.getItem(TAX_ID_STATUS_STORAGE_KEY);
    return raw && isTaxIdStatus(raw) ? raw : 'unspecified';
  } catch {
    return 'unspecified';
  }
}

function readIncomeType(): IncomeType {
  try {
    const raw = localStorage.getItem(INCOME_TYPE_STORAGE_KEY);
    return raw && isIncomeType(raw) ? raw : 'unspecified';
  } catch {
    return 'unspecified';
  }
}

function persistOnboardingCategory(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); selections simply do not persist.
  }
}

function firstOfCurrentMonthISO(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function todayISO(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function applyComfortPreferences(
  fontScaleValue: number,
  reducedMotion: boolean,
  simplifiedMode: boolean,
  highContrast: boolean,
): void {
  const selectedFontScale =
    FONT_SCALE_OPTIONS[Math.min(Math.max(fontScaleValue, 0), FONT_SCALE_OPTIONS.length - 1)] ??
    getFontScaleOption(DEFAULT_FONT_SCALE_PREFERENCE);

  setFontScalePreference(selectedFontScale.value);
  setReducedMotionPreference(reducedMotion);
  setSimplifiedModePreference(simplifiedMode);

  const nextTheme = highContrast ? 'high-contrast' : 'system';
  safeSetItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
}

function readStringArray(key: string): string[] {
  try {
    const stored = localStorage.getItem(key);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function writeStringArray(key: string, values: string[]): void {
  safeSetItem(key, JSON.stringify(values));
}

function readBoolean(key: string): boolean {
  return safeGetItem(key) === 'true';
}

function writeBoolean(key: string, value: boolean): void {
  safeSetItem(key, String(value));
}

function readGoals(): StoredGoal[] {
  try {
    const stored = localStorage.getItem(GOALS_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? (parsed as StoredGoal[]) : [];
  } catch {
    return [];
  }
}

function writeGoals(goals: StoredGoal[]): void {
  safeSetItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
}

const DEFAULT_GOAL_DRAFT: GoalDraft = {
  name: 'Emergency buffer',
  goalType: 'Emergency savings',
  targetAmount: '1000',
  startingBalance: '0',
  targetDate: '',
};

function isLifeStageId(value: string): value is LifeStageId {
  return LIFE_STAGE_OPTIONS.some((option) => option.id === value);
}

function calculateMonthlyContribution(draft: GoalDraft): number {
  const targetAmount = Number(draft.targetAmount) || 0;
  const startingBalance = Number(draft.startingBalance) || 0;
  const remainingAmount = Math.max(targetAmount - startingBalance, 0);

  if (!draft.targetDate) {
    return remainingAmount;
  }

  const today = new Date();
  const targetDate = new Date(`${draft.targetDate}T00:00:00`);
  const monthDelta =
    (targetDate.getFullYear() - today.getFullYear()) * 12 +
    targetDate.getMonth() -
    today.getMonth();
  const months = Math.max(monthDelta, 1);

  return Math.ceil(remainingAmount / months);
}

function trackOnboardingEvent(
  analyticsEnabled: boolean,
  eventName: string,
  payload: Record<string, unknown> = {},
): void {
  if (!analyticsEnabled) {
    return;
  }

  const existing = safeGetItem(ANALYTICS_EVENTS_STORAGE_KEY);
  let events: unknown;
  try {
    events = existing ? JSON.parse(existing) : [];
  } catch {
    events = [];
  }
  const nextEvents = Array.isArray(events) ? events : [];
  nextEvents.push({ eventName, payload, timestamp: new Date().toISOString() });
  safeSetItem(ANALYTICS_EVENTS_STORAGE_KEY, JSON.stringify(nextEvents));
}

const FeatureRow: React.FC<{ feature: FeatureAvailability }> = ({ feature }) => (
  <tr className="onboarding__feature-row">
    <td className="onboarding__feature-name">
      <span className="onboarding__feature-title">{feature.name}</span>
      <span className="onboarding__feature-desc">{feature.description}</span>
    </td>
    <td
      className="onboarding__feature-cell"
      aria-label={
        feature.availableLocalOnly ? 'Available in Local Only' : 'Not available in Local Only'
      }
    >
      {feature.availableLocalOnly ? (
        <span className="onboarding__check" aria-hidden="true">
          <AppIcon name="check" />
        </span>
      ) : (
        <span className="onboarding__cross" aria-hidden="true">
          —
        </span>
      )}
    </td>
    <td className="onboarding__feature-cell" aria-label="Available with Account">
      <span className="onboarding__check" aria-hidden="true">
        <AppIcon name="check" />
      </span>
    </td>
  </tr>
);

const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { features, enableLocalOnly, completeOnboarding } = useLocalOnlyMode();
  const { acceptAll, rejectAll, consent } = useConsent();
  const { recordBulkChanges } = useConsentHistory();
  const { createBudgetTemplate } = useBudgets();
  const { createGoal } = useGoals();
  const db = useDatabase();

  const starterTemplates = useMemo(() => getBudgetStarterTemplates(), []);
  const studentTemplate = starterTemplates.find((template) => template.id === 'student') ?? null;
  const futureTemplates = starterTemplates.filter((template) => template.isAvailable === false);

  const [step, setStep] = useState<OnboardingStep>(() =>
    // Authenticated visitors have already completed signup (and saw the pre-signup
    // welcome/comfort/choose screens), so resume onboarding at the deferred
    // education/setup sequence rather than repeating the welcome flow (#3089).
    isAuthenticated ? DEFERRED_SETUP_START_STEP : 'comfort',
  );
  const [fontScaleValue, setFontScaleValue] = useState(DEFAULT_FONT_SCALE_INDEX);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [simplifiedMode, setSimplifiedMode] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [starterBudgetCreated, setStarterBudgetCreated] = useState(false);
  const [selectedLifeStages, setSelectedLifeStages] = useState<LifeStageId[]>(() =>
    readStringArray(LIFE_STAGE_STORAGE_KEY).filter(isLifeStageId),
  );
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>(() =>
    readStringArray(LESSONS_STORAGE_KEY),
  );
  const [lessonFeedback, setLessonFeedback] = useState<Record<string, string>>({});
  const [lessonSelections, setLessonSelections] = useState<Record<string, string>>({});
  const [lessonsOptedIn, setLessonsOptedIn] = useState<boolean>(
    () => readStringArray(LESSONS_STORAGE_KEY).length > 0,
  );
  const [pendingTemplateAnchor, setPendingTemplateAnchor] = useState<string | null>(null);
  const [activeGlossaryTerm, setActiveGlossaryTerm] = useState<GlossaryTermId | null>(null);
  const [coachMarksDismissed, setCoachMarksDismissed] = useState(() =>
    readBoolean(COACH_MARKS_STORAGE_KEY),
  );
  const [setupChecklistHidden, setSetupChecklistHidden] = useState(() =>
    readBoolean(CHECKLIST_HIDDEN_STORAGE_KEY),
  );
  const [savedGoals, setSavedGoals] = useState<StoredGoal[]>(() => readGoals());
  const [goalDraft, setGoalDraft] = useState<GoalDraft>(DEFAULT_GOAL_DRAFT);
  const [goalReviewVisible, setGoalReviewVisible] = useState(false);
  const [goalSavedName, setGoalSavedName] = useState<string | null>(null);
  const [taxIdStatus, setTaxIdStatus] = useState<TaxIdStatus>(() => readTaxIdStatus());
  const [incomeType, setIncomeType] = useState<IncomeType>(() => readIncomeType());
  const [activeExplainer, setActiveExplainer] = useState<NewcomerExplainerKey | null>(null);
  const explainerCloseRef = useRef<HTMLButtonElement>(null);
  const explainerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const glossaryCloseRef = useRef<HTMLButtonElement>(null);
  const glossaryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef<OnboardingStep>(step);

  const analyticsEnabled = consent.categories.analytics;
  const newcomerGuidance = useMemo(
    () => getNewcomerGuidance({ taxIdStatus, incomeType }),
    [taxIdStatus, incomeType],
  );
  const newcomerExplainerList = useMemo(
    () => newcomerGuidance.explainers.map((key) => newcomerExplainers[key]),
    [newcomerGuidance.explainers],
  );
  const selectedLifeStageOptions = useMemo(
    () => LIFE_STAGE_OPTIONS.filter((option) => selectedLifeStages.includes(option.id)),
    [selectedLifeStages],
  );
  const selectedStageLabels = selectedLifeStageOptions.map((option) => option.label).join(', ');
  const monthlyContribution = calculateMonthlyContribution(goalDraft);
  const goalTargetAmount = Number(goalDraft.targetAmount) || 0;
  const isGoalDraftValid = goalTargetAmount > 0;
  const fullySetUp = starterBudgetCreated || savedGoals.length > 0;
  const currentStepIndex = Math.max(ONBOARDING_STEP_ORDER.indexOf(step), 0);
  const totalStepCount = ONBOARDING_STEP_ORDER.length;
  const onboardingProgressAnnouncement = buildOnboardingProgressAnnouncement({
    stepLabel: ONBOARDING_STEP_LABELS[step],
    stepIndex: currentStepIndex,
    totalSteps: totalStepCount,
    status: templateError
      ? 'error'
      : isApplyingTemplate
        ? 'saving'
        : step === 'complete'
          ? 'complete'
          : 'current',
    errorCount: templateError ? 1 : 0,
  });
  const onboardingProgressLiveRegion = (
    <p
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Onboarding progress"
    >
      {onboardingProgressAnnouncement}
    </p>
  );

  // Visible companion to the live region above (#3118). Marked aria-hidden so the
  // step count is announced exactly once — by the polite live region — for screen
  // readers, while sighted users still get a persistent progress cue.
  const stepProgressIndicator =
    step === 'complete' ? null : (
      <div className="onboarding__progress" aria-hidden="true">
        <p className="onboarding__progress-label">
          Step {currentStepIndex + 1} of {totalStepCount}
        </p>
        <ol className="onboarding__progress-track">
          {ONBOARDING_STEP_ORDER.map((orderedStep, index) => (
            <li
              key={orderedStep}
              className={
                index <= currentStepIndex
                  ? 'onboarding__progress-dot onboarding__progress-dot--active'
                  : 'onboarding__progress-dot'
              }
            />
          ))}
        </ol>
      </div>
    );

  const onboardingClassName = [
    'onboarding',
    reducedMotion ? 'onboarding--reduced-motion' : '',
    simplifiedMode ? 'onboarding--simplified' : '',
    highContrast ? 'onboarding--high-contrast' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const updateComfortPreferences = useCallback(
    (
      nextFontScaleValue: number,
      nextReducedMotion: boolean,
      nextSimplifiedMode: boolean,
      nextHighContrast: boolean,
    ) => {
      applyComfortPreferences(
        nextFontScaleValue,
        nextReducedMotion,
        nextSimplifiedMode,
        nextHighContrast,
      );
    },
    [],
  );

  const handleFontScaleChange = useCallback(
    (value: number) => {
      setFontScaleValue(value);
      updateComfortPreferences(value, reducedMotion, simplifiedMode, highContrast);
    },
    [highContrast, reducedMotion, simplifiedMode, updateComfortPreferences],
  );

  const handleReducedMotionChange = useCallback(
    (checked: boolean) => {
      setReducedMotion(checked);
      updateComfortPreferences(fontScaleValue, checked, simplifiedMode, highContrast);
    },
    [fontScaleValue, highContrast, simplifiedMode, updateComfortPreferences],
  );

  const handleSimplifiedModeChange = useCallback(
    (checked: boolean) => {
      setSimplifiedMode(checked);
      updateComfortPreferences(fontScaleValue, reducedMotion, checked, highContrast);
    },
    [fontScaleValue, highContrast, reducedMotion, updateComfortPreferences],
  );

  const handleHighContrastChange = useCallback(
    (checked: boolean) => {
      setHighContrast(checked);
      updateComfortPreferences(fontScaleValue, reducedMotion, simplifiedMode, checked);
    },
    [fontScaleValue, reducedMotion, simplifiedMode, updateComfortPreferences],
  );

  const handleLifeStageToggle = useCallback(
    (lifeStageId: LifeStageId) => {
      setSelectedLifeStages((current) => {
        const next = current.includes(lifeStageId)
          ? current.filter((id) => id !== lifeStageId)
          : [...current, lifeStageId];
        writeStringArray(LIFE_STAGE_STORAGE_KEY, next);
        trackOnboardingEvent(analyticsEnabled, 'onboarding_life_stage_updated', {
          selectedLifeStages: next,
        });
        return next;
      });
    },
    [analyticsEnabled],
  );

  const handleClearLifeStages = useCallback(() => {
    setSelectedLifeStages([]);
    writeStringArray(LIFE_STAGE_STORAGE_KEY, []);
    trackOnboardingEvent(analyticsEnabled, 'onboarding_life_stage_cleared');
  }, [analyticsEnabled]);

  const handleLessonChoice = useCallback(
    (lesson: Lesson, choice: LessonChoice) => {
      setLessonSelections((current) => ({ ...current, [lesson.id]: choice.label }));
      setLessonFeedback((current) => ({ ...current, [lesson.id]: choice.feedback }));

      if (!choice.correct) {
        return;
      }

      setCompletedLessonIds((current) => {
        const next = current.includes(lesson.id) ? current : [...current, lesson.id];
        writeStringArray(LESSONS_STORAGE_KEY, next);
        trackOnboardingEvent(analyticsEnabled, 'onboarding_lesson_completed', {
          lessonId: lesson.id,
        });
        return next;
      });
    },
    [analyticsEnabled],
  );

  const handleGoalDraftChange = useCallback((field: keyof GoalDraft, value: string) => {
    setGoalDraft((current) => ({ ...current, [field]: value }));
    setGoalReviewVisible(false);
    setGoalSavedName(null);
  }, []);

  const handleAmountDraftChange = useCallback(
    (field: 'targetAmount' | 'startingBalance', value: string) => {
      handleGoalDraftChange(field, value.replace(/[^0-9.]/g, ''));
    },
    [handleGoalDraftChange],
  );

  const handlePreviewGoal = useCallback(() => {
    if ((Number(goalDraft.targetAmount) || 0) <= 0) {
      return;
    }
    setGoalReviewVisible(true);
  }, [goalDraft.targetAmount]);

  const handleSaveGoal = useCallback(() => {
    if ((Number(goalDraft.targetAmount) || 0) <= 0) {
      return;
    }
    const nextGoal: StoredGoal = {
      id: `goal-${Date.now()}`,
      name: goalDraft.name.trim() || 'My goal',
      goalType: goalDraft.goalType,
      targetAmount: Number(goalDraft.targetAmount) || 0,
      startingBalance: Number(goalDraft.startingBalance) || 0,
      targetDate: goalDraft.targetDate,
      monthlyContribution,
    };

    setSavedGoals((current) => {
      const next = [...current, nextGoal];
      writeGoals(next);
      return next;
    });
    setGoalReviewVisible(false);
    setGoalDraft(DEFAULT_GOAL_DRAFT);
    setGoalSavedName(nextGoal.name);
    trackOnboardingEvent(analyticsEnabled, 'onboarding_goal_saved', {
      goalType: nextGoal.goalType,
    });
  }, [analyticsEnabled, goalDraft, monthlyContribution]);

  const persistOnboardingGoalsToStore = useCallback(() => {
    // Goals captured during onboarding live only in a standalone localStorage
    // key until now; migrate them into the real goals store so they show up on
    // /goals just like starter budgets do (#3405). Amounts are entered in whole
    // currency units and stored as minor units (cents) to match the goals repo.
    // A migration failure must never block onboarding completion.
    try {
      const pendingGoals = readGoals();
      if (pendingGoals.length === 0) {
        return;
      }

      const householdId = getPrimaryHouseholdId(db);
      if (!householdId) {
        return;
      }

      let migratedAny = false;
      for (const goal of pendingGoals) {
        const created = createGoal({
          householdId,
          name: goal.name,
          description: goal.goalType || null,
          targetAmount: { amount: Math.round(goal.targetAmount * 100) },
          currentAmount: { amount: Math.round(goal.startingBalance * 100) },
          targetDate: goal.targetDate ? goal.targetDate : null,
        });
        if (created) {
          migratedAny = true;
        }
      }

      if (migratedAny) {
        writeGoals([]);
      }
    } catch {
      // Best-effort migration; onboarding completion continues regardless.
    }
  }, [createGoal, db]);

  const handleCoachMarksDismiss = useCallback(() => {
    setCoachMarksDismissed(true);
    writeBoolean(COACH_MARKS_STORAGE_KEY, true);
  }, []);

  const handleCoachMarksRestore = useCallback(() => {
    setCoachMarksDismissed(false);
    writeBoolean(COACH_MARKS_STORAGE_KEY, false);
  }, []);

  const handleChecklistHiddenChange = useCallback((hidden: boolean) => {
    setSetupChecklistHidden(hidden);
    writeBoolean(CHECKLIST_HIDDEN_STORAGE_KEY, hidden);
  }, []);

  const handleUseSimpleMode = useCallback(() => {
    setFontScaleValue(SIMPLE_MODE_FONT_SCALE_INDEX);
    setReducedMotion(true);
    setSimplifiedMode(true);
    updateComfortPreferences(SIMPLE_MODE_FONT_SCALE_INDEX, true, true, highContrast);
    setStep('choose');
  }, [highContrast, updateComfortPreferences]);

  const handleComfortContinue = useCallback(() => {
    setStep('choose');
  }, []);

  const handleLocalOnly = useCallback(() => {
    setTemplateError(null);
    setStep('privacy');
  }, []);

  const handleCreateAccount = useCallback(() => {
    // Defer onboarding completion until AFTER signup (#3089). Onboarding stays
    // incomplete so that, once the user is authenticated, the app re-launches
    // onboarding at the education/template step. `/signup` is exempt from the
    // first-run auto-redirect (see FIRST_RUN_ALLOWED_ROUTES in App.tsx).
    navigate('/signup');
  }, [navigate]);

  const handlePrivacyAcceptEssential = useCallback(() => {
    rejectAll();
    recordBulkChanges(
      [
        { category: 'analytics', granted: false },
        { category: 'error_reporting', granted: false },
        { category: 'sync', granted: false },
        { category: 'marketing', granted: false },
      ],
      'first_run',
    );
    enableLocalOnly();
    setTemplateError(null);
    setStep(DEFERRED_SETUP_START_STEP);
  }, [enableLocalOnly, recordBulkChanges, rejectAll]);

  const handlePrivacyAcceptAll = useCallback(() => {
    acceptAll();
    recordBulkChanges(
      [
        { category: 'analytics', granted: true },
        { category: 'error_reporting', granted: true },
        { category: 'sync', granted: true },
        { category: 'marketing', granted: true },
      ],
      'first_run',
    );
    enableLocalOnly();
    setTemplateError(null);
    setStep(DEFERRED_SETUP_START_STEP);
  }, [acceptAll, enableLocalOnly, recordBulkChanges]);

  // Deferred-setup wizard navigation (#3118). Selections in each step persist on
  // change, so "Skip for now" and "Continue" both simply advance; "Back" steps
  // through the sequence in reverse.
  const handleNewcomerAdvance = useCallback(() => {
    setTemplateError(null);
    setStep('goals');
  }, []);

  const handleNewcomerBack = useCallback(() => {
    setStep('privacy');
  }, []);

  const handleGoalsAdvance = useCallback(() => {
    setTemplateError(null);
    setStep('template');
  }, []);

  const handleGoalsBack = useCallback(() => {
    setStep('newcomer');
  }, []);

  const handleTemplateBack = useCallback(() => {
    setTemplateError(null);
    setStep('goals');
  }, []);

  const handleSkipStarterBudget = useCallback(() => {
    setStarterBudgetCreated(false);
    setTemplateError(null);
    persistOnboardingGoalsToStore();
    completeOnboarding();
    setStep('complete');
  }, [completeOnboarding, persistOnboardingGoalsToStore]);

  const handleApplyStudentTemplate = useCallback(() => {
    if (!studentTemplate) {
      setTemplateError('Student starter budget is unavailable right now.');
      return;
    }

    setIsApplyingTemplate(true);
    setTemplateError(null);

    try {
      const createdBudgets = createBudgetTemplate({
        templateId: studentTemplate.id,
        startDate: firstOfCurrentMonthISO(),
      });

      if (!createdBudgets || createdBudgets.length === 0) {
        throw new Error('Failed to create the student starter budget.');
      }

      setStarterBudgetCreated(true);
      persistOnboardingGoalsToStore();
      completeOnboarding();
      setStep('complete');
    } catch (error) {
      setTemplateError(
        error instanceof Error ? error.message : 'Failed to create the student starter budget.',
      );
    } finally {
      setIsApplyingTemplate(false);
    }
  }, [completeOnboarding, createBudgetTemplate, persistOnboardingGoalsToStore, studentTemplate]);

  const handleGoToDashboard = useCallback(() => {
    navigate('/dashboard');
  }, [navigate]);

  const handleTaxIdStatusChange = useCallback(
    (value: TaxIdStatus) => {
      setTaxIdStatus(value);
      persistOnboardingCategory(TAX_ID_STATUS_STORAGE_KEY, value);
      // Only the chosen category is recorded — never a real ID number.
      trackOnboardingEvent(analyticsEnabled, 'onboarding_tax_id_status_updated', {
        taxIdStatus: value,
      });
    },
    [analyticsEnabled],
  );

  const handleIncomeTypeChange = useCallback(
    (value: IncomeType) => {
      setIncomeType(value);
      persistOnboardingCategory(INCOME_TYPE_STORAGE_KEY, value);
      trackOnboardingEvent(analyticsEnabled, 'onboarding_income_type_updated', {
        incomeType: value,
      });
    },
    [analyticsEnabled],
  );

  const handleClearNewcomerProfile = useCallback(() => {
    setTaxIdStatus('unspecified');
    setIncomeType('unspecified');
    persistOnboardingCategory(TAX_ID_STATUS_STORAGE_KEY, 'unspecified');
    persistOnboardingCategory(INCOME_TYPE_STORAGE_KEY, 'unspecified');
    trackOnboardingEvent(analyticsEnabled, 'onboarding_newcomer_profile_cleared');
  }, [analyticsEnabled]);

  const handleOpenExplainer = useCallback(
    (key: NewcomerExplainerKey, event: React.MouseEvent<HTMLButtonElement>) => {
      explainerTriggerRef.current = event.currentTarget;
      setActiveExplainer(key);
    },
    [],
  );

  const handleCloseExplainer = useCallback(() => {
    setActiveExplainer(null);
    const trigger = explainerTriggerRef.current;
    explainerTriggerRef.current = null;
    trigger?.focus();
  }, []);

  useEffect(() => {
    if (activeExplainer) {
      explainerCloseRef.current?.focus();
    }
  }, [activeExplainer]);

  useEffect(() => {
    if (!activeExplainer) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseExplainer();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeExplainer, handleCloseExplainer]);

  const handleOpenGlossary = useCallback(
    (term: GlossaryTermId, event: React.MouseEvent<HTMLButtonElement>) => {
      glossaryTriggerRef.current = event.currentTarget;
      setActiveGlossaryTerm(term);
    },
    [],
  );

  const handleCloseGlossary = useCallback(() => {
    setActiveGlossaryTerm(null);
    const trigger = glossaryTriggerRef.current;
    glossaryTriggerRef.current = null;
    trigger?.focus();
  }, []);

  useEffect(() => {
    if (activeGlossaryTerm) {
      glossaryCloseRef.current?.focus();
    }
  }, [activeGlossaryTerm]);

  useEffect(() => {
    if (!activeGlossaryTerm) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseGlossary();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeGlossaryTerm, handleCloseGlossary]);

  const handleOptIntoLessons = useCallback(() => {
    setLessonsOptedIn(true);
    trackOnboardingEvent(analyticsEnabled, 'onboarding_lessons_opted_in');
  }, [analyticsEnabled]);

  // Deep-link from the completion checklist back into the deferred-setup wizard.
  // The guidance + lessons anchors live on the `newcomer` step (#3118), so focus
  // and scroll there once it renders.
  useEffect(() => {
    if (step !== 'newcomer' || !pendingTemplateAnchor) {
      return;
    }
    const anchor = pendingTemplateAnchor;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(anchor);
      if (target) {
        target.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
        target.focus({ preventScroll: true });
      }
      setPendingTemplateAnchor(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [step, pendingTemplateAnchor, reducedMotion]);

  // Move focus to the heading of each step on transition so keyboard and screen
  // reader users land at the top of the new content (#3118). Skipped when a
  // deep-link anchor is pending, which manages its own focus target above.
  useEffect(() => {
    if (previousStepRef.current === step) {
      return;
    }
    previousStepRef.current = step;
    if (pendingTemplateAnchor) {
      return;
    }
    stepHeadingRef.current?.focus();
  }, [step, pendingTemplateAnchor]);

  const openNewcomerSection = useCallback((anchor: string) => {
    if (anchor === TEMPLATE_LESSONS_ANCHOR) {
      setLessonsOptedIn(true);
    }
    setPendingTemplateAnchor(anchor);
    setStep('newcomer');
  }, []);

  // Shared glossary/explainer dialogs (#3120). Rendered on whichever wizard step
  // exposes their triggers; only one of each can be open at a time.
  const glossaryModal = activeGlossaryTerm ? (
    <div
      className="onboarding__glossary"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-glossary-title"
    >
      <div className="onboarding__glossary-card">
        <button
          type="button"
          className="onboarding__glossary-close"
          aria-label="Close"
          onClick={handleCloseGlossary}
        >
          <span aria-hidden="true">×</span>
        </button>
        <h2 id="onboarding-glossary-title" className="onboarding__path-title">
          {GLOSSARY_TERMS[activeGlossaryTerm].title}
        </h2>
        <p className="onboarding__path-description">{GLOSSARY_TERMS[activeGlossaryTerm].body}</p>
        <button
          ref={glossaryCloseRef}
          type="button"
          className="onboarding__path-btn onboarding__path-btn--primary"
          onClick={handleCloseGlossary}
        >
          Got it
        </button>
      </div>
    </div>
  ) : null;

  const explainerModal = activeExplainer ? (
    <div
      className="onboarding__glossary"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-newcomer-explainer-title"
    >
      <div className="onboarding__glossary-card">
        <button
          type="button"
          className="onboarding__glossary-close"
          aria-label="Close"
          onClick={handleCloseExplainer}
        >
          <span aria-hidden="true">×</span>
        </button>
        <h2 id="onboarding-newcomer-explainer-title" className="onboarding__path-title">
          {newcomerExplainers[activeExplainer].title}
        </h2>
        <p className="onboarding__path-description">{newcomerExplainers[activeExplainer].body}</p>
        <h3 className="onboarding__section-title">Why it matters</h3>
        <p className="onboarding__path-description">
          {newcomerExplainers[activeExplainer].whyItMatters}
        </p>
        <button
          ref={explainerCloseRef}
          type="button"
          className="onboarding__path-btn onboarding__path-btn--primary"
          onClick={handleCloseExplainer}
        >
          Got it
        </button>
      </div>
    </div>
  ) : null;

  if (step === 'comfort') {
    return (
      <main className={onboardingClassName} aria-label="Comfort Preferences">
        {onboardingProgressLiveRegion}
        <div className="onboarding__container onboarding__container--narrow">
          {stepProgressIndicator}
          <header className="onboarding__header">
            <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
              Welcome to Finance
            </h1>
            <h2 className="onboarding__preferences-title">Make it Yours</h2>
            <p className="onboarding__subtitle">
              Pick a few comfort settings now. You can change these any time later in Settings.
            </p>
          </header>

          <section className="onboarding__preferences-card" aria-label="Comfort settings">
            <div className="onboarding__simple-mode-card" aria-label="Simple Mode quick start">
              <div className="onboarding__simple-mode-copy">
                <span className="onboarding__simple-mode-kicker">Recommended first step</span>
                <h3 className="onboarding__simple-mode-title">Simple Mode</h3>
                <p className="onboarding__simple-mode-description">
                  Large text, calmer navigation, and fewer features so Finance feels easier right
                  away.
                </p>
                <ul className="onboarding__simple-mode-list" role="list">
                  <li role="listitem">Large text for easier reading</li>
                  <li role="listitem">Reduced motion for a calmer experience</li>
                  <li role="listitem">Simplified screens with fewer distractions</li>
                </ul>
              </div>
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--primary onboarding__simple-mode-button"
                onClick={handleUseSimpleMode}
              >
                Use Simple Mode
              </button>
            </div>

            <div className="onboarding__preferences-divider">Or adjust each setting</div>

            <div className="onboarding__preference onboarding__preference--stacked">
              <div className="onboarding__preference-copy">
                <label
                  htmlFor="onboarding-font-scale"
                  className="onboarding__preference-title-text"
                >
                  Text Size
                </label>
                <p className="onboarding__preference-description">
                  Make labels and charts easier to read from the start.
                </p>
              </div>
              <input
                id="onboarding-font-scale"
                className="onboarding__range"
                type="range"
                min="0"
                max={FONT_SCALE_OPTIONS.length - 1}
                step="1"
                value={fontScaleValue}
                onChange={(event) => handleFontScaleChange(Number(event.target.value))}
                aria-label="Text Size"
              />
              <div className="onboarding__range-labels" aria-hidden="true">
                {FONT_SCALE_OPTIONS.map((option) => (
                  <span key={option.value}>{option.label}</span>
                ))}
              </div>
            </div>

            <label className="onboarding__toggle">
              <span className="onboarding__toggle-copy">
                <span className="onboarding__preference-title-text">Reduce Motion</span>
                <span className="onboarding__preference-description">
                  Tone down animations if you prefer a calmer interface.
                </span>
              </span>
              <input
                type="checkbox"
                className="onboarding__toggle-input"
                checked={reducedMotion}
                onChange={(event) => handleReducedMotionChange(event.target.checked)}
                aria-label="Reduce Motion"
              />
              <span className="onboarding__toggle-switch" aria-hidden="true" />
            </label>

            <label className="onboarding__toggle">
              <span className="onboarding__toggle-copy">
                <span className="onboarding__preference-title-text">Simplified Mode</span>
                <span className="onboarding__preference-description">
                  Start with a lower-stress layout and fewer competing elements.
                </span>
              </span>
              <input
                type="checkbox"
                className="onboarding__toggle-input"
                checked={simplifiedMode}
                onChange={(event) => handleSimplifiedModeChange(event.target.checked)}
                aria-label="Simplified Mode"
              />
              <span className="onboarding__toggle-switch" aria-hidden="true" />
            </label>

            <label className="onboarding__toggle">
              <span className="onboarding__toggle-copy">
                <span className="onboarding__preference-title-text">High Contrast</span>
                <span className="onboarding__preference-description">
                  Increase visual contrast for stronger focus and readability.
                </span>
              </span>
              <input
                type="checkbox"
                className="onboarding__toggle-input"
                checked={highContrast}
                onChange={(event) => handleHighContrastChange(event.target.checked)}
                aria-label="High Contrast"
              />
              <span className="onboarding__toggle-switch" aria-hidden="true" />
            </label>

            <div className="onboarding__template-actions">
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--secondary"
                onClick={handleComfortContinue}
              >
                Skip for now
              </button>
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--primary"
                onClick={handleComfortContinue}
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (step === 'choose') {
    return (
      <main className={onboardingClassName} aria-label="Get Started">
        {onboardingProgressLiveRegion}
        <div className="onboarding__container">
          {stepProgressIndicator}
          <header className="onboarding__header">
            <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
              Welcome to Finance
            </h1>
            <p className="onboarding__subtitle">
              Your personal finance tracker. Choose how you want to get started.
            </p>
          </header>

          <div className="onboarding__paths">
            <article className="onboarding__path-card onboarding__path-card--local">
              <div className="onboarding__path-icon" aria-hidden="true">
                <AppIcon name="lock" />
              </div>
              <h2 className="onboarding__path-title">Local Only</h2>
              <p className="onboarding__path-description">
                Keep everything on this device. No account needed. No data ever leaves your browser.
              </p>
              <ul className="onboarding__path-features" role="list">
                <li role="listitem">
                  <AppIcon name="check" /> Full budgeting & tracking
                </li>
                <li role="listitem">
                  <AppIcon name="check" /> All data stays on device
                </li>
                <li role="listitem">
                  <AppIcon name="check" /> No email required
                </li>
                <li role="listitem">
                  <AppIcon name="check" /> Works completely offline
                </li>
              </ul>
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--primary"
                onClick={handleLocalOnly}
              >
                Start Local Only
              </button>
              <p className="onboarding__path-note">
                You can create an account later without losing any data.
              </p>
            </article>

            <article className="onboarding__path-card onboarding__path-card--account">
              <div className="onboarding__path-icon" aria-hidden="true">
                <AppIcon name="cloud" />
              </div>
              <h2 className="onboarding__path-title">Create Account</h2>
              <p className="onboarding__path-description">
                Sign up to sync across devices and share with household members.
              </p>
              <ul className="onboarding__path-features" role="list">
                <li role="listitem">
                  <AppIcon name="check" /> Everything in Local Only
                </li>
                <li role="listitem">
                  <AppIcon name="check" /> Sync across devices
                </li>
                <li role="listitem">
                  <AppIcon name="check" /> Household sharing
                </li>
                <li role="listitem">
                  <AppIcon name="check" /> Automatic cloud backups
                </li>
              </ul>
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--secondary"
                onClick={handleCreateAccount}
              >
                Create Account
              </button>
            </article>
          </div>

          <section className="onboarding__comparison" aria-label="Feature comparison">
            <h2 className="onboarding__comparison-title">Feature Comparison</h2>
            <table className="onboarding__comparison-table">
              <thead>
                <tr>
                  <th scope="col" className="onboarding__table-header">
                    Feature
                  </th>
                  <th scope="col" className="onboarding__table-header">
                    Local Only
                  </th>
                  <th scope="col" className="onboarding__table-header">
                    With Account
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((feature) => (
                  <FeatureRow key={feature.id} feature={feature} />
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </main>
    );
  }

  if (step === 'privacy') {
    return (
      <main className={onboardingClassName} aria-label="Privacy Preferences">
        {onboardingProgressLiveRegion}
        <div className="onboarding__container onboarding__container--narrow">
          {stepProgressIndicator}
          <header className="onboarding__header">
            <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
              Privacy Preferences
            </h1>
            <p className="onboarding__subtitle">
              Even in local-only mode, you can choose to share anonymous usage data to help us
              improve the app. This is entirely optional.
            </p>
          </header>

          <div className="onboarding__privacy-choices">
            <button
              type="button"
              className="onboarding__path-btn onboarding__path-btn--primary"
              onClick={handlePrivacyAcceptEssential}
            >
              Essential Only: Maximum Privacy
            </button>
            <p className="onboarding__privacy-note">
              No analytics, no error reporting, no sync. Your data never leaves this device.
            </p>

            <button
              type="button"
              className="onboarding__path-btn onboarding__path-btn--secondary"
              onClick={handlePrivacyAcceptAll}
            >
              Help Improve Finance
            </button>
            <p className="onboarding__privacy-note">
              Allow anonymous analytics and crash reporting. You can change this anytime in
              Settings.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (step === 'newcomer') {
    return (
      <main className={onboardingClassName} aria-label="Personalize Your Setup">
        {onboardingProgressLiveRegion}
        <div className="onboarding__container onboarding__container--narrow">
          {stepProgressIndicator}
          {!isAuthenticated && (
            <div className="onboarding__wizard-back-row">
              <button
                type="button"
                className="onboarding__back-button"
                onClick={handleNewcomerBack}
              >
                <span aria-hidden="true">←</span> Back
              </button>
            </div>
          )}
          <header className="onboarding__header">
            <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
              Personalize your setup
            </h1>
            <p className="onboarding__subtitle">
              {selectedLifeStageOptions.length > 0
                ? `Guidance is tailored for: ${selectedStageLabels}. You can change or skip this any time.`
                : 'Optional: tailor guidance to your life stage and learn the basics. You can change or skip any of this at any time.'}
            </p>
          </header>

          <section
            id={TEMPLATE_GUIDANCE_ANCHOR}
            tabIndex={-1}
            className="onboarding__template-card"
            aria-label="Life-stage tailored setup"
          >
            <div className="onboarding__template-header">
              <div>
                <h2 className="onboarding__path-title">Tailor setup to your life stage</h2>
                <p className="onboarding__path-description">
                  Optional: this only changes guidance, examples, and next steps. It does not create
                  budget templates, and local-only selections stay in this browser.
                </p>
              </div>
              <span className="onboarding__template-badge">Optional</span>
            </div>

            <div className="onboarding__choice-grid" role="group" aria-label="Life stages">
              {LIFE_STAGE_OPTIONS.map((option) => (
                <Checkbox
                  key={option.id}
                  className="onboarding__choice-card"
                  checked={selectedLifeStages.includes(option.id)}
                  onChange={() => handleLifeStageToggle(option.id)}
                  label={
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.setupCopy}</small>
                    </span>
                  }
                />
              ))}
            </div>

            <div className="onboarding__tailored-guidance" aria-live="polite">
              <h3 className="onboarding__section-title">Recommended next steps</h3>
              {selectedLifeStageOptions.length > 0 ? (
                <ul className="onboarding__template-list" role="list">
                  {selectedLifeStageOptions.map((option) => (
                    <li key={option.id} className="onboarding__template-item" role="listitem">
                      <span>{option.nextStep}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="onboarding__path-description">
                  Pick one or more stages for tailored setup copy, or skip and keep the default
                  guidance.
                </p>
              )}
              {selectedLifeStageOptions.length > 0 && (
                <p className="onboarding__education-prompt">
                  Education prompt: {selectedLifeStageOptions[0].educationPrompt}
                </p>
              )}
            </div>

            <div className="onboarding__inline-actions">
              <button
                type="button"
                className="onboarding__link-button"
                onClick={(event) => handleOpenGlossary('cashFlow', event)}
                aria-haspopup="dialog"
              >
                What is cash flow?
              </button>
              <button
                type="button"
                className="onboarding__link-button"
                onClick={(event) => handleOpenGlossary('recurringExpense', event)}
                aria-haspopup="dialog"
              >
                What is a recurring expense?
              </button>
              <button
                type="button"
                className="onboarding__link-button"
                onClick={handleClearLifeStages}
              >
                Clear selections
              </button>
            </div>
          </section>

          <section
            className="onboarding__template-card"
            aria-label="New to working or taxes in the US"
          >
            <div className="onboarding__template-header">
              <div>
                <h2 className="onboarding__path-title">New to working or taxes in the US?</h2>
                <p className="onboarding__path-description">
                  Optional and private. We never ask for any real ID numbers, only the category you
                  pick. These choices stay in this browser, are never shared, and simply tailor the
                  budgeting tips and explainers below.
                </p>
              </div>
              <span className="onboarding__template-badge">Optional &amp; private</span>
            </div>

            <div className="onboarding__newcomer-groups">
              <fieldset className="onboarding__fieldset">
                <legend className="onboarding__legend">Tax ID status</legend>
                <p className="onboarding__path-description" id="onboarding-tax-id-help">
                  An ITIN is the number some people use to file taxes when they do not have an SSN.
                  We never collect the number itself.
                </p>
                <div
                  className="onboarding__choice-grid"
                  role="radiogroup"
                  aria-label="Tax ID status"
                  aria-describedby="onboarding-tax-id-help"
                >
                  {TAX_ID_STATUS_OPTIONS.map((option) => (
                    <label key={option.value} className="onboarding__choice-card">
                      <input
                        type="radio"
                        name="onboarding-tax-id-status"
                        value={option.value}
                        checked={taxIdStatus === option.value}
                        onChange={() => handleTaxIdStatusChange(option.value)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="onboarding__fieldset">
                <legend className="onboarding__legend">How you earn money</legend>
                <p className="onboarding__path-description" id="onboarding-income-help">
                  Pick the closest match. This helps tailor budgeting tips for steady, hourly,
                  seasonal, or contract income.
                </p>
                <div
                  className="onboarding__choice-grid"
                  role="radiogroup"
                  aria-label="Income type"
                  aria-describedby="onboarding-income-help"
                >
                  {INCOME_TYPE_OPTIONS.map((option) => (
                    <label key={option.value} className="onboarding__choice-card">
                      <input
                        type="radio"
                        name="onboarding-income-type"
                        value={option.value}
                        checked={incomeType === option.value}
                        onChange={() => handleIncomeTypeChange(option.value)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="onboarding__tailored-guidance" aria-live="polite">
              <h3 className="onboarding__section-title">Budgeting tips for you</h3>
              <p className="onboarding__path-description">{newcomerGuidance.summary}</p>
              <ul className="onboarding__template-list" role="list">
                {newcomerGuidance.tips.map((tip) => (
                  <li key={tip} className="onboarding__template-item" role="listitem">
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="onboarding__newcomer-explainers">
              <h3 className="onboarding__section-title">Learn the basics</h3>
              <p className="onboarding__path-description">
                Open any topic for a short, plain-language explanation. These are educational and
                not tax advice.
              </p>
              <div className="onboarding__inline-actions">
                {newcomerExplainerList.map((explainer) => (
                  <button
                    key={explainer.id}
                    type="button"
                    className="onboarding__link-button"
                    onClick={(event) => handleOpenExplainer(explainer.id, event)}
                    aria-haspopup="dialog"
                  >
                    {explainer.linkLabel}
                  </button>
                ))}
              </div>
            </div>

            <div className="onboarding__inline-actions">
              <button
                type="button"
                className="onboarding__link-button"
                onClick={handleClearNewcomerProfile}
              >
                Clear these choices
              </button>
            </div>
          </section>

          <section
            id={TEMPLATE_LESSONS_ANCHOR}
            tabIndex={-1}
            className="onboarding__template-card onboarding__stacked-section"
            aria-label="Financial literacy lessons"
          >
            <div className="onboarding__template-header">
              <div>
                <h2 className="onboarding__path-title">Quick financial-literacy lessons</h2>
                <p className="onboarding__path-description">
                  Optional two-minute checks with plain-language examples. These are educational and
                  not financial advice.
                </p>
              </div>
              <span className="onboarding__template-badge">
                {completedLessonIds.length}/{FINANCIAL_LESSONS.length} done
              </span>
            </div>

            {lessonsOptedIn ? (
              <>
                <div className="onboarding__lesson-grid">
                  {FINANCIAL_LESSONS.map((lesson) => {
                    const isComplete = completedLessonIds.includes(lesson.id);
                    const selectedLabel = lessonSelections[lesson.id];
                    return (
                      <article
                        key={lesson.id}
                        className={
                          isComplete
                            ? 'onboarding__lesson-card onboarding__lesson-card--complete'
                            : 'onboarding__lesson-card'
                        }
                      >
                        <div className="onboarding__lesson-card-head">
                          <h3 className="onboarding__section-title">{lesson.title}</h3>
                          {isComplete && (
                            <span className="onboarding__lesson-status" role="status">
                              Completed ✓
                            </span>
                          )}
                        </div>
                        <p className="onboarding__path-description">{lesson.scenario}</p>
                        <div
                          className="onboarding__lesson-choices"
                          role="group"
                          aria-label={`${lesson.title} answers`}
                        >
                          {lesson.choices.map((choice) => {
                            const isSelected = selectedLabel === choice.label;
                            const isCorrectAnswer = isComplete && choice.correct;
                            const choiceClassName = [
                              'onboarding__path-btn',
                              'onboarding__lesson-choice',
                              isSelected
                                ? 'onboarding__lesson-choice--selected'
                                : 'onboarding__path-btn--secondary',
                              isCorrectAnswer ? 'onboarding__lesson-choice--correct' : '',
                            ]
                              .filter(Boolean)
                              .join(' ');
                            return (
                              <button
                                key={choice.label}
                                type="button"
                                className={choiceClassName}
                                aria-pressed={isSelected}
                                disabled={isComplete}
                                onClick={() => handleLessonChoice(lesson, choice)}
                              >
                                <span>{choice.label}</span>
                                {isCorrectAnswer && (
                                  <span
                                    aria-hidden="true"
                                    className="onboarding__lesson-choice-check"
                                  >
                                    ✓
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <p className="onboarding__lesson-feedback" aria-live="polite">
                          {isComplete ? 'Completed. ' : ''}
                          {lessonFeedback[lesson.id] ??
                            'Choose an answer to check your understanding.'}
                        </p>
                      </article>
                    );
                  })}
                </div>
                <div className="onboarding__inline-actions">
                  <button
                    type="button"
                    className="onboarding__link-button"
                    onClick={() => setLessonsOptedIn(false)}
                  >
                    Hide lessons
                  </button>
                </div>
              </>
            ) : (
              <div className="onboarding__lesson-optin">
                <p className="onboarding__path-description">
                  Lessons are optional. Opt in for three quick checks now, or take them anytime
                  later from the Learn area in the app.
                </p>
                <div className="onboarding__inline-actions">
                  <button
                    type="button"
                    className="onboarding__path-btn onboarding__path-btn--secondary"
                    onClick={handleOptIntoLessons}
                  >
                    Yes, show me lessons
                  </button>
                </div>
              </div>
            )}
          </section>

          <div className="onboarding__wizard-nav">
            <button
              type="button"
              className="onboarding__path-btn onboarding__path-btn--secondary"
              onClick={handleNewcomerAdvance}
            >
              Skip for now
            </button>
            <button
              type="button"
              className="onboarding__path-btn onboarding__path-btn--primary"
              onClick={handleNewcomerAdvance}
            >
              Continue
            </button>
          </div>

          {glossaryModal}
          {explainerModal}
        </div>
      </main>
    );
  }

  if (step === 'goals') {
    return (
      <main className={onboardingClassName} aria-label="Set a Savings Goal">
        {onboardingProgressLiveRegion}
        <div className="onboarding__container onboarding__container--narrow">
          {stepProgressIndicator}
          <div className="onboarding__wizard-back-row">
            <button type="button" className="onboarding__back-button" onClick={handleGoalsBack}>
              <span aria-hidden="true">←</span> Back
            </button>
          </div>
          <header className="onboarding__header">
            <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
              Set a savings goal
            </h1>
            <p className="onboarding__subtitle">
              Optional: add a goal and preview the monthly estimate, or skip and set goals later.
            </p>
          </header>

          <section className="onboarding__template-card" aria-label="Goal-setting wizard">
            <div className="onboarding__template-header">
              <div>
                <h2 className="onboarding__path-title">Goal-setting wizard</h2>
                <p className="onboarding__path-description">
                  Add an optional goal, preview the monthly estimate, then explicitly save it.
                </p>
              </div>
              <span className="onboarding__template-badge">{savedGoals.length} saved</span>
            </div>

            <div className="onboarding__form-grid">
              <label className="onboarding__field">
                <span>Goal name</span>
                <input
                  type="text"
                  value={goalDraft.name}
                  onChange={(event) => handleGoalDraftChange('name', event.target.value)}
                />
              </label>
              <label className="onboarding__field">
                <span>Goal type</span>
                <select
                  value={goalDraft.goalType}
                  onChange={(event) => handleGoalDraftChange('goalType', event.target.value)}
                >
                  <option>Emergency savings</option>
                  <option>Debt payoff</option>
                  <option>Vacation</option>
                  <option>Rent deposit</option>
                  <option>Buffer building</option>
                </select>
              </label>
              <label className="onboarding__field">
                <span>Target amount</span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  value={goalDraft.targetAmount}
                  onChange={(event) => handleAmountDraftChange('targetAmount', event.target.value)}
                  aria-describedby={isGoalDraftValid ? undefined : 'onboarding-goal-amount-hint'}
                />
              </label>
              <label className="onboarding__field">
                <span>Starting balance</span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  value={goalDraft.startingBalance}
                  onChange={(event) =>
                    handleAmountDraftChange('startingBalance', event.target.value)
                  }
                />
              </label>
              <label className="onboarding__field">
                <span>Target date</span>
                <input
                  type="date"
                  min={todayISO()}
                  value={goalDraft.targetDate}
                  onChange={(event) => handleGoalDraftChange('targetDate', event.target.value)}
                />
              </label>
            </div>

            <div className="onboarding__inline-actions">
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--secondary"
                onClick={handlePreviewGoal}
                disabled={!isGoalDraftValid}
                aria-describedby={isGoalDraftValid ? undefined : 'onboarding-goal-amount-hint'}
              >
                Preview goal
              </button>
              <button
                type="button"
                className="onboarding__link-button"
                onClick={(event) => handleOpenGlossary('savingsGoal', event)}
                aria-haspopup="dialog"
              >
                What is a savings goal?
              </button>
            </div>

            {!isGoalDraftValid && (
              <p
                id="onboarding-goal-amount-hint"
                className="onboarding__path-description"
                role="note"
              >
                Enter a target amount greater than $0 to preview and save your goal.
              </p>
            )}

            {goalReviewVisible && (
              <div className="onboarding__goal-review" role="status">
                <h3 className="onboarding__section-title">Confirm goal before saving</h3>
                <p>
                  {goalDraft.name || 'My goal'}: save{' '}
                  {formatCurrencyValue(Number(goalDraft.targetAmount) || 0, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                  {goalDraft.targetDate ? ` by ${goalDraft.targetDate}` : ''}. Estimated monthly
                  contribution:{' '}
                  {formatCurrencyValue(monthlyContribution, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                  .
                </p>
                <button
                  type="button"
                  className="onboarding__path-btn onboarding__path-btn--primary"
                  onClick={handleSaveGoal}
                >
                  Save goal
                </button>
              </div>
            )}

            {goalSavedName && (
              <div className="onboarding__goal-saved" role="status" aria-live="polite">
                <strong>Goal saved ✓</strong> — {goalSavedName} is in your plan. Add another, or
                continue when you are ready.
              </div>
            )}

            {savedGoals.length > 0 && (
              <div className="onboarding__saved-goals">
                <h3 className="onboarding__section-title">Saved goals</h3>
                <ul className="onboarding__saved-goals-list" role="list">
                  {savedGoals.map((goal) => (
                    <li key={goal.id} className="onboarding__saved-goals-item" role="listitem">
                      <span>{goal.name}</span>
                      <strong>
                        {formatCurrencyValue(goal.monthlyContribution, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                        /mo
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <div className="onboarding__wizard-nav">
            <button
              type="button"
              className="onboarding__path-btn onboarding__path-btn--secondary"
              onClick={handleGoalsAdvance}
            >
              Skip for now
            </button>
            <button
              type="button"
              className="onboarding__path-btn onboarding__path-btn--primary"
              onClick={handleGoalsAdvance}
            >
              Continue
            </button>
          </div>

          {glossaryModal}
        </div>
      </main>
    );
  }

  if (step === 'template' && studentTemplate) {
    return (
      <main className={onboardingClassName} aria-label="Starter Budget Template">
        {onboardingProgressLiveRegion}
        <div className="onboarding__container onboarding__container--narrow">
          {stepProgressIndicator}
          <div className="onboarding__wizard-back-row">
            <button type="button" className="onboarding__back-button" onClick={handleTemplateBack}>
              <span aria-hidden="true">←</span> Back
            </button>
          </div>
          <header className="onboarding__header">
            <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
              Want a starter budget? Choose a template:
            </h1>
            <p className="onboarding__subtitle">
              Start with a student-friendly budget you can rename or adjust any time, or skip and
              build your own later.
            </p>
          </header>

          {templateError && (
            <div className="onboarding__template-error" role="alert">
              {templateError}
            </div>
          )}

          <section className="onboarding__template-card" aria-label="Student starter budget">
            <div className="onboarding__template-header">
              <div>
                <h2 className="onboarding__path-title">{studentTemplate.name}</h2>
                <p className="onboarding__path-description">{studentTemplate.description}</p>
              </div>
              <span className="onboarding__template-badge">Available now</span>
            </div>

            <p className="onboarding__template-guidance">{studentTemplate.guidance}</p>

            <ul className="onboarding__template-list" role="list">
              {studentTemplate.categories.map((category) => (
                <li key={category.name} className="onboarding__template-item" role="listitem">
                  <span>
                    {category.emoji} {category.name}
                  </span>
                  <strong>
                    {formatCurrencyValue(category.amountCents / 100, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="onboarding__coming-soon" aria-label="More templates coming soon">
            <h2 className="onboarding__comparison-title">More templates coming soon</h2>
            <div className="onboarding__coming-soon-list">
              {futureTemplates.map((template) => (
                <span key={template.id} className="onboarding__coming-soon-chip">
                  {template.name}
                </span>
              ))}
            </div>
          </section>

          <div className="onboarding__template-actions">
            <p className="onboarding__template-summary">
              We will set up the {studentTemplate.name} starter budget shown above — more templates
              are coming soon, and you can rename categories or change amounts any time.
            </p>
            <button
              type="button"
              className="onboarding__path-btn onboarding__path-btn--primary"
              onClick={handleApplyStudentTemplate}
              disabled={isApplyingTemplate}
              aria-busy={isApplyingTemplate}
            >
              {isApplyingTemplate ? 'Creating your budget…' : 'Create my budget'}
            </button>
            <button
              type="button"
              className="onboarding__path-btn onboarding__path-btn--secondary"
              onClick={handleSkipStarterBudget}
              disabled={isApplyingTemplate}
            >
              Skip for now
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={onboardingClassName} aria-label="Setup Complete">
      {onboardingProgressLiveRegion}
      <div className="onboarding__container onboarding__container--narrow">
        <div className="onboarding__complete">
          <div className="onboarding__complete-icon" aria-hidden="true">
            <AppIcon name="sparkles" />
          </div>
          <h1 className="onboarding__title" ref={stepHeadingRef} tabIndex={-1}>
            You&apos;re All Set!
          </h1>
          <p className="onboarding__subtitle">
            {starterBudgetCreated
              ? 'Your finance tracker is ready, and your student starter budget is already in place.'
              : isAuthenticated
                ? 'Your finance tracker is ready and synced to your account.'
                : 'Your finance tracker is ready. All data is stored locally on this device.'}
          </p>
          <div className="onboarding__complete-details">
            {isAuthenticated ? (
              <p className="onboarding__complete-item">
                <AppIcon name="cloud" /> <strong>Synced to your account</strong>: your data is
                backed up and available on every device
              </p>
            ) : (
              <p className="onboarding__complete-item">
                <AppIcon name="lock" /> <strong>Local-only mode</strong>: no data leaves your
                browser
              </p>
            )}
            {starterBudgetCreated && (
              <p className="onboarding__complete-item">
                <AppIcon name="wallet" /> <strong>Starter budget added</strong>: realistic student
                categories are ready to edit
              </p>
            )}
            <p className="onboarding__complete-item">
              <AppIcon name="database" /> <strong>SQLite storage</strong>: fast, reliable,
              offline-first
            </p>
            {isAuthenticated ? (
              <p className="onboarding__complete-item">
                <AppIcon name="check" /> <strong>Account active</strong>: sign in anywhere to pick
                up where you left off
              </p>
            ) : (
              <p className="onboarding__complete-item">
                <AppIcon name="refresh" /> <strong>Upgrade anytime</strong>: create an account later
                to enable sync
              </p>
            )}
          </div>

          {setupChecklistHidden ? (
            <section className="onboarding__checklist" aria-label="Setup checklist hidden">
              <p className="onboarding__path-description">Checklist hidden.</p>
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--secondary"
                onClick={() => handleChecklistHiddenChange(false)}
              >
                Show checklist
              </button>
            </section>
          ) : (
            <section className="onboarding__checklist" aria-label="Setup progress">
              <div className="onboarding__template-header">
                <div>
                  <h2 className="onboarding__path-title">Setup progress</h2>
                  <p className="onboarding__path-description">
                    Beta activation is complete when privacy is reviewed, setup has a first budget
                    or goal, and at least one confidence task is done.
                  </p>
                </div>
                <span className="onboarding__template-badge">
                  {fullySetUp ? 'Fully set up' : 'In progress'}
                </span>
              </div>
              <ul className="onboarding__checklist-list" role="list">
                <li className="onboarding__checklist-item" role="listitem">
                  <span>Privacy reviewed</span>
                  <strong>Done</strong>
                </li>
                <li className="onboarding__checklist-item" role="listitem">
                  <span>
                    {starterBudgetCreated ? 'Starter budget created' : 'Starter budget skipped'}
                  </span>
                  <button
                    type="button"
                    className="onboarding__link-button"
                    onClick={() => navigate('/budgets')}
                  >
                    Open budgets
                  </button>
                </li>
                <li className="onboarding__checklist-item" role="listitem">
                  <span>
                    Life-stage guidance{' '}
                    {selectedLifeStages.length > 0
                      ? `saved for ${selectedStageLabels}`
                      : 'not selected'}
                  </span>
                  <button
                    type="button"
                    className="onboarding__link-button"
                    onClick={() => openNewcomerSection(TEMPLATE_GUIDANCE_ANCHOR)}
                  >
                    Edit guidance
                  </button>
                </li>
                <li className="onboarding__checklist-item" role="listitem">
                  <span>
                    Education lessons {completedLessonIds.length}/{FINANCIAL_LESSONS.length}{' '}
                    complete
                  </span>
                  <button
                    type="button"
                    className="onboarding__link-button"
                    onClick={() => openNewcomerSection(TEMPLATE_LESSONS_ANCHOR)}
                  >
                    Review lessons
                  </button>
                </li>
                <li className="onboarding__checklist-item" role="listitem">
                  <span>
                    {savedGoals.length > 0
                      ? `${savedGoals.length} goal saved`
                      : 'No goal saved yet'}
                  </span>
                  <button
                    type="button"
                    className="onboarding__link-button"
                    onClick={() => navigate('/goals')}
                  >
                    Open goals
                  </button>
                </li>
              </ul>
              <button
                type="button"
                className="onboarding__link-button"
                onClick={() => handleChecklistHiddenChange(true)}
              >
                Hide checklist
              </button>
            </section>
          )}

          <section className="onboarding__coachmarks" aria-label="Quick tips">
            <div className="onboarding__template-header">
              <div>
                <h2 className="onboarding__path-title">Quick tips</h2>
                <p className="onboarding__path-description">
                  Plain-language tips for dashboard, budget, transactions, and goals. Dismiss once
                  or reopen later from help.
                </p>
              </div>
            </div>
            {coachMarksDismissed ? (
              <button
                type="button"
                className="onboarding__path-btn onboarding__path-btn--secondary"
                onClick={handleCoachMarksRestore}
              >
                Show tips
              </button>
            ) : (
              <>
                <div className="onboarding__coachmark-grid">
                  <article className="onboarding__coachmark-card">
                    <strong>Dashboard</strong>
                    <p>Your daily snapshot shows balances, upcoming bills, and setup nudges.</p>
                  </article>
                  <article className="onboarding__coachmark-card">
                    <strong>Budget</strong>
                    <p>Budget categories are planning buckets, not judgments.</p>
                  </article>
                  <article className="onboarding__coachmark-card">
                    <strong>Transactions</strong>
                    <p>
                      Transactions explain what actually happened so you can compare to the plan.
                    </p>
                  </article>
                  <article className="onboarding__coachmark-card">
                    <strong>Goals</strong>
                    <p>Goals connect saving or payoff progress to outcomes you choose.</p>
                  </article>
                </div>
                <div className="onboarding__inline-actions">
                  <button
                    type="button"
                    className="onboarding__link-button"
                    onClick={(event) => handleOpenGlossary('budgetVariance', event)}
                    aria-haspopup="dialog"
                  >
                    Explain budget variance
                  </button>
                  <button
                    type="button"
                    className="onboarding__path-btn onboarding__path-btn--secondary"
                    onClick={handleCoachMarksDismiss}
                  >
                    Hide tips
                  </button>
                </div>
              </>
            )}
          </section>

          {glossaryModal}

          <button
            type="button"
            className="onboarding__path-btn onboarding__path-btn--primary"
            onClick={handleGoToDashboard}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </main>
  );
};

export default OnboardingPage;
