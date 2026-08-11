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

### Refreshed to `v0.15.7`, and drift is now enforced in CI

`node scripts/vendor-configs.mjs --check` verifies the vendored tree against
`engineering-configs.lock.json` and **fails on drift**, so an edit to a vendored file can no longer
pass review as a local change. It runs in `ci-lint.yml`, immediately before the Prettier step it
protects. A newer upstream release is reported as a **notice at exit 0**, deliberately: an upstream
tag must never redden an unrelated PR.

Two things worth knowing before relying on it:

- **The staleness notice makes an unauthenticated call to `api.github.com`** on every lint run. It
  fails open — non-200, rate limit, or offline all return "fine" rather than a false signal — so it
  is safe, but it is outbound egress on a hot path, and belongs in the same ledger as the registry
  routing in [`docs/security/supply-chain.md`](../security/supply-chain.md).
- **Drift detection and staleness are different checks.** The first is a hash comparison and is
  authoritative offline; the second is advisory and silently degrades to "no answer". A green
  `--check` means _matches the lock_, not _up to date_.

The refresh `v0.15.1` → `v0.15.7` changed **0 files of content** — the shared Prettier config has
been byte-stable across six releases. The lock proves that rather than requiring the claim be
taken on trust, which is the whole point of recording a SHA-256 per file.

### Gap 12 is still open at `v0.15.7`

The refresh was also the cheapest possible test of whether the missing `"type": "module"` marker
had been fixed upstream. It has not: `v0.15.7` still vendors two source files and no module-type
declaration, so finance's local workaround file stays. Re-test on each refresh — it is one command
and removes the need to guess.

### Staying at `v0.15.7` while `v0.16.4` exists is a measured decision

`--check` reports the newer release as a non-failing notice. Rather than take or ignore it blind,
both files were fetched at `v0.16.4` and hash-compared: **SHA-256 identical to `v0.15.7` for both
`index.js` and `svelte.js`.** Nine releases changed nothing finance consumes, so the refresh would
be a lock-file-only commit. It is deferred until a release actually changes content — which the
hash comparison will detect, and which is the whole point of vendoring at a hash rather than a
range.

Doing that comparison is what surfaced **gap 17**: the preview command mutates the repository lock
and disarms the drift gate. Preview upgrades with care until that is fixed upstream, and
`git status` afterwards.

### Resolve the ref; do not copy a version literal

Upstream's guidance, and finance follows it — with the observation that it applies to upstream's
own announcements too. The release notice that introduced `--check` named `v0.15.3`; the newest tag
at the time of reading was **`v0.15.7`**, four releases further on. Pinning the literal from the
message would have been stale on arrival.

```powershell
$tag = gh api repos/jrmoulckers/engineering/releases/latest --jq .tag_name
node scripts/vendor-configs.mjs $tag --set prettier --dest config/engineering
```

`releases/latest` was verified to agree with a version-sorted tag listing (39 tags, newest
`v0.15.7`). **Do not substitute a lexical sort** — `Sort-Object` without a version cast returns
`v0.9.0` as the newest of these tags, which is the failure upstream's `sort -V` note warns about,
reproduced here on PowerShell.

A recorded ref inside this document is a **historical fact** — what was vendored, when — and stays
literal. Only the instructions use the resolver.

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

**`401` and `403` are different failures, and finance hits neither locally.** Upstream now
distinguishes authentication (`401` — token absent, wrong host, or wrong token class) from
authorization (`403 permission_denied: read_package` — the token is valid and correctly scoped but
the package has not been shared with the consumer), noting that the tell for the latter is metadata
resolving while only the tarball download fails. Finance tested for exactly that split and does not
have it — with the keyring token both halves succeed:

```console
$ npm view @jrmoulckers/eslint-config version   # metadata  -> 0.9.0
$ npm pack @jrmoulckers/eslint-config@0.9.0     # tarball   -> 10425 bytes, exit 0
```

So the local install path is fully open, and the three failures now sit in a clean hierarchy:
`401` = no/!scoped token (what an unauthenticated CI run gets), `403 read_package` = scoped token
without a grant (what finance would get if the token were scoped but unshared), and neither = what
finance actually observes. **The blocker is therefore narrower than recorded above: it is
CI-only.** Local adoption work needs no grant at all; only landing it does.

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

