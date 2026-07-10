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

/** Shared non-color semantic tokens (typography, elevation, breakpoints, animation, state, layer) */
const semanticShared = [
  toGlob(join(root, 'tokens', 'semantic', 'typography.json')),
  toGlob(join(root, 'tokens', 'semantic', 'elevation.json')),
  toGlob(join(root, 'tokens', 'semantic', 'breakpoints.json')),
  toGlob(join(root, 'tokens', 'semantic', 'animation.json')),
  toGlob(join(root, 'tokens', 'semantic', 'state.json')),
  toGlob(join(root, 'tokens', 'semantic', 'layer.json')),
];

/**
 * Dark-theme overrides layered AFTER shared semantic + components so dark/OLED
 * builds get visible (theme-aware) elevation and the dark CVD-safe chart palette
 * without affecting the light or light-high-contrast output. Kept in
 * tokens/override/ (outside the primitive/component globs) so they only apply to
 * the themes that explicitly include them.
 */
const darkOverrides = [
  toGlob(join(root, 'tokens', 'override', 'elevation.dark.json')),
  toGlob(join(root, 'tokens', 'override', 'chart.dark.json')),
];

// ---------------------------------------------------------------------------
// Custom Formats
// ---------------------------------------------------------------------------

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
 * Custom format: XAML ResourceDictionary for WinUI / UWP.
 * Generates color and dimension resources consumable by Windows platform.
 */
StyleDictionary.registerFormat({
  name: 'xaml/resource-dictionary',
  format: ({ dictionary, options: _options }) => {
    const header = [
      '<!-- Do not edit directly, this file was auto-generated. -->',
      '<ResourceDictionary',
      '    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"',
      '    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">',
      '',
    ];
    const footer = ['', '</ResourceDictionary>', ''];

    const lines = dictionary.allTokens
      .map((token) => {
        const name = token.path.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');

        if (token.$type === 'color') {
          const hex = token.$value || token.value;
          // Convert #RRGGBB to #FFRRGGBB for XAML
          const xamlColor =
            hex.startsWith('#') && hex.length === 7
              ? `#FF${hex.slice(1).toUpperCase()}`
              : hex.toUpperCase();
          return `    <Color x:Key="${name}">${xamlColor}</Color>`;
        }

        if (token.$type === 'dimension') {
          const val = parseFloat(token.$value || token.value);
          return `    <x:Double x:Key="${name}">${val}</x:Double>`;
        }

        // Skip non-color/dimension tokens for XAML
        return null;
      })
      .filter(Boolean);

    return [...header, ...lines, ...footer].join('\n');
  },
});

/**
 * Custom format: XAML SolidColorBrush resources.
 * Provides ready-to-use brush resources for WinUI controls.
 */
StyleDictionary.registerFormat({
  name: 'xaml/brushes',
  format: ({ dictionary }) => {
    const header = [
      '<!-- Do not edit directly, this file was auto-generated. -->',
      '<ResourceDictionary',
      '    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"',
      '    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">',
      '',
    ];
    const footer = ['', '</ResourceDictionary>', ''];

    const lines = dictionary.allTokens
      .filter((token) => token.$type === 'color')
      .map((token) => {
        const name = token.path.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
        const hex = token.$value || token.value;
        const xamlColor =
          hex.startsWith('#') && hex.length === 7
            ? `#FF${hex.slice(1).toUpperCase()}`
            : hex.toUpperCase();
        return `    <SolidColorBrush x:Key="${name}Brush" Color="${xamlColor}" />`;
      });

    return [...header, ...lines, ...footer].join('\n');
  },
});

// ---------------------------------------------------------------------------
// Shared platform configs (DRY helpers)
// ---------------------------------------------------------------------------

/**
 * Creates the standard set of platform outputs for a given theme.
 * @param {object} opts - Theme options
 * @param {string} opts.cssFile - CSS output filename
 * @param {string} opts.cssSelector - CSS selector for the theme scope
 * @param {string} opts.swiftFile - Swift output filename
 * @param {string} opts.swiftClass - Swift enum class name
 * @param {string} opts.androidColorsFile - Android colors XML filename
 * @param {string} opts.xamlFile - XAML ResourceDictionary filename
 * @param {string} opts.xamlBrushFile - XAML Brushes filename
 * @param {boolean} [opts.includeDimens] - Whether to include dimens.xml
 * @param {boolean} [opts.includeKotlin] - Whether to include Kotlin breakpoints
 */
function buildPlatforms(opts) {
  const platforms = {
    css: {
      transformGroup: 'css',
      buildPath: toGlob(join(root, 'build', 'web/')),
      files: [
        {
          destination: opts.cssFile,
          format: 'css/variables',
          options: {
            outputReferences: true,
            ...(opts.cssSelector ? { selector: opts.cssSelector } : {}),
          },
        },
      ],
    },
    swift: {
      transformGroup: 'ios-swift',
      buildPath: toGlob(join(root, 'build', 'ios/')),
      files: [
        {
          destination: opts.swiftFile,
          format: 'ios-swift/enum.swift',
          className: opts.swiftClass,
          options: { outputReferences: true },
        },
      ],
    },
    android: {
      transformGroup: 'android',
      buildPath: toGlob(join(root, 'build', 'android/')),
      files: [
        {
          destination: opts.androidColorsFile,
          format: 'android/colors',
          filter: (token) => token.$type === 'color',
        },
        ...(opts.includeDimens
          ? [
              {
                destination: 'dimens.xml',
                format: 'android/dimens',
                filter: (token) => token.$type === 'dimension',
              },
            ]
          : []),
      ],
    },
    windows: {
      transformGroup: 'css',
      buildPath: toGlob(join(root, 'build', 'windows/')),
      files: [
        {
          destination: opts.xamlFile,
          format: 'xaml/resource-dictionary',
        },
        {
          destination: opts.xamlBrushFile,
          format: 'xaml/brushes',
        },
      ],
    },
  };

  if (opts.includeKotlin) {
    platforms.kotlin = {
      transformGroup: 'android',
      buildPath: toGlob(join(root, 'build', 'kotlin/')),
      files: [
        {
          destination: 'FinanceBreakpoints.kt',
          format: 'kotlin/breakpoints-object',
          filter: (token) => token.$type === 'dimension' && token.path[0] === 'breakpoint',
        },
      ],
    };
  }

  return platforms;
}

