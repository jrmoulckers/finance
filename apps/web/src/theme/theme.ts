/**
 * TypeScript theme object for programmatic access to design tokens.
 *
 * CSS custom properties are the primary way to consume tokens (via tokens.css).
 * This module exposes the same values as typed constants for use cases where
 * JS access is required - e.g., chart libraries (Recharts, D3), inline
 * calculations, or dynamic style generation.
 *
 * Values are kept in sync with packages/design-tokens/build/web/tokens.css.
 */

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

export const spacing = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  20: "80px",
} as const;

// ---------------------------------------------------------------------------
// Colors - semantic aliases (reference CSS vars at runtime)
// ---------------------------------------------------------------------------

export const colors = {
  background: {
    primary: "var(--semantic-background-primary)",
    secondary: "var(--semantic-background-secondary)",
    elevated: "var(--semantic-background-elevated)",
  },
  text: {
    primary: "var(--semantic-text-primary)",
    secondary: "var(--semantic-text-secondary)",
    disabled: "var(--semantic-text-disabled)",
    inverse: "var(--semantic-text-inverse)",
  },
  border: {
    default: "var(--semantic-border-default)",
    focus: "var(--semantic-border-focus)",
    error: "var(--semantic-border-error)",
  },
  interactive: {
    default: "var(--semantic-interactive-default)",
    hover: "var(--semantic-interactive-hover)",
    pressed: "var(--semantic-interactive-pressed)",
    disabled: "var(--semantic-interactive-disabled)",
  },
  status: {
    positive: "var(--semantic-status-positive)",
    negative: "var(--semantic-status-negative)",
    warning: "var(--semantic-status-warning)",
    info: "var(--semantic-status-info)",
  },
  amount: {
    positive: "var(--semantic-amount-positive)",
    negative: "var(--semantic-amount-negative)",
  },
  /** CVD-safe chart palette (IBM color-blind safe). */
  chart: [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
    "var(--color-chart-6)",
  ] as const,
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const typography = {
  display: {
    fontSize: "var(--type-scale-display-font-size)",
    fontWeight: "var(--type-scale-display-font-weight)",
    lineHeight: "var(--type-scale-display-line-height)",
  },
  headline: {
    fontSize: "var(--type-scale-headline-font-size)",
    fontWeight: "var(--type-scale-headline-font-weight)",
    lineHeight: "var(--type-scale-headline-line-height)",
  },
  title: {
    fontSize: "var(--type-scale-title-font-size)",
    fontWeight: "var(--type-scale-title-font-weight)",
    lineHeight: "var(--type-scale-title-line-height)",
  },
  body: {
    fontSize: "var(--type-scale-body-font-size)",
    fontWeight: "var(--type-scale-body-font-weight)",
    lineHeight: "var(--type-scale-body-line-height)",
  },
  label: {
    fontSize: "var(--type-scale-label-font-size)",
    fontWeight: "var(--type-scale-label-font-weight)",
    lineHeight: "var(--type-scale-label-line-height)",
  },
  caption: {
    fontSize: "var(--type-scale-caption-font-size)",
    fontWeight: "var(--type-scale-caption-font-weight)",
    lineHeight: "var(--type-scale-caption-line-height)",
  },
} as const;

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------

export const borderRadius = {
  none: "var(--border-radius-none)",
  sm: "var(--border-radius-sm)",
  md: "var(--border-radius-md)",
  lg: "var(--border-radius-lg)",
  xl: "var(--border-radius-xl)",
  full: "var(--border-radius-full)",
} as const;

// ---------------------------------------------------------------------------
// Shadows / Elevation
// ---------------------------------------------------------------------------

export const elevation = {
  none: "var(--elevation-none)",
  low: "var(--elevation-low)",
  medium: "var(--elevation-medium)",
  high: "var(--elevation-high)",
} as const;

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

export const animation = {
  duration: {
    instant: "var(--duration-instant)",
    fast: "var(--duration-fast)",
    normal: "var(--duration-normal)",
    slow: "var(--duration-slow)",
  },
  easing: {
    default: "var(--easing-default)",
    in: "var(--easing-in)",
    out: "var(--easing-out)",
    inOut: "var(--easing-in-out)",
  },
} as const;

// ---------------------------------------------------------------------------
// Composite theme object
// ---------------------------------------------------------------------------

export const theme = {
  spacing,
  colors,
  typography,
  borderRadius,
  elevation,
  animation,
} as const;

export type Theme = typeof theme;