4. Depend on the current floors as **ranges, not carets**:

   | Package                        | Range            | Note                                               |
   | ------------------------------ | ---------------- | -------------------------------------------------- |
   | `@jrmoulckers/eslint-config`   | `>=0.9.0 <1.0.0` | plus three plugins in `devDependencies`, see below |
   | `@jrmoulckers/tsconfig`        | `>=0.4.0 <1.0.0` | vendored channel — range is advisory only          |
   | `@jrmoulckers/prettier-config` | `>=0.3.0 <1.0.0` | vendored here; pinned by ref + lock instead        |

   The React preset and `vite-react.json` first shipped in `0.2.0`, as did `prettier-config`'s
   reversal to `proseWrap: 'preserve'`; `eslint-config@0.4.0` is the first release installable on
   ESLint 10 (see Blocker 2), and `0.6.0` the first in which the React preset can reach type-aware
   rules at all. `0.7.0` and `0.8.0` are both no-ops for finance — see below — but are taken as the
   floor anyway, because there is no cost to either and a stale floor is a liability the moment a
   later fix lands.

   **This document previously recommended `^0.8.0`, `^0.3.0` and `^0.2.0`, and that was wrong.**
   On a `0.x` package a caret permits patch updates only: `^0.8.0` resolves to `>=0.8.0 <0.9.0-0`
   and can never reach `0.9.0`, let alone the current `0.15.7`. Verified rather than reasoned:

   ```powershell
   node -e "console.log(require('semver').satisfies('0.9.0','^0.8.0'))"   # false
   ```

   The failure is silent and self-inflicted — a repository can report a defect as outstanding
   months after it was fixed, because its range cannot resolve the fix. **finance was never
   actually frozen**, since it depends on none of these packages yet (`@jrmoulckers` appears in
   neither `package.json` nor `package-lock.json`), but the recommendation above would have frozen
   it at the moment of adoption.

   Worth recording _how_ the error survived: the caret rule was **already stated correctly in this
   very section**, one paragraph below the floors it contradicted. A rule written down next to the
   thing that violates it does not enforce itself. The upstream guide made the identical mistake in
   the identical shape — warning against `^0.1.0` while its own table used `^0.3.0`. **Prefer a
   range a tool can check over a rule a reader must apply.**

   Two ranges above are now advisory only. `prettier-config` is vendored at a ref and pinned by
   `engineering-configs.lock.json`; `tsconfig` is deliberately not vendored at all. For those, the
   lock is the pin and a semver range describes nothing that is installed.

   Worth stating as a method rather than a version bump: verify against the **resolved version**,
   not the pinned range and not the working tree. Validating a preset through a `file:` link while
   committing a caret range that cannot reach it means the artifact tested and the artifact
   installed are different code. The same discipline surfaced Blocker 2 — a floor bump alone would
   have looked like progress while the peer range still excluded finance. Ranges recur at every
   boundary; resolve them, do not read them.

   That discipline still paid out, though not as first reported. Applying `>=0.8.0 <1.0.0` as
   recommended and then asking npm what it actually installed returned **`0.9.0`** — at that point
   a release announced in no message, and one that changes what a consumer must declare. The
   conclusion drawn from it was wrong and is retracted below; the habit of resolving the range
   rather than reading it is what surfaced the change at all.

### `0.9.0` is intentional, and gap 16 is retracted

An earlier revision of this document filed `0.9.0` as **gap 16**, a packaging defect that broke
`./react`. **That was wrong, and the error was mine.** Upstream has since explained the change, and
re-measuring against that explanation shows it is deliberate, documented, and correctly signalled.
The mechanism this document described is accurate; the conclusion drawn from it was not.

**What is real.** Between `0.8.0` and `0.9.0` every preset file is byte-identical — `git diff
--no-index` across the two published tarballs reports one changed file, `package.json` — and it
moves the five framework plugins out of `peerDependencies` into a top-level `frameworkPlugins` key
that npm does not implement:

```diff
   "peerDependencies": {
-    "@next/eslint-plugin-next": "^15.0.0 || ^16.0.0",
     "eslint": "^9.0.0 || ^10.0.0",
-    "eslint-plugin-jsx-a11y": "^6.10.0",
-    "eslint-plugin-react": "^7.37.0",
-    "eslint-plugin-react-hooks": "^5.0.0 || ^6.0.0 || ^7.0.0",
-    "eslint-plugin-svelte": "^2.46.0 || ^3.0.0",
     "typescript": ">=5.5.0 <6.1.0"
   },
+  "frameworkPlugins": { ... the five, relocated ... }
```

**What that is for.** `peerDependenciesMeta.optional: true` suppresses the _error_ for a missing
peer; it does not stop npm ≥7 auto-installing one it can resolve. So every consumer was installing
every framework's toolchain. Measured here, one scratch project, bare preset only:

| Install                                 | Size        | Svelte plugin | Next plugin |
| --------------------------------------- | ----------- | ------------- | ----------- |
| `eslint-config@0.8.0`, React consumer   | **75.0 MB** | present       | present     |
| `eslint-config@0.9.0` + 3 React plugins | **71.7 MB** | absent        | absent      |

75.0 MB reproduces upstream's figure exactly. The saving for finance is **3.3 MB, 4.4%** — not the
75 → 36.6 MB headline, because 36.6 MB is the bare preset with no framework plugins, a state no
consumer can lint from. The dead weight removed is real; its size is an order of magnitude smaller
than advertised for anyone who then installs their own stack.

**Why the original finding was wrong.** The probe harness was
`import(...).catch(e => console.log(e.code))`, which catches the rejection and lets node exit 0. I
reported "exit 0, no warning" as evidence the failure was silent. It is not silent — that was my
harness reporting its own exit code. Re-measured through ESLint itself:

| Condition                        | `npx eslint` exit | Output                                                |
| -------------------------------- | ----------------- | ----------------------------------------------------- |
| all framework plugins present    | `1`               | normal lint results                                   |
| `eslint-plugin-react-hooks` gone | `2`               | `ERR_MODULE_NOT_FOUND`, **names the missing package** |

Exit 2 naming the package is a loud failure. The general lesson is the one this document already
records about lint evidence, turned on its author: **a probe reports the exit code of the probe,
not of the thing under test.** Where an exit code is the finding, it has to be taken from the real
tool.

**What finance must do.** Pin `>=0.9.0 <1.0.0` and declare the plugins the React preset imports at
module scope in `devDependencies`. There are **three**, not two:

```jsonc
"eslint-plugin-react": "^7.37.0",
"eslint-plugin-react-hooks": "^5 || ^6 || ^7",
"eslint-plugin-jsx-a11y": "^6.10.0"
```

