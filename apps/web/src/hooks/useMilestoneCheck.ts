// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useDatabase } from '../db/DatabaseProvider';
import { getAllAccounts } from '../db/repositories/accounts';
import { getAllGoals } from '../db/repositories/goals';
import { getAllTransactions } from '../db/repositories/transactions';
import {
  MILESTONE_DATA_CHANGED_EVENT,
  buildMilestoneSnapshot,
  detectMilestones,
  loadMilestoneStorageState,
  mergeDebtBaselines,
  saveMilestoneStorageState,
  type DetectedMilestone,
} from '../lib/milestones';
import { useSyncStatus } from './useSyncStatus';

export interface UseMilestoneCheckResult {
  readonly queuedMilestones: readonly DetectedMilestone[];
  readonly activeMilestone: DetectedMilestone | null;
  readonly dismissMilestone: (milestoneId: string) => void;
  readonly checkMilestones: () => void;
}

export function useMilestoneCheck(): UseMilestoneCheckResult {
  const db = useDatabase();
  const { lastSyncTime } = useSyncStatus();
  const [queuedMilestones, setQueuedMilestones] = useState<DetectedMilestone[]>([]);

  const checkMilestones = useCallback(() => {
    try {
      const accounts = getAllAccounts(db);
      const goals = getAllGoals(db);
      const transactions = getAllTransactions(db);
      const currentSnapshot = buildMilestoneSnapshot({ accounts, goals, transactions });
      const state = loadMilestoneStorageState();
      const mergedDebtBaselines = mergeDebtBaselines(state.debtBaselines, currentSnapshot);

      if (state.snapshot === null) {
        saveMilestoneStorageState({
          snapshot: currentSnapshot,
          shownMilestoneIds: state.shownMilestoneIds,
          debtBaselines: mergedDebtBaselines,
        });
        return;
      }

      const detected = detectMilestones({
        previous: state.snapshot,
        current: currentSnapshot,
        shownMilestoneIds: new Set(state.shownMilestoneIds),
        debtBaselines: mergedDebtBaselines,
        now: new Date().toISOString(),
      });

      const nextShownMilestoneIds = new Set(state.shownMilestoneIds);
      for (const milestone of detected) {
        nextShownMilestoneIds.add(milestone.id);
      }

      saveMilestoneStorageState({
        snapshot: currentSnapshot,
        shownMilestoneIds: [...nextShownMilestoneIds],
        debtBaselines: mergedDebtBaselines,
      });

      if (detected.length === 0) {
        return;
      }

      setQueuedMilestones((previousQueue) => {
        const queuedIds = new Set(previousQueue.map((milestone) => milestone.id));
        const nextMilestones = detected.filter((milestone) => !queuedIds.has(milestone.id));
        return nextMilestones.length > 0 ? [...previousQueue, ...nextMilestones] : previousQueue;
      });
    } catch {
      // Ignore transient database issues so milestone checks never break navigation.
    }
  }, [db]);

  useEffect(() => {
    checkMilestones();
  }, [checkMilestones]);

  useEffect(() => {
    if (!lastSyncTime) {
      return;
    }

    checkMilestones();
  }, [checkMilestones, lastSyncTime]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleDataChanged = () => {
      checkMilestones();
    };

    window.addEventListener(MILESTONE_DATA_CHANGED_EVENT, handleDataChanged);
    return () => window.removeEventListener(MILESTONE_DATA_CHANGED_EVENT, handleDataChanged);
  }, [checkMilestones]);

  const dismissMilestone = useCallback((milestoneId: string) => {
    setQueuedMilestones((previousQueue) =>
      previousQueue.filter((milestone) => milestone.id !== milestoneId),
    );
  }, []);

  const activeMilestone = useMemo(() => queuedMilestones[0] ?? null, [queuedMilestones]);

  return {
    queuedMilestones,
    activeMilestone,
    dismissMilestone,
    checkMilestones,
  };
}
