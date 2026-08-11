# Adopting `jrmoulckers/engineering`

Status of finance's adoption of the centralized engineering practice repository. Tracking
issue: [#4029](https://github.com/jrmoulckers/finance/issues/4029).

Upstream: [`docs/adopting.md`](https://github.com/jrmoulckers/engineering/blob/main/docs/adopting.md).

## Layers

| Layer                                                                                                         | What it gives finance                            | Status                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| [Principles](https://github.com/jrmoulckers/engineering/tree/main/principles) — 66 `ENG-*` rules              | Cited by ID; resolve via `principles/index.json` | **Adopted**                                                                |
| [Practices](https://github.com/jrmoulckers/engineering/tree/main/practices)                                   | Linked by URL from finance docs                  | **Adopted**                                                                |
| [Packages](https://github.com/jrmoulckers/engineering/tree/main/packages) — shared ESLint/Prettier/TS presets | Executable enforcement                           | **Split** — Prettier adopted (vendored); ESLint blocked; tsconfig deferred |

## Done

- **Citations replace restated rules.** ADR-0002/0018/0022 cite `ENG-LOCAL-*`/`ENG-DATA-*`;
  ADR-0020 cites `ENG-OBS-001`–`007`; ADR-0023 cites `ENG-INT-003`/`ENG-SEC-007`;
  `security-architecture.md` cites `ENG-SEC-*`; `security-checklist.md` cites `ENG-SEC-006`;
  `performance-budget-architecture.md` and `guides/performance.md` cite `ENG-PERF-*` and
  `ENG-WEB-003`. `AGENTS.md` names the engineering repo as the authority and states the
  no-copy rule from ADR-0003.

  **Known gap in this pass: the diff was net-additive.** Citations were added, but the prose
  they cite was largely not deleted — each file was judged to carry local context (thresholds,
  platform specifics) beyond the ratified rule. That is defensible file by file and
  unsatisfying in aggregate, since removing duplication was the point. A second pass with a
  harder deletion bias is warranted once `practices/` has stabilised.

- **Every citation verified against `principles/index.json`.** All **28 distinct `ENG-*` IDs**
  cited across finance resolve to a real Ratified principle, and every parenthetical gloss
  matches the canonical `title` exactly. A wrong ID is worse than the restated prose it
  replaced, because it reads as authoritative while pointing at nothing — so the index, not
  memory, is the source. Re-run the check whenever citations are added:

  ```powershell
  $idx = Get-Content <engineering>\principles\index.json -Raw | ConvertFrom-Json
  # compare each cited ID against ($idx.principles).id
  ```

- **ADR numbering reconciled.** See [`docs/architecture/README.md`](../architecture/README.md).
- **Workflow reuse assessed.** See
  [`docs/ops/workflow-reuse-assessment.md`](../ops/workflow-reuse-assessment.md). Action
  pinning already satisfies `GH-ACT-003` — 241/241 refs SHA-pinned.
- **`.npmrc` committed**, containing the `@jrmoulckers` scope-routing line and nothing else. It
  is inert until the scope is actually depended on; `npm ci` and `npm install` work normally
  with no token configured (verified).

  It deliberately carries **no `_authToken` line**. Interpolating `${NODE_AUTH_TOKEN}` into a
  tracked file puts a credential-shaped string in version control, and when the variable is
  unset npm sends an _empty_ token rather than none — the registry then answers `401
unauthenticated: User cannot be authenticated with the token provided`, which points at a bad
  token when the real problem is a missing one. Credentials belong in the developer's
  user-level `~/.npmrc`, and in CI in the file `actions/setup-node` generates from
  `registry-url` + `scope`.

  It also routes **by scope only**. Replacing the default registry wholesale would break
  `npm audit` with `ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS`, and no token fixes that. The routing
  rules and the measured audit egress are recorded in
  [`docs/security/supply-chain.md`](../security/supply-chain.md).

## Adopted: the shared Prettier config, vendored

As of engineering `v0.15.1` the delivery model split (upstream ADR-0001):
`@jrmoulckers/prettier-config` and `@jrmoulckers/tsconfig` are **vendored at a ref** rather than
installed, so they need no registry, no token, and no `read:packages` grant.
`@jrmoulckers/eslint-config` stays on the registry because it owns four runtime dependencies that
consumers must not re-choose. **finance has adopted the Prettier half.**

```powershell
node scripts/vendor-configs.mjs v0.15.1 --set prettier --dest config/engineering
```

Committed: `scripts/vendor-configs.mjs`, `config/engineering/prettier/{index.js,svelte.js}`, and
`engineering-configs.lock.json` (ref + SHA-256 per file, so a refresh is a reviewable diff and
drift shows against the hash). Wiring is a `prettier` field in `package.json` pointing at the
vendored file; `.prettierrc.json` was **removed**, since a dedicated rc file outranks the
`package.json` field and would have silently kept the old config in force while appearing adopted.

**`@jrmoulckers/tsconfig` was deliberately not vendored.** Its adoption is deferred on evidence
(2,691 diagnostics — see _Deliberately deferred_). Vendoring a config nothing extends would put
an unreferenced copy of someone else's authority in the tree, where it rots silently and fails no
gate. Vendor it in the same change that adopts it, not before.

### Measured cost: 5 files, 48 lines — and it is not zero

This guide previously predicted a **0-file** reflow, on the basis that `.prettierrc.json` is
byte-equivalent to the shared config across all seven scalar keys. That prediction was **wrong**,
and the reason is worth recording: the shared config carries an **eighth** thing the key-by-key
comparison never looked at — an `overrides` block setting `printWidth: 96` for `*.md`. finance
had no markdown override at all, so markdown moved 100 → 96.

Measured on the full tree, not estimated:

| Effect                | Files | Lines |
| --------------------- | ----: | ----: |
| Fenced code in `*.md` |     5 |    48 |
| Markdown tables       |     0 |     0 |
| Prose reflow          |     0 |     0 |

Isolated by re-running the same five files with `--print-width 100`: all clean, so the delta is
entirely the override and nothing else in the shared config touches finance. `proseWrap:
'preserve'` — which finance's own 592-file measurement argued for and which upstream adopted —
holds exactly as advertised: **no prose line moved.** Every changed line is a TypeScript snippet
inside a fenced block being re-wrapped at the narrower width.

The general lesson is the one this guide keeps re-learning: **a key-by-key config diff scores
structural additions as zero.** `overrides`, `ignores`, and file-selection globs are invisible to
it. Compare resolved output for a representative file of each type — `prettier.resolveConfig()`
answers this directly — not the literal config objects.

### Gap 12 — the vendor script drops `"type": "module"`

`packages/prettier-config/package.json` upstream declares `"type": "module"`, and the vendored
files are ESM (`export default`). The script vendors **only** the source files, so the module-type
declaration is lost. In a consumer whose root `package.json` has no `type` field — finance's does
not — the vendored `.js` is nominally CommonJS.

It works here, but only because Node ≥22.7 retries a failed CJS parse as ESM. It says so:

```
[MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of …/config/engineering/prettier/index.js is
not specified and it doesn't parse as CommonJS. Reparsing as ES module …
```

On older Node, or in any tool that resolves the file without that fallback, this is a hard
`SyntaxError: Unexpected token 'export'` — and the failure surfaces at the tool, far from the
vendoring step that caused it. finance works around it with a two-line
`config/engineering/prettier/package.json` containing `{ "type": "module" }`. That file is **not**
in the lockfile and is not hash-checked, which is the wrong place for it: the module type is a
property of the upstream package, so the fix belongs upstream. **Recommendation: have
`vendor-configs.mjs` emit the `type` marker for any ESM set** rather than leaving each of seven
consumers to discover it.

### `.impeccable/` added to `.prettierignore`

`prettier --check .` scans the whole tree, and the bundled impeccable skill writes
`.impeccable/hook.cache.json`. That directory is excluded only in machine-local
`.git/info/exclude`, so git ignores it but Prettier does not — a permanent local-only red on
`format:check` that CI never reproduces. One ignore line removes the false signal.

The studio-synced ignore block upstream recommends alongside this was **already present**, and in
a stricter form: finance enumerates each managed file individually with a `!` re-include for
finance-owned `finance-domain.agent.md`, rather than ignoring `.github/{agents,instructions,
prompts,skills}` wholesale. The glob form would silently stop formatting finance's own overlays.

### Verified

`npm run format:check` (`npx prettier --check .`, whole tree) — **exit 0, all matched files use
Prettier code style**, with the vendored config resolving and `.prettierrc.json` deleted.

### The one thing this change broke, and what it exposes

Adding `scripts/vendor-configs.mjs` failed `npx eslint . --max-warnings 0` with **8 `no-undef`
errors** — `fetch` once, `process` seven times. Not a preset problem; finance's own config. Two
separate defects in the hand-rolled tooling block, both of which the change merely happened to be
the first file to touch:

1. **The glob is asymmetric.** It lists `tools/**/*.js`, `tools/**/*.mjs`, and `scripts/**/*.js` —
   but not `scripts/**/*.mjs`. An ESM script under `scripts/` got no Node globals at all. The
   omission was invisible because until now no such file existed.
2. **The globals are a hand-maintained list, so they drift from the runtime.** `fetch` has been a
   Node global since 18 and is absent, as are `URL`, `TextEncoder`, `structuredClone` and the rest
   of the modern surface. Each will fail the same way, one at a time, on first use.

Fixed narrowly here (add the glob, add `fetch`), but the durable fix is the shared preset:
`toolingFiles` applies `globals.node` wholesale, so both defects are unrepresentable. **This is a
concrete point in favour of adopting `@jrmoulckers/eslint-config` that the rule-by-rule diff does
not score** — the diff compares rules, and this is a `languageOptions` difference.

It also inverts upstream's warning that "the presets lint more files than your old config did,
typically `scripts/**/*.mjs`". Here finance's config already **selects** that path (via the
top-level `**/*.mjs` selection) but **configures** it wrongly. Selection and configuration are two
different comparisons and both need making.

The process failure is worth naming too: `npm run format:check` was run and `npx eslint .` was
not, on the reasoning that a Prettier-config change cannot affect ESLint. True of the config —
false of the commit, which also added a source file. **Run the whole gate, not the part that
seems relevant.**

## Blocked: the shared toolchain presets

Two blockers were identified. **One is now resolved**; the remaining one is access.

### Blocker 1 — package access

The three packages are **private**, and finance's token also lacks `read:packages`. Both are
true, and it matters which one is quoted, because **neither registry error can tell them apart**:

| Probe                               | Result                                                  | Distinguishes visibility? |
| ----------------------------------- | ------------------------------------------------------- | ------------------------- |
| `GET` registry, anonymous           | `401 authentication token not provided`                 | no — same when public     |
| `GET` registry, token without scope | `403 permission_denied: does not match expected scopes` | no — scope checked first  |
| Repo packages tab, anonymous        | HTTP 200 rendering the **empty state**                  | **yes**                   |

Both registry responses were reproduced against `@jrmoulckers/eslint-config`. The 403 this guide
previously quoted as the blocker is a **scope** answer returned before visibility is ever
evaluated, so it was never evidence about visibility.

`jrmoulckers/engineering` is a _public repository_; publishing from one does not make the package
public, and the repo page gives no hint.

**On the visibility probe itself.** Two better forms have since been found, and the originally
recommended one should not be used. `curl -s .../packages | grep -c eslint-config`, with a count of
`0` meaning private, is an **absence test**: it returns `0` just as readily for a 404, a redirect,
or a login wall, so on its own it cannot distinguish "no packages" from "the probe did not run".

The decisive probe asks the API for the field directly, and needs a token carrying
`read:packages`:

```console
$ gh api users/jrmoulckers/packages/npm/eslint-config \
    --jq '{name,visibility,repo:.repository.full_name,version_count}'
{"name":"eslint-config","repo":"jrmoulckers/engineering","version_count":7,"visibility":"private"}
```

All three return `visibility: private` (`eslint-config` 7 versions, `tsconfig` 3,
`prettier-config` 2). This reports the property being asked about rather than inferring it from an
absence, and it has a working positive control — a public package returns `"public"` through the
same call. Where no such token is available, assert the positive marker instead of a zero count:

```bash
curl -s -o pkgs.html -w '%{http_code}\n' https://github.com/jrmoulckers/engineering/packages
grep -q 'Get started with GitHub Packages' pkgs.html && echo 'no packages visible'
```

**Correction: a token on this machine does carry `read:packages`.** This guide previously recorded
that no available token had the scope. That was wrong, and the cause is worth recording because it
is silent: `gh` holds two accounts here, and an environment-supplied `GH_TOKEN` **masks** the
keyring one that carries the scope. `gh auth status` shows both, and the active account is the
masked-in one:

```console
$ gh auth status
  ✓ Logged in to github.com account jrmoulckers (GH_TOKEN)   # active
  - Token scopes: 'gist', 'project', 'read:org', 'repo', 'user', 'workflow'
  ✓ Logged in to github.com account jrmoulckers (keyring)
  - Token scopes: 'admin:public_key', 'gist', 'read:org', 'read:packages', 'repo'
```

Clearing `GH_TOKEN` in the shell selects the keyring account. The failure mode is that an
environment token silently outranks a better-scoped stored one, and every probe then reports a
scope error that looks like an account-wide limitation.

**What this unblocks, and what it does not.** With that token the registry is readable, so the
presets can now be **validated locally against the real published artifacts** — see
"Measured against the real artifact" below, which supersedes the earlier from-source trial. It does
**not** unblock adoption: CI authenticates as `GITHUB_TOKEN`, which cannot read a private package
without a grant, so committing the dependency would still fail on `main`.

Granting access is human-gated and **owner-only**: either flip the three packages public, or
grant this repository Read under each package's _Manage Actions access_. There is no API path for
either action.

### Blocker 2 — the ESLint peer range excluded finance (**resolved upstream in 0.4.0**)

`@jrmoulckers/eslint-config@0.3.0` declared `eslint: ^9.0.0` as a peer. Finance runs
**`eslint@10.6.0`**, so `npm install` produced an `ERESOLVE` conflict on **every** subpath —
including `./base`, which has nothing to do with React. No version floor fixed this, because the
constraint was in the peer range rather than the caret. **`0.4.0` widens it to
`^9.0.0 || ^10.0.0`**, verified in the published manifest.

Resolved against the installed tree rather than read off the manifest:

| Peer                        | Range (0.4.0)         | Finance has | Satisfied |
| --------------------------- | --------------------- | ----------- | --------- |
| `eslint`                    | `^9.0.0 \|\| ^10.0.0` | 10.6.0      | yes       |
| `typescript`                | `>=5.5.0 <6.1.0`      | 6.0.3       | yes       |
| `eslint-plugin-react`       | `^7.37.0`             | 7.37.5      | yes       |
| `eslint-plugin-react-hooks` | `^5 \|\| ^6 \|\| ^7`  | 7.1.1       | yes       |
| `eslint-plugin-jsx-a11y`    | `^6.10.0`             | 6.10.2      | yes       |

#### Correction: `eslint-plugin-react` was never broken

This guide previously recorded that `eslint-plugin-react@7.37.5` was incompatible with ESLint 10,
on the evidence of a `contextOrFilename.getFilename is not a function` thrown from `resolveBasedir`.
**That diagnosis was wrong**, and the error was reproducible enough to be convincing, which is why
it is worth recording rather than quietly deleting.

Narrowing it to a single variable — the `settings.react.version` value, against finance's own
`eslint@10.6.0`, `eslint-plugin-react@7.37.5`, `react@19.2.7`:

| `settings.react.version` | Result                                            |
| ------------------------ | ------------------------------------------------- |
| unset                    | works; warns; `react/jsx-key` fires               |
| `'19.0.0'` (pinned)      | works; `react/jsx-key` fires                      |
| `'detect'`               | **TypeError**; every `react/*` rule fails to load |

Only auto-detection is broken: `detectReactVersion()` calls `context.getFilename()`, which ESLint
10 removed. The plugin is fine; a config asking it to auto-detect is not. The upstream fix resolves
React's version at config-construction time so the detection path is never entered.

**Where the `'detect'` setting came from — checked, because the attribution has since drifted.**
Upstream later re-described this as a fault in the consuming repository's own config, with the
remedy "delete your `settings.react.version = 'detect'` line." That does not fit finance, and the
package history says otherwise. Both are verifiable from the published tarballs:

| Version | `react.js`                                                 |
| ------- | ---------------------------------------------------------- |
| `0.3.0` | line 141: `settings: { react: { version: 'detect' } }`     |
| `0.4.0` | `detectReactVersion()`, emitting a concrete version string |
| `0.8.0` | same as `0.4.0`                                            |

The `'detect'` opt-in was **in the preset**, at the line upstream itself first identified, and was
fixed in `0.4.0`. Finance never had a line to delete: `eslint.config.mjs` contains **no `settings`
block and no reference to React at all** — `git grep` for `settings.*react` across every `.mjs`,
`.js`, `.cjs`, and `.json` in the repository returns nothing. The failure was observed here only
because the preset was being run from source at `0.3.0`.

This is recorded because the remedy is being circulated to six other repositories. A repo that
follows it will search for a line it does not have, find nothing, and be left without either the
cause or the fix — while the actual fix, upgrading past `0.4.0`, goes unstated.

Verified against `0.4.0`'s actual `react.js` on finance's ESLint 10.6.0:

- `react/jsx-key` fires on a missing key
- resolved setting is `{"version":"19.2.7"}` — finance's real React, not a guess
- **18 enforcing `react/*` rules**, plus 2 `react-hooks/*` and 31 `jsx-a11y/*`

On the rule count: 38 `react/*` keys are present in the resolved config, but 20 are set to `off` —
17 formatting rules disabled by `eslint-config-prettier`, plus the deliberate `react/prop-types`,
`react/react-in-jsx-scope`, `react/jsx-uses-react`, and `react/no-unsafe`. Keys present and rules
enforcing are different numbers, and the second is the one that catches bugs.

**The lesson generalizes and is the reason this section stays.** A reproducible stack trace names
the frame that threw, not the caller that caused it. The blast radius here — every rule in the
plugin failing to load — made a config-level cause look like a package-level one, and the
remedy that follows from the wrong diagnosis (drop the plugin) would have cost 18 working rules
including `jsx-key`. Bisecting the config would have cost one more probe than accepting the trace.

### To unblock

**Scope note: this section now applies to `@jrmoulckers/eslint-config` alone.** Since `v0.15.1`,
`prettier-config` and `tsconfig` are vendored at a ref and need none of the steps below. Prettier
is adopted; tsconfig is deferred on its own evidence, not on access.

1. Grant this repository read access to the packages from the `jrmoulckers/engineering`
   package settings, **or** create a classic PAT with `read:packages` and store it as the
   `PACKAGES_READ_TOKEN` repository secret. GitHub Packages accepts **classic PATs only** — a
   fine-grained token fails with the same `401` as no token at all, so this is worth getting
   right before debugging.
2. Developers put the token in their **user-level `~/.npmrc`**, never in the repository's:

   ```text
   //npm.pkg.github.com/:_authToken=<classic-pat-with-read-packages>
   ```

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

   This applies to finance's own workflows, which install dependencies themselves. The
   **reusable** workflows in `jrmoulckers/.github` that run `npm ci` / `pnpm install` currently
   set no `registry-url`, no `scope`, and no `NODE_AUTH_TOKEN`, and expose no input or secret to
   supply one — so a caller cannot fix this from its own side. That is being addressed upstream.

   Ordering consequence: **do not migrate a dependency-installing workflow onto a backbone
   reusable until both that fix and the token have landed.** It does not affect the workflows
   finance runs today, but it gates the `deploy-pages.yml` migration, which would otherwise
   start failing the moment `@jrmoulckers/*` enters the manifest.

   The upstream fix has since landed, at
   `f1457271427fcde18a62b07c53a1ea75e14cd644`. Migration remains gated on package access, and on a
   second, unrelated hazard that the pin itself introduces: a caller's `permissions:` block
   replaces the default rather than extending it, so a caller that grants less than its callee
   declares dies as an unreadable `startup_failure`. Finance's repository default is restricted and
   grants exactly `{contents, metadata, packages}: read` — measured, not assumed. That covers six
   of the eight callees but **not** `reusable-ci-lint` (`pull-requests: read`) or
   `reusable-deploy-pages` (`id-token: write`), the latter being precisely the migration
   recommended first. See
   [`docs/ops/workflow-reuse-assessment.md`](../ops/workflow-reuse-assessment.md).

4. Depend on the current floors: **`@jrmoulckers/eslint-config@^0.8.0`**,
   **`@jrmoulckers/tsconfig@^0.3.0`**, **`@jrmoulckers/prettier-config@^0.2.0`**. The React
   preset and `vite-react.json` first shipped in `0.2.0`, as did `prettier-config`'s reversal to
   `proseWrap: 'preserve'`; `eslint-config@0.4.0` is the first release installable on ESLint 10
   (see Blocker 2), and `0.6.0` the first in which the React preset can reach type-aware rules at
   all. `0.7.0` and `0.8.0` are both no-ops for finance — see below — but are taken as the floor
   anyway, because there is no cost to either and a stale floor is a liability the moment a later
   fix lands. On a
   `0.x` package a caret permits patch updates only, so `^0.1.0` resolves
   to `>=0.1.0 <0.2.0` and can never reach any of them.

   Worth stating as a method rather than a version bump: verify against the **resolved range**,
   not the working tree. Validating a preset through a `file:` link while committing a caret
   range that cannot reach it means the artifact tested and the artifact installed are different
   code. The same discipline surfaced Blocker 2 — a floor bump alone would have looked like
   progress while the peer range still excluded finance. Ranges recur at every boundary; resolve
   them, do not read them.

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

### Measured against the real artifact (0.6.0)

Everything above was originally estimated by resolving the preset **from source**. With registry
read access the published tarballs can be executed directly, so these numbers supersede the
earlier from-source trial. Preset installed into a throwaway sandbox inside the repo; peers
resolved upward to finance's own `eslint@10.6.0`, `react@19.2.7`, `typescript@6.0.3`.

> **These counts are pinned to a tree, and will be re-measured at adoption.** They were taken
> against `main` as it stood when the sandbox ran. A green gate proves a config works on the tree
> it ran against, not the tree it merges into — `main` here moves fast enough that a branch can
> quietly diverge from the measured state. So `317` is a planning figure with a known expiry, not
> a commitment; the adopting change re-runs it rather than citing this row.

The real `@jrmoulckers/eslint-config@0.6.0` `./react` entry point **loads and runs on ESLint 10**,
resolving `settings.react.version` to the actual installed `19.2.7`.

| Configuration                                   | Files | Errors | Warnings | Total     |
| ----------------------------------------------- | ----- | ------ | -------- | --------- |
| `reactConfig()`, defaults, no overrides         | 2,510 | 355    | 706      | **1,061** |
| plus finance's existing exemptions              | 2,510 | 245    | 72       | **317**   |
| `strictTypeChecked: true` (`apps/web/src` only) | 2,301 | 2,046  | 47       | **2,093** |

**317 is the real adoption cost**, and the 744-finding gap between the first two rows is precisely
the set of overrides listed above. It is dominated by two rules, both explained by the preset's
`toolingFiles` glob covering `**/scripts/**` and `**/*.config.*` but **not `tools/**` or
`services/**`**: `no-console` (659 warnings in 41 files) and `@typescript-eslint/no-require-imports`
(84 errors in 36 files). Porting the two exemption blocks into `extend` removes both entirely,
which confirms the mapping rather than merely asserting it.

The residual 317 is mostly pre-existing accessibility debt the current config never checked:
`jsx-a11y/no-redundant-roles` 171 (50 files) still dominates, as it did in the from-source trial.
Also surfaced: **13 now-redundant `eslint-disable` directives across 8 files**, all suppressing
`no-console` for `console.warn`/`console.error` calls that the shared preset's
`allow: ['warn','error']` already permits. They are reported as unused-directive warnings, so
adoption must delete them in the same commit.

**The from-source reconstruction under-counted: 266 estimated versus 317 measured, 19% low.** Close
enough to have supported the decision, wrong enough not to be quoted as a result. Reconstructing a
dependency from its source is a reasonable stand-in for a blocked artifact, not a substitute for it.

#### `strictTypeChecked` is not viable for finance

`0.6.0` adds `base({ strictTypeChecked: true })`, opting into `recommendedTypeChecked` +
`stylisticTypeChecked`. Upstream measured one consumer at **13** mechanical violations. Finance,
scoped to `apps/web/src` alone — the only directory covered by a `tsconfig.json` — measures
**2,093 across 45 distinct rules**, led by `no-unsafe-assignment` 311, `no-unnecessary-type-assertion`
187, `no-unsafe-call` 143, `array-type` 135. That is the same order as the deferred
`@jrmoulckers/tsconfig` trial (2,691) and for the same underlying reason, so it is deferred with it.

**But one rule in that set is worth having on its own.** `no-floating-promises` finds **54 sites in
32 files** — a swallowed rejection is a real defect class, not a style preference — and
`no-misused-promises` a further 81 in 52. Both can be enabled without the other ~1,900 findings,
because `typeAware: true` supplies type information while leaving the rule set at `recommended`,
and a caller's `rules` override outranks the preset's own `no-floating-promises: 'off'`:

```js
reactConfig({
  typeAware: true,
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
  },
});
```

Verified: **449 total on `apps/web/src`**, versus 2,093 for the full opt-in — the two promise rules
plus the same baseline findings, and nothing else. This is the recommended second step, after the
default adoption lands.

Cost note: type-aware runs are far slower. Full-repo default run **163 s**; `strictTypeChecked` on
`apps/web/src` alone **262 s**.

### 0.8.0 is types-only, and the file-set warning measures zero here

`0.8.0` adds type declarations for every entrypoint (`base.d.ts`, `svelte.d.ts`, `react.d.ts`,
`next.d.ts`, shared `types.d.ts`) wired through `exports`. Confirmed it changes no behaviour:
**all six JavaScript files — `base.js`, `ignores.js`, `react.js`, `svelte.js`, `next.js`,
`hooks.js` — are byte-identical to `0.7.0`**, and `dependencies` and `peerDependencies` are
unchanged. The 317-finding measurement stands for a third release running.

The declarations themselves are **inert at finance today**: no `tsconfig.json` in the repository
sets `checkJs` or `allowJs`, and `eslint.config.mjs` is not in any tsconfig `include`. So the
option checking `0.8.0` enables is a benefit finance would have to opt into, not one the floor
bump delivers. Taking `^0.8.0` still costs nothing — it is the same code — but the release note's
headline feature should not be recorded here as a gain that was actually received.

Upstream also warns that **the presets lint more files than a local config did**, that a
rule-by-rule diff scores this as zero, and that the file _set_ must be compared too. The warning
is correct in general and worth stating; it measures **zero for finance**, and it is worth
recording why rather than just that.

The two configs cover different extensions on paper:

|                     | Extensions covered                                    |
| ------------------- | ----------------------------------------------------- |
| `eslint.config.mjs` | `.ts` `.tsx` `.mjs` `.js`                             |
| Preset (`base.js`)  | `.ts` `.tsx` `.mts` `.cts` `.js` `.jsx` `.mjs` `.cjs` |

So the preset adds `.mts`, `.cts`, `.jsx`, and `.cjs`. Counting tracked files after the shared
ignores:

```
.ts 1852   .tsx 601   .js 42   .mjs 15     = 2510
.mts 0     .cts 0     .jsx 0   .cjs 0      = 0
```

**Finance contains none of the four added extensions**, so both configs select the same 2,510
files. That number is not a coincidence: it is exactly the file count the `0.6.0` measurement
reported, which independently confirms the run covered the preset's full selection.

Two caveats worth keeping:

- This is an accident of finance's current file inventory, not a property of the configs. The
  first `.cjs` or `.jsx` file added to the repo is linted by the preset and not by today's config,
  with no signal. It is a reason to re-measure on adoption, not to assume.
- The **ignore** side does differ and does not net to zero: the preset ignores `**/coverage/**`,
  `**/dev-dist/**`, `**/.svelte-kit/**`, and `**/.impeccable/**` (which finance does not), while
  finance ignores `**/.gradle/**` (which the preset does not). These are generated directories, so
  they are largely untracked and invisible to a tracked-file count — but `.gradle` is why that
  ignore is on the must-port list rather than droppable.

Separately, the numbers here were never exposed to the blind spot upstream describes: **317 was
produced by running the preset over the repository, not by diffing rule tables.** A rule diff
cannot see file-set changes; an actual run cannot miss them. That is the general argument for
measuring the artifact rather than reasoning about the config, and it is the same reason the
from-source reconstruction under-counted by 19%.

### Source-shape guards: one latent case, not currently active

Upstream warns that a large format pass re-breaks tests asserting against literal source text on
every rebase, and that the fix belongs at the read (normalise quotes, collapse whitespace) rather
than in the assertion.

Finance has exactly one test of that shape:
[`apps/web/src/accessibility/__tests__/wcag-audit.test.ts`](../../apps/web/src/accessibility/__tests__/wcag-audit.test.ts).
It `readFileSync`s CSS sources and makes ~25 literal substring assertions —
`toContain('min-height: 44px')`, `toContain('clip: rect(0, 0, 0, 0)')` — each of which depends on
Prettier's CSS spacing. One assertion already uses `\s*` and is resilient; the rest are not.

**It is not at risk today**, and the reason is a measurement already recorded above: adopting
`prettier-config@^0.2.0` reformats **zero** files, because `.prettierrc.json` is byte-equivalent to
the shared config on all seven keys and `proseWrap` was reverted to `preserve`. With no format
pass there is no reflow to re-break. Recorded as a latent exposure with a named file so that any
future change to shared CSS formatting is understood to have a test cost attached, rather than
being discovered through a mysteriously failing accessibility suite.

### 0.7.0 changes nothing on the React path — verified, not assumed

`0.7.0` is published as fixing a silent drop of hooks linting: `next.js` did not bundle
`eslint-plugin-react-hooks`, so a consumer migrating off `eslint-config-next` lost
`rules-of-hooks` and `exhaustive-deps` with no signal. Both presets now resolve hooks through a
shared `hooks.js`.

Upstream states the React preset was never affected. That is correct, but `react.js` **did**
change — 67 lines were removed from it — so "unchanged file" is not the evidence, and confirming
it needed a behavioural test rather than a diff:

| Check                                            | Result                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `base.js`, `ignores.js`, `svelte.js`             | byte-identical `0.6.0` → `0.7.0`                                                                   |
| `react.js`                                       | −67 / +1 — pure extraction of `resolveHooks`, `isFlatConfig`, `CLASSIC_HOOK_RULES` into `hooks.js` |
| `next.js`                                        | gains `resolveHooks` — **the only behavioural change in the release**                              |
| Resolved rules on a `.tsx` file, `reactConfig()` | **342 on both**, **0 differing**                                                                   |

The last row is the one that settles it: `--print-config` output was compared key-by-key across
every rule, not just the hooks family. So **the 317-finding measurement recorded above stands
without re-running it**, and the floor bump carries no re-validation cost.

The same run confirms the hooks severities finance would inherit — `rules-of-hooks` **error**,
`exhaustive-deps` **warn**, and all **15** React Compiler rules **off** unless `compiler: true`:

```
react-hooks/rules-of-hooks=2  react-hooks/exhaustive-deps=1  (15 others = 0)
```

**This is the release note that matters most to finance, for a reason it does not state.**
`eslint.config.mjs` configures **no** `react-hooks` rules and **no** `jsx-a11y` rules, and neither
plugin appears in any manifest. Finance lints React today with **zero hooks linting and zero
accessibility linting**. The preset does not preserve an existing guarantee here — it introduces
one that has never existed, which is why the earlier `rules-of-hooks` finding of 2 real defects
came from the preset rather than from CI. It also means the drift bug fixed in `0.7.0` was only
ever reachable through `./next`, which finance does not use.

### The 0.6.0 crash does not affect finance

`0.6.0` is published as fixing a hard crash — a type-aware rule reaching a file with no TypeScript
project aborts the **entire** ESLint run rather than failing that rule. The fix is real and the
floor should be at least `^0.6.0`, but the stated rationale does not transfer here, and adopting
the reasoning unchecked would misdescribe finance's risk:

- `react.js` is **byte-identical between 0.5.0 and 0.6.0** — `git diff` reports no change.
- In 0.5.0 the only entry point that enabled type-aware linting was **`next.js`**, where
  `typeAware` defaults to **`true`**. `base.js`, `react.js`, and `svelte.js` never requested type
  information at all, so they could not reach the crash.
- Finance is a `./react` consumer, so **it was never exposed.**

The correct reason for finance to take a `0.6.0`-or-later floor is the opposite one: it is the
**first release in
which the React preset can reach type-aware rules at all**, because `reactConfig` spreads its
remaining options into `base()`. That is what makes the targeted `no-floating-promises` step above
possible; on `0.5.0` a React consumer had no route to it. The new `.js` guard — which turns every
type-aware rule back off for JavaScript, applied after `extend` so a caller cannot accidentally
outrank it — is what makes that opt-in safe.

### Then, for Prettier

**Done — see _Adopted: the shared Prettier config, vendored_ above.** Since engineering `v0.15.1`
this no longer requires the registry at all; the config is vendored at a ref.

**Correction to the figure this section used to carry.** It claimed adopting the markdown override
was a "verified no-op" at **0 files changed**. Running it for real produced **5 files / 48 lines**.
The old number was measured by invoking Prettier with a simulated config rather than through the
wired gate, and it missed fenced code blocks entirely. The corrected breakdown — and the
confirmation that prose churn really is zero — is in the adopted section above.

The lesson is not that the override is expensive; 48 lines is nothing. It is that **a simulated
config run is not evidence about the gate.** `npm run format:check` after wiring is the only thing
that answers this, and it disagreed with the simulation. Nothing below this line was affected: the
`proseWrap` analysis stands, and it was measured against real files.

The 73-line `.prettierignore` is finance-specific and stays.

**The `proseWrap` decision, which is what actually mattered.** Finance already used Prettier's
default `preserve`, so the only delta was `printWidth` 100 → 96 — and under `preserve` that reaches
tables, lists and fences, not prose. Measured across every tracked markdown file:

| Metric                 | Value |
| ---------------------- | ----- |
| Markdown files tracked | 592   |
| Files reflowing prose  | **0** |

The earlier `0.1.x` config set `proseWrap: 'always'`, which would have rewritten **528 of 592
files (89%)** — 36,249 added / 29,723 removed against 182,051 total markdown lines, roughly 36% of
every markdown line finance owns. Finance objected on that basis; the authority reversed to
`preserve` in `0.2.0` and cancelled the reflow fleet-wide. The reasoning that settled it was not
the one-time cost:

**`proseWrap: 'always'` destroys semantic line breaks**, silently, on every write. One sentence per
line is the technique that bounds line length without taxing edits, and Prettier cannot enforce
it — but `always` actively undoes it, while `preserve` is the setting that permits it. `preserve`
is therefore not better in itself; it is the only value under which the convention can survive.

**The merge-conflict axis does not discriminate between the two live options** and should not be
cited in either direction. Measured directly — two branches, each editing one sentence of a shared
paragraph, then `git merge`:

| Regime                         | Edits far apart | Edits adjacent |
| ------------------------------ | --------------- | -------------- |
| `always`                       | clean           | CONFLICT       |
| `preserve`, one long paragraph | **CONFLICT**    | CONFLICT       |
| `preserve` + semantic breaks   | clean           | CONFLICT       |

Conflict behaviour is governed by **line granularity, not wrapping policy**. `always` and semantic
breaks both produce roughly sentence-length lines and behave identically. Unbroken single-line
paragraphs are the genuinely bad case, because every concurrent edit collides on one line.
Adjacent edits conflict under every regime, since git needs an unchanged context line between
changes. So finance's original "`always` manufactures conflicts" argument was wrong, and so is the
converse — the real cost of `always` is the one above.

**Convention: semantic line breaks.** One sentence per line in new and substantially-edited prose.
Not enforced, not retrofitted, and not a reason to reflow existing files.

### Sealed and generated content

Reformatting is only safe where formatting carries no meaning. Finance's tree was audited for
content where it does. This audit stands regardless of the `proseWrap` outcome — it applies to any
future formatting change, which is why it is recorded rather than discarded once the reflow was
cancelled. Two classes exist and both are already handled by `.prettierignore`:

- **Sealed** — `**/vendor/@jrm/` (vendored verbatim from `jrmoulckers/studio`) and the
  studio-managed `.github/agents`, `.github/instructions`, `.github/prompts`, and `.github/skills`
  assets, which are generated and hash-checked upstream. Reformatting these would invalidate the
  hash that proves they match their source.
- **Unparseable** — `.kt`, `.kts`, `.swift`, `Caddyfile`, `.npmrc`, `*.env*`, `*.sql`.

**Golden and snapshot fixtures were checked specifically and need no exclusion**, which is worth
recording because the reason generalises. Finance has six fixture files —
`apps/windows/src/test/resources/narration-fixtures/{golden,snapshots}/*.json` and
`tools/ai-eval/golden-tasks/*.json` — and **every one is deserialised before comparison**
(`json.decodeFromString` then `assertEquals` on the data class; `JSON.parse` in `run-evals.js`).
The repository contains no `toMatchFileSnapshot`, no `toMatchSnapshot`, and no `.snap` files.

**Coverage was verified against the sync manifest, not by reading globs.** `.studio-sync.lock.json`
lists **72** managed paths; asking Prettier itself (`--file-info`) which of them it would format
returns **1** — `AGENTS.md`. The other 71 are already ignored.

`AGENTS.md` is deliberately not in `.prettierignore`, and that is the better answer for a **mixed**
file: it is mostly finance-authored prose with a synced block at lines 488–636, fenced by
`<!-- prettier-ignore-start -->` / `<!-- prettier-ignore-end -->`. The fence protects the synced
region byte-for-byte while leaving finance's own prose formatter-managed. A whole-file ignore would
surrender the larger half to no benefit. `prettier --check AGENTS.md` passes.

For the same reason finance enumerates managed assets rather than ignoring
`.github/{agents,instructions,prompts,skills}` wholesale: those directories hold finance-owned
overlays too, and `.prettierignore` explicitly re-includes `finance-domain.agent.md`. A blanket
directory glob would silently exempt files finance actually maintains — including
`.github/copilot-instructions.md`, which is **not** studio-managed here and must stay formatted.
The enumeration's real cost is that it can go stale, so the `--file-info` sweep above is the check
that catches drift; re-run it after any canon sync.

So the hazard is not "golden fixtures exist" but "golden fixtures are compared as bytes." A
parse-then-compare fixture is immune to reformatting by construction; a byte-compared one fails
as a false test failure far from its cause. Finance has none of the latter, and the audit is
recorded here so the next formatting change does not have to repeat it.

## Deliberately deferred

**`@jrmoulckers/tsconfig`** — and, following from that, it is **deliberately not vendored either**.
`v0.15.1` makes the files fetchable with no token, which removes the access argument but not the
migration cost below. A vendored config that nothing `extends` is not adoption: it fails no gate,
is checked by no CI, and drifts against upstream silently until someone tries to use it. Fetch it
in the change that adopts it. (Its `node.json` entrypoint, new in `v0.15.1`, is likewise not
needed here — finance executes no `.ts` directly.)

`apps/web/tsconfig.json` is the repository's only tsconfig. Trial
run against the shared chain (`vite-react.json` → `vite-app.json` → `base.json`, resolved from
source): **2,691 diagnostics**, against a baseline of 0.

| Code                   | Count | Cause                                                 |
| ---------------------- | ----- | ----------------------------------------------------- |
| TS2532 + TS18048       | 2,173 | `noUncheckedIndexedAccess` — possibly `undefined`     |
| TS2345 + TS2322        | 416   | same family, surfacing as `T \| undefined` mismatches |
| TS6133                 | 29    | `noUnusedLocals` / `noUnusedParameters`               |
| TS2769                 | 27    | no overload matches                                   |
| TS1484                 | 20    | `verbatimModuleSyntax` — needs `import type`          |
| TS2538, TS2488, TS2339 | 24    | index/iterator/property shapes                        |

**1,853 (69%) are in test files; 838 (31%) in production code.** The concentration is in import
parsers — `qif-parser.ts` (55), `csv-parser.ts` (45), `reconciliation.ts` (36),
`pdf-parser.ts` (34).

**Triage finding: the dominant shape is provably safe.** Sampling the highest-risk codes
(TS2538/TS2488) across production sites found no active crash. finance's diagnostics are
overwhelmingly `arr[i]` inside `for (let i = 0; i < arr.length; i++)`, regex capture groups
behind a match guard, and `split('|')` destructuring of a key the same function constructed —
all in-bounds by construction, unprovable to the compiler.

The useful discriminator, since a raw count is not a risk signal:

> The dangerous shape is a read indexed by something **other than** the collection's own bounds
> check — zipping two collections by position, or indexing collection A by a value found in
> collection B. A read indexed by its own `length` guard is noise.

`reconciliation.ts:196` (`existing[exactCandidates[0]]`) is the one instance of the dangerous
shape found, and it is guarded by `exactCandidates.length === 1`.

This is a real migration and needs its own issue, but it is **mechanical, not bug-revealing**,
and should be sequenced accordingly. Fix at the call site with guards, never with `!` or `as`.

## Gaps to close upstream, in `jrmoulckers/engineering`

These are engineering-repo changes. Working around them locally would create exactly the
duplication this adoption removes.

0. **`eslint-config`'s `eslint` peer excluded ESLint 10.** (Closed upstream in
   `eslint-config@0.4.0`.) The package declared `eslint: ^9.0.0`; finance runs `10.6.0`, so
   installation failed `ERESOLVE` on every subpath, `./base` and `./svelte` included. Verified
   that `./base` **loads and lints correctly under ESLint 10** when resolved from source, so the
   range was conservative rather than accurate. Now `^9.0.0 || ^10.0.0`.

   The React half of this report was **wrong**, and the correction is recorded under Blocker 2:
   `eslint-plugin-react` is not broken on ESLint 10 — only `settings.react.version: 'detect'` is,
   and the preset opted into that path itself. Fixed upstream by resolving React's version at
   config-construction time. `0.4.0`'s `./react` was re-verified against finance's ESLint 10.6.0:
   18 enforcing `react/*` rules, `react/jsx-key` firing, version resolved to the real `19.2.7`.

1. **No React ESLint preset.** (Closed upstream in `eslint-config@0.2.0`+.) The package shipped
   `./base`, `./svelte`, and `./next` only. finance's
   web app is **React 19 + Vite, 2,301 `.ts`/`.tsx` files** — none of the three fit. `base()`
   carries no `eslint-plugin-react-hooks` (rules-of-hooks, exhaustive-deps) and no `jsx-a11y`,
   both of which this app needs and on which its WCAG 2.2 AA obligations depend. Requesting
   `@jrmoulckers/eslint-config/react`.
2. **`tsconfig/vite-app.json` has no `jsx` setting** and sets `types: ['vite/client']` only. A
   React consumer needs `"jsx": "react-jsx"`. Requesting a `vite-react.json` variant. (Closed
   upstream in `tsconfig@0.2.0`.)
3. **`tsconfig/base.json` sets no `ignoreDeprecations`, which aborts the run on TypeScript 6.**
   finance is on **TypeScript 6.0.3**, where `baseUrl` is a hard error (`TS5101`), not a warning.
   A consumer that extends the shared chain while keeping `baseUrl` + `paths` — the ordinary
   shape for a path alias — gets **one config error and zero type diagnostics**, because the
   compiler exits before checking anything. That reads as "the preset works, we're clean."

   Either set `"ignoreDeprecations": "6.0"` in `base.json`, or document that consumers must drop
   `baseUrl` and make `paths` tsconfig-relative (`"@/*": ["./src/*"]`), which is the better fix.
   Worth stating loudly given the adoption wave is measuring diagnostic counts right now.

4. **`vite-app.json`'s `types: ['vite/client']` replaces rather than merges.** `types` is not
   additive across `extends`, so any consumer with test globals silently loses them. finance had
   to restate `node`, `vitest/globals`, and `@testing-library/jest-dom` alongside `vite/client`.
   A note in `docs/adopting.md` would save every consumer the rediscovery.
5. **`practices/performance-budgets.md` covers no native or JVM profiling.** Its sections are
   delivery/runtime budgets and Lighthouse — yet `ENG-PERF-007` requires _platform-native_
   profiling. finance already documents Android Profiler + baseline profiles, Instruments +
   MetricKit + signposts, JFR + VisualVM + WPA, and a Gradle benchmark harness. That technique
   is general and belongs upstream.
6. **No native-platform principle area.** The 66 principles span 11 areas — API, ARCH, BUILD,
   DATA, INT, LOCAL, OBS, PERF, SEC, TEST, WEB. `WEB` covers browser frontends; **nothing covers
   native application surface.** Searching the whole principles corpus for `mobile|Android|iOS|
desktop|Kotlin|Swift|multiplatform` returns a single incidental match. finance ships **four**
   platforms, **three of them native** (Android, iOS, Windows/Compose Desktop), so only
   `apps/web` is addressed by a platform area at all.

   This compounds gap 3 rather than duplicating it: `ENG-PERF-007` demands platform-native
   profiling, the practice that would explain how is web-shaped, and there is no native area to
   host the obligation in the first place. Requesting an `ENG-NATIVE-*` (or `ENG-APP-*`) area.

7. **`scripts/check-citations.mjs` does not expand ID ranges.** The checker resolves literal IDs
   only, so a citation written as `` `ENG-OBS-001`–`ENG-OBS-007` `` is scanned as exactly two
   citations and the five in between are never verified. That is precisely where a
   wrong-meaning citation hides best: a range asserts something about every member while
   showing the reader only the endpoints. In this repository the ranges concealed five IDs
   (`ENG-OBS-002`–`006`, `ENG-DATA-002`) — all correct on manual check, but invisible to the
   tool that exists to check them. Requesting that the checker either expand `NNN`–`NNN` ranges
   within an area or warn that it cannot.

8. **`toolingFiles` omits `tools/**` and `services/**`.** The shared glob covers
   `**/scripts/**`, `**/*.config.*`, and test files, which is where the preset relaxes
   `no-console`. finance keeps CLI-style code under `tools/` and `services/` as well, and that
   single omission accounts for **743 of the 1,061 findings** in an unmodified run — `no-console`
   659 and `@typescript-eslint/no-require-imports` 84. Both vanish once the two exemptions are
   restated locally, so nothing is broken; but every consumer with a `tools/` directory will
   rediscover this and restate the same two blocks. Worth either widening `toolingFiles` or, more
   conservatively, exporting it so consumers can spread and extend it rather than re-authoring
   the list. Note the preset already turns `no-console` off for tooling but never relaxes
   `no-require-imports` anywhere, which CommonJS tooling always needs.

9. **The `strictTypeChecked` cost stated in the README is unrepresentative by two orders of
   magnitude.** `0.6.0` documents one measured consumer at **13** mechanical violations. finance,
   scoped to the single directory covered by a `tsconfig.json`, measures **2,093 across 45
   rules**. Both numbers are honest; quoting only the small one invites consumers to treat the
   opt-in as a cheap afternoon. Suggest phrasing it as a range with the driver named — the cost
   scales with how much untyped or `any`-typed surface the codebase already carries, not with
   file count — and noting that `no-floating-promises` can be enabled alone via
   `typeAware: true` plus a rule override, which is where nearly all the defect-finding value
   sits (finance: 54 real sites, versus ~1,900 stylistic findings for the full set).

10. **Release notes are scoped to what changed, not to what a consumer lacks.** `0.7.0` tells
    React consumers they "were never affected," which is true of the regression and was verified
    here (342 resolved rules, 0 differing, `0.6.0` → `0.7.0`). But it reads as _nothing here
    concerns you_, and for finance the opposite holds: `eslint.config.mjs` configures **no**
    `react-hooks` and **no** `jsx-a11y` rules, and neither plugin is in any manifest. The preset
    is not preserving finance's hooks linting — it is the only thing that would ever provide it.
    Suggest release notes distinguish _regression scope_ from _baseline capability_, since the
    consumers least protected today are exactly the ones a "you were never affected" line tells
    to stop reading.

11. **`exhaustive-deps` ships at `warn`, which is not a lower severity everywhere.** The
    intent — advisory, since the rule has known false positives — is right. But finance's gate is
    `npx eslint . --max-warnings 0`, which is also what the shared `practices/` guidance
    encourages, and under it a `warn` fails the build identically to an `error`. The severity
    distinction silently collapses for any consumer following that advice. Worth either saying so
    in the README or noting which rules are expected to need per-repo downgrading.

12. **`vendor-configs.mjs` drops `"type": "module"`.** Upstream
    `packages/prettier-config/package.json` declares it and the vendored files are ESM, but the
    script copies only the source files, so the module type is lost. Any consumer whose root
    `package.json` has no `type` field — finance's has none — receives nominally-CommonJS files
    containing `export default`. finance survives only because Node ≥22.7 retries a failed CJS
    parse as ESM, emitting `MODULE_TYPELESS_PACKAGE_JSON`; on older Node, or under any resolver
    without that fallback, it is a hard `SyntaxError` surfacing at the tool rather than at the
    vendoring step. The module type is a property of the upstream package, so the fix belongs in
    the script: **emit a `{ "type": "module" }` marker into the destination for any ESM set.**
    finance carries a local workaround file that is deliberately outside the lock and therefore
    not hash-checked — which is exactly why it should not be the permanent answer.

13. **The vendored/registry split needs a stated rule for _when_ to vendor.** ADR-0001 explains
    why each package landed where it did, but not what a consumer should do with a vendored
    config it is not yet ready to adopt. finance deferred `@jrmoulckers/tsconfig` on evidence
    (2,691 diagnostics) and therefore did **not** vendor it, on the reasoning that an
    unreferenced copy of another authority's config extends nothing, fails no gate, and drifts
    invisibly. Worth stating that vendoring should happen in the same change that adopts, since
    the obvious reading of "vendor the half that needs no token" is to fetch both sets at once.

## Citation audit

Verified with `scripts/check-citations.mjs --review` at `v0.2.11`, run over all 804 markdown
files: **every ID valid, and every principle's true title matching the claim made about it.** The
wrong-meaning defect reported elsewhere in the org did not reach finance.

Two notes, because the exit code is not the result:

- **`ENG-ARCH-003` is cited here correctly**, as the obligation to keep durable decision
  records, in `docs/architecture/README.md`. It is one of the IDs miscited elsewhere, so it was
  checked directly rather than assumed.
- **Ranges were rewritten as explicit lists.** ADR-0002 and ADR-0020 previously cited
  `ENG-DATA-001`–`003` and `ENG-OBS-001`–`007`. Both are now enumerated with each principle's
  title inline, which brings five previously unverifiable IDs under the checker and removes the
  blind spot described in gap 7. Prefer enumerated citations over ranges for this reason.

Finance cites **nothing as the source** of its accessibility, test-colocation, or service-tier
requirements — there is no ratified principle for any of them. Those are finance commitments and
say so. Where a ratified principle bears on them _additively_, that is now stated as such rather
than omitted:

- `docs/guides/accessibility.md` and `docs/audits/accessibility-audit-wcag22.md` note that
  `ENG-PERF-009` (assurance precedence) forbids trading accessibility away for performance. It is
  not the source of the WCAG 2.2 AA commitment; it constrains what may be done to it.
- Test colocation is named as a finance convention; the obligation it serves is `ENG-TEST-003`
  (regression boundaries).

The distinction is worth stating precisely, because the two readings differ in what they license.
"Accessibility follows `ENG-PERF-009`" is false and would make the WCAG commitment look
negotiable by amending a principle finance does not own. "`ENG-PERF-009` additionally forbids
trading it away" is true and adds a constraint without relocating authority.

## Principles finance declines

**None.** All 66 apply or are inapplicable-but-not-contradicted; none conflict with finance's
architecture, so nothing is refused.

This was checked rather than assumed, and the expectation going in was the opposite — finance
diverges from the other repos more than any of them. The divergence turns out to be one of
**scale and platform count, not of contradicted premises**. Specific candidates examined and
cleared:

| Candidate       | Suspected tension                             | Verdict                                                                                                   |
| --------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ENG-API-003`   | Edge-first: logic runs on the client          | **Applies.** Supabase RLS enforces authorization server-side regardless of where computation happens.     |
| `ENG-API-002`   | Backend is sync-only, holds no business logic | **Applies.** Migrations + PowerSync rules are exactly the owned data contract it asks for.                |
| `ENG-WEB-004`   | Local SQLite outlives the session             | **Applies, strongly.** A PWA swapping assets under a running session is a live risk here.                 |
| `ENG-TEST-008`  | Mutation testing across ~5,516 files          | **Applies.** Aspirational at this scale, but scope is not contradiction.                                  |
| `ENG-LOCAL-001` | The one docket refused                        | **Affirmed.** docket's server is canonical; finance's client is. Finance is the principle's central case. |

Worth noting for the corpus: `ENG-LOCAL-001` being simultaneously the principle one repo refuses
outright and the principle another treats as foundational is a sign it is well-drawn, not
ambiguous — it makes a real claim that a repository can fail.

## Worth hoisting up

Finance-invented, generic, and absent from the shared layers:

- **The skip-with-success required-check pattern** — a path-filtered required check never
  reports status, leaving PRs permanently `BLOCKED`; gate inside the workflow instead. Generic
  Actions knowledge, so it belongs in `jrmoulckers/.github`.
- **The sensitive-data-logging grep guardrail** in `ci-lint.yml` — an executable check for
  `ENG-OBS-005`, which the practices layer stated only as an obligation. **Delivered**; shipped
  upstream as `practices/observability.md`, which implements all seven `ENG-OBS` principles.
- **The lab-profiler / field-metrics split for `ENG-PERF-007`.** A lab-only setup satisfies the
  letter of the principle while missing the real-device regressions it exists to catch, and the
  gap widens the further you get from a server. **Delivered** as a diff reconciled into
  `practices/performance-budgets.md`'s existing tool table — a fourth _field channel_ column
  rather than a second table — plus the device-as-variable and sampling-floor sections. The
  Compose-specific half (recomposition counting, `derivedStateOf`, baseline profiles, `key()` in
  lazy lists) deliberately **stays** in `docs/guides/performance.md`: it is one product's stack,
  and hoisting it would put Compose guidance in front of six repos that have no Compose.
- **`.gitattributes` line-ending carve-out for Windows batch files.** The shared Prettier config
  sets `endOfLine: 'lf'`, which requires a `.gitattributes` to avoid `format:check` passing in CI
  and failing on every Windows checkout. finance already has one, and it goes further than the
  bare `* text=auto eol=lf` being recommended: it adds `*.bat`/`*.cmd text eol=crlf`. Forcing LF
  on batch files can break `cmd.exe` parsing, so the bare snippet trades one Windows-only failure
  for another. The carve-out belongs in the recommendation.