`eslint-plugin-jsx-a11y` matters: `react.js` line 3 is a static `import jsxA11y from
'eslint-plugin-jsx-a11y'`, so with only the first two the entry point still throws. Upstream's
broadcast named two; its `docs/adopting.md` per-stack table correctly names three, and the table is
the authority. Verified both ways — two plugins → `Cannot find package 'eslint-plugin-jsx-a11y'`;
three → `LOADED OK, entries=14`. The Next row omits `jsx-a11y` and that is also correct: the Next
entry point loads clean with exactly the two it lists.

**One consequence still stands.** The peer range was the only machine-checkable statement of the
ESLint 10 constraint in Blocker 2 — `eslint-plugin-react: ^7.37.0`, whose own peer caps at
`eslint: … || ^9.7`, is what let npm refuse an unsatisfiable tree at install time. Moving it to an
inert field means npm no longer checks it. Under `0.9.0` that obligation transfers to the consumer,
which is the stated intent: finance now owns the `eslint-plugin-react` version directly and can
hold it if a future release regresses on ESLint 10. Worth recording as a transfer of
responsibility, not a loss.

Every preset measurement in this document is stated against a **resolved version** already —
`0.5.0`, `0.6.0`, `0.7.0`, `0.8.0` — because each was run against a specific published tarball
rather than an installed range. Those findings are therefore unaffected by this correction.

Every preset measurement in this document is stated against a **resolved version** already —
`0.5.0`, `0.6.0`, `0.7.0`, `0.8.0` — because each was run against a specific published tarball
rather than an installed range. Those findings are therefore unaffected by this correction.

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
bump delivers. Taking `>=0.8.0 <1.0.0` still costs nothing — it is the same code — but the release
note's headline feature should not be recorded here as a gain that was actually received.

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

**It is not at risk today**, and the reason is a measurement recorded above — though not the one
this paragraph originally cited. Adopting the shared Prettier config reformatted **5 files, all
markdown, all fenced code blocks**. It reformatted **no CSS at all**, so there was no reflow for
these assertions to lose. The earlier claim here was "zero files", which was wrong in general and
happened to be harmless for this test specifically. Recorded as a latent exposure with a named file
so that any future change to shared CSS formatting is understood to have a test cost attached,
rather than being discovered through a mysteriously failing accessibility suite.

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
floor should be at least `0.6.0`, but the stated rationale does not transfer here, and adopting
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

13. **The vendored/registry split needs a stated rule for _when_ to vendor.** ADR-0001 explains why each package landed where it did, but not what a consumer should do with a vendored
    config it is not yet ready to adopt. finance deferred `@jrmoulckers/tsconfig` on evidence
    (2,691 diagnostics) and therefore did **not** vendor it, on the reasoning that an
    unreferenced copy of another authority's config extends nothing, fails no gate, and drifts
    invisibly. Worth stating that vendoring should happen in the same change that adopts, since
    the obvious reading of "vendor the half that needs no token" is to fetch both sets at once.

14. **The "no version literals" rule needs a carve-out for evidence.** Replacing every literal with
    a placeholder is right for _instructions_, where a stale pin propagates reversed guidance. It
    is wrong for _measurements_: "verified with the checker at `v0.2.11`" is a claim about a
    specific tool version, and a resolver silently re-points it at a different one on every read,
    turning a reproducible result into an unfalsifiable one. **Instructions resolve; evidence
    pins.** Worth stating, because the audit that produced this rule flagged one of finance's
    evidence pins as an error.

    That same audit reported `v0.2.11` as **"a tag that never existed"**. It exists —
    `git ls-remote --tags` returns 39 version tags including `v0.2.11`, contiguous with `v0.2.10`
    and `v0.2.12`. Worth re-checking how the audit decided a tag was missing, since the same method
    presumably ran against six other repositories.

15. **The staleness notice performs unauthenticated network I/O inside a lint gate.** `--check`
    calls `api.github.com/repos/.../releases/latest` on every run. The implementation is careful —
    it fails open, so rate limiting or an offline runner yields no signal rather than a false
    one — but the behaviour is undocumented at the call site, and consumers with egress review
    (finance keeps a supply-chain ledger) need to declare it. Either document it or add a
    `--no-remote` flag for gate use, where only the hash comparison is wanted.

16. **~~`eslint-config@0.9.0` breaks `./react`.~~ RETRACTED — this was my error, not a defect.**
    The mechanism was reported accurately: `0.9.0` moves five plugins from `peerDependencies` into a
    `frameworkPlugins` key npm does not read, while `react.js` and `hooks.js` still static-import
    them. But it is deliberate — `optional: true` never prevented npm ≥7 from auto-installing a
    resolvable peer, so every consumer was pulling every framework's toolchain, and upstream's
    `docs/adopting.md` documents the per-stack plugins each consumer must now declare.

    **The part I got wrong was the severity, and I got it wrong by mis-measuring.** I reported the
    failure as silent — "exit 0, no warning" — from a probe of the form
    `import(...).catch(e => console.log(e.code))`, which swallows the rejection and lets node exit 0.
    That was my harness's exit code, not ESLint's. Through the real tool, a missing framework plugin
    exits **2** and names the package. Loud, not silent. Where an exit code _is_ the finding, take it
    from the tool under test.

    Two things remain worth reporting upstream, neither a defect: the **75 → 36.6 MB** saving is
    measured against the bare preset, which no consumer can lint from — for a React consumer that
    installs the three plugins it needs, the real figure is **75.0 → 71.7 MB, 4.4%**; and the
    broadcast named two React plugins where three are required, `eslint-plugin-jsx-a11y` being a
    static import at `react.js` line 3. The `docs/adopting.md` table is right; only the broadcast
    was short. Finance pins `>=0.9.0 <1.0.0`.

