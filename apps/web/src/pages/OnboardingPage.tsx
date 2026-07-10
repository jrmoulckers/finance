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
import { useFocusTrap } from '../accessibility/aria';
import { useDatabase } from '../db/DatabaseProvider';
import { getPrimaryHouseholdId } from '../db/repositories/household';
import { useBudgets } from '../hooks/useBudgets';
import { useConsent } from '../hooks/useConsent';
import { useConsentHistory } from '../hooks/useConsentHistory';
import { useGoals } from '../hooks/useGoals';
import { useLocalOnlyMode } from '../hooks/useLocalOnlyMode';
import { buildOnboardingProgressAnnouncement } from '../lib/a11y/onboarding-progress';
import { getBudgetStarterTemplates } from '../lib/budgeting/starter-budget-templates';
import {
  newcomerExplainers,
  type NewcomerExplainerKey,
} from '../lib/education/newcomer-explainers';
import {
  getNewcomerGuidance,
  type IncomeType,
  type TaxIdStatus,
} from '../lib/onboarding/newcomer-tax-profile';

import {
  applyComfortPreferences,
  DEFAULT_FONT_SCALE_INDEX,
  SIMPLE_MODE_FONT_SCALE_INDEX,
} from './onboarding/comfort';
import {
  DEFAULT_GOAL_DRAFT,
  GLOSSARY_TERMS,
  LIFE_STAGE_OPTIONS,
} from './onboarding/content';
import {
  calculateMonthlyContribution,
  firstOfCurrentMonthISO,
  isLifeStageId,
} from './onboarding/goal-math';
import {
  CHECKLIST_HIDDEN_STORAGE_KEY,
  COACH_MARKS_STORAGE_KEY,
  INCOME_TYPE_STORAGE_KEY,
  LESSONS_STORAGE_KEY,
  LIFE_STAGE_STORAGE_KEY,
  persistOnboardingCategory,
  readBoolean,
  readGoals,
  readIncomeType,
  readStringArray,
  readTaxIdStatus,
  TAX_ID_STATUS_STORAGE_KEY,
  trackOnboardingEvent,
  writeBoolean,
  writeGoals,
  writeStringArray,
} from './onboarding/storage';
import {
  DEFERRED_SETUP_START_STEP,
  ONBOARDING_STEP_LABELS,
  ONBOARDING_STEP_ORDER,
  TEMPLATE_LESSONS_ANCHOR,
} from './onboarding/steps';
import type {
  GlossaryTermId,
  GoalDraft,
  Lesson,
  LessonChoice,
  LifeStageId,
  OnboardingStep,
  StoredGoal,
} from './onboarding/types';

import { ChooseStep } from './onboarding/steps/ChooseStep';
import { ComfortStep } from './onboarding/steps/ComfortStep';
import { CompleteStep } from './onboarding/steps/CompleteStep';
import { GoalsStep } from './onboarding/steps/GoalsStep';
import { NewcomerStep } from './onboarding/steps/NewcomerStep';
import { PrivacyStep } from './onboarding/steps/PrivacyStep';
import { TemplateStep } from './onboarding/steps/TemplateStep';

