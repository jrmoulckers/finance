import StyleDictionary from 'style-dictionary';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

const toGlob = (p) => p.replace(/\\/g, '/');

const primitives = toGlob(join(root, 'tokens', 'primitive', '*.json'));
const components = toGlob(join(root, 'tokens', 'component', '*.json'));

/** Shared non-color semantic tokens (typography, elevation) */
const semanticShared = [
  toGlob(join(root, 'tokens', 'semantic', 'typography.json')),
  toGlob(join(root, 'tokens', 'semantic', 'elevation.json')),
];

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

try {
  await lightSd.buildAllPlatforms();
  await darkSd.buildAllPlatforms();
  console.log('✅ Design tokens built successfully (light + dark)!');
} catch (err) {
  console.error('Build failed:', err.message);
  process.exit(1);
}