17. **`--dest` writes the lock to the repo root but keys it by the destination path, so a trial
    vendoring disarms the drift gate while reporting success.** Vendoring into a scratch directory
    to preview an upgrade —
    `node scripts/vendor-configs.mjs v0.16.4 --set prettier --dest $TEMP/probe` — rewrote the
    repository's `engineering-configs.lock.json` in place: `ref` moved `v0.15.7` → `v0.16.4`, and
    both file keys became absolute temp paths (`C:/Users/.../Temp/v0164/prettier/index.js`). `LOCK`
    is a bare relative constant resolved against the cwd, so `--dest` redirects the vendored files
    but never the lock.

    The consequence is worse than a dirty working tree, because `--check` iterates the lock's keys.
    **Mutation-tested:** with the mutated lock in place, appending a line to the real
    `config/engineering/prettier/index.js` still produced
    `2 vendored file(s) match … at v0.16.4`, **exit 0**. Restoring the lock and repeating the same
    corruption correctly failed with exit 1. So the gate CI relies on can be silently pointed at a
    directory outside the repository — one that will later cease to exist — by a command whose
    entire purpose is to be a read-only preview, and it keeps reporting success either way.

    Two fixes, both cheap: resolve `LOCK` relative to `--dest` (a scratch vendoring gets a scratch
    lock and leaves the repo alone), and have `--check` reject entries whose path escapes the
    repository root rather than trusting them.

    A corollary defect surfaced in the same run: the script reported
    `Ref moved v0.15.7 -> v0.16.4; 2 file(s) changed content.` while both files were **byte-identical
    across the two refs** — SHA-256 equal, `git diff` empty. The "changed" test compares against the
    previous lock entry _for that destination key_, and `--dest` had changed the key, so unchanged
    files are reported as changed. The practical effect is that the one signal telling a reader
    whether an upgrade is reviewable or a no-op is wrong precisely when previewing an upgrade.

18. **A line-wrapped citation name stops being verified, silently.** `v0.16.5`'s `TITLED` pattern is
    `[^)/#\n]{2,59}`, so a parenthesised title split across a newline is not recognised as a claim.
    It does not fail — it is simply not checked, the exit code stays 0, and the only visible symptom
    is the "stated name(s) match" count being one lower than the number of names actually written.
    Reproduced in finance: the `ENG-PERF-009` citation in `docs/guides/accessibility.md`, whose
    title `Assurance precedence` was split between the two words. Unwrapping it moved the count
    30 → 31.

    **An earlier revision of this entry blamed the format pass. That was wrong and is retracted** —
    finance resolves `proseWrap: "preserve"`, so Prettier never reflows prose here (verified by
    `resolveConfig`, by a no-op format of an over-long paragraph, and by `git show` of the commit
    that introduced the citation already wrapped). The break was **hand-authored**. That makes the
    gap wider, not narrower: under `preserve` authors wrap by hand to a column convention, so every
    repo on the shared config is exposed through its authors, and `proseWrap: 'always'` merely adds
    a second mechanical trigger. Either match across newlines, or have `--review` report near-misses
    — an `ENG-*` ID followed by a parenthesised capitalised phrase that the strict pattern rejected.

    **Severity is worse than "the count drops", and `always` is the safe setting, not the trigger.**
    Both corrections come from measurement, and the second reverses what this entry said above.

    A four-case probe against the real `check-citations.mjs` v7, on a scratch corpus:

    | Case | Name      | Line     | Result                                                    |
    | ---- | --------- | -------- | --------------------------------------------------------- |
    | A    | correct   | one line | `1 stated name(s) match`, exit **0**                      |
    | B    | **wrong** | one line | **exit 1**, `claimed:`/`actual:` diff — the control fires |
    | C    | correct   | wrapped  | exit **0**, name silently unchecked                       |
    | D    | **wrong** | wrapped  | exit **0** — **a false name passes**                      |

    Case D is the finding. The check exists specifically to catch a real ID standing for a different
    rule, and a hand wrap defeats it completely. Worse, the summary does not report `0 stated
name(s) match` — the clause **disappears from the output entirely**, so a file whose every name
    claim is unverified is textually indistinguishable from one that makes no name claims. There is
    no count to notice being low. Case B matters as much as D: it is the control proving the checker
    genuinely discriminates, so C and D isolate the wrap rather than a broken checker.

    **The durability inversion.** This entry said `preserve` is the safer state and `always` adds a
    trigger. Measured against Prettier 3 at `printWidth: 96`, that is backwards, because Prettier
    treats a Markdown link as an **atomic inline node**:

    - `--prose-wrap always` on a title hand-broken across two lines **re-joins it** and moves the
      whole link onto its own line. An adversarial case with the title broken in _two_ places healed
      completely. The formatter cannot insert a newline inside `[...](...)`, so under `always` a
      mid-title break is neither creatable by the formatter nor survivable.
    - `--prose-wrap preserve` returns the broken title **byte-identical**. The formatter is
      contractually obliged to leave it exactly where the author put it.

    So `preserve` is not the mitigation — it is the state in which a bad break is durable,
    invisible, and looks deliberate in review, while `always` is self-healing for this failure mode.

    **This does not reverse finance's `proseWrap` recommendation, and should not.** That decision
    rested on 399 of 592 files reflowing and a one-word edit costing 5 changed lines instead of 1 —
    a far broader consideration than one failure class, and semantic line breaks remain worth
    keeping. The honest statement is narrower: **`preserve` shifts this error class onto authors and
    simultaneously removes the mechanism that would repair it.** The fix belongs in the checker, not
    in the format setting — which makes the near-miss detector above the right remedy rather than a
    nice-to-have, since under `preserve` nothing else will ever catch it.
    A near-miss warning is the cheaper fix and converts a silent gap into a visible one, which is
    the same argument this document makes about `rules-of-hooks`: **the dangerous lint result is the
    one that says nothing.**

    **Corollary, found while writing the paragraph above.** Quoting the broken citation verbatim as
    an example made this document fail the check with `claimed: Assurance\nprecedence`. The pattern
    cannot distinguish a citation from a quotation of one, so **prose about miscitation is parsed as
    miscitation** — the guide documenting the trap trips it. Worked around here by describing the
    wrap instead of reproducing it, which is a worse document. A skip marker for fenced or inline
    examples would fix it.