import './OnboardingPage.css';

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
  const explainerPanelRef = useRef<HTMLDivElement>(null);
  const glossaryCloseRef = useRef<HTMLButtonElement>(null);
  const glossaryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const glossaryPanelRef = useRef<HTMLDivElement>(null);
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

  // Constrain Tab focus within the open glossary / explainer modals. Escape,
  // initial focus, and focus restoration are handled by the effects above and
  // the close handlers, so the trap only needs to cycle focus (restoreFocus
  // false avoids double-restoring to the trigger).
  useFocusTrap(glossaryPanelRef, {
    active: activeGlossaryTerm !== null,
    restoreFocus: false,
    initialFocusRef: glossaryCloseRef,
  });

  useFocusTrap(explainerPanelRef, {
    active: activeExplainer !== null,
    restoreFocus: false,
    initialFocusRef: explainerCloseRef,
  });

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
      ref={glossaryPanelRef}
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
      ref={explainerPanelRef}
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
      <ComfortStep
        onboardingClassName={onboardingClassName}
        onboardingProgressLiveRegion={onboardingProgressLiveRegion}
        stepProgressIndicator={stepProgressIndicator}
        stepHeadingRef={stepHeadingRef}
        fontScaleValue={fontScaleValue}
        reducedMotion={reducedMotion}
        simplifiedMode={simplifiedMode}
        highContrast={highContrast}
        handleUseSimpleMode={handleUseSimpleMode}
        handleFontScaleChange={handleFontScaleChange}
        handleReducedMotionChange={handleReducedMotionChange}
        handleSimplifiedModeChange={handleSimplifiedModeChange}
        handleHighContrastChange={handleHighContrastChange}
        handleComfortContinue={handleComfortContinue}
      />
    );
  }

  if (step === 'choose') {
    return (
      <ChooseStep
        onboardingClassName={onboardingClassName}
        onboardingProgressLiveRegion={onboardingProgressLiveRegion}
        stepProgressIndicator={stepProgressIndicator}
        stepHeadingRef={stepHeadingRef}
        features={features}
        handleLocalOnly={handleLocalOnly}
        handleCreateAccount={handleCreateAccount}
      />
    );
  }

  if (step === 'privacy') {
    return (
      <PrivacyStep
        onboardingClassName={onboardingClassName}
        onboardingProgressLiveRegion={onboardingProgressLiveRegion}
        stepProgressIndicator={stepProgressIndicator}
        stepHeadingRef={stepHeadingRef}
        handlePrivacyAcceptEssential={handlePrivacyAcceptEssential}
        handlePrivacyAcceptAll={handlePrivacyAcceptAll}
      />
    );
  }

  if (step === 'newcomer') {
    return (
      <NewcomerStep
        onboardingClassName={onboardingClassName}
        onboardingProgressLiveRegion={onboardingProgressLiveRegion}
        stepProgressIndicator={stepProgressIndicator}
        isAuthenticated={isAuthenticated}
        handleNewcomerBack={handleNewcomerBack}
        stepHeadingRef={stepHeadingRef}
        selectedLifeStageOptions={selectedLifeStageOptions}
        selectedStageLabels={selectedStageLabels}
        selectedLifeStages={selectedLifeStages}
        handleLifeStageToggle={handleLifeStageToggle}
        handleOpenGlossary={handleOpenGlossary}
        handleClearLifeStages={handleClearLifeStages}
        taxIdStatus={taxIdStatus}
        handleTaxIdStatusChange={handleTaxIdStatusChange}
        incomeType={incomeType}
        handleIncomeTypeChange={handleIncomeTypeChange}
        newcomerGuidance={newcomerGuidance}
        newcomerExplainerList={newcomerExplainerList}
        handleOpenExplainer={handleOpenExplainer}
        handleClearNewcomerProfile={handleClearNewcomerProfile}
        completedLessonIds={completedLessonIds}
        lessonsOptedIn={lessonsOptedIn}
        lessonSelections={lessonSelections}
        lessonFeedback={lessonFeedback}
        handleLessonChoice={handleLessonChoice}
        setLessonsOptedIn={setLessonsOptedIn}
        handleOptIntoLessons={handleOptIntoLessons}
        handleNewcomerAdvance={handleNewcomerAdvance}
        glossaryModal={glossaryModal}
        explainerModal={explainerModal}
      />
    );
  }

  if (step === 'goals') {
    return (
      <GoalsStep
        onboardingClassName={onboardingClassName}
        onboardingProgressLiveRegion={onboardingProgressLiveRegion}
        stepProgressIndicator={stepProgressIndicator}
        stepHeadingRef={stepHeadingRef}
        handleGoalsBack={handleGoalsBack}
        savedGoals={savedGoals}
        goalDraft={goalDraft}
        handleGoalDraftChange={handleGoalDraftChange}
        handleAmountDraftChange={handleAmountDraftChange}
        isGoalDraftValid={isGoalDraftValid}
        handlePreviewGoal={handlePreviewGoal}
        handleOpenGlossary={handleOpenGlossary}
        goalReviewVisible={goalReviewVisible}
        monthlyContribution={monthlyContribution}
        handleSaveGoal={handleSaveGoal}
        goalSavedName={goalSavedName}
        handleGoalsAdvance={handleGoalsAdvance}
        glossaryModal={glossaryModal}
      />
    );
  }

  if (step === 'template' && studentTemplate) {
    return (
      <TemplateStep
        onboardingClassName={onboardingClassName}
        onboardingProgressLiveRegion={onboardingProgressLiveRegion}
        stepProgressIndicator={stepProgressIndicator}
        stepHeadingRef={stepHeadingRef}
        handleTemplateBack={handleTemplateBack}
        templateError={templateError}
        studentTemplate={studentTemplate}
        futureTemplates={futureTemplates}
        handleApplyStudentTemplate={handleApplyStudentTemplate}
        isApplyingTemplate={isApplyingTemplate}
        handleSkipStarterBudget={handleSkipStarterBudget}
      />
    );
  }

  return (
    <CompleteStep
      onboardingClassName={onboardingClassName}
      onboardingProgressLiveRegion={onboardingProgressLiveRegion}
      stepHeadingRef={stepHeadingRef}
      starterBudgetCreated={starterBudgetCreated}
      isAuthenticated={isAuthenticated}
      setupChecklistHidden={setupChecklistHidden}
      handleChecklistHiddenChange={handleChecklistHiddenChange}
      fullySetUp={fullySetUp}
      navigate={navigate}
      selectedLifeStages={selectedLifeStages}
      selectedStageLabels={selectedStageLabels}
      openNewcomerSection={openNewcomerSection}
      completedLessonIds={completedLessonIds}
      savedGoals={savedGoals}
      coachMarksDismissed={coachMarksDismissed}
      handleCoachMarksRestore={handleCoachMarksRestore}
      handleCoachMarksDismiss={handleCoachMarksDismiss}
      handleOpenGlossary={handleOpenGlossary}
      glossaryModal={glossaryModal}
      handleGoToDashboard={handleGoToDashboard}
    />
  );
};
export default OnboardingPage;
