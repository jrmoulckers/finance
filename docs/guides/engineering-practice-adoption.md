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

4. Depend on the current floors: **`@jrmoulckers/eslint-config@^0.6.0`**,
   **`@jrmoulckers/tsconfig@^0.3.0`**, **`@jrmoulckers/prettier-config@^0.2.0`**. The React
   preset and `vite-react.json` first shipped in `0.2.0`, as did `prettier-config`'s reversal to
   `proseWrap: 'preserve'`; `eslint-config@0.4.0` is the first release installable on ESLint 10
   (see Blocker 2), and `0.6.0` the first in which the React preset can reach type-aware rules at
   all. On a `0.x` package a caret permits patch updates only, so `^0.1.0` resolves
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

### The 0.6.0 crash does not affect finance

`0.6.0` is published as fixing a hard crash — a type-aware rule reaching a file with no TypeScript
project aborts the **entire** ESLint run rather than failing that rule. The fix is real and the
floor should be `^0.6.0`, but the stated rationale does not transfer here, and adopting the
reasoning unchecked would misdescribe finance's risk:

- `react.js` is **byte-identical between 0.5.0 and 0.6.0** — `git diff` reports no change.
- In 0.5.0 the only entry point that enabled type-aware linting was **`next.js`**, where
  `typeAware` defaults to **`true`**. `base.js`, `react.js`, and `svelte.js` never requested type
  information at all, so they could not reach the crash.
- Finance is a `./react` consumer, so **it was never exposed.**

The correct reason for finance to take `^0.6.0` is the opposite one: it is the **first release in
which the React preset can reach type-aware rules at all**, because `reactConfig` spreads its
remaining options into `base()`. That is what makes the targeted `no-floating-promises` step above
possible; on `0.5.0` a React consumer had no route to it. The new `.js` guard — which turns every
type-aware rule back off for JavaScript, applied after `extend` so a caller cannot accidentally
outrank it — is what makes that opt-in safe.

### Then, for Prettier

`.prettierrc.json` is byte-equivalent to the shared config on all seven keys. Adopt
`@jrmoulckers/prettier-config` at **`^0.2.0`**, which sets `proseWrap: 'preserve'` and
`printWidth: 96` for `*.md`. The 73-line `.prettierignore` is finance-specific and stays.

**Adopting the markdown override is a verified no-op here.** Finance already uses Prettier's
default `preserve`, so the only delta is `printWidth` 100 → 96, and under `preserve` that affects
only tables, lists and fences — not prose. Measured across every tracked markdown file:

| Metric                 | Value     |
| ---------------------- | --------- |
| Markdown files tracked | 592       |
| Files changed          | **0**     |
| Line churn             | **0 / 0** |

No reflow commit is needed.

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

**`@jrmoulckers/tsconfig`.** `apps/web/tsconfig.json` is the repository's only tsconfig. Trial
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