## Citation audit

Verified with `scripts/check-citations.mjs --review` at `v0.2.11`, run over all 804 markdown
files: **every ID valid, and every principle's true title matching the claim made about it.** The
wrong-meaning defect reported elsewhere in the org did not reach finance.

### Re-audited under machine-verified names (`v0.16.5`)

`v0.16.5` makes a stated title checkable: a parenthesised phrase beginning with a capital after an
`ENG-*` ID is read as a claim and diffed against `principles/index.json`. Finance had 35 such names
already, written in lowercase and therefore invisible to the checker. All 35 were re-derived from
the index before being capitalised, and **all 35 were already correct** — no wrong-meaning citation
existed to find. They are now machine-verified rather than merely right:

```powershell
node scripts/check-citations.mjs docs --index <pinned-index> --review
# 66 citation(s) across 34 principle(s) in 441 file(s); all IDs exist, and 31 stated name(s) match.
```

**31, not 35, because the count is of unique IDs.** Five names are cited in more than one file —
`Versioned performance budgets` in three, `Assurance precedence` in three. Worth stating because a
count that is lower than the number of names you just wrote reads exactly like five silent
failures, and the exit code alone does not distinguish "deduplicated" from "rejected".

Mutation-tested rather than assumed. Retitling `ENG-PERF-001` to another principle's real title
fails with a `claimed:`/`actual:` diff and **exit 1**; restoring it returns **exit 0**. The guard
is live.

### One name was silently unverified — and I misattributed the cause

`docs/guides/accessibility.md` cited `ENG-PERF-009` with its title stated, and that title was split
between its two words across a line break. Upstream's pattern excludes newlines
(`[^)/#\n]{2,59}`), so a wrapped name is **not read as a claim at all**. It does not fail; it stops
being checked. Exit stays 0, and the "stated names match" count silently drops by one. Unwrapping
that one line moved the verified count 30 → 31 and the "read as named but missed" count 1 → 0.

**That much is confirmed. The cause originally recorded here — "Prettier's reflow split it" — is
wrong, and is retracted.** Prettier cannot have done it. Three checks, prompted by a sister repo
pointing out that the trap needs `proseWrap: 'always'` to fire from a formatter:

1. `resolveConfig` on that exact file returns **`proseWrap: "preserve"`**, `printWidth: 96` —
   finance resolves its Prettier options from the vendored shared config via `package.json`.
2. Formatting a deliberately over-long paragraph containing a named citation is a **no-op**: 3
   lines in, 3 lines out, nothing reflowed.
3. `git show aa730191:docs/guides/accessibility.md` — the commit that introduced the citation —
   shows it **already split across two lines when authored**, and lowercase (`(assurance
precedence)`), so at that point it was not a name claim at all. The break predates any format
   pass over it.

**The real mechanism is worse, because it is the one this repo actively encourages.** With
`proseWrap: preserve`, Prettier never reflows prose, so authors wrap by hand to a ~96-column
convention — and a hand wrap is now the _only_ thing that can split a title. This document argued
for `preserve` fleet-wide and won the reversal, so **the format decision recorded here as a success
is the same decision that creates the exposure**. That is not an argument against `preserve`; the
reflow measurement behind it (592 files, 399 reflowing, 1 line vs 5 for a one-word edit) still
stands. It is an argument that the two findings interact, and the interaction was invisible while
the cause was misattributed to the formatter.

The correction also changes who is exposed. Under the original account the trap fires on any repo
that runs the format pass. Under the correct one it fires on **authors**, in every repo, and
`proseWrap: 'always'` merely adds a second, mechanical trigger on top. Repos on `preserve` are not
safe from gap 18 — they are exposed to it in the way that is hardest to see, because a hand wrap
looks deliberate in review.

**A later measurement inverts even that.** The sentence above still treats `always` as an
additional trigger. It is not one: Prettier treats a Markdown link as an atomic inline node, so
`--prose-wrap always` cannot insert a newline inside `[...](...)`, and re-joins a title an author
broke by hand — verified on a title broken in two places, which healed completely. `preserve`
returns the same broken title byte-identical. `always` is therefore self-healing for this failure
mode and `preserve` is the state in which the break is permanent. The exposure is not merely
"authors as well as formatters"; it is that the setting finance argued for is the one that removes
the only automatic repair. The reflow measurement still justifies `preserve` on balance, but the
remedy has to be the checker, because under `preserve` nothing else will ever catch this.

Two mitigations, neither owned here: match across newlines in the pattern, or have `--review`
report near-misses — an `ENG-*` ID followed by a parenthesised capitalised phrase that the strict
pattern rejected. The second is cheap and turns a silent gap into a warning. Filed as **gap 18**.

