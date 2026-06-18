// SPDX-License-Identifier: BUSL-1.1

export type PhysicalCssProperty =
  | 'margin-left'
  | 'margin-right'
  | 'padding-left'
  | 'padding-right'
  | 'border-left'
  | 'border-right'
  | 'left'
  | 'right';

export interface PhysicalCssFinding {
  readonly line: number;
  readonly column: number;
  readonly property: PhysicalCssProperty;
  readonly suggestedProperty: string;
}

export const LOGICAL_CSS_PROPERTY_MAP: Readonly<Record<PhysicalCssProperty, string>> = {
  'margin-left': 'margin-inline-start',
  'margin-right': 'margin-inline-end',
  'padding-left': 'padding-inline-start',
  'padding-right': 'padding-inline-end',
  'border-left': 'border-inline-start',
  'border-right': 'border-inline-end',
  left: 'inset-inline-start',
  right: 'inset-inline-end',
};

const PHYSICAL_PROPERTY_PATTERN =
  /(?:^|[\s{;])((?:margin|padding|border)-(?:left|right)|left|right)\s*:/g;

function lineColumn(
  content: string,
  index: number,
): { readonly line: number; readonly column: number } {
  const prefix = content.slice(0, index);
  const lines = prefix.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

export function findPhysicalCssProperties(content: string): readonly PhysicalCssFinding[] {
  const findings: PhysicalCssFinding[] = [];

  for (const match of content.matchAll(PHYSICAL_PROPERTY_PATTERN)) {
    const property = match[1] as PhysicalCssProperty;
    const propertyIndex = (match.index ?? 0) + match[0].indexOf(property);
    findings.push({
      ...lineColumn(content, propertyIndex),
      property,
      suggestedProperty: LOGICAL_CSS_PROPERTY_MAP[property],
    });
  }

  return findings;
}

export function replacePhysicalCssProperties(content: string): string {
  return content.replace(PHYSICAL_PROPERTY_PATTERN, (match, property: PhysicalCssProperty) =>
    match.replace(property, LOGICAL_CSS_PROPERTY_MAP[property]),
  );
}
