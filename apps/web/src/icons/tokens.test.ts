// SPDX-License-Identifier: BUSL-1.1

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ICON_TOKENS, LUCIDE_MAPPING } from './tokens';

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

describe('IconToken web mirror', () => {
  it('matches the KMP IconToken enum names', () => {
    expect(ICON_TOKENS).toEqual(readKmpIconTokens());
  });

  it('has a complete Lucide mapping', () => {
    expect(Object.keys(LUCIDE_MAPPING).sort()).toEqual([...ICON_TOKENS].sort());
    expect(Object.values(LUCIDE_MAPPING).every((value) => value.length > 0)).toBe(true);
  });
});
