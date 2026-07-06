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

const dateLocaleRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow hardcoded 'en-US' locales in date formatting; dates must follow the user's active locale via getCurrentLocale() or the formatDate helper.",
    },
    schema: [],
    messages: {
      hardcodedDateLocale:
        "Hardcoded 'en-US' date formatting ignores the user's locale. Pass getCurrentLocale() (from lib/i18n) or use the formatDate helper from utils/formatDate.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    const normalized = filename.replace(/\\/g, '/');
    const isTestFile =
      /\.test\.[cm]?[jt]sx?$/.test(normalized) || normalized.includes('/__tests__/');

    function firstArgIsEnUs(node) {
      const first = node.arguments?.[0];
      return first != null && first.type === 'Literal' && first.value === 'en-US';
    }

    return {
      CallExpression(node) {
        if (isTestFile) return;
        const callee = node.callee;
        if (
          callee?.type === 'MemberExpression' &&
          callee.property?.type === 'Identifier' &&
          (callee.property.name === 'toLocaleDateString' ||
            callee.property.name === 'toLocaleTimeString') &&
          firstArgIsEnUs(node)
        ) {
          context.report({ node: node.arguments[0], messageId: 'hardcodedDateLocale' });
        }
      },
      NewExpression(node) {
        if (isTestFile) return;
        const callee = node.callee;
        if (
          callee?.type === 'MemberExpression' &&
          callee.object?.type === 'Identifier' &&
          callee.object.name === 'Intl' &&
          callee.property?.type === 'Identifier' &&
          callee.property.name === 'DateTimeFormat' &&
          firstArgIsEnUs(node)
        ) {
          context.report({ node: node.arguments[0], messageId: 'hardcodedDateLocale' });
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
          'no-hardcoded-date-locale': dateLocaleRule,
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
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'finance/no-hardcoded-date-locale': 'error',
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
