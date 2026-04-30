// SPDX-License-Identifier: BUSL-1.1

/**
 * AchievementsPage — Gamification dashboard showing badges, streaks,
 * and progress milestones for financial goals.
 *
 * Accessibility:
 * - Section landmarks with aria-label
 * - Progress bars with ARIA roles
 * - Achievement status announced via aria-label
 * - All interactive elements keyboard-accessible
 */

import React from 'react';
import { EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { useGamification } from '../hooks/useGamification';
import type {
  Achievement,
  AchievementCategory,
  GoalMilestone,
  StreakData,
} from '../components/gamification/achievements-engine';
import { getAchievementsByCategory } from '../components/gamification/achievements-engine';
import './AchievementsPage.css';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface AchievementBadgeProps {
  achievement: Achievement;
}

const AchievementBadge: React.FC<AchievementBadgeProps> = ({ achievement }) => {
  const isUnlocked = achievement.status === 'unlocked';

  return (
    <article
      className={`achievement-badge ${isUnlocked ? 'achievement-badge--unlocked' : 'achievement-badge--locked'}`}
      aria-label={`${achievement.name}: ${isUnlocked ? 'Unlocked' : `${achievement.progress}% progress`}`}
    >
      <div
        className="achievement-badge__icon"
        aria-hidden="true"
        style={{ opacity: isUnlocked ? 1 : 0.4 }}
      >
        {achievement.icon}
      </div>
      <div className="achievement-badge__info">
        <h4 className="achievement-badge__name">{achievement.name}</h4>
        <p className="achievement-badge__description">{achievement.description}</p>
        {!isUnlocked && (
          <div
            className="achievement-badge__progress-track"
            role="progressbar"
            aria-valuenow={achievement.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${achievement.name} progress`}
          >
            <div
              className="achievement-badge__progress-fill"
              style={{ width: `${achievement.progress}%` }}
            />
          </div>
        )}
      </div>
      {isUnlocked && (
        <span className="achievement-badge__check" aria-hidden="true">
          ✓
        </span>
      )}
    </article>
  );
};

interface StreakCardProps {
  streak: StreakData;
}

const StreakCard: React.FC<StreakCardProps> = ({ streak }) => (
  <article className="streak-card" aria-label={`${streak.label} streak`}>
    <div className="streak-card__flame" aria-hidden="true">
      🔥
    </div>
    <div className="streak-card__info">
      <h4 className="streak-card__label">{streak.label}</h4>
      <p className="streak-card__count">
        <span className="streak-card__number">{streak.current}</span>
        <span className="streak-card__unit">{streak.current === 1 ? ' day' : ' days'}</span>
      </p>
      <p className="streak-card__best">
        Best: {streak.longest} {streak.longest === 1 ? 'day' : 'days'}
      </p>
    </div>
  </article>
);

interface MilestoneCardProps {
  milestone: GoalMilestone;
}

const MilestoneCard: React.FC<MilestoneCardProps> = ({ milestone }) => (
  <article className="milestone-card" aria-label={`${milestone.goalName} progress`}>
    <div className="milestone-card__header">
      <h4 className="milestone-card__name">{milestone.goalName}</h4>
      <span className="milestone-card__percent">{milestone.progress}%</span>
    </div>
    <div
      className="milestone-card__track"
      role="progressbar"
      aria-valuenow={milestone.progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${milestone.goalName}: ${milestone.progress}%`}
    >
      <div className="milestone-card__fill" style={{ width: `${milestone.progress}%` }} />
      {/* Milestone markers */}
      {[25, 50, 75, 100].map((m) => (
        <div
          key={m}
          className={`milestone-card__marker ${milestone.milestonesReached.includes(m) ? 'milestone-card__marker--reached' : ''}`}
          style={{ left: `${m}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
    {milestone.nextMilestone !== null ? (
      <p className="milestone-card__next">Next milestone: {milestone.nextMilestone}%</p>
    ) : (
      <p className="milestone-card__next milestone-card__next--completed">Goal complete! 🎉</p>
    )}
  </article>
);

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  tracking: 'Tracking',
  budgeting: 'Budgeting',
  saving: 'Saving',
  milestone: 'Milestones',
};

const CATEGORY_ORDER: AchievementCategory[] = ['tracking', 'budgeting', 'saving', 'milestone'];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export const AchievementsPage: React.FC = () => {
  const { state, loading, error, refresh } = useGamification();

  if (loading) {
    return (
      <div className="achievements-page__loading">
        <LoadingSpinner label="Loading achievements" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  if (!state) {
    return (
      <EmptyState
        title="No achievements yet"
        description="Start using Finance to earn badges and track your progress."
      />
    );
  }

  const unlockedCount = state.achievements.filter((a) => a.status === 'unlocked').length;

  return (
    <div className="achievements-page">
      <div className="page-section__header">
        <h2 className="achievements-page__title">Achievements</h2>
      </div>

      {/* Level & Points Summary */}
      <section className="achievements-section" aria-label="Level progress">
        <div className="achievements-level-card">
          <div className="achievements-level-card__info">
            <span className="achievements-level-card__level">Level {state.level}</span>
            <h3 className="achievements-level-card__name">{state.levelName}</h3>
            <p className="achievements-level-card__points">{state.totalPoints} points earned</p>
          </div>
          <div className="achievements-level-card__stats">
            <div className="achievements-level-card__stat">
              <span className="achievements-level-card__stat-value">{unlockedCount}</span>
              <span className="achievements-level-card__stat-label">Badges</span>
            </div>
            <div className="achievements-level-card__stat">
              <span className="achievements-level-card__stat-value">
                {state.achievements.length}
              </span>
              <span className="achievements-level-card__stat-label">Total</span>
            </div>
          </div>
          {state.pointsToNextLevel > 0 && (
            <p className="achievements-level-card__next">
              {state.pointsToNextLevel} points to next level
            </p>
          )}
        </div>
      </section>

      {/* Streaks */}
      {state.streaks.length > 0 && (
        <section className="achievements-section" aria-label="Streaks">
          <h3 className="achievements-section__title">Streaks</h3>
          <div className="achievements-streaks-grid">
            {state.streaks.map((streak) => (
              <StreakCard key={streak.type} streak={streak} />
            ))}
          </div>
        </section>
      )}

      {/* Goal milestones */}
      {state.milestones.length > 0 && (
        <section className="achievements-section" aria-label="Goal milestones">
          <h3 className="achievements-section__title">Goal Progress</h3>
          <div className="achievements-milestones">
            {state.milestones.map((milestone) => (
              <MilestoneCard key={milestone.goalId} milestone={milestone} />
            ))}
          </div>
        </section>
      )}

      {/* Achievement badges by category */}
      {CATEGORY_ORDER.map((category) => {
        const categoryAchievements = getAchievementsByCategory(state.achievements, category);
        if (categoryAchievements.length === 0) return null;

        return (
          <section
            key={category}
            className="achievements-section"
            aria-label={`${CATEGORY_LABELS[category]} achievements`}
          >
            <h3 className="achievements-section__title">{CATEGORY_LABELS[category]}</h3>
            <div className="achievements-badge-grid">
              {categoryAchievements.map((achievement) => (
                <AchievementBadge key={achievement.id} achievement={achievement} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default AchievementsPage;
