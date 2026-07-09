// SPDX-License-Identifier: BUSL-1.1

/**
 * Compact, accessible status chip for a savings goal (#3776, items 3 & 4).
 *
 * Completed goals previously looked identical to active ones. This badge gives
 * every goal an at-a-glance status indicator whose colour is backed by a text
 * label (not colour alone), keeping it usable for colour-blind users and screen
 * readers alike.
 *
 * @module components/goals/GoalStatusBadge
 */

import type { GoalStatus } from '../../kmp/bridge';
import { formatGoalStatusLabel } from '../../lib/goals';
import './goal-status-badge.css';

const STATUS_TONE: Record<GoalStatus, string> = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/** Props for {@link GoalStatusBadge}. */
export interface GoalStatusBadgeProps {
  /** The goal status to render. */
  status: GoalStatus;
  /** Optional extra class names. */
  className?: string;
}

/** Render a coloured, labelled status chip for a goal. */
export function GoalStatusBadge({ status, className }: GoalStatusBadgeProps) {
  const tone = STATUS_TONE[status] ?? 'active';
  const label = formatGoalStatusLabel(status);

  return (
    <span
      className={`goal-status-badge goal-status-badge--${tone}${className ? ` ${className}` : ''}`}
      data-status={status}
    >
      {label}
    </span>
  );
}

export default GoalStatusBadge;
