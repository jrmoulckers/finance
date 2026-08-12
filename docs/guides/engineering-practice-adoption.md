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
installed. `@jrmoulckers/eslint-config` stays on the registry because it owns four runtime
dependencies that consumers must not re-choose. **finance has adopted the Prettier half.**

> **Retracted:** this paragraph previously added "so they need no registry, no token, and no
> `read:packages` grant," attributing that to an upstream `channel: vendored` field. **All three
> packages are and always have been published to the registry, and all three require a token** —
> upstream's `versions.json` now says so in terms ("THEY WERE RIGHT AND THIS FILE WAS WRONG").
> What makes finance's Prettier adoption work is **transport, not channel**: `vendor-configs.mjs`
> fetches `raw.githubusercontent.com/<repo>/<ref>/<path>`, which is unauthenticated repository
> content and has nothing to do with GitHub Packages. That distinction is the load-bearing one and
> it survives the retraction unchanged. See _Blocker 1_ for how finance's own measurement had
> already falsified the claim.

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

### 13 of the ignore entries were inert, and one of them was mine

Upstream advised adding `.npmrc` to `.prettierignore`, then retracted it. Rather than take either the
advice or the retraction, I measured: removed the entry and re-ran `format:check` — **exit 0**. The
mechanism is that Prettier only considers files it can infer a parser for, and `.npmrc` has none;
naming it explicitly exits **2** with `No parser could be inferred`, which is a crash rather than a
lint failure. So the entry never suppressed anything.

**Nor could it ever have.** Upstream later asked whether the entry had been added in response to a
real failure and was therefore masking whatever actually caused it. The git record forecloses that:
`.npmrc` and its ignore entry were introduced in the **same commit** (`58782b2`, the initial
adoption), the file has never been deleted, and there is exactly one `.npmrc` in the tree. So there
is no commit in finance's history in which `.npmrc` existed without the entry — no interval in which
a failure could have occurred, and nothing for the entry to have fixed. It was prophylactic from the
moment it was written, which is precisely why removing it changes nothing.

Removing the whole no-parser class at once — `*.jar`, `*.apk`, `*.aab`, `*.sql`, `*.kt`, `*.kts`,
`*.swift`, `Caddyfile`, `Caddyfile.*`, `*.env`, `*.env.*`, `.env*`, plus `.npmrc` — also leaves
`format:check` green. **Thirteen of this file's entries have no effect** under `prettier --check .`,
because they defend against a parser that does not exist. There are no Prettier plugins configured
(the vendored config declares none), so the built-in parser set is the whole story.

**Correction to the sentence above, caught after it merged.** It originally read "no effect … in any
invocation mode", which is an overclaim I had not tested. Prettier **does** honour `.prettierignore`
for files named explicitly on the command line, so under an explicit invocation these entries are
load-bearing: without them, `prettier --write .npmrc` exits 2 instead of being skipped. The removal
is nonetheless safe, and the reason is a third invocation path I should have checked before
generalising — `lint-staged`, which is the only thing in finance that passes Prettier explicit
filenames. Its two patterns are extension-scoped:

```json
"*.{ts,tsx,js,jsx,mjs}":            ["eslint --fix", "prettier --write"],
"*.{json,yaml,yml,md,css,html}":    ["prettier --write"]
```

`.npmrc` has no extension and matches neither, as do `Caddyfile`, `*.kt`, `*.swift` and the `.env`
forms. So the claim that survives measurement is the narrower one: the entries are inert under
**finance's three actual invocations** — `--check .`, `--write .`, and extension-scoped lint-staged —
not under every possible one.

Only `.npmrc` is removed. The other twelve stay, for a reason that is about readers rather than
about Prettier: `.github/copilot-instructions.md` and `AGENTS.md` both tell agents that
"`.prettierignore` covers `*.kt`, `*.kts`, `*.swift`, `Caddyfile`, `*.env*`". Deleting entries the
repo's own instructions promise are there would contradict documented policy to remove lines that
cost nothing. `.npmrc` is **not** in that documented list, so removing it restores consistency with
it rather than breaking it.

The transferable point is about the shape of the original advice. "Add this to `.prettierignore`" and
"remove it again" are both instructions about a file, and neither is checkable by reading the file —
the entry's effect depends on the **script**, and finance's is `prettier --check .`, the invocation
under which the entry is inert. A glob like `--check "**/*"` would make it matter, and would
simultaneously make it useless: **1,633 of finance's 5,520 tracked files** have no Prettier parser,
so a thirteen-line ignore list defends against under one percent of what such a glob would hit. The
fault would be the glob, not the ignore file.

**And the fix for that glob is a flag, not an ignore list.** `--ignore-unknown` makes Prettier skip
any file it cannot infer a parser for. Verified on the same file that motivated all of this:

```
npx prettier --check .npmrc                     → exit 2  ("No parser could be inferred")
npx prettier --check --ignore-unknown .npmrc    → exit 0  (skipped)
```

That is the substantive difference between the two remedies: an ignore entry suppresses one named
path, while `--ignore-unknown` covers the entire 1,633-file unparseable set and converts a **tooling
exit 2** into an ordinary formatting result. finance needs neither, because `--check .` already only
selects files with a parser. Recorded so that if the script is ever widened to a glob, the flag is
reached for rather than the ignore file.

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

