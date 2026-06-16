// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface AccessibleChartTableColumn {
  key: string;
  header: string;
}

export interface AccessibleChartTableRow {
  id: string;
  rowHeader: string;
  cells: string[];
  ariaLabel: string;
}

export const CHART_KEYBOARD_INSTRUCTIONS =
  'Use Left and Right arrow keys to move between data points. Press Home for the first point and End for the last point.';

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return ((index % length) + length) % length;
}

export function useChartKeyboardNavigation(rows: AccessibleChartTableRow[]) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    setActiveIndex((current) => {
      if (rows.length === 0) return 0;
      return Math.min(current, rows.length - 1);
    });
  }, [rows.length]);

  const announceIndex = useCallback(
    (index: number) => {
      if (rows.length === 0) return;
      const next = clampIndex(index, rows.length);
      setActiveIndex(next);
      setAnnouncement(rows[next].ariaLabel);
    },
    [rows],
  );

  const handleFocus = useCallback(() => {
    if (rows.length === 0) return;
    setAnnouncement(rows[Math.min(activeIndex, rows.length - 1)].ariaLabel);
  }, [activeIndex, rows]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (rows.length === 0) return;

      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          announceIndex(activeIndex - 1);
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          announceIndex(activeIndex + 1);
          break;
        case 'Home':
          event.preventDefault();
          announceIndex(0);
          break;
        case 'End':
          event.preventDefault();
          announceIndex(rows.length - 1);
          break;
        default:
          break;
      }
    },
    [activeIndex, announceIndex, rows.length],
  );

  return {
    announcement,
    handleFocus,
    handleKeyDown,
  };
}

interface AccessibleChartDataTableProps {
  captionId: string;
  title: string;
  rowHeaderLabel: string;
  columns: AccessibleChartTableColumn[];
  rows: AccessibleChartTableRow[];
}

export function AccessibleChartDataTable({
  captionId,
  title,
  rowHeaderLabel,
  columns,
  rows,
}: AccessibleChartDataTableProps) {
  return (
    <table className="sr-only" aria-label={`${title} data table`}>
      <caption id={captionId}>{title} data table</caption>
      <thead>
        <tr>
          <th scope="col">{rowHeaderLabel}</th>
          {columns.map((column) => (
            <th key={column.key} scope="col">
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} id={row.id} aria-label={row.ariaLabel}>
            <th scope="row">{row.rowHeader}</th>
            {row.cells.map((cell, index) => (
              <td key={`${row.id}-${columns[index]?.key ?? index}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
