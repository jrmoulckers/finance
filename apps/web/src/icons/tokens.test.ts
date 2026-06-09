// SPDX-License-Identifier: BUSL-1.1

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  FLUENT_FILLED_MAPPING,
  FLUENT_REGULAR_MAPPING,
  ICON_TOKENS,
  LUCIDE_MAPPING,
  MATERIAL_SYMBOLS_OUTLINED_MAPPING,
  MATERIAL_SYMBOLS_ROUNDED_MAPPING,
  MATERIAL_SYMBOLS_SHARP_MAPPING,
  type IconMapping,
} from './tokens';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const kmpIconTokenPath = resolve(
  currentDirectory,
  '../../../../packages/core/src/commonMain/kotlin/com/finance/core/icons/IconToken.kt',
);

function readKmpIconTokens(): string[] {
  const source = readFileSync(kmpIconTokenPath, 'utf8');
  const match = source.match(/enum class IconToken \{([\s\S]*?)\n\}/);

  if (!match?.[1]) {
    throw new Error('Unable to parse IconToken enum from ' + kmpIconTokenPath);
  }

  return match[1]
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function expectCompleteMapping(name: string, mapping: IconMapping): void {
  expect(Object.keys(mapping).sort(), `${name} keys`).toEqual([...ICON_TOKENS].sort());
  expect(
    Object.values(mapping).every((value) => value.length > 0),
    `${name} values`,
  ).toBe(true);
}

describe('IconToken web mirror', () => {
  it('matches the KMP IconToken enum names', () => {
    expect(ICON_TOKENS).toEqual(readKmpIconTokens());
  });

  it.each([
    ['Lucide', LUCIDE_MAPPING],
    ['Material Symbols Outlined', MATERIAL_SYMBOLS_OUTLINED_MAPPING],
    ['Material Symbols Rounded', MATERIAL_SYMBOLS_ROUNDED_MAPPING],
    ['Material Symbols Sharp', MATERIAL_SYMBOLS_SHARP_MAPPING],
    ['Fluent Regular', FLUENT_REGULAR_MAPPING],
    ['Fluent Filled', FLUENT_FILLED_MAPPING],
  ])('has a complete %s mapping', (name, mapping) => {
    expectCompleteMapping(name, mapping);
  });
});
