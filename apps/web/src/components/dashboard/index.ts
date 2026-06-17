// SPDX-License-Identifier: BUSL-1.1

/**
 * Barrel exports for the dashboard widget system.
 *
 * @module components/dashboard
 */

export { WidgetContainer } from './WidgetContainer';
export type { WidgetContainerProps } from './WidgetContainer';
export { CustomizePanel } from './CustomizePanel';
export type { CustomizePanelProps } from './CustomizePanel';
export { SafeToSpendCard } from './SafeToSpendCard';
export type { SafeToSpendCardProps } from './SafeToSpendCard';
export {
  WIDGET_DEFINITIONS,
  WIDGET_DEFINITION_MAP,
  DEFAULT_WIDGET_ORDER,
  LAYOUT_STORAGE_KEY,
  LAYOUT_VERSION,
  buildDefaultLayout,
} from './widget-types';
export type {
  WidgetId,
  WidgetSize,
  WidgetDefinition,
  WidgetConfig,
  DashboardLayout,
} from './widget-types';
