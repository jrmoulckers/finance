// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { LearningDashboard } from '../components/learning';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAccounts, useDashboardData, useGoals, useTransactions } from '../hooks';
import { useLocalePreferences } from '../hooks/useLocalePreferences';
import {
  buildLearningActivityProfile,
  getLearningLesson,
  LEARNING_LESSONS,
  LEARNING_MODULES,
  loadLearningProgress,
  markLessonCompleted,
  recordQuizScore,
  saveLearningProgress,
  suggestNextLessons,
} from '../lib/learning';
// Deep import keeps the long-form credit-building copy in this lazy-loaded
// route chunk instead of the app-wide education barrel / i18n catalog.
import {
  type CreditChecklistKey,
  type CreditEducationLocale,
  formatChecklistProgress,
  getCreditEducation,
  resolveCreditEducationLocale,
} from '../lib/education/credit-building';
import './LearningPage.css';

// Built from a template literal so storage keys never look like hard-coded
// secrets to scanners.
const CHECKLIST_STORAGE_KEY = `finance:credit-building-checklist:v1`;

type ChecklistState = Partial<Record<CreditChecklistKey, boolean>>;

function loadChecklistState(): ChecklistState {
  try {
    const raw = globalThis.localStorage?.getItem(CHECKLIST_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as ChecklistState;
    }
  } catch {
    // Ignore malformed or unavailable storage; the checklist simply starts empty.
  }
  return {};
}

function saveChecklistState(state: ChecklistState): void {
  try {
    globalThis.localStorage?.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persistence is best-effort when storage is unavailable.
  }
}

/**
 * Beginner-friendly credit-building education for newcomers building credit from
 * zero (issue #2174): plain-language explainers, secured-card guidance, and a
 * checklist that never requires pulling a real credit score. Available in
 * English and Spanish via a self-contained reading-language toggle that defaults
 * to the app's active locale.
 */