// ---------------------------------------------------------------------------
// Theme builds
// ---------------------------------------------------------------------------

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
  platforms: buildPlatforms({
    cssFile: 'tokens.css',
    cssSelector: null,
    swiftFile: 'FinanceTokens.swift',
    swiftClass: 'FinanceTokens',
    androidColorsFile: 'colors.xml',
    includeDimens: true,
    includeKotlin: true,
    xamlFile: 'FinanceTokens.xaml',
    xamlBrushFile: 'FinanceTokensBrushes.xaml',
  }),
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
    ...darkOverrides,
  ],
  usesDtcg: true,
  platforms: buildPlatforms({
    cssFile: 'tokens-dark.css',
    cssSelector: '[data-theme="dark"]',
    swiftFile: 'FinanceTokensDark.swift',
    swiftClass: 'FinanceTokensDark',
    androidColorsFile: 'colors-night.xml',
    xamlFile: 'FinanceTokensDark.xaml',
    xamlBrushFile: 'FinanceTokensDarkBrushes.xaml',
  }),
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
    ...darkOverrides,
  ],
  usesDtcg: true,
  platforms: buildPlatforms({
    cssFile: 'tokens-dark-oled.css',
    cssSelector: '[data-theme="dark-oled"]',
    swiftFile: 'FinanceTokensDarkOLED.swift',
    swiftClass: 'FinanceTokensDarkOLED',
    androidColorsFile: 'colors-night-oled.xml',
    xamlFile: 'FinanceTokensDarkOLED.xaml',
    xamlBrushFile: 'FinanceTokensDarkOLEDBrushes.xaml',
  }),
});

/**
 * Build high-contrast theme — primitives + high-contrast semantic + shared semantic + components
 *
 * Maximizes contrast ratios for users with low vision.
 * All text pairings exceed WCAG AAA (7:1) where possible.
 * Works alongside Windows High Contrast, macOS Increase Contrast,
 * and CSS prefers-contrast: more.
 */
const highContrastSd = new StyleDictionary({
  source: [
    primitives,
    toGlob(join(root, 'tokens', 'semantic', 'colors.high-contrast.json')),
    ...semanticShared,
    components,
  ],
  usesDtcg: true,
  platforms: buildPlatforms({
    cssFile: 'tokens-high-contrast.css',
    cssSelector: '[data-theme="high-contrast"]',
    swiftFile: 'FinanceTokensHighContrast.swift',
    swiftClass: 'FinanceTokensHighContrast',
    androidColorsFile: 'colors-high-contrast.xml',
    xamlFile: 'FinanceTokensHighContrast.xaml',
    xamlBrushFile: 'FinanceTokensHighContrastBrushes.xaml',
  }),
});

/**
 * Build dark high-contrast theme — primitives + dark high-contrast semantic +
 * shared semantic + components + dark overrides.
 *
 * Completes the accessibility matrix for users who need both high contrast AND a
 * dark surface (Windows High Contrast dark, macOS Increase Contrast + Dark Mode,
 * prefers-contrast: more + prefers-color-scheme: dark). Near-black base with
 * near-white AAA text pairings and brightened borders (≥3:1 UI contrast). Reuses
 * the dark elevation + dark CVD-safe chart overrides since it is a dark theme.
 */
const highContrastDarkSd = new StyleDictionary({
  source: [
    primitives,
    toGlob(join(root, 'tokens', 'semantic', 'colors.high-contrast-dark.json')),
    ...semanticShared,
    components,
    ...darkOverrides,
  ],
  usesDtcg: true,
  platforms: buildPlatforms({
    cssFile: 'tokens-high-contrast-dark.css',
    cssSelector: '[data-theme="high-contrast-dark"]',
    swiftFile: 'FinanceTokensHighContrastDark.swift',
    swiftClass: 'FinanceTokensHighContrastDark',
    androidColorsFile: 'colors-high-contrast-dark.xml',
    xamlFile: 'FinanceTokensHighContrastDark.xaml',
    xamlBrushFile: 'FinanceTokensHighContrastDarkBrushes.xaml',
  }),
});

// ---------------------------------------------------------------------------
// Build all themes
// ---------------------------------------------------------------------------

try {
  await lightSd.buildAllPlatforms();
  await darkSd.buildAllPlatforms();
  await oledDarkSd.buildAllPlatforms();
  await highContrastSd.buildAllPlatforms();
  await highContrastDarkSd.buildAllPlatforms();
  console.log(
    '✅ Design tokens built successfully (light + dark + dark-oled + high-contrast + high-contrast-dark)!',
  );
} catch (err) {
  console.error('Build failed:', err.message);
  process.exit(1);
}
