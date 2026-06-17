// SPDX-License-Identifier: BUSL-1.1

import { useEffect, useMemo, type RefObject } from 'react';

import { useAnnouncer } from '../../hooks/useAnnouncer';

export interface FormErrorSummaryItem {
  fieldId: string;
  label: string;
  message: string;
}

export interface FormErrorSummaryProps {
  id: string;
  title?: string;
  errors: readonly FormErrorSummaryItem[];
  summaryRef?: RefObject<HTMLDivElement | null>;
}

export function FormErrorSummary({
  id,
  title = 'Some fields need attention',
  errors,
  summaryRef,
}: FormErrorSummaryProps) {
  const { announceNow } = useAnnouncer({ politeness: 'assertive' });
  const announcement = useMemo(
    () => `${title}. ${errors.map((error) => `${error.label}: ${error.message}`).join(' ')}`,
    [errors, title],
  );

  useEffect(() => {
    if (errors.length > 0) {
      announceNow(announcement);
    }
  }, [announceNow, announcement, errors.length]);

  if (errors.length === 0) return null;

  return (
    <div
      id={id}
      ref={summaryRef}
      className="form-error-summary"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      tabIndex={-1}
    >
      <p className="form-error-summary__title">{title}</p>
      <ul className="form-error-summary__list">
        {errors.map((error) => (
          <li key={error.fieldId}>
            <a href={`#${error.fieldId}`}>{`${error.label}: ${error.message}`}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FormErrorSummary;