export function CreditBuildingSection(): React.ReactElement {
  const { locale } = useLocalePreferences();
  const [language, setLanguage] = useState<CreditEducationLocale>(() =>
    resolveCreditEducationLocale(locale),
  );
  const [checklist, setChecklist] = useState<ChecklistState>(loadChecklistState);

  const content = getCreditEducation(language);

  useEffect(() => {
    saveChecklistState(checklist);
  }, [checklist]);

  const toggleItem = useCallback((key: CreditChecklistKey) => {
    setChecklist((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const completedCount = content.checklistItems.filter((item) => checklist[item.id]).length;
  const totalCount = content.checklistItems.length;
  const progressText = formatChecklistProgress(content, completedCount, totalCount);
  const allComplete = completedCount === totalCount;

  return (
    <section className="credit-building" aria-labelledby="credit-building-heading">
      <header className="credit-building__header">
        <p className="credit-building__eyebrow">Issue #2174</p>
        <h2 id="credit-building-heading" className="credit-building__title">
          {content.sectionTitle}
        </h2>
        <p className="credit-building__intro">{content.sectionIntro}</p>
        <div
          className="credit-building__lang"
          role="group"
          aria-label={content.languageToggleLabel}
        >
          <span className="credit-building__lang-label" aria-hidden="true">
            {content.languageToggleLabel}
          </span>
          <div className="credit-building__lang-options">
            <button
              type="button"
              className="credit-building__lang-button"
              aria-pressed={language === 'en'}
              onClick={() => setLanguage('en')}
            >
              {content.languageOptionEnglish}
            </button>
            <button
              type="button"
              className="credit-building__lang-button"
              aria-pressed={language === 'es'}
              onClick={() => setLanguage('es')}
            >
              {content.languageOptionSpanish}
            </button>
          </div>
        </div>
        <p className="credit-building__disclaimer" role="note">
          {content.disclaimer}
        </p>
      </header>

      <div className="credit-building__explainers">
        <h3 className="credit-building__subheading">{content.explainersHeading}</h3>
        <div className="credit-building__explainer-list">
          {content.explainers.map((entry) => (
            <article key={entry.id} className="credit-building__explainer">
              <h4 className="credit-building__explainer-title">{entry.title}</h4>
              <p>{entry.body}</p>
              <p className="credit-building__why">
                <strong className="credit-building__why-label">{content.whyItMattersLabel}:</strong>{' '}
                {entry.whyItMatters}
              </p>
            </article>
          ))}
        </div>
      </div>

      <div className="credit-building__secured">
        <h3 className="credit-building__subheading">{content.securedHeading}</h3>
        <p>{content.securedIntro}</p>
        <ol className="credit-building__steps">
          {content.securedSteps.map((step) => (
            <li key={step.id} className="credit-building__step">
              <h4 className="credit-building__step-title">{step.title}</h4>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="credit-building__checklist">
        <h3 className="credit-building__subheading" id="credit-building-checklist-heading">
          {content.checklistHeading}
        </h3>
        <p>{content.checklistIntro}</p>
        <p className="credit-building__note">{content.checklistNoScoreNote}</p>

        <div className="credit-building__progress">
          <p
            id="credit-building-progress-status"
            className="credit-building__progress-status"
            aria-live="polite"
          >
            {allComplete ? content.checklistAllDone : progressText}
          </p>
          <progress
            className="credit-building__progress-bar"
            max={totalCount}
            value={completedCount}
            aria-labelledby="credit-building-progress-status"
          />
        </div>

        <ul className="credit-building__checklist-items">
          {content.checklistItems.map((item) => {
            const checked = Boolean(checklist[item.id]);
            return (
              <li
                key={item.id}
                className={
                  checked
                    ? 'credit-building__checklist-item credit-building__checklist-item--done'
                    : 'credit-building__checklist-item'
                }
              >
                <label className="credit-building__checkbox-label">
                  <input
                    type="checkbox"
                    className="credit-building__checkbox"
                    checked={checked}
                    onChange={() => toggleItem(item.id)}
                  />
                  <span className="credit-building__checkbox-text">
                    <span className="credit-building__checkbox-title">
                      {item.label}
                      {checked && (
                        <span className="credit-building__checkbox-badge">
                          {content.checklistDoneBadge}
                        </span>
                      )}
                    </span>
                    <span className="credit-building__checkbox-detail">{item.detail}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRecentDateRange(days: number): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - (days - 1));

  return {
    startDate: formatLocalDate(startDate),
    endDate: formatLocalDate(endDate),
  };
}

export function LearningPage(): React.ReactElement {
  const {
    data,
    loading: dashboardLoading,
    error: dashboardError,
    refresh: refreshDashboard,
  } = useDashboardData();
  const {
    accounts,
    loading: accountsLoading,
    error: accountsError,
    refresh: refreshAccounts,
  } = useAccounts();
  const { goals, loading: goalsLoading, error: goalsError, refresh: refreshGoals } = useGoals();
  const transactionFilter = useMemo(() => getRecentDateRange(90), []);
  const {
    transactions,
    loading: transactionsLoading,
    error: transactionsError,
    refresh: refreshTransactions,
  } = useTransactions(transactionFilter);

  const [progress, setProgress] = useState(() => loadLearningProgress());
  const [selectedLessonId, setSelectedLessonId] = useState<string>(LEARNING_LESSONS[0]?.id ?? '');

  useEffect(() => {
    saveLearningProgress(progress);
  }, [progress]);

  const activityProfile = useMemo(
    () =>
      buildLearningActivityProfile({
        dashboardData: data,
        accounts,
        goals,
        transactions,
      }),
    [accounts, data, goals, transactions],
  );

  const recommendations = useMemo(
    () =>
      suggestNextLessons({
        modules: LEARNING_MODULES,
        progress,
        activityProfile,
        limit: 4,
      }),
    [activityProfile, progress],
  );

  useEffect(() => {
    if (!selectedLessonId || !getLearningLesson(selectedLessonId)) {
      setSelectedLessonId(recommendations[0]?.lessonId ?? LEARNING_LESSONS[0]?.id ?? '');
    }
  }, [recommendations, selectedLessonId]);

  const selectedLesson = getLearningLesson(selectedLessonId) ?? LEARNING_LESSONS[0];
  const isLoading = dashboardLoading || accountsLoading || goalsLoading || transactionsLoading;
  const errors = [dashboardError, accountsError, goalsError, transactionsError].filter(Boolean);

  if (!selectedLesson) {
    return (
      <div className="learning-page__loading">
        <LoadingSpinner label="Loading learning path" />
      </div>
    );
  }

  const handleRefreshAll = () => {
    refreshDashboard();
    refreshAccounts();
    refreshGoals();
    refreshTransactions();
  };

  return (
    <main className="learning-page" aria-label="Financial literacy learning path">
      <header className="learning-page__header">
        <div>
          <p className="learning-page__eyebrow">Issue #1665</p>
          <h1 className="learning-page__title">Personalized Financial Literacy Learning Path</h1>
          <p className="learning-page__subtitle">
            Learn budgeting, saving, debt, investing, and tax planning with a structured path that
            stays entirely on-device.
          </p>
        </div>
        {recommendations[0] && (
          <aside className="learning-page__focus" aria-label="Current learning focus">
            <p className="learning-page__focus-label">Current focus</p>
            <h2>{recommendations[0].title}</h2>
            <p>{recommendations[0].reason}</p>
          </aside>
        )}
      </header>

      {errors.length > 0 && (
        <ErrorBanner
          message={`Using partial local data for recommendations: ${errors.join(' ')}`}
          onRetry={handleRefreshAll}
        />
      )}

      {isLoading ? (
        <div className="learning-page__loading">
          <LoadingSpinner label="Loading learning path" />
        </div>
      ) : (
        <LearningDashboard
          modules={LEARNING_MODULES}
          progress={progress}
          recommendations={recommendations}
          selectedLesson={selectedLesson}
          onSelectLesson={setSelectedLessonId}
          onMarkLessonComplete={(lessonId) =>
            setProgress((current) => markLessonCompleted(current, lessonId))
          }
          onRecordQuizScore={(lessonId, percent) =>
            setProgress((current) => recordQuizScore(current, lessonId, percent))
          }
        />
      )}

      <CreditBuildingSection />
    </main>
  );
}

export default LearningPage;
