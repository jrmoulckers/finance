// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useMemo, useState } from 'react';

import { LearningDashboard } from '../components/learning';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAccounts, useDashboardData, useGoals, useTransactions } from '../hooks';
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
import './LearningPage.css';

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
    </main>
  );
}

export default LearningPage;
