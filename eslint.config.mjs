// SPDX-License-Identifier: BUSL-1.1

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
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
    // `config/engineering/**` is vendored verbatim from jrmoulckers/engineering
    // at a pinned tag and content-hashed in engineering-configs.lock.json. Its
    // style is upstream's to decide, and any local "fix" would be reverted by
    // the next re-vendor and fail `npm run eng:vendor:check` in the meantime.
    // Correctness there is enforced by the lock, not by this config.
    ignores: [
      '**/build/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/.gradle/**',
      '**/vendor/**',
      'config/engineering/**',
      // Playwright writes bundled JS here — the HTML report is a megabyte of
      // minified webpack output and traces carry snapshot scripts. These are in
      // .gitignore (L103-106), but flat config does not read .gitignore, so
      // without these globs a *failed* local run makes the next `eslint .`
      // report thousands of problems in files nobody wrote. CI never sees it:
      // no job runs Playwright and ESLint together, so the gate cannot warn
      // about a condition only a developer's working tree can reach.
      '**/playwright-report/**',
      '**/playwright-report-live/**',
      '**/blob-report/**',
      '**/test-results/**',
    ],
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
  // React Hooks rules (ENG-WEB-004). Scoped to apps/web/src: apps/web/e2e is
  // Playwright, whose `use()` fixture callback is name-matched by
  // react-hooks/rules-of-hooks even though it is not React's `use` hook.
  //
  // Only the rules that are already at zero violations are enabled. The
  // remaining 7 of the plugin's 17 recommended-latest rules are NOT enabled;
  // measured counts across 2,326 linted files are recorded in
  // docs/guides/engineering-practice-adoption.md and tracked as follow-up work:
  //   set-state-in-effect 98, exhaustive-deps 34, preserve-manual-memoization 21,
  //   refs 15, rules-of-hooks 3, immutability 2, purity 2.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/config': 'error',
      'react-hooks/error-boundaries': 'error',
      'react-hooks/gating': 'error',
      'react-hooks/globals': 'error',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/set-state-in-render': 'error',
      'react-hooks/static-components': 'error',
      'react-hooks/unsupported-syntax': 'warn',
      'react-hooks/use-memo': 'error',
      'react-hooks/void-use-memo': 'error',
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
      'scripts/**/*.mjs',
      '.vscode/extensions/**/*.js',
      '*.js',
      '*.cjs',
      '**/*.config.mjs',
      '**/webpack.config.d/**/*.js',
    ],
    languageOptions: {
      globals: {
        // Sourced from the runtime rather than hand-listed: a maintained list drifts
        // silently as Node adds globals, and the drift is invisible to a rule-by-rule
        // config diff because it lives in `languageOptions`. `config` is a genuine
        // local global (Kotlin/JS `webpack.config.d`) with no Node equivalent.
        ...globals.node,
        config: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
