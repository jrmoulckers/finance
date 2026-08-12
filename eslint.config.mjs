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

// react-hooks/rules-of-hooks detects a hook called inside `try` only when the
// call is a destructuring declaration. Measured against a fixture matrix, one
// case per file, with `if` as the known-positive control:
//
//   if  / const / return / destructure / bare-call  -> all FIRE
//   try / destructuring declaration                 -> FIRES
//   try / simple const, return-member, bare call    -> silent
//
// The consequence is not a missed edge case, it is a false denominator:
// apps/web/src/pages/HouseholdPage.tsx has five structurally identical
// `useOptional*` try/catch hook wrappers and the upstream rule reports two of
// them. Fixing those two turns the file green over three surviving instances
// of the same defect. The coverage of a rule this repository does not own is
// not something this repository can widen, so the claim is relocated to a rule
// it does own: any `use*` call lexically inside a `try` block is reported here,
// independent of the syntactic form the call happens to take.
const hookInTryRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow React hook calls inside a try block; hook order must not depend on control flow.',
    },
    schema: [],
    messages: {
      hookInTry:
        'React Hook "{{name}}" is called inside a try block, so its execution depends on control flow. Hooks must run unconditionally; use a provider default instead of catching a missing provider.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    const normalized = filename.replace(/\\/g, '/');
    const isTestFile =
      /\.test\.[cm]?[jt]sx?$/.test(normalized) || normalized.includes('/__tests__/');

    function hookName(callee) {
      if (callee?.type === 'Identifier') return callee.name;
      if (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier') {
        return callee.property.name;
      }
      return null;
    }

    return {
      CallExpression(node) {
        if (isTestFile) return;
        const name = hookName(node.callee);
        if (name == null || !/^use[A-Z]/.test(name)) return;

        // Only the `try` block itself is conditional in the sense that matters:
        // a hook in `catch`/`finally` is reported too, since neither runs on
        // every render either. Walking ancestors keeps this independent of how
        // deeply the call is nested inside the block.
        const ancestors = context.sourceCode.getAncestors(node);
        for (let i = ancestors.length - 1; i > 0; i -= 1) {
          if (ancestors[i].type === 'TryStatement') {
            context.report({ node, messageId: 'hookInTry', data: { name } });
            return;
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
          'no-hook-call-in-try': hookInTryRule,
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
  // re-measured across 2,301 linted files (was 2,326) and recorded in
  // docs/guides/engineering-practice-adoption.md and tracked as follow-up work:
  //   set-state-in-effect 98, exhaustive-deps 34, preserve-manual-memoization 21,
  //   refs 15, immutability 2, purity 2, rules-of-hooks 2.
  //
  // Every count above is a tool output, not a population, and rules-of-hooks
  // shows how far those two can diverge: it reports 2, while the number of
  // hooks actually called inside a `try` block in the same tree is 14 across 7
  // files. Read as a deferral budget, "2" understates the work by 7x. The gap
  // is a syntactic blind spot, not a severity choice -- see finance/no-hook-call-in-try
  // above -- so this list is safe to use for sequencing and unsafe to use for sizing.
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
      'finance/no-hook-call-in-try': 'error',
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