The method lesson is the recurring one in this document, applied to myself for the third time: the
observation (a split title, a dropped count) was real and reproducible, and the **causal story
attached to it was assumed rather than tested**. One `resolveConfig` call would have falsified it
immediately. Prefer checking the mechanism you are about to name over the one that fits the
narrative.

**This is not wired into finance's CI**, deliberately. The checker resolves
`principles/index.json` over the network by default, and gap 15 objects to exactly that — network
I/O inside a lint gate. Running it in CI would contradict a finding this document makes two
sections earlier. It is run manually on any PR that touches citations, and the command is recorded
above so the result is reproducible.

> **`v0.2.11` is a real tag.** An upstream audit reported this citation as pointing at "a tag that
> never existed". It does exist: `git ls-remote --tags` returns **39 version tags**, `v0.2.11`
> among them, contiguous with `v0.2.10` and `v0.2.12`. Left as a literal deliberately — it records
> which version of the checker produced the result below, and a resolver would silently re-point
> that claim at a different tool on every read. **Instructions should resolve; evidence should
> pin.**

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
  `ENG-PERF-009` (Assurance precedence) forbids trading accessibility away for performance. It is
  not the source of the WCAG 2.2 AA commitment; it constrains what may be done to it.
- Test colocation is named as a finance convention; the obligation it serves is `ENG-TEST-003`
  (Regression boundaries).

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

## ADR corpus audited against the decision/observation test

Upstream drew a distinction worth testing: an ADR records a **tradeoff you chose**, whereas
behaviour of a tool or platform you don't control is shared guidance, not a decision record. The
stated test is whether you could have chosen otherwise. `ENG-ARCH-003` (Durable decisions)
supports it — "Record consequential architectural tradeoffs as ADRs before treating them as durable
constraints" — and its **evidence clause carries a second exclusion the framing omits**: "routine
implementation choices do not create records". So there are two ways to file a non-decision, not
one. External facts are the more seductive failure; routine choices are the more common one.

Finance's 25 ADRs were measured against it rather than reasoned about. A cheap discriminator does
most of the work: **an ADR recording a choice names what it rejected.** Checking every ADR for
`Decision`, `Alternatives Considered`, and `Consequences` headings —

| Result                     | Count  |
| -------------------------- | ------ |
| All three sections present | **24** |
| None of the three          | **1**  |

The single outlier is **ADR-0009**, and it is exactly the shape upstream describes: 811 lines
titled "Legal, Licensing & Monetization **Analysis**", most of it an account of licence law,
trademark availability, export-control thresholds and App Store policy — none of which finance
chose or can change. One real decision (BUSL-1.1) sits inside it in a subsection called
"Recommendation".

**The predicted decay had already happened, and in both directions.** This is the part worth
recording, because it converts the upstream argument from plausible to demonstrated:

- The ADR's recommendation line specified a **3-year** change date. `LICENSE` says **four**
  (`Change Date: 2030-03-08`). The document that is supposed to govern the artifact had drifted
  from it, while still carrying `Status: Accepted`.
- Checklist item 6, SPDX identifiers in the three `build.gradle.kts` files, was marked
  **outstanding**. All three already carry `// SPDX-License-Identifier: BUSL-1.1`. Verified by
  reading the files.

Neither error is visible from inside the document; both are only visible by checking the ADR
against the thing it describes. That is the cost upstream names — the facts go stale while keeping
the authority of a decision nobody revisits — and it lands hardest on the ADR that is mostly facts,
because there is so much more of it to go stale and no `Decision` heading to anchor what is
actually binding.

**Fixed, without rewriting history.** ADR-0009 now opens with a `## Decision` section stating the
one durable choice, naming `LICENSE` as the authority where the two disagree, giving the rejected
alternative (AGPL-3.0 + CLA) and the consequence accepted in exchange (not OSI-approved, so the
README must not call the project open source unqualified). The 2025 recommendation text is left as
written and marked superseded rather than corrected in place — an ADR records the judgement that
was made, not a tidied version of it. §§3–8 are explicitly scoped as context with no authority to
constrain future work, and each future action taken under them is directed to its own ADR citing
this one.

Two things this does **not** do. It does not delete the analysis: the material is useful and the
fault was its status, not its content. And it does not renumber or split the record, because
inbound links and the ADR index refer to 0009 and a split would trade a scoping problem for a
provenance one.

**The generalisable finding:** applying the test cost one grep across 25 files, and the value came
from what the outlier revealed rather than from the classification itself. A document that fails
the decision/observation test is worth auditing for drift **first**, before deciding what to do
with it, because a corpus of observed facts filed as decisions decays silently and the decay is
what actually hurts.

## A false exemption survived in ten files while its retraction reached one

Upstream's `v0.21.0` broadcast reported that a `copilot-instructions.md` claiming a TypeScript
5.9.3 incompatibility had been steering every agent away from a working type-check gate. Most of
that message described work finance never did — see the misattribution note below — but **this part
was true here**, and checking it turned out to be worth more than the original claim.

**The claim, measured.** finance's docs stated that TypeScript 5.9.3 rejects the
`ignoreDeprecations` compiler option locally, so `npm run type-check` and `npm run ci:check` fail
even on clean code, and agents should therefore check only format and lint before pushing. Every
load-bearing element is false:

| Claim                            | Measured                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Compiler is TypeScript 5.9.3     | **6.0.3**                                                                     |
| `ignoreDeprecations` is rejected | `apps/web/tsconfig.json` sets `"ignoreDeprecations": "6.0"`; 6.0.3 accepts it |
| `npm run type-check` fails       | exit **0** (turbo, 3 packages in scope, 1 task)                               |
| `ci:check` unusable locally      | `tsc -p apps/web/tsconfig.json --noEmit` → exit **0**, no output              |

