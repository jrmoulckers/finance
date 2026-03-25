// SPDX-License-Identifier: BUSL-1.1

import StyleDictionary from 'style-dictionary';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

const toGlob = (p) => p.replace(/\\/g, '/');

const primitives = toGlob(join(root, 'tokens', 'primitive', '*.json'));
const components = toGlob(join(root, 'tokens', 'component', '*.json'));

/** Shared non-color semantic tokens (typography, elevation, breakpoints, animation) */
const semanticShared = [
  toGlob(join(root, 'tokens', 'semantic', 'typography.json')),
  toGlob(join(root, 'tokens', 'semantic', 'elevation.json')),
  toGlob(join(root, 'tokens', 'semantic', 'breakpoints.json')),
  toGlob(join(root, 'tokens', 'semantic', 'animation.json')),
];

/**
 * Custom format: Kotlin object with breakpoint constants (Int, in px).
 * Generates a single Kotlin object that Android / KMP code can import.
 */
StyleDictionary.registerFormat({
  name: 'kotlin/breakpoints-object',
  format: ({ dictionary }) => {
    const header = [
      '// Do not edit directly, this file was auto-generated.',
      '',
      'package com.finance.tokens',
      '',
      '/**',
      ' * Responsive breakpoint constants (values in CSS pixels).',
      ' * Use these in Jetpack Compose or Kotlin Multiplatform layout logic.',
      ' */',
      'object FinanceBreakpoints {',
    ];
    const footer = ['}', ''];

    const lines = dictionary.allTokens.map((token) => {
      const name = token.path
        .slice(1)
        .join('_')
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toUpperCase();
      const px = parseInt(token.original.$value.toString().replace(/[^0-9]/g, ''), 10) || 0;
      const desc = token.$description || token.original.$description || '';
      return `    /** ${desc} */\n    const val ${name}: Int = ${px}`;
    });

    return [...header, lines.join('\n\n'), ...footer].join('\n');
  },
});

/**
 * Build light theme — primitives + light semantic + shared semantic + components
 */
const lightSd = new StyleDictionary({
  source: [
    primitives,
    toGlob(join(root, 'tokens', 'semantic', 'colors.light.json')),
    ...semanticShared,
    components,
  ],
  usesDtcg: true,
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: toGlob(join(root, 'build', 'web/')),
      files: [
        {
          destination: 'tokens.css',
          format: 'css/variables',
          options: { outputReferences: true },
        },
      ],
    },
    swift: {
      transformGroup: 'ios-swift',
      buildPath: toGlob(join(root, 'build', 'ios/')),
      files: [
        {
          destination: 'FinanceTokens.swift',
          format: 'ios-swift/enum.swift',
          className: 'FinanceTokens',
          options: { outputReferences: true },
        },
      ],
    },
    android: {
      transformGroup: 'android',
      buildPath: toGlob(join(root, 'build', 'android/')),
      files: [
        {
          destination: 'colors.xml',
          format: 'android/colors',
          filter: (token) => token.$type === 'color',
        },
        {
          destination: 'dimens.xml',
          format: 'android/dimens',
          filter: (token) => token.$type === 'dimension',
        },
      ],
    },
    kotlin: {
      transformGroup: 'android',
      buildPath: toGlob(join(root, 'build', 'kotlin/')),
      files: [
        {
          destination: 'FinanceBreakpoints.kt',
          format: 'kotlin/breakpoints-object',
          filter: (token) => token.$type === 'dimension' && token.path[0] === 'breakpoint',
        },
      ],
    },
  },
});

/**
 * Build dark theme — primitives + dark semantic + shared semantic + components
 */
const darkSd = new StyleDictionary({
  source: [
    primitives,
    toGlob(join(root, 'tokens', 'semantic', 'colors.dark.json')),
    ...semanticShared,
    components,
  ],
  usesDtcg: true,
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: toGlob(join(root, 'build', 'web/')),
      files: [
        {
          destination: 'tokens-dark.css',
          format: 'css/variables',
          options: {
            outputReferences: true,
            selector: '[data-theme="dark"]',
          },
        },
      ],
    },
    swift: {
      transformGroup: 'ios-swift',
      buildPath: toGlob(join(root, 'build', 'ios/')),
      files: [
        {
          destination: 'FinanceTokensDark.swift',
          format: 'ios-swift/enum.swift',
          className: 'FinanceTokensDark',
          options: { outputReferences: true },
        },
      ],
    },
    android: {
      transformGroup: 'android',
      buildPath: toGlob(join(root, 'build', 'android/')),
      files: [
        {
          destination: 'colors-night.xml',
          format: 'android/colors',
          filter: (token) => token.$type === 'color',
        },
      ],
    },
  },
});

/**
 * Build OLED dark theme — primitives + OLED dark semantic + shared semantic + components
 *
 * Uses true black (#000000) backgrounds for AMOLED battery savings.
 * All color pairings verified for WCAG AA contrast against pure black.
 * See: docs/design/oled-dark-mode.md
 */
const oledDarkSd = new StyleDictionary({
  source: [
    primitives,
    toGlob(join(root, 'tokens', 'semantic', 'colors.dark-oled.json')),
    ...semanticShared,
    components,
  ],
  usesDtcg: true,
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: toGlob(join(root, 'build', 'web/')),
      files: [
        {
          destination: 'tokens-dark-oled.css',
          format: 'css/variables',
          options: {
            outputReferences: true,
            selector: '[data-theme="dark-oled"]',
          },
        },
      ],
    },
    swift: {
      transformGroup: 'ios-swift',
      buildPath: toGlob(join(root, 'build', 'ios/')),
      files: [
        {
          destination: 'FinanceTokensDarkOLED.swift',
          format: 'ios-swift/enum.swift',
          className: 'FinanceTokensDarkOLED',
          options: { outputReferences: true },
        },
      ],
    },
    android: {
      transformGroup: 'android',
      buildPath: toGlob(join(root, 'build', 'android/')),
      files: [
        {
          destination: 'colors-night-oled.xml',
          format: 'android/colors',
          filter: (token) => token.$type === 'color',
        },
      ],
    },
  },
});

try {
  await lightSd.buildAllPlatforms();
  await darkSd.buildAllPlatforms();
  await oledDarkSd.buildAllPlatforms();
  console.log('✅ Design tokens built successfully (light + dark + dark-oled)!');
} catch (err) {
  console.error('Build failed:', err.message);
  process.exit(1);
}
