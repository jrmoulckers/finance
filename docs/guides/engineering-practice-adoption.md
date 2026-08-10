# Adopting `jrmoulckers/engineering`

Status of finance's adoption of the centralized engineering practice repository. Tracking
issue: [#4029](https://github.com/jrmoulckers/finance/issues/4029).

Upstream: [`docs/adopting.md`](https://github.com/jrmoulckers/engineering/blob/main/docs/adopting.md).

## Layers

| Layer                                                                                                         | What it gives finance                            | Status                  |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------- |
| [Principles](https://github.com/jrmoulckers/engineering/tree/main/principles) — 66 `ENG-*` rules              | Cited by ID; resolve via `principles/index.json` | **Adopted**             |
| [Practices](https://github.com/jrmoulckers/engineering/tree/main/practices)                                   | Linked by URL from finance docs                  | **Adopted**             |
| [Packages](https://github.com/jrmoulckers/engineering/tree/main/packages) — shared ESLint/Prettier/TS presets | Executable enforcement                           | **Blocked** — see below |

## Done

- **Citations replace restated rules.** ADR-0002/0018/0022 cite `ENG-LOCAL-*`/`ENG-DATA-*`;
  ADR-0020 cites `ENG-OBS-001`–`007`; ADR-0023 cites `ENG-INT-003`/`ENG-SEC-007`;
  `security-architecture.md` cites `ENG-SEC-*`; `security-checklist.md` cites `ENG-SEC-006`;
  `performance-budget-architecture.md` and `guides/performance.md` cite `ENG-PERF-*` and
  `ENG-WEB-003`. `AGENTS.md` names the engineering repo as the authority and states the
  no-copy rule from ADR-0003.
- **ADR numbering reconciled.** See [`docs/architecture/README.md`](../architecture/README.md).
- **Workflow reuse assessed.** See
  [`docs/ops/workflow-reuse-assessment.md`](../ops/workflow-reuse-assessment.md). Action
  pinning already satisfies `GH-ACT-003` — 241/241 refs SHA-pinned.
- **`.npmrc` committed**, mapping the `@jrmoulckers` scope to GitHub Packages. It is inert
  until the scope is actually depended on; `npm ci` and `npm install` work normally with
  `NODE_AUTH_TOKEN` unset (verified).

## Blocked: the shared toolchain presets

`@jrmoulckers/eslint-config`, `@jrmoulckers/prettier-config`, and `@jrmoulckers/tsconfig` are
published to **GitHub Packages, which requires authentication even to read**. The token
available to CI and to this repository's agents does not carry the `read:packages` scope:

```text
npm error code E403
npm error 403 Forbidden - GET https://npm.pkg.github.com/@jrmoulckers%2feslint-config
npm error Permission permission_denied: The token provided does not match expected scopes.
```

Granting a token is a human-gated operation. **The presets were deliberately not adopted
blind** — a lint config that cannot be executed locally would be verified for the first time
by CI on `main`.

### To unblock

1. Grant this repository read access to the packages from the `jrmoulckers/engineering`
   package settings, **or** create a classic PAT with `read:packages` and store it as the
   `PACKAGES_READ_TOKEN` repository secret.
2. Developers export the same token locally: `$env:NODE_AUTH_TOKEN = "ghp_..."`.
3. Add registry auth to every workflow that runs `npm ci`:

   ```yaml
   - uses: actions/setup-node@<sha>
     with:
       node-version: 22
       registry-url: https://npm.pkg.github.com
       scope: '@jrmoulckers'
   - run: npm ci
     env:
       NODE_AUTH_TOKEN: ${{ secrets.PACKAGES_READ_TOKEN }}
   ```

### Then, for ESLint

Install the preset and reduce `eslint.config.mjs` to `base({ ignores, rules, extend })`.
Baseline for comparison: **the current config reports 0 problems across the repo**, so every
new finding is attributable to the preset.

What the shared `base()` adds: `eqeqeq` (`null: 'ignore'`), `eslint-config-prettier`,
`@typescript-eslint/no-unused-vars` at `error` instead of `warn`, and `no-console` with
`allow: ['warn', 'error']`. Roughly **58 loose-equality sites across 36 files** exist today —
many are `== null`, which the rule's option permits, so the real count needs a run.

What must stay local, via `extend` / `ignores` / `rules`:

- The `finance/no-money-template-interpolation` and `finance/no-hardcoded-date-locale` plugin
  rules and their four path-scoped blocks.
- The `**/.gradle/**` ignore — KMP-specific, absent from the shared ignore set.
- `@typescript-eslint/no-require-imports: off` plus the CommonJS globals for `tools/`,
  `scripts/`, `.vscode/extensions/`, and `**/webpack.config.d/**`.
- `no-console: off` for `services/**` and `tools/**`, which the preset's `toolingFiles` glob
  does not cover.

### Then, for Prettier

`.prettierrc.json` is byte-equivalent to the shared config on all seven keys. The only
difference is the shared markdown override (`proseWrap: 'always'`, `printWidth: 96`), which
reflows **590 markdown files**. Land that as an isolated mechanical commit. The 73-line
`.prettierignore` is finance-specific and stays.

## Deliberately deferred

**`@jrmoulckers/tsconfig`.** `apps/web/tsconfig.json` is the repository's only tsconfig, and
the shared base adds `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noUnusedLocals`,
`noUnusedParameters`, `moduleDetection: force`, `noImplicitOverride`, and
`noFallthroughCasesInSwitch`; `vite-app.json` adds `checkJs`. Against **2,301 `.ts`/`.tsx`
files** that is a multi-thousand-diagnostic migration, not a config swap. It needs its own
issue.

## Gaps to close upstream, in `jrmoulckers/engineering`

These are engineering-repo changes. Working around them locally would create exactly the
duplication this adoption removes.

1. **No React ESLint preset.** The package ships `./base`, `./svelte`, and `./next`. finance's
   web app is **React 19 + Vite, 2,301 `.ts`/`.tsx` files** — none of the three fit. `base()`
   carries no `eslint-plugin-react-hooks` (rules-of-hooks, exhaustive-deps) and no `jsx-a11y`,
   both of which this app needs and on which its WCAG 2.2 AA obligations depend. Requesting
   `@jrmoulckers/eslint-config/react`.
2. **`tsconfig/vite-app.json` has no `jsx` setting** and sets `types: ['vite/client']` only. A
   React consumer needs `"jsx": "react-jsx"`. Requesting a `vite-react.json` variant.
3. **`practices/performance-budgets.md` covers no native or JVM profiling.** Its sections are
   delivery/runtime budgets and Lighthouse — yet `ENG-PERF-007` requires _platform-native_
   profiling. finance already documents Android Profiler + baseline profiles, Instruments +
   MetricKit + signposts, JFR + VisualVM + WPA, and a Gradle benchmark harness. That technique
   is general and belongs upstream.

## Worth hoisting up

Finance-invented, generic, and absent from the shared layers:

- **The skip-with-success required-check pattern** — a path-filtered required check never
  reports status, leaving PRs permanently `BLOCKED`; gate inside the workflow instead. Generic
  Actions knowledge, so it belongs in `jrmoulckers/.github`.
- **The sensitive-data-logging grep guardrail** in `ci-lint.yml` — an executable check for
  `ENG-OBS-005`, which the practices layer currently states only as an obligation.
