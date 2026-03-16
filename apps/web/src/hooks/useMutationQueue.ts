// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useState } from 'react';
import { getQueueSize } from '../db/mutation-queue';

const QUEUE_POLL_INTERVAL_MS = 5_000;

type MutationQueueMessage =
  | { type: 'MUTATION_REPLAY_STARTED' }
  | { type: 'MUTATION_REPLAY_FINISHED'; queueSize: number };

/** Shape returned by {@link useMutationQueue}. */
export interface UseMutationQueueResult {
  /** Number of queued offline mutations waiting to replay. */
  queueSize: number;
  /** `true` while the service worker is replaying queued mutations. */
  isReplaying: boolean;
  /** Ask the active service worker to replay queued mutations immediately. */
  replay: () => void;
}

/**
 * React hook for monitoring the IndexedDB-backed offline mutation queue.
 *
 * The hook polls queue size periodically and listens for replay lifecycle
 * messages from the service worker so UI can reflect sync progress.
 */
export function useMutationQueue(): UseMutationQueueResult {
  const [queueSize, setQueueSize] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);

  /** Refresh queue size from IndexedDB. */
  const refreshQueueSize = useCallback(async () => {
    try {
      setQueueSize(await getQueueSize());
    } catch {
      setQueueSize(0);
    }
  }, []);

  /** Request an immediate replay from the active service worker. */
  const replay = useCallback(() => {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      return;
    }

    setIsReplaying(true);
    navigator.serviceWorker.controller.postMessage({ type: 'REPLAY_MUTATIONS' });
  }, []);

  useEffect(() => {
    void refreshQueueSize();

    const intervalId = window.setInterval(() => {
      void refreshQueueSize();
    }, QUEUE_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [refreshQueueSize]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return undefined;
    }

    const handleMessage = (event: MessageEvent<MutationQueueMessage>) => {
      if (event.data?.type === 'MUTATION_REPLAY_STARTED') {
        setIsReplaying(true);
        return;
      }

      if (event.data?.type === 'MUTATION_REPLAY_FINISHED') {
        setIsReplaying(false);
        setQueueSize(event.data.queueSize);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, []);

  return {
    queueSize,
    isReplaying,
    replay,
  };
}
