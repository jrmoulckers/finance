// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import './loading-spinner.css';

export interface LoadingSpinnerProps {
  size?: number;
  label?: string;
  className?: string;
}
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 40,
  label = 'Loading',
  className = '',
}) => (
  <div
    className={`loading-spinner ${className}`.trim()}
    role="status"
    aria-label={label}
    aria-live="polite"
  >
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="loading-spinner__svg"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="var(--semantic-border-default)"
        strokeWidth="3"
        fill="none"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="var(--semantic-interactive-default)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
    <span className="loading-spinner__sr-label">{label}</span>
  </div>
);
export default LoadingSpinner;
