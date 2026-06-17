// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';
import type { PeriodSnapshot } from '../../lib/insights/types';

export interface NetWorthChartProps {
  history: readonly PeriodSnapshot[];
}

export const NetWorthChart: React.FC<NetWorthChartProps> = ({ history }) => {
  const { points, areaPoints } = useMemo(() => {
    if (history.length === 0) {
      return { points: '0,70 100,70', areaPoints: '0,70 100,70 100,80 0,80' };
    }

    const values = history.map((point) => point.netWorth);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const linePoints = history
      .map((point, index) => {
        const x = history.length === 1 ? 50 : (index / (history.length - 1)) * 100;
        const y = 70 - ((point.netWorth - min) / range) * 50;
        return `${x},${y}`;
      })
      .join(' ');

    return {
      points: linePoints,
      areaPoints: `${linePoints} 100,80 0,80`,
    };
  }, [history]);

  return (
    <div className="net-worth-chart" role="img" aria-label="Net worth trend sparkline">
      <svg viewBox="0 0 100 80" preserveAspectRatio="none" className="net-worth-chart__svg">
        <polyline className="net-worth-chart__area" points={areaPoints} />
        <polyline className="net-worth-chart__line" points={points} />
      </svg>
      <div className="net-worth-chart__labels" aria-hidden="true">
        {history.map((point) => (
          <span key={`${point.label}-${point.endDate}`}>{point.label}</span>
        ))}
      </div>
    </div>
  );
};