**The clean result was proved, not assumed.** A healthy tree and a compiler that aborted before
checking anything produce the same exit code and the same empty output, so a passing type-check is
not by itself evidence the type-check ran. Planting
`const planted: number = "definitely not a number";` under `apps/web/src` produced `TS2322` and
exit **2**; removing it returned exit 0. The gate genuinely runs and is genuinely clean. This is
the same discipline as the harness-versus-code distinction recorded elsewhere in this guide: a
summary line is a claim about the harness until something makes it a claim about the code.

**The part upstream did not have.** Their framing is that a wrong "known issue" is self-reinforcing
— each agent that honours the exemption skips the command that would falsify it, so the claim is
never retested. Correct, and finance is a worked example of a second-order version:

> **A retraction does not propagate along the same paths the claim did.** The correction had
> already landed in `.github/copilot-instructions.md`. Grepping for `5.9.3` found the claim alive
> in **nine other files** — `ci-monitoring.md` (the hub every other doc linked to for it),
> `workflow.md`, `agent-cookbook.md`, `troubleshooting.md`, `pain-points.md` (as open pain point
> PP-0018), `fleet-operations.md` (twice), `fleet-ci-analysis.md`, `worktrees.md`, and
> `workflow-metrics.md`. Fourteen occurrences in total. An agent reading any of the canonical
> workflow docs would still have been told to skip the gate.

Worse, the retraction had been applied to the _statement_ while leaving its _consequences_ in place
two lines above it: `copilot-instructions.md` still listed the format+lint subset as "preferred over
`npm run ci:check` — see Known Local Issues", pointing at the very section that now says the issue
was never real. The exemption had also propagated into a **metric definition** —
`workflow-metrics.md` excluded type failures from avoidable-CI-failure rate on its authority, so the
false claim was quietly improving a number finance reports on itself.

**What this changes for adoption.** `ENG-TEST-004` (Distinct static signals) requires format, lint
and type-check to report independently. finance's `ci:check` satisfies the structure, but a
documented exemption that stops anyone running one of the three signals defeats it just as
thoroughly as merging them would. The exemption is withdrawn; PP-0018 is marked withdrawn rather
than deleted, so the corpus keeps the lesson.

**Generalisable, and offered upstream:** when retracting a documented exemption, grep the repo for
the claim before considering it retracted, and check the guidance it _caused_ as well as the claim
itself. Fixing the sentence is the cheap half. Recorded here because the ratio — one file corrected,
nine still asserting it — is the useful number, not the retraction.

### Retracted: the "misattribution" claim was itself the error

An earlier revision of this section claimed the `v0.21.0` broadcast had misattributed four things
to finance — a TypeScript 6.0.3 / `TS5101` / `baseUrl` false-clean report, "838" in-bounds indexed
reads, "your 2,691", and a `reactConfig()` diff of "266 findings" — and asserted that **"finance
filed none of those"**, calling it a fourth mirror error and asking upstream to go find the real
reporting repo. **Every part of that is wrong and it is retracted.** Checked against this file:

| Attributed                                                        | Actually finance's?                 | Where                                                                    |
| ----------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| TS 6.0.3 / `TS5101` / `baseUrl` aborts before checking            | **Yes**                             | gap 3, including both proposed fixes                                     |
| "drop `baseUrl`, make `paths` tsconfig-relative — the better fix" | **Yes**                             | the same entry, in those words                                           |
| `types` replaces rather than merges                               | **Yes**                             | gap 4                                                                    |
| 838 in-bounds indexed reads                                       | **Yes**                             | the `noUncheckedIndexedAccess` breakdown, 1,853 test / 838 production    |
| 2,691                                                             | **Yes**                             | the `@jrmoulckers/tsconfig` trial                                        |
| "266 findings"                                                    | **finance's own superseded number** | the from-source reconstruction, retracted here for under-counting by 19% |

Only the last has anything wrong with it, and it is not a misattribution: 266 was finance's own
figure before the measurement against the published artifact returned **317**. Upstream was quoting
a number finance had published and later withdrawn — the fix is for finance to say "use 317", not
for anyone to go looking for another repo.

**The claim that `baseUrl` "cannot be finance's" was the worst of it**, and it was reasoned rather
than checked: `apps/web/tsconfig.json` carries `baseUrl` _and_ `ignoreDeprecations: "6.0"` and
type-checks cleanly, so I concluded finance could not have reported the combination aborting. But
gap 3 is a report about **`@jrmoulckers/tsconfig`'s `base.json`**, which sets no
`ignoreDeprecations` — a consumer extending that chain while keeping `baseUrl` is the aborting
case. finance's own tsconfig is clean _because it does not extend the shared chain yet_. The
observation was true and the inference from it was invalid.

**Why this matters more than the error itself.** Every other correction in this document was
produced by checking a primary artifact — the index, the tarball, `resolveConfig`, the compiler,
the checker. This one was produced by consulting my own session notes about what finance had
reported, and asserting from them. The guide recording the finding was in the repository the whole
time, and one grep would have falsified the claim before it was sent. **A summary of your own work
is a secondary source and decays like any other.** Filed here as the fifth instance of this
document's recurring failure — a real observation welded to an unverified story — and the first
where the unverified story was about _me_.

