// SPDX-License-Identifier: BUSL-1.1

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const moneyTemplateRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow raw monetary template interpolation outside the privacy formatter.',
    },
    schema: [],
    messages: {
      rawMoney:
        'Monetary values must be formatted via lib/ui/privacy/formatAmount or formatRange before interpolation.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    const normalized = filename.replaceAll('\\\\', '/');
    const isFormatterFile =
      normalized.includes('/lib/ui/privacy/') || normalized.endsWith('/lib/currency.ts');
    const isTestFile =
      /(?:\\.|\/)test\.[cm]?[jt]sx?$/.test(normalized) || normalized.includes('/__tests__/');

    function expressionText(node) {
      return context.sourceCode.getText(node);
    }

    return {
      TemplateLiteral(node) {
        if (isFormatterFile || isTestFile) return;
        for (const expression of node.expressions) {
          const text = expressionText(expression);
          if (/format(?:Amount|Range|Currency|ChartCurrency)|CurrencyDisplay/.test(text)) continue;
          if (/(amount|balance|cents|netWorth|budgetSpent|monthlyBudget)/i.test(text)) {
            context.report({ node: expression, messageId: 'rawMoney' });
          }
        }
      },
    };
  },
};

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/build/**', '**/dist/**', '**/node_modules/**', '**/.gradle/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs', '**/*.js'],
    plugins: {
      finance: {
        rules: {
          'no-money-template-interpolation': moneyTemplateRule,
        },
      },
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: [
      'apps/web/src/components/charts/**/*.{ts,tsx}',
      'apps/web/src/components/common/CurrencyDisplay.tsx',
      'apps/web/src/pages/DashboardPage.tsx',
      'apps/web/src/lib/ui/privacy/**/*.{ts,tsx}',
    ],
    rules: {
      'finance/no-money-template-interpolation': 'error',
    },
  },
  {
    files: [
      'services/**/*.ts',
      'tools/**/*.js',
      'tools/**/*.mjs',
      'tools/**/*.ts',
      'scripts/**/*.js',
      '**/*.config.mjs',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: [
      'tools/**/*.js',
      'tools/**/*.mjs',
      'scripts/**/*.js',
      '.vscode/extensions/**/*.js',
      '*.js',
      '*.cjs',
      '**/*.config.mjs',
      '**/webpack.config.d/**/*.js',
    ],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
        config: 'readonly',
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
