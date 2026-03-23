// SPDX-License-Identifier: BUSL-1.1

/** Lazy-load Recharts components only when charts are needed. */
export const lazyRecharts = () => import('recharts');
/** Lazy-load D3 only when the pie chart is rendered. */
export const lazyD3 = () => import('d3');