**The version counts above are the falsifying evidence for a claim recorded elsewhere in this same
document.** A package with 3 and 2 published versions is, necessarily, published. Yet the Prettier
section asserted for several revisions that `tsconfig` and `prettier-config` were `channel:
vendored` and therefore needed no token — copied from upstream and never reconciled against the
probe two hundred lines earlier. Upstream has since retracted it: all three are `private: false`
in name only, `publish.yml` publishes every directory under `packages/` without consulting
`channel`, and all three are gated on the same visibility grant. Upstream's own words are "THEY
WERE RIGHT AND THIS FILE WAS WRONG," and finance was one of the three repositories that reported
it.

The lesson is not "check upstream claims" — that was already the practice, and is how the probe
came to exist. It is that **finance held the measurement and the contradicting claim in one
document and the adjacency did nothing.** Co-location is not a check. Two statements only conflict
when something evaluates them together, and nothing here did; the probe answered "is it visible?"
while the claim answered "must it be installed?", and no reader had cause to put them side by
side. This is the same defect upstream names about its own file — an explanation sitting next to a
value checks nothing unless something checks the value — and it is the reason the range table now
carries the URL it was read from rather than the value alone.

What survives unchanged is the operative fact, because it never depended on `channel`:
`vendor-configs.mjs` fetches `raw.githubusercontent.com/<repo>/<ref>/<path>`. That is
**unauthenticated repository content, not the registry**, which is why vendoring succeeds today
while `npm view @jrmoulckers/eslint-config` returns `E401` from this machine. Vendoring was chosen
for ref-pinning and drift detection, before access was understood to be a constraint at all; it
turns out to be the only auth-free path to any of the three, which makes the decision more right
than the reasoning that produced it.

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

**Scope note: this section now applies to `@jrmoulckers/eslint-config` alone** — but for a reason
that has been corrected. All three packages are on the registry and all three need the same token;
`prettier-config` is nonetheless adopted because vendoring fetches raw repository content rather
than the registry, and `tsconfig` is deferred on its own evidence, not on access.

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

