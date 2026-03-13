// SPDX-License-Identifier: BUSL-1.1

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/build/**', '**/dist/**', '**/node_modules/**', '**/.gradle/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs', '**/*.js'],
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tools/**/*.js', '*.js', '*.cjs', '**/*.config.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
