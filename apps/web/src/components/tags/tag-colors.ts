// SPDX-License-Identifier: BUSL-1.1

/**
 * Deterministic color generation for tag chips.
 *
 * Generates WCAG AA compliant colors from tag names using a hash function.
 * Colors are consistent across renders — the same tag name always produces
 * the same color. Subtags (e.g., "travel:flights") inherit the root tag's color.
 */

/** Color values for a tag chip (CSS color strings). */
export interface TagColor {
  /** Background color for the chip. */
  bg: string;
  /** Text color for the chip label. */
  text: string;
  /** Border color for the chip outline. */
  border: string;
}

/**
 * Pre-defined palette of 12 harmonious hues (in degrees on the HSL wheel).
 * Selected for visual distinctiveness and WCAG AA contrast compliance when
 * paired with appropriate lightness values.
 */
const PALETTE_HUES = [
  210, // blue
  340, // rose
  160, // teal
  30, // orange
  270, // purple
  50, // gold
  180, // cyan
  0, // red
  120, // green
  300, // magenta
  80, // lime
  240, // indigo
] as const;

/**
 * Simple string hash using DJB2 algorithm.
 * Produces a positive 32-bit integer from any string.
 */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Ensure unsigned
}

/**
 * Extract the root tag name from a potentially nested subtag.
 *
 * @example
 * getTagRootName("travel:flights") // "travel"
 * getTagRootName("groceries") // "groceries"
 */
export function getTagRootName(tag: string): string {
  const colonIndex = tag.indexOf(':');
  return colonIndex === -1 ? tag : tag.slice(0, colonIndex);
}

/**
 * Generate a deterministic HSL color set from a tag name.
 *
 * Uses the root tag name for color so subtags share their parent's color.
 * Light theme: pastel background + dark text for WCAG AA contrast (≥4.5:1).
 * Dark theme support via CSS custom properties is handled at the component level.
 *
 * @param tagName - The full tag name (may include subtag separator `:`)
 * @returns Object with bg, text, and border CSS color strings
 */
export function getTagColor(tagName: string): TagColor {
  const root = getTagRootName(tagName.toLowerCase().trim());
  const hash = djb2Hash(root);
  const hue = PALETTE_HUES[hash % PALETTE_HUES.length];

  // Light theme: high-lightness bg, low-lightness text
  // These values ensure ≥4.5:1 contrast ratio for WCAG AA
  const saturation = 60 + (hash % 20); // 60-79%

  return {
    bg: `hsl(${hue} ${saturation}% 92%)`,
    text: `hsl(${hue} ${saturation}% 25%)`,
    border: `hsl(${hue} ${saturation}% 80%)`,
  };
}

/**
 * Get dark-mode color values for a tag.
 * Uses lower lightness for background and higher for text.
 */
export function getTagColorDark(tagName: string): TagColor {
  const root = getTagRootName(tagName.toLowerCase().trim());
  const hash = djb2Hash(root);
  const hue = PALETTE_HUES[hash % PALETTE_HUES.length];
  const saturation = 40 + (hash % 20); // 40-59% (less saturated in dark mode)

  return {
    bg: `hsl(${hue} ${saturation}% 18%)`,
    text: `hsl(${hue} ${saturation}% 82%)`,
    border: `hsl(${hue} ${saturation}% 30%)`,
  };
}

/**
 * Format a subtag for display, showing the hierarchy separator.
 *
 * @example
 * formatTagDisplay("travel:flights") // { root: "travel", sub: "flights" }
 * formatTagDisplay("groceries") // { root: "groceries", sub: null }
 */
export function formatTagDisplay(tag: string): { root: string; sub: string | null } {
  const colonIndex = tag.indexOf(':');
  if (colonIndex === -1) {
    return { root: tag, sub: null };
  }
  return {
    root: tag.slice(0, colonIndex),
    sub: tag.slice(colonIndex + 1),
  };
}
