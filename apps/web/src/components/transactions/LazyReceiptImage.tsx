// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import type { Transaction } from '../../kmp/bridge';
import { getReceiptImageMetadata } from '../../lib/receiptImagePolicy';

export interface LazyReceiptImageProps {
  readonly transaction: Transaction;
  readonly className?: string;
}

const LOAD_ROOT_MARGIN = '200% 0px';
const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 16_000;

export const LazyReceiptImage: React.FC<LazyReceiptImageProps> = ({ transaction, className }) => {
  const { isOffline, shouldDeferHeavyAssets } = useOfflineStatus();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  const metadata = useMemo(
    () =>
      getReceiptImageMetadata(
        transaction.customFields,
        `Receipt for ${transaction.payee ?? 'transaction'}`,
      ),
    [transaction.customFields, transaction.payee],
  );

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: LOAD_ROOT_MARGIN },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [metadata.url]);

  useEffect(
    () => () => {
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  if (metadata.status === 'none') {
    return null;
  }

  if (metadata.status === 'pending-upload') {
    return <ReceiptPlaceholder className={className} label="Receipt pending upload" />;
  }

  if (metadata.status === 'unavailable' || !metadata.url) {
    return <ReceiptPlaceholder className={className} label="Receipt unavailable offline" />;
  }

  const canLoadImage = isNearViewport && !(shouldDeferHeavyAssets && metadata.status !== 'cached');
  const showOfflinePlaceholder = isOffline && metadata.status !== 'cached' && !canLoadImage;

  const handleError = () => {
    setLoadFailed(true);
    const delay = Math.min(INITIAL_RETRY_MS * 2 ** retryAttempt, MAX_RETRY_MS);
    retryTimerRef.current = setTimeout(() => {
      setRetryAttempt((attempt) => attempt + 1);
      setLoadFailed(false);
    }, delay);
  };

  return (
    <div
      ref={wrapperRef}
      className={className ?? 'receipt-thumb'}
      data-retry-attempt={retryAttempt}
    >
      {showOfflinePlaceholder || !canLoadImage ? (
        <ReceiptPlaceholder
          label={showOfflinePlaceholder ? 'Receipt unavailable offline' : 'Receipt deferred'}
        />
      ) : loadFailed ? (
        <ReceiptPlaceholder label="Receipt retrying" />
      ) : (
        <img
          key={`${metadata.url}:${retryAttempt}`}
          src={metadata.url}
          alt={metadata.alt}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onError={handleError}
        />
      )}
    </div>
  );
};

const ReceiptPlaceholder: React.FC<{ readonly className?: string; readonly label: string }> = ({
  className,
  label,
}) => (
  <span className={className ?? 'receipt-thumb__placeholder'} role="img" aria-label={label}>
    🧾
  </span>
);

export default LazyReceiptImage;