4. Depend on the current floors as **ranges, not carets**. Values below were read from
   `https://raw.githubusercontent.com/jrmoulckers/engineering/main/versions.json` — the URL is
   recorded beside them deliberately, because a version written into a document ages and a reader
   needs the way to re-derive it, not just the value:

   | Package                        | Range             | Note                                                    |
   | ------------------------------ | ----------------- | ------------------------------------------------------- |
   | `@jrmoulckers/eslint-config`   | `>=0.12.0 <1.0.0` | plus three plugins in `devDependencies`, see below      |
   | `@jrmoulckers/tsconfig`        | `>=0.4.0 <1.0.0`  | registry channel; not installed here — deferred on cost |
   | `@jrmoulckers/prettier-config` | `>=0.3.0 <1.0.0`  | registry channel; vendored here by ref + lock instead   |

   The React preset and `vite-react.json` first shipped in `0.2.0`, as did `prettier-config`'s
   reversal to `proseWrap: 'preserve'`; `eslint-config@0.4.0` is the first release installable on
   ESLint 10 (see Blocker 2), and `0.6.0` the first in which the React preset can reach type-aware
   rules at all. `0.7.0` and `0.8.0` are both no-ops for finance — see below — but are taken as the
   floor anyway, because there is no cost to either and a stale floor is a liability the moment a
   later fix lands.

   **A latent break the same read exposed: finance's TypeScript caret outruns the preset's peer.**
   `versions.json` publishes each package's `peerDependencies`, and reading it needs no registry
   token — which is the whole point, since `npm view` answers `E401` from this machine and could
   not have produced this. finance resolves TypeScript **6.0.3**, declared `^6.0.3` in
   `apps/web/package.json` (the only declaration in the tree; there is no root one):

   | Preset                       | `typescript` peer                | 6.0.3 today | Permitted by `^6.0.3` but rejected by the peer |
   | ---------------------------- | -------------------------------- | ----------- | ---------------------------------------------- |
   | `@jrmoulckers/eslint-config` | `>=5.5.0 <6.1.0`                 | satisfied   | **`6.1.0`, `6.4.0`, `6.9.9`**                  |
   | `@jrmoulckers/tsconfig`      | `^5.5.0 \|\| ^6.0.0 \|\| ^7.0.0` | satisfied   | none                                           |

   So adoption is safe **today** and breaks on the next TypeScript minor: `^6.0.3` will pick up
   `6.1.0` on any fresh install, and `eslint-config`'s peer refuses it. That refusal is now
   enforced rather than advisory, because `0.12.0` restored the framework plugins as real
   `peerDependencies` and npm version-checks ranges again. The failure would arrive as a broken
   install on an unrelated dependency bump, far from any change to linting.

   **The two presets also disagree with each other**, which is an upstream question rather than a
   finance one: `tsconfig` accepts all of TypeScript 6.x and 7.x, `eslint-config` stops at
   `<6.1.0`. A consumer adopting both is silently governed by the narrower cap. Either the cap is
   deliberate — in which case `tsconfig` is over-permissive and a suite that is supposed to be
   adopted together does not agree on its own supported compiler — or it is a stale upper bound
   that has not been widened since TypeScript 6 shipped. Flagged upstream; finance takes no local
   workaround, because pinning TypeScript to dodge a peer cap would trade a loud install failure
   for a silent version freeze.

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

   **Retracted: "finance is not one of the caret cases."** Upstream has twice attributed a planned
   `^0.2.0` to finance, and twice this guide's author denied it upstream — "I was never the repo
   that caret-ised it," "I'm not one of your nine." **Both denials were false, and upstream was
   right both times.** The evidence is this document's own history:

   ```powershell
   git show 0e7344c0:docs/guides/engineering-practice-adoption.md
   # 4. Depend on the current floors: **`@jrmoulckers/eslint-config@^0.8.0`**,
   #    **`@jrmoulckers/tsconfig@^0.3.0`**, **`@jrmoulckers/prettier-config@^0.2.0`**.
   ```

   Corrected in `ae36d0ca` (#4084), which is why the working tree is clean today.

   **The instrument was `git grep`, and it cannot see the period being asked about.** It reports
   the checked-out tree; the claim was about what finance had ever planned. Zero carets today is
   entirely consistent with having recommended three of them for eleven commits. This is precisely
   the rule stated elsewhere in this guide and credited as the sharpest formulation reached in this
   adoption — **a point-in-time observation cannot falsify a claim about the past** — committed by
   the person who wrote it, against an external party who had the history right.

   Two aggravating details, both of which make this worse than an ordinary mistake:

   - **The disproof was already in this file**, forty lines above, in the paragraph beginning "This
     document previously recommended `^0.8.0`, `^0.3.0` and `^0.2.0`." The denial was written while
     editing the same section. That is the identical defect diagnosed one pull request earlier
     about the vendored-channel claim — a measurement and its contradiction in one document, with
     nothing evaluating the pair — so **co-location is not a check** now has an instance where the
     author had just finished naming it.
   - **It cost the other side twice.** Upstream was told its record of finance was wrong, and
     `versions.json` carries a numbered census of caret cases used to justify a test. Denying
     membership in that census argues, on false evidence, for weakening the very guard that would
     have caught finance.

   The general form is worth keeping, because it is not about carets: **a repository's own history
   is a primary source about it, and its working tree is not.** `git log -S<literal>` answers the
   question `git grep <literal>` only appears to.

   Two ranges above are not currently pinning anything, for different reasons.
   `prettier-config` is vendored at a ref and pinned by `engineering-configs.lock.json`, so for it
   the lock is the pin and a semver range describes nothing installed. `tsconfig` is not vendored
   and not installed, so **nothing** pins it here and its range is a floor to adopt at, not a
   present constraint. Both remain registry packages requiring the same grant; neither is exempt
   from access, only from current use.

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

**What that is for — and the stated mechanism is false.** This document previously carried upstream's
explanation verbatim: that `peerDependenciesMeta.optional: true` suppresses the _error_ for a missing
peer but "does not stop npm ≥7 auto-installing one it can resolve." **Upstream has retracted that**
(`eslint-config@0.12.0`, repo `v0.43.0`) after testing tarball installs into a bare consumer on npm
7, npm 11, pnpm 11, and pnpm with `auto-install-peers=true` — optional peers were installed in none
of the four. Required peers _are_ auto-installed, which is the asymmetry the false claim generalised
from. The sentence was wrong upstream and it was wrong here, having been copied rather than derived.

**But the retraction does not reconcile with the measurement below, and that is unresolved.** All
five framework plugins were already `optional: true` at `0.8.0` — verified against the published
manifest in the engineering history, `40cf05d^`:

```
peerDependenciesMeta:  @next/eslint-plugin-next optional=true, eslint-plugin-jsx-a11y optional=true,
                       eslint-plugin-react optional=true, eslint-plugin-react-hooks optional=true,
                       eslint-plugin-svelte optional=true
```

So "required peers auto-install" cannot explain a Svelte plugin appearing in a React consumer's
`0.8.0` tree, and neither can a transitive path: `0.8.0`'s regular `dependencies` are exactly
`@eslint/js`, `eslint-config-prettier`, `globals`, and `typescript-eslint`, none of which reach
`eslint-plugin-svelte` or `@next/eslint-plugin-next`. **Under the corrected mechanism, a bare
`0.8.0` install should have measured near the 36.7 MB bare-preset figure, not 75.0 MB.**

Measured here at the time, one scratch project:

| Install                                 | Size        | Svelte plugin | Next plugin |
| --------------------------------------- | ----------- | ------------- | ----------- |
| `eslint-config@0.8.0`, React consumer   | **75.0 MB** | present       | present     |
| `eslint-config@0.9.0` + 3 React plugins | **71.7 MB** | absent        | absent      |

**Status: the numbers stand as recorded, the "present" attribution does not, and the conflict cannot
be closed from here.** The scratch project is gone and the registry now returns `E401` for this
session — package read access is the standing blocker (#4038) — so the install is not re-runnable
until that clears. Applying upstream's own rule to this table: **a measurement is evidence for the
number, not for the cause.** `75.0 MB` and `71.7 MB` were read off `du`; "present" and "absent" were
the interpretation laid over them, and it is the interpretation that the corrected mechanism
contradicts. Recorded as an open question for whoever has registry access, rather than quietly
deleted — a row that disagrees with the explanation is the most informative thing on the page.

The one downstream claim that does not depend on the disputed rows: the saving for finance was
**3.3 MB, 4.4%**, not the 75 → 36.6 MB headline, because 36.6 MB is a bare preset no consumer can
lint from. That arithmetic holds whatever the cause turns out to be.

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

**What finance must do.** Pin `>=0.12.0 <1.0.0` and declare the plugins the React preset imports at
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

**One consequence stood, and has now reversed.** The peer range was the only machine-checkable
statement of the ESLint 10 constraint in Blocker 2 — `eslint-plugin-react: ^7.37.0`, whose own peer
caps at `eslint: … || ^9.7`, is what let npm refuse an unsatisfiable tree at install time. Moving it
to an inert field meant npm no longer checked it, and under `0.9.0`–`0.11.0` that obligation
transferred to the consumer. **`0.12.0` restores the five as optional `peerDependencies` and deletes
the bespoke `frameworkPlugins` key, so npm version-checks the ranges again** and the obligation
transfers back. Install size is unchanged either way, because the optional peers were never being
auto-installed — which is the whole content of the retraction above.

Upstream warns that anyone who pinned one of the five outside its supported range _during_ the
unchecked window will now get an install failure rather than silent mis-linting. **finance is not
exposed on either count.** Nothing is installed — `git grep '@jrmoulckers/' -- '*package.json'`
still returns zero — and the three ranges this document proposes are each inside the published
supported range:

| finance proposes                                | supported                        | inside |
| ----------------------------------------------- | -------------------------------- | ------ |
| `eslint-plugin-react: ^7.37.0`                  | `^7.37.0`                        | yes    |
| `eslint-plugin-react-hooks: ^5 \|\| ^6 \|\| ^7` | `^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0` | yes    |
| `eslint-plugin-jsx-a11y: ^6.10.0`               | `^6.10.0`                        | yes    |

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
5. **`practices/performance-budgets.md` covers no native or JVM profiling.** (**Closed upstream —
   `practices/native-profiling.md` now exists**, with the omissions noted below.) Its sections are
   delivery/runtime budgets and Lighthouse — yet `ENG-PERF-007` requires _platform-native_
   profiling. finance already documents Android Profiler + baseline profiles, Instruments +
   MetricKit + signposts, JFR + VisualVM + WPA, and a Gradle benchmark harness. That technique
   is general and belongs upstream.

   **Landed as a new file rather than as the proposed diff, and three pieces did not survive.** The
   text finance drafted was a +149-line extension to `performance-budgets.md`, sent upstream twice;
   what shipped is a separate `practices/native-profiling.md` of about half the length. It keeps two
   of the six drafted section headings verbatim and the load-bearing framing, so the draft clearly
   fed it. Verified by fetching the landed file and testing for each substantive claim:

   | Dropped from the draft                                               | Why it mattered                                                                                                                                                                                                                                                                           |
   | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | **The sampling floor** — no `sampling interval`, `sampled` vs traced | A sampling profiler resolves nothing below its interval, so diffuse cost appears as _absence_, not as a small number. A flat profile then reads as "this path is cheap." Sampled and traced captures of the same workload are also not comparable, and mixing them reads as a regression. |
   | **Thermal state and device tier**                                    | The two most common ways a native measurement silently lies. The same capture run twice under sustained load can differ by more than the regression being chased, and the engineer's own device is the one that hides it. `emulator` survived; the other two did not.                     |
   | **`ENG-TEST-008` — break the channel on purpose once**               | The strongest idea in the draft, and the through-line of this entire adoption: a field channel never observed failing is an assumption, and its output is identical in the healthy case and the blind case.                                                                               |

   The first two are the specifically **native** content — the reason a native profiling practice
   needs to exist separately from a web one — and the third is the discipline that makes any of it
   verifiable. Re-proposed upstream rather than restated here, since a practice may not be copied
   into a product repo.

   Note also that the finance-authored PR is **still open and unmerged** while its content ships
   elsewhere; flagged upstream so it is closed rather than landing a second time.

6. **No native-platform principle area.** The 66 principles span 11 areas — API, ARCH, BUILD,
   DATA, INT, LOCAL, OBS, PERF, SEC, TEST, WEB. `WEB` covers browser frontends; **nothing covers
   native application surface.** Searching the whole principles corpus for `mobile|Android|iOS|
desktop|Kotlin|Swift|multiplatform` returns a single incidental match. finance ships **four**
   platforms, **three of them native** (Android, iOS, Windows/Compose Desktop), so only
   `apps/web` is addressed by a platform area at all.

   This compounds gap 3 rather than duplicating it: `ENG-PERF-007` demands platform-native
   profiling, the practice that would explain how is web-shaped, and there is no native area to
   host the obligation in the first place. Requesting an `ENG-NATIVE-*` (or `ENG-APP-*`) area.

7. **`scripts/check-citations.mjs` does not expand ID ranges.** (**Closed upstream in checker
   `v9`** — verified below.) The checker resolves literal IDs
   only, so a citation written as `` `ENG-OBS-001`–`ENG-OBS-007` `` is scanned as exactly two
   citations and the five in between are never verified. That is precisely where a
   wrong-meaning citation hides best: a range asserts something about every member while
   showing the reader only the endpoints. In this repository the ranges concealed five IDs
   (`ENG-OBS-002`–`006`, `ENG-DATA-002`) — all correct on manual check, but invisible to the
   tool that exists to check them. Requesting that the checker either expand `NNN`–`NNN` ranges
   within an area or warn that it cannot.

   **Verified closed** against `check-citations.mjs` at `1607a6d` (`TOOL_VERSION 9`), which lists
   `range members` in its checks-run line. Both directions were tested, because a pass alone would
   not have distinguished "expands ranges" from "still ignores them":

   | Probe                                                       | Result                                              |
   | ----------------------------------------------------------- | --------------------------------------------------- |
   | `OBS-005` through `OBS-009`, prefixes elided (OBS ends 007) | **exit 1**, naming the two nonexistent members      |
   | `ENG-OBS-001`–`ENG-OBS-007` (valid)                         | exit 0, **7 citations from 2 endpoints** — expanded |

   The second row is the load-bearing one: under the old behaviour it would have reported 2. Over
   finance's whole tree the checker now reports **92 citations across 34 principles in 441 files,
   35 stated names, exit 0**.

   **The `ENG-` prefixes in the first row are elided deliberately, and that is itself a finding.**
   Written in full, the invalid probe range trips the checker _in this guide_ — the run above
   initially exited 1 against this very file, flagging the two members of a range that is being
   **quoted as a failing example**, not asserted as a citation. The checker cannot distinguish
   mentioning a citation from making one. That is the correct trade for a tool whose job is to
   catch unverifiable claims, but it means the guide documenting a citation defect cannot state the
   defect in its own notation. Worth an upstream escape hatch — a fenced block or an
   `<!-- citations: ignore -->` marker — since every repo that documents a bad citation will hit it.

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
    was short. Finance pins `>=0.12.0 <1.0.0`.

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

### The atomicity result was scoped to linked citations, and most citations are not linked

A sister repo pointed out that the paragraph above generalises a result obtained on **one** citation
form. That is correct, and the correction matters more than the original finding.

Two forms are in use. The **linked** form, `[`ID` (Title)](path)`, is what I tested — Prettier treats
a Markdown link as an atomic inline node, so it cannot break inside it. The **bare** form,
`` `ID` (Title) ``, is ordinary inline text with an ordinary break opportunity at every space, and it
is the form the upstream practice PR uses and the form all five of finance's own split citations
use. Prettier's atomicity protects the form almost nobody writes.

Swept both forms across 41 margin positions (filler padding 0–80, step 2) at `printWidth: 96` under
`--prose-wrap always`, with a deliberately wrong title in every fixture so that a check which _runs_
must exit 1. Exit code is the discriminator, because the summary sentence differs between
checked-and-failed and never-checked.

| Citation form                | Wrong name caught | Silently missed |
| ---------------------------- | ----------------- | --------------- |
| Bare — `` `ID` (Title) ``    | 25 / 41           | **16 / 41**     |
| Linked — `[`ID` (Title)](p)` | **41 / 41**       | 0 / 41          |

Three things this establishes that neither repo had:

1. **`always` does not merely fail to heal the bare form — it creates the defect.** On a correctly
   authored single line, with no author involved, the formatter inserts the break. So `preserve` is
   the safer setting for citation-bearing prose specifically, which is a second and independent
   reason for it beyond the 592-file reflow measurement.
2. **The misses are a contiguous band, not a scatter** — pads 30 through 60, and nothing outside it.
   Below the band the whole line fits; above it the citation is pushed wholly onto the next line
   intact. The hazard is precisely "the citation straddles the margin", which is why it feels random.
3. **There are two break sites, not one.** After the ID, and _inside_ the title (`(Mandatory` ⏎
   `coverage thresholds)`). A near-miss detector keyed only on ID-then-newline would miss the second,
   which accounted for the lower half of the band.

**Replicated upstream, with one genuinely new result and one mislabelled one.** The other session ran
the same protocol and reported `25/41` caught for the bare form and `41/41` for linked — identical to
the totals here. Two of its three observations refine this section; the third does not survive.

- **The band is a property of the sentence, not a constant.** Its band sat at pads 34–64 against
  30–60 here, both endpoints offset by 4. That is fixture wording, not mechanism, and it means the
  numeric range above should be read as illustrative. Re-running locally with different filler moved
  the band again — to 54–78 — which settles it: only the _shape_ (contiguous, closing at both ends)
  generalises.
- **The detector needs the union of two rules, not one rule plus a supplement.** Measured upstream
  against both sites: the ID-then-newline rule catches every after-the-ID case and **no**
  inside-the-title case; an unclosed-paren rule catches every inside-the-title case and **no**
  after-the-ID case, because where the break falls after the ID the parenthesis opens and closes on
  the same line. They are disjoint halves. A detector shipping either alone would be green across
  half the failure mode it exists to catch — the same defect this document keeps recording, one
  level up, in the instrument rather than the corpus.
- **Retracted by measurement: the claimed inversion.** That session reported the site-to-region
  mapping here as reversed — "you assigned inside-the-title to the lower half; it's the reverse" —
  and then stated its own result as inside-the-title at the lower 34–52 and after-the-ID at the upper
  58–64, which is the mapping it had just attributed to this document. **The two statements agree and
  the disagreement is in the label.** Its own mechanism paragraph settles the direction independently
  and in the same sense: as padding grows the citation slides right, so the margin falls progressively
  _earlier_ within it — deep inside the title first, then before the ID. Re-derived here rather than
  adjudicated between two prose claims:

  ```
  pad 54, 60, 66 → INSIDE-TITLE
  pad 72, 78     → AFTER-ID
  ```

  Inside-the-title occupies the low end, after-the-ID the high end, exactly as written above. Worth
  recording because the failure shape is one this document has not seen before: not a bad
  measurement and not a bad mechanism — both were right — but a bad **comparison** between two
  correct statements. Nothing in the data flags it, because the data is not what is wrong. Had it
  been acted on, it would have inverted a correct mapping on the authority of a correct experiment.

The linked form being 41/41 makes "prefer linked named citations" a **complete** mitigation under
`always`, not a partial one — though it is worth being precise about its limit: it defends against
the _formatter_, and under `preserve` a hand break inside a link is still unrecoverable. Links are
not a substitute for the detector; they remove one of the two authors of the defect. Upstream now
ranks the work in that order too — **detector first, link conversion second** — since `preserve` is
what both repositories run, and under `preserve` links defend against a hazard neither currently
faces while doing nothing about the one they do.

### Five live instances in finance, and they were correct only by luck

Searching finance's own corpus for the shape found **five**, in `docs/architecture/README.md`,
`docs/architecture/security-architecture.md`, `docs/guides/accessibility.md`,
`docs/audits/accessibility-audit-wcag22.md`, and this guide. Rejoining them onto one line moved the
whole-tree verified count **36 → 41** — five name claims that every human reviewer reads as verified
and the checker had never once checked. All five turned out to state the correct title, which is the
point: they passed on their content being right, not on anything having confirmed it. Fixed by
rejoining; Prettier reports the files unchanged afterwards, confirming `preserve` will not re-break
them.

Two mitigations, neither owned here: match across newlines in the pattern, or have `--review`
report near-misses — an `ENG-*` ID followed by a parenthesised capitalised phrase that the strict
pattern rejected. The second is cheap and turns a silent gap into a warning. Filed as **gap 18**.

The method lesson is the recurring one in this document, applied to myself for the third time: the
observation (a split title, a dropped count) was real and reproducible, and the **causal story
attached to it was assumed rather than tested**. One `resolveConfig` call would have falsified it
immediately. Prefer checking the mechanism you are about to name over the one that fits the
narrative.

**And the sweep above took two wrong detectors before it took a right one**, both of the same family
this document has now named five times — an instrument that cannot distinguish the two states it is
being used to tell apart. The first grepped the checker output for `stated name`, which also occurs
in v9's _"checks run:"_ line, so every run looked like the name had been checked. The second grepped
for `stated name(s) match`, which is absent both when the check is skipped **and** when it runs and
fails — collapsing the good outcome into the bad one and reporting 0/41 for a form that actually
scores 41/41. Only the exit code separates all three states. The lesson is not "grep more carefully":
it is that a detector needs its own positive control, and the cheapest one is a fixture that _must_
fail. Every number in the table above comes from a wrong-by-construction title for exactly that
reason.

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
- Test colocation is named as a finance convention; the obligation it serves is `ENG-TEST-003` (Regression boundaries).

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

### A search that returns zero is not a measurement

One turn after retracting the misattribution claim above — whose lesson was _check a primary
artifact instead of your own notes_ — the same claim was made again, and this time the checking
was the part that failed.

Upstream credited finance with "your two ranges" and with finding the range blind spot. To verify,
every tracked file was searched with `git ls-files` and this pattern:

```text
ENG-[A-Z]+-\d{3}\s*(?:-|\u2013|\u2014|to)\s*(?:ENG-[A-Z]+-)?\d{2,3}
```

It returned **0 hits across 74 `ENG-*` references**, and that zero was reported upstream as a
measurement. It was wrong. finance's ranges are written `` `ENG-OBS-001`–`ENG-OBS-007` `` — each ID
wrapped in backticks — and `\s*` cannot cross a backtick. Re-run allowing them, the same corpus
returns **5 ranges**, all in this guide, and gap 7 above _is_ finance's range finding, stating the
concealed IDs by name. Both things upstream said were true.

**The failure is not the regex, it is that a zero result was trusted without a positive control.**
A search that finds nothing and a search that cannot find anything produce identical output: no
matches, exit 0, no error. They are the same two indistinguishable states as a type-check that
passes and one that aborted before starting, and as a citation checker that verified a name and one
that silently skipped it. The instrument reports absence of evidence identically to evidence of
absence.

The remedy is the one this document has already reached twice by other routes, now stated for
search: **before believing a zero, run the pattern against a case you know is present.** Here the
positive control was free and sitting in the same file — gap 7 contains a range in exactly the form
being searched for. One test against it falsifies the pattern instantly.

Applied immediately afterwards when verifying the upstream fix: the `v9` range check was tested
with a **deliberately invalid range** first, confirming exit 1 and the two missing interior members
by name, and only then was the passing run treated as meaningful. A tool that has not been observed
failing is not evidence that anything passed — `ENG-TEST-008` (Discriminating mutation evidence),
which is now the fourth distinct instrument in this adoption to have needed it.

The cost was again external and again asymmetric: upstream was told, for the second consecutive
turn, that a finding credited to finance was not finance's, and asked to go re-check the
attribution. Both times the disproving evidence was local and free.

### A span is safe exactly when a machine-checked ledger enumerates its exceptions

Upstream sharpened the range finding above into a rule worth keeping, and the sharpening came from
a case where finance was wrong. This guide previously reported that a `practices/` header claimed
`ENG-PERF-001`–`009` and thereby concealed three unimplemented principles. That was retracted: no
range-form claim exists in `practices/`, headers enumerate individually, and the three gaps
(`ENG-PERF-003`, `-004`, `-009`) are disclosed in `practices/uncovered.json`, named in prose, and
reconciled by `check-coverage` — which fails if the ledger and reality disagree.

So two spans that look identical behave oppositely, and the difference is not the notation:

| Span                                                 | Interior members tracked by         | Verdict                      |
| ---------------------------------------------------- | ----------------------------------- | ---------------------------- |
| finance's `` `ENG-OBS-001`–`ENG-OBS-007` `` citation | nothing, before checker `v9`        | unsafe — asserted, unchecked |
| upstream's `practices/` coverage catalog             | `uncovered.json` + `check-coverage` | safe — exceptions enumerated |

**The rule is therefore not "avoid ranges."** It is: a span asserts a claim about members it does
not display, so it is only as good as whatever machine-checks the members it omits. That is a
better rule than the one finance proposed because it says what to do with a span you inherit —
find the ledger, or build it — rather than telling you to rewrite notation that may be fine.

Finance's own spans are the confirming case, and the fix ran in the direction the rule predicts:
they were made safe by **acquiring the check, not by deleting the spans**. Checker `v9` expands
`NNN`–`NNN` into its members and resolves each one, and that expansion was itself confirmed
falsifiable before its passing runs were believed — a deliberately invalid range exits 1 naming the
two nonexistent members. The spans are unchanged; the ledger underneath them is new.

### The fourth check had one live input, and had never been shown able to fail

Upstream disclosed that every test in its React block asserted on `react-hooks/*` rules or on the
config object, so **no rule from `eslint-plugin-react` had ever executed** — the plugin could have
failed to load entirely and the suite would have stayed green. Applying that inward found the same
shape in finance's own instrument.

Checker `v9` prints `checks run: IDs, stated names, range members, link paths`. Three of those four
had been exercised against a known-failing input. **`link paths` had not.** Two facts, both
measured:

- Across every tracked markdown file, exactly **one** link has visible text naming an `ENG-*` ID
  and a target under `principles/` — `docs/guides/engineering-practice-adoption.md:1913`. That is
  the check's entire live input set in this repository, and it passes.
- Until now, nothing established that it _could_ fail. A check with one passing input and no
  negative control is indistinguishable from a check that is silently skipping.

Both controls now exist, run against fixtures rather than against the repository:

| Fixture                                            | Raw exit | Output                                    |
| -------------------------------------------------- | -------- | ----------------------------------------- |
| Real ID, link to the correct `source` path         | **0**    | clean                                     |
| Same real ID, link to a different area's directory | **1**    | names the wrong path and the expected one |

The check is sound. What was unsound was believing it on the strength of a green run — the same
error as trusting a zero-hit search, recorded above, and the same error upstream just disclosed
about its own suite. One live input is one deletion away from zero, and the banner would go on
claiming four checks ran either way. This is the fourth distinct instrument in this adoption to
have needed `ENG-TEST-008` (Discriminating mutation evidence).

**And the harness failed a fourth time while measuring it.** The first two runs reported `exit=0`
for a fixture the checker was correctly rejecting, because `node … 2>&1 | Select-Object` leaves
`$LASTEXITCODE` at `0`; re-run with output redirected to a file and no pipeline, the same fixture
reports `1`. That is the identical defect as the earlier `Select-String`/`$?` reading and the
grep-for-a-banner-line reading: an **inverting** instrument, which maps the correct outcome onto
the failure it was built to detect. Had the pipeline form been trusted, the conclusion would have
been that the link check is broken — a false report about upstream's tool, from finance, for the
third time in this adoption. The tell is the same one every time: the reading was _accurate about
something_, just not about the question asked.

### A cached read fails silently, and the correction about it arrived carrying the error

Upstream retracted its own instruction to run `git show origin/main:versions.json`. That command
reads the **local** remote-tracking ref: without a preceding fetch it returns whatever was last
downloaded, with no error and no signal, and a stale read is byte-identical to a fresh one. The
replacement holds no state and needs no auth:

```bash
curl -s https://raw.githubusercontent.com/jrmoulckers/engineering/main/versions.json
```

**finance had no exposure to the stale-read defect and worse exposure to the underlying one.** No
tracked file cites `versions.json` at all — every version fact in this guide arrived through chat
messages, which cannot be re-read, cannot be diffed, and carry no ref. A stale cached read is at
least reproducible; an unattributed assertion is not. Upstream's remedy — record the URL next to
any value you copy out — is adopted above, in the range table.

**And the correction itself repeats the claim it retracts.** The message recommending the fresh
read presents `prettier-config` and `tsconfig` as `channel: vendored`; the file it points at
records all three as `channel: registry` with `requiresRegistryAuth: true`, and its comment block
retracts the vendored claim explicitly. So the fresh-read instruction was correct and the table
beside it was written from memory. This is not a gotcha — it is the strongest available argument
for the instruction, because it demonstrates that knowing about staleness does not protect you
from it. The defect is not ignorance of the fix; it is that a remembered value and a read value
are indistinguishable once written down.

Which is also the answer to why finance propagated it: **the claim was never checked against the
evidence finance already held.** See _Blocker 1_ — the visibility probe reported `tsconfig` with 3
published versions and `prettier-config` with 2, in this document, two hundred lines from the
assertion that neither was published. Nothing evaluated the pair.

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

  **A later exchange with the same session added two refinements, one of which retracts a claim made
  here.**

  - **Retracted: "the branch was not rebased again."** That session reported a second rebase of the
    `ENG-PERF-007` branch; this guide recorded it as disproved, on the grounds that the PR's
    `headRefOid` was `085469a` and had not moved across repeated readings. **The rebase did happen**,
    and the reflog is unambiguous: `rebase (start): checkout origin/main` → `rebase (finish)` at
    `12:03:47`, rewriting `313ac60` onto base `8c23ddd` as `085469a`. Both commits carry identical
    subjects and identical content on different parents, which is a rebase's signature rather than a
    contradiction, and `313ac60` is provably not an ancestor of the branch.

    **The error was comparing a current state against a historical claim.** A stable `headRefOid` is
    evidence that nothing has changed _since the first reading_, and says nothing whatever about
    events before it. The observation window opened after the event it was being used to refute, so
    the measurement was sound and simply could not bear on the question. Generalised: **a
    point-in-time observation cannot falsify a claim about the past — for that you need a record that
    retains history**, which for git means the reflog, `merge-base --is-ancestor`, or the parent
    chain, none of which were consulted.

    One part of the counter-claim did not survive checking either, in the other direction: that
    session attributed the rebase to this one's visit to its worktree. The rebase finished at
    `12:03:47`; the `node_modules` directory this session created there was stamped `12:07:24`,
    **three and a half minutes later**, so this session arrived after the event and is excluded as
    the actor. Reported back rather than accepted, because an unowned rewrite that also reached
    `origin` is worth someone identifying.

    **Closed, by that session's own retraction.** It withdrew both halves: the attribution to this
    session, on the timing above, and — more damagingly for it — its own "I haven't pushed since
    `313ac60`." The remote-tracking reflog in its worktree records `085469a … update by push` at
    `12:04:05`, eighteen seconds after the rebase finished, with `ORIG_HEAD` still at `313ac60`. The
    push originated there. The remaining question is only the mechanism — most plausibly an
    app-level rebase of the session onto `main`, which that session has explicitly marked
    **unverified** rather than asserting a third story to replace the two already withdrawn. That
    restraint is the right call: the thread has now consumed one confident wrong explanation from
    each side, and a third would have been offered on the same evidentiary footing as the first two.

    **The generalisation is worth more than the incident.** The retracted claim was about the
    author's _own actions_, falsifiable by a single command, and went unchecked precisely because it
    felt certain. Every other instance catalogued here involved measuring something external; this
    one shows the same defect turned inward, where it is harder to see because **certainty about
    one's own history is indistinguishable from knowledge of it, and is only memory.** Self-report is
    not a primary source. Where a record exists — the reflog here — it outranks recollection even
    when the recollection is the actor's.

  - **The truncation hazard recurs inside its own correction.** The rule above — tail to _find_ a
    failure, read the body before _explaining_ one — is right but understates the problem. The
    sharper form is that **tailing is safe for detection and fatal for attribution, and the boundary
    is crossed silently the moment a summary line is used as a causal claim.** Nothing announces the
    transition; the same twenty lines that correctly said "something failed" become a wrong answer to
    "why" without changing. The evidence for how easily this happens is that the message which
    carried the `proseWrap` caveat into this guide — the caveat later retracted for exactly this
    reason — was itself composed from truncated output. A hazard that reproduces inside the writeup
    of the hazard is not a lapse of attention, it is a default that has to be designed against.

- **`.gitattributes` line-ending carve-out for Windows batch files.** The shared Prettier config
  sets `endOfLine: 'lf'`, which requires a `.gitattributes` to avoid `format:check` passing in CI
  and failing on every Windows checkout. finance already has one, and it goes further than the
  bare `* text=auto eol=lf` being recommended: it adds `*.bat`/`*.cmd text eol=crlf`. Forcing LF
  on batch files can break `cmd.exe` parsing, so the bare snippet trades one Windows-only failure
  for another. The carve-out belongs in the recommendation.

- **A path filter and a required check interact two different ways, and the safe one is the ugly
  one.** Upstream could not test this (no protected branch) and framed it as two rival outcomes: the
  check never reports and the PR blocks forever, or it is treated as satisfied and the gate is
  bypassed. **Both happen.** Which one you get is decided by where the filter sits, and finance runs
  both configurations today against a protected `main` whose required contexts include
  `ESLint & Prettier`, `Secret Detection`, `Build & Test`, and `Required Checks Gatekeeper`.

  | Filter placement                            | GitHub's behaviour                       | Failure direction                      |
  | ------------------------------------------- | ---------------------------------------- | -------------------------------------- |
  | `on: pull_request: paths:` (workflow level) | the check never reports at all           | **fail-closed** — PR stuck pending     |
  | job-level `if:` (skip-with-success)         | conclusion `skipped`, counted as passing | **fail-open** — gate silently bypassed |

  Measured, not inferred. PR #4126 changed exactly one file,
  `docs/guides/engineering-practice-adoption.md`, which matches none of `ci-lint.yml`'s filters —
  the workflow's list covers `**/*.ts`, `**/*.json`, `apps/**`, `packages/**`, `services/**` and
  friends, but no `docs/**` and no `**/*.md`. The required `ESLint & Prettier` context completed with
  `conclusion: skipped`, the PR reported `MERGEABLE`/`CLEAN`, and it merged. A skipped required check
  is a satisfied one.

  The fail-closed half is recorded in `ci-lint.yml` itself, as a guardrail comment above the
  `changes` job (lines 54–58) warning against adding `paths:` to the `pull_request:` trigger because
  a filtered-out required check "never reports its status, leaving PRs stuck in a BLOCKED state."
  Note that the `push:` trigger _does_ carry a `paths:` list — that is safe precisely because pushes
  to `main` are not the gate.

  **The inversion is the part worth hoisting.** The pattern everyone adopts to avoid the blocking
  annoyance — gate inside the workflow, skip with success — is the one that fails open. It is correct
  for lint, where a skipped check on a docs-only PR is exactly right, and it is **wrong for a leak
  gate**, where the whole premise is that nothing merges unexamined. So the recommendation cannot be
  one pattern: a _relevance_ check should skip with success, and a _prohibition_ check should run
  unfiltered on every PR and decide internally. finance's own configuration is correct for lint and
  would be a silent hole if the secret-detection gate were built the same way. That is not a
  hypothetical about someone else's repo; it is one `if:` away in this one.

- **`|| echo ""` beats `|| true` when the grep result is captured.** Upstream flagged that a guardrail
  script's `grep` exits 1 on no match and fails the job on a clean repository under `pipefail`.
  finance already carries the fix and a load-bearing comment forbidding its "simplification"
  (`ci-lint.yml` lines 166–170), but uses `|| echo ""` rather than the suggested `|| true`. In a
  command substitution the distinction matters: `|| true` suppresses the exit code while leaving the
  variable empty by accident, whereas `|| echo ""` makes the empty result the explicit value being
  assigned. Same green build, but the second states the intent that a clean repository is a valid
  outcome rather than a suppressed error.