There was also a live cost: upstream was told to go find the reporting repo and re-check its
numbers, which is wasted work created out of nothing. Corrected to them directly.

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

  **Opened upstream** as a PR against `jrmoulckers/engineering` — one file, `+143/−8`, with three
  further sections requested by the engineering session: a named baseline device in the versioned
  budget under `ENG-PERF-002` ("a native budget without a named device is unfalsifiable"),
  profile-to-diagnose versus benchmark-to-gate with a gating-harness table, and carrying the
  `ENG-OBS-004` correlation identifier into `os_signpost` / `Trace.beginSection` / JFR regions.
  Verified before opening: `check-citations.mjs` and `check-coverage.mjs` both pass, coverage
  unchanged at 59/66 with the 7 known gaps intact, every new `ENG-*` ID anchored in an `^#{2,6}`
  heading because the ratchet counts nothing else, and `principles/` and `docs/ratification/`
  untouched — both are sealed by path and hash.

  **Two of the citations in the draft were wrong, and existence-checking would not have caught
  either.** The draft claimed `ENG-TEST-004` "requires the gate to be automated and deterministic"
  (it separates static signals from behavior tests) and that `ENG-OBS-004` "requires structured
  logs to carry a stable operation name" (it requires propagated correlation identifiers that are
  unique, bounded, and unrelated to sensitive identity). Both IDs exist, both were cited in
  plausible contexts, and both claims were false. They were caught only by reading the `statement`
  and `evidence` fields out of `principles/index.json` rather than inferring from the titles —
  "Distinct static signals" and "End-to-end correlation" both _sound_ like they support the claims
  made. **Read the statement, not the title**, and treat a citation as a quotation rather than a
  label.

  **A defect was reported against upstream from that same worktree, and there was no defect.** The
  report was that `npm test` failed on five files in `packages/eslint-config` and
  `packages/prettier-config`, that stashing the change and re-running on clean `main` reproduced it
  identically, and that green CI was therefore hiding a real failure. Every part of that is
  checkable and the conclusion is still wrong. The failures were all `ERR_MODULE_NOT_FOUND: Cannot
find package 'prettier'` — resolution, not assertion — and the worktree had no `node_modules` at
  all. Running `npm install` at its root took the suite to **154/154 passing**. The test count is
  the tell: it went 79 → 154, so the original run was not five failures out of a complete suite, it
  was a suite that could not load half its files.

  Two method lessons, both cheap and both generic:

  - **CI passing where a fresh worktree fails is evidence _for_ an uninstalled tree, not against
    it.** CI runs `npm ci` first; the install is precisely the variable CI controls and a new
    worktree does not. That observation was read as "CI is blind" when it was the diagnosis.
  - **`git stash` controls for the patch, not for the environment.** A missing `node_modules` is
    invariant under stashing, so re-running on clean `main` could only ever return "identical
    failures". The control was real but orthogonal to the hypothesis it was taken to test.

  Same shape as the probe-harness error recorded above: in both cases the summary line — an exit
  code, a pass/fail count — was taken as the finding without reading the error underneath it.
  **Read the failure text before attributing the failure.** Note also that `npm install` rewrote a
  line of `package-lock.json`; that was reverted so it did not ride along in the upstream PR.

  **The author's own post-mortem sharpened all three points, and the sharper forms are worth
  keeping.** They accepted the correction, retracted the finding, reproduced 154/154 themselves and
  confirmed the mechanism (`prettier` is a peer of `prettier-config` with no dependency entry and no
  root install, so it cannot resolve). Three refinements:

  - **The root cause was output truncation, upstream of the bad inference.** They had run
    `npm test ... | Select-Object -Last 20`, which shows only the summary lines, so
    `ERR_MODULE_NOT_FOUND` was on screen the whole time and never read. Every downstream step was
    inference over a symptom nobody had inspected. Truncating a command's output is not a display
    choice — it decides what evidence exists. Tail the summary to _find_ a failure; read the body
    before _explaining_ one.
  - **A control that cannot produce a distinguishing result is not evidence, it is a ritual.** This
    is the general form of the `git stash` point and it is better than the version above: the
    problem is not merely that the control was orthogonal, it is that it was _structurally
    incapable_ of returning anything except "identical", so its confirmation carried no
    information while feeling like rigour. This is exactly the argument
    [`ENG-TEST-008` (Discriminating mutation evidence)](https://github.com/jrmoulckers/engineering/blob/main/principles/assurance/testing.md)
    makes about a test never observed failing — and, as they noted, they had applied that principle
    to the PR's prose the same morning without applying it to their own reasoning. **Before running
    a control, name the result that would falsify the hypothesis. If there isn't one, it isn't a
    control.**
  - **The priors were backwards.** Green CI plus a red local run was read as "CI is blind" rather
    than "my tree is broken", which prefers the hypothesis where the shared, controlled, reproducible
    environment is at fault over the one where the local, uncontrolled, hand-assembled one is. The
    default should run the other way.

  Recorded because the failure is not specific to that session: this guide has four instances of the
  same shape, and in every one a real observation arrived welded to an unverified causal story.

- **`.gitattributes` line-ending carve-out for Windows batch files.** The shared Prettier config
  sets `endOfLine: 'lf'`, which requires a `.gitattributes` to avoid `format:check` passing in CI
  and failing on every Windows checkout. finance already has one, and it goes further than the
  bare `* text=auto eol=lf` being recommended: it adds `*.bat`/`*.cmd text eol=crlf`. Forcing LF
  on batch files can break `cmd.exe` parsing, so the bare snippet trades one Windows-only failure
  for another. The carve-out belongs in the recommendation.
