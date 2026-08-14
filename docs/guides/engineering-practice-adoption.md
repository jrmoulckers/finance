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

#### The auth-free substitute is verified by a check that the same `401` switches off

While blocked, finance reads peer ranges from `versions.json` in the engineering repo rather than
from the registry, on the stated grounds that CI verifies that file against what is published.
**It does — and the verification includes peer ranges, not just versions**, which was worth
confirming rather than assuming, because finance's own TypeScript peer-disagreement finding rests
entirely on that block. Read from `scripts/check-published-versions.mjs` on `main`:

| Line | Behaviour                                                        |
| ---- | ---------------------------------------------------------------- |
| 48   | `diffPeers()` compares recorded against published peer ranges    |
| 98   | reads `peerDependencies` from the packument's `dist-tags.latest` |
| 165  | each differing peer becomes a `problem`                          |

So the block is genuinely checked. The caveat is in how the check behaves when it cannot run:

| Line   | Behaviour                                                             |
| ------ | --------------------------------------------------------------------- |
| 82–83  | HTTP **`401` or `403`** → `unreachable: true`                         |
| 132–33 | `unreachable` → pushed to `unknown`, **not** to `problems`            |
| 189–94 | `unknown` emits `console.warn`; the text says "this is not a failure" |
| 186    | `process.exitCode = 1` only when `problems` is non-empty              |

An authorization failure is therefore classified as an outage, and **the gate stays green with
zero packages verified**. The console output is honest about it — `verified === 0` prints
"versions.json was not confirmed against the registry on this run" rather than the usual "matches
the registry for 3 of 3" — but that distinction lives only in log prose that nobody reads on a
green run, which is the same shape as the "3 of 3" line that was quoted as proof of the opposite
of what it said.

**Why this is finance's problem specifically.** `401` on all three packages is not a hypothetical
here — it is exactly what finance observes. The condition that blocks finance from the registry is
the condition that silently stops the peer block being verified, and the repositories directed to
trust that block as their auth-free substitute are precisely the ones without the access needed to
notice it had lapsed. A credential regression is also durable rather than transient, so unlike a
real outage it would not self-correct on the next run.

**Proposed upstream, not worked around here** (finance cannot fix another authority's checker, and
the file is still the best available source): treat `401`/`403` as a `problem` rather than as
`unreachable`, or fail when `verified === 0` while a token was present. `404` should stay
`unknown` — the existing comment gives a good reason for that one, and it is a different
condition. finance continues to cite `versions.json`, now knowing which runs confirm it.

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

Upstream reached the same rule independently and supplied the argument this measurement lacked.
When they audited a broken `nextConfig()` that had dropped every `jsx-a11y` rule, a **present-key**
count would have scored the break as **38 versus 22 — a 73% improvement**. Counting keys does not
merely blur the number; it inverts the sign, and reports a regression as a gain. The rule is
therefore not `prefer active counts` but `a present-key count cannot detect a disabling bug at
all`, since disabling a rule leaves its key in place.

Their measured active counts for `nextConfig()` at `0.13.0` — 18 `react/*`, 2 `react-hooks/*`,
31 `jsx-a11y/*` — are **identical to finance's three numbers above**, which were measured against
`reactConfig()` on a different day by a different method. Two presets, two observers, one triple.
That is corroboration of the counting method, not of either preset: the shared plugins and the same
`eslint-config-prettier` subtraction dominate, so the react/next difference lives in the 20
`off` keys rather than in what enforces.

**The lesson generalizes and is the reason this section stays.** A reproducible stack trace names
the frame that threw, not the caller that caused it. The blast radius here — every rule in the
plugin failing to load — made a config-level cause look like a package-level one, and the
remedy that follows from the wrong diagnosis (drop the plugin) would have cost 18 working rules
including `jsx-key`. Bisecting the config would have cost one more probe than accepting the trace.

#### Second commission: I refuted a claim about #4057 with a present-tense grep

Upstream reported that finance carried `@jrmoulckers/eslint-config@^0.4.0`, naming **#4057**. I
swept the working tree, found carets only inside retraction prose, and replied that the claim was
stale. The sweep was accurate and the reply was wrong in method.

`git log -S` settles it:

| Commit     | PR        | Event                                         |
| ---------- | --------- | --------------------------------------------- |
| `4a0f456b` | **#4057** | **added** `@jrmoulckers/eslint-config@^0.4.0` |
| `59890ae2` | #4061     | removed it                                    |

**Upstream was right about #4057.** finance held that caret, at exactly the PR named. The claim is
stale — corrected four PRs later — but it was never false, and "stale" and "wrong" required
different replies.

The instrument is the failure. `git grep` reports the checked-out tree; the claim was about a named
commit. **A point-in-time observation cannot falsify a claim about the past** — which is stated at
line 789 of this same file, credited there as the sharpest formulation reached in this adoption, and
recorded there because I had _already made this exact mistake once_, against the same party, about
the same package.

So this is the second commission of a defect this document names, and the aggravating detail is the
same one: the disproof was in the file the whole time. Writing a rule down, even prominently, even
with a retraction attached, does not cause the rule to fire when the matching situation arrives.
The remedy has to be an instrument — `git log -S` before any "we never had that" — because the
recognition step is what fails.

**What is true today, by the instruments that answer the present-tense question:**

| Check                                         | Result     |
| --------------------------------------------- | ---------- |
| `git grep '@jrmoulckers/' -- '*package.json'` | no matches |
| `npm ls @jrmoulckers/eslint-config`           | `(empty)`  |

finance has **no pin at all** — nothing is installed, blocked on package access — so there is
currently no range to be stale. That is a narrower claim than the one I made last time, and it is
the only one a present-tense check supports.

#### Why finance keeps reading as caret-bearing to a scanner

The recurrence has a mechanism, and it is one this guide already hit from the other side. The only
`^0.x` strings left in the repository are these two lines, inside a fenced `git show` quotation of
the superseded advice:

```
# HISTORICAL AND RETRACTED -- quoted from a superseded commit, not finance's pins.
# 4. Depend on the current floors: **`@jrmoulckers/eslint-config@^0.8.0`**,
#    **`@jrmoulckers/tsconfig@^0.3.0`**, **`@jrmoulckers/prettier-config@^0.2.0`**.
```

That marker line was not in the first draft of this section. Writing the paragraph below — about
quoting a bad value reproducing the hazard — reproduced it, in the same commit, four lines above
the sentence describing it. The check that caught it was mechanical (enumerate every `@^0.` hit,
assert each is within four lines of a marker), not a re-reading. **Prose lines are self-contexting
because the sentence around the value is on the same line; a fenced block is not, which is exactly
why the fence is the part that needs the marker.**

A scan for `@jrmoulckers/[a-z-]*@\^0\.` returns exactly those two lines. **A retraction that quotes
the value it retracts is indistinguishable, to any scanner, from the configuration it describes** —
the identical defect that made this repository's own citation gate reject a documented fixture ID,
because the checker could not tell a citation from a description of one.

Two observers, two tools, same blind spot: **quoting a bad value preserves the evidence and
reproduces the hazard.** The evidence is worth keeping, so the fence below now carries an explicit
historical marker rather than being defused — a scanner still matches it, but anything that reports
the line also reports what it is.

#### The anti-caret correction arrived without its upper bound

Upstream re-sent the floors on 2026-08-11 as **`>=0.13.0` / `>=0.4.0` / `>=0.3.0`**. The values in
`versions.json` are **`>=0.13.0 <1.0.0` / `>=0.4.0 <1.0.0` / `>=0.3.0 <1.0.0`**. The bound was
dropped in the restatement.

That is not cosmetic, and it is not the caret failure:

| Version  | `>=0.13.0 <1.0.0` (recorded) | `>=0.13.0` (restated) |
| -------- | ---------------------------- | --------------------- |
| `0.13.0` | ✅                           | ✅                    |
| `0.99.0` | ✅                           | ✅                    |
| `1.0.0`  | ❌                           | ✅                    |
| `9.9.9`  | ❌                           | ✅                    |

The caret errs closed — it silently refuses fixes. The unbounded range errs **open**: it accepts
every future major, so the first `1.0.0` with a breaking change installs itself with no signal. The
two defects are mirror images, and a warning about one delivered in the shape of the other is the
worst available outcome, because it arrives with the authority of a correction.

`versions.json` is explicit that this is why the bound exists — it "records an explicit upper bound
and a test rejects caret forms" so "the recorded value stays safe to paste", and it instructs
consumers to **copy `range` literally**. A restatement from memory is not a literal copy, and the
one token it lost is the one the file added on purpose.

**finance was already correct** — `>=0.13.0 <1.0.0` for all three, with no caret pin anywhere
outside the retraction prose above — so nothing was adopted from the restatement. It is recorded
because the near-miss is the point: had finance still been mid-adoption, the accepted fix for a
caret would have been a range that is wrong in the opposite direction.

This is the third time upstream's prose has disagreed with upstream's own artifact (after the
`curl` output that contradicted the table in the same message, and the `channel: vendored` entries
for packages that were always on the registry). The pattern is consistent: **the artifact has been
right every time and the sentence about it has not.** Read `versions.json`; do not accept a range
quoted in a message, including a message correcting a range.

#### Pin currency: re-verified rather than assumed

The vendored checker is pinned at `v0.86.0`. The latest tag is now **`v0.90.0`**, so the pin was
re-checked instead of being carried forward on the previous verification:

| Ref       | bytes  | SHA-256 (12)   |
| --------- | ------ | -------------- |
| `v0.86.0` | 22,699 | `4bc850401c2f` |
| `v0.90.0` | 22,699 | `4bc850401c2f` |
| `main`    | 22,699 | `4bc850401c2f` |

Byte-identical, so the pin is current. This is the direct application of the lesson from the
previous entry — an upper bound taken on report is an unverified premise — turned on this
repository's own prior verification. "Verified a few hours ago" is a bound on report where the
reporter is oneself, and four releases landed inside it. The answer happened to be unchanged; that
is a result, not a reason to have skipped the check.

#### The version numeral is not a ref — the misattribution ran in reverse

Upstream later reported this section as stale, on the diagnosis that finance had read the repo at
tag **`v0.4.0`** and mistaken a nine-minor-old tree for current: "at `v0.4.0` (= `0.3.0`, what you
read)". The correction was accompanied by a re-run of finance's own `./react` experiment, which
reproduced finance's result.

The diagnosis does not fit the record above. finance never read a tag. It read **published package
tarballs** at three package versions — `0.3.0`, `0.4.0` and `0.8.0` (the `react.js` table) — and
then re-measured the whole adoption against the real `0.6.0` artifact resolved from the registry.
Two of those numerals are _higher_ than the tag finance is said to have been stuck at, which is
available in the same section that was being corrected.

The mechanism is the tag/package confusion that upstream itself documented, run in the opposite
direction. Their rule is **never infer a package version from a tag**, because the two series
numerically resemble each other. The inverse holds equally and is not yet stated: **never infer
which ref someone read from a package version they quoted.** `0.4.0` appearing in a report is not
evidence of tag `v0.4.0`; here it was the version in which the fix landed, named as the fix.

Worth recording for the same reason the original wrong diagnosis was kept: it is cheap to check and
expensive to skip. The check is to read what the report says it measured — the guide states the
artifact and the resolved peer table on every claim — rather than pattern-matching a numeral. A
correction issued against a misread of the evidence costs more than the error it targets, because
it arrives with the authority of a re-run experiment attached, and the re-run agreed with finance.

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
   | `@jrmoulckers/eslint-config`   | `>=0.13.0 <1.0.0` | plus three plugins in `devDependencies`, see below      |
   | `@jrmoulckers/tsconfig`        | `>=0.4.0 <1.0.0`  | registry channel; not installed here — deferred on cost |
   | `@jrmoulckers/prettier-config` | `>=0.3.0 <1.0.0`  | registry channel; vendored here by ref + lock instead   |

   Re-read 2026-08-12: `eslint-config` had moved to **`0.13.0`** while this table still said
   `0.12.0`. Worth being precise about the severity, because it is not the caret failure upstream
   warns about. `>=0.12.0 <1.0.0` **already resolved `0.13.0`** — a correct lower-bound range
   degrades gracefully and keeps installing new releases, where `^0.12.0` would have silently
   excluded them. What went stale was the printed floor, which claims a currency it no longer has,
   not the dependency itself. The two failure modes deserve different urgency and the caret warning
   should not be read as covering both.

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
   # HISTORICAL AND RETRACTED -- the two lines below are quoted from a superseded
   # commit. They are NOT finance's pins. Current values are in the range table above.
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

**What finance must do.** Pin `^0.17.0` (see _"The caret reversal"_ below — upstream reversed this
form in `v0.119.0`, and the earlier `>=0.13.0 <1.0.0` recorded here is superseded as an instruction
while remaining accurate as a record of what was decided at the time). Declare the plugins the React
preset imports at module scope in `devDependencies`. There are **three**, not two:

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

**What the 48 lines actually are, and why another repo's category list did not predict them.**
A second repo (cartridge) measured the same adoption at 575 lines and enumerated three residue
categories: pipe-table re-padding, `singleQuote` rewriting inside fenced code, and emphasis
normalisation (`*x*` → `_x_`). Checked against finance's five files, **none of those three fired
even once.** Every one of finance's 48 lines is a fourth category the list does not contain:
**embedded fenced code re-wrapped by the narrower `printWidth`** — JSON and TypeScript samples
whose lines fell in the 96–100 column band and were split.

```diff
-      "category1": { "$value": "#648FFF", "$type": "color", "$description": "IBM CVD-safe blue" },
+      "category1": {
+        "$value": "#648FFF",
+        "$type": "color",
+        "$description": "IBM CVD-safe blue"
+      },
```

The reason the lists disagree is worth stating as a rule: **the residue is a function of the diff
between the old and new configs, not of the config being adopted.** finance's previous
`.prettierrc.json` already set `singleQuote: true` and already matched on `tabWidth`, `endOfLine`
and `trailingComma`, so the only markdown-relevant delta was `printWidth` 100 → 96. cartridge's
prior config evidently differed on more axes. Two repos adopting the identical config therefore
get disjoint residue sets, and a category list derived from one adoption cannot generalise —
only the per-repo config delta predicts it.

**Corollary: the "line counts are unchanged" structural check does not hold here.** It is offered
as proof that no authored break moved, but finance's line counts changed in **5 of 5** files
(432→448, 543→548, 628→632, 238→242, 364→365). The invariant only holds when no fenced code block
contains a line in the band between the new and old `printWidth`, which is a property of the
corpus rather than of `preserve`. The claim it is meant to support — zero prose churn — is true
here and was verified directly instead: 0 changed lines outside fences and outside table rows.

**And the measurement is not reversible, which is a trap for anyone auditing this after the fact.**
Re-running the same comparison against the _post-adoption_ tree reports **3** changed files, not 5.
Prettier preserves an object's expanded form when the source already has a line break after `{`, so
re-formatting adopted content at the old width does not restore the joined form. Measuring adoption
cost on already-adopted content silently undercounts it; the pre-adoption tree (`37c2747f~1`) is the
only valid input, and it reproduces the real commit exactly at 5 files. Same defect class as the
merge-conflict matrix above — an experiment run against the post-transform artifact.

The 73-line `.prettierignore` is finance-specific and stays.

**The `proseWrap` decision, which is what actually mattered.** Finance already used Prettier's
default `preserve`, so the only delta was `printWidth` 100 → 96 — and under `preserve` that reaches
tables, lists and fences, not prose. Measured across every tracked markdown file:

| Metric                              | Value |
| ----------------------------------- | ----- |
| Markdown files tracked              | 593   |
| Files reflowing prose               | **0** |
| Files changed by the adoption       | 5     |
| Changed lines outside fences/tables | **0** |

The earlier `0.1.x` config set `proseWrap: 'always'`, which would have rewritten **528 of 592
files (89%)** — 36,249 added / 29,723 removed against 182,051 total markdown lines, roughly 36% of
every markdown line finance owns. Finance objected on that basis; the authority reversed to
`preserve` in `0.2.0` and cancelled the reflow fleet-wide. The reasoning that settled it was not
the one-time cost:

**`proseWrap: 'always'` destroys semantic line breaks**, silently, on every write. One sentence per
line is the technique that bounds line length without taxing edits, and Prettier cannot enforce
it — but `always` actively undoes it, while `preserve` is the setting that permits it. `preserve`
is therefore not better in itself; it is the only value under which the convention can survive.

**Retracted: the merge-conflict axis _does_ discriminate.** This section previously concluded that
conflict behaviour is "governed by line granularity, not wrapping policy" and that the axis should
not be cited in either direction. That conclusion was wrong, and the experiment behind it could not
have produced any other answer.

The original test edited **lines** of the already-formatted file. Editing a formatted line directly
means Prettier never re-runs, and reflow is the only behaviour `proseWrap: 'always'` has — so the
setting under test had been removed from the test. Re-run holding the **prose** edit constant
instead (one word into sentence 1 on one branch, one word into sentence 4 on the other, each branch
re-formatted with real Prettier under its own regime, then merged), sweeping the size of the edit:

| Words inserted into sentence 1 | `always` lines touched | `always` merge | semantic lines touched | semantic merge |
| ------------------------------ | ---------------------- | -------------- | ---------------------- | -------------- |
| 1                              | 4                      | **CONFLICT**   | 1                      | clean          |
| 2                              | 4                      | **CONFLICT**   | 1                      | clean          |
| 3–12                           | 5                      | **CONFLICT**   | 1                      | clean          |

**8 of 8 conflict under `always`; 0 of 8 under semantic breaks.** The earlier verdict is withdrawn.

**But the mechanism is narrower than "reflow expands every edit to paragraph scope."** Holding the
regime at `always` and varying only the character-length delta of a single-word substitution:

| Edit to sentence 1       | Δ chars | Lines touched | Merge vs. sentence-4 edit |
| ------------------------ | ------- | ------------- | ------------------------- |
| `every` → `each`         | −1      | 1             | clean                     |
| `every` → `those`        | 0       | 1             | clean                     |
| `every` → `all of the`   | +5      | 4             | **CONFLICT**              |
| `every` → `every single` | +7      | 4             | **CONFLICT**              |

Reflow escalates an edit to paragraph scope **only when the length delta pushes a word across a
wrap boundary**. Below that threshold `always` touches one line and merges clean. This makes the
cost harder to reason about, not easier: under `always`, whether two authors collide depends on the
character count of a word, which is invisible at authoring time and differs between two edits a
human would call identical. Under semantic breaks the footprint is one line unconditionally. The
axis therefore discriminates on **predictability** as much as on conflict count, and it now supports
`preserve` rather than being neutral toward it.

Two findings survive unchanged: unbroken single-line paragraphs are the genuinely bad case, since
every concurrent edit collides on one line; and **adjacent edits conflict under every regime**,
because git needs an unchanged context line between changes and no wrapping policy can supply one.
That last row is non-discriminating and should not be cited by anyone.

> **The method note is the transferable part.** If a setting's whole function is to transform the
> artifact, an experiment that edits the artifact's _post-transform_ shape has quietly removed the
> setting from the experiment. Worth recording that finance's first attempt to _refute_ the
> correction repeated the defect in a second form: a single substitution (`every` → `each`) that
> landed in the sub-threshold region above, measured correctly, and read as a regime-level result.
> Both the original claim and its first rebuttal were single-condition experiments generalised to a
> policy. The sweep is what separates them.

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

   **Correction — two of those three have since landed, and this ledger went stale.** Re-checked
   against the live files rather than against the report of them, because the row above was true
   when written and quietly stopped being true:

   | Drafted content            | Status                                                                            |
   | -------------------------- | --------------------------------------------------------------------------------- |
   | The sampling floor         | **Landed** — `performance-budgets.md`, `### Know the floor of your instrument`    |
   | Thermal state, device tier | **Landed** — `native-profiling.md`, as device tier / thermal and power / emulator |
   | `ENG-TEST-008` channel     | **Still absent** from both performance guides                                     |

   The sampling floor landed in `performance-budgets.md` rather than `native-profiling.md`, on the
   reasoning that `pprof` and `node --cpu-prof` are in that file's tool table and nothing about
   sampling resolution is native-specific. That is the better home, and it means **a hoist can land
   in a different file than the one it was proposed against** — so checking only the target file
   reports a false negative. This ledger did exactly that.

   The third row survives and is narrower than it looks. `testing.md` does carry
   `## Prove the test can fail (ENG-TEST-008)`, so the general principle is covered; what is still
   unlanded is the **field-channel** application — breaking the observability channel on purpose to
   establish it would report a failure, which is a different claim from breaking a test.

   Note also that the finance-authored PR is **still open and unmerged** while its content ships
   elsewhere; flagged upstream so it is closed rather than landing a second time. Its author now
   reports it as `CONFLICTING`, 48 commits behind, and recommends closing rather than rebasing —
   which this check supports more strongly than their own estimate did. They named the KMP
   `kotlinx-benchmark`/`jvmTest` row as the last content plausibly not upstream; it **is** upstream,
   at `native-profiling.md` line 88 with a dedicated paragraph arguing the row carries more weight
   than its size suggests. Both of the remainders they identified are already landed.

6. **No native-platform principle area.** The 66 principles span 11 areas — API, ARCH, BUILD,
   DATA, INT, LOCAL, OBS, PERF, SEC, TEST, WEB. `WEB` covers browser frontends; **nothing covers
   native application surface.** Searching the whole principles corpus for `mobile|Android|iOS|
desktop|Kotlin|Swift|multiplatform` returns a single incidental match. finance ships **four**
   platforms, **three of them native** (Android, iOS, Windows/Compose Desktop), so only
   `apps/web` is addressed by a platform area at all.

   This compounds gap 3 rather than duplicating it: `ENG-PERF-007` demands platform-native
   profiling, the practice that would explain how is web-shaped, and there is no native area to
   host the obligation in the first place. Requesting an `ENG-NATIVE-*` (or `ENG-APP-*`) area.

7. **`check-citations.mjs` does not expand ID ranges.** (**Closed upstream in checker
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
    was short. Finance pins `>=0.13.0 <1.0.0`.

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

Verified with the upstream checker (then run from a temp directory; see below) at `v0.2.11`, run over all 804 markdown
files: **every ID valid, and every principle's true title matching the claim made about it.** The
wrong-meaning defect reported elsewhere in the org did not reach finance.

### The checker was never in this repository

Every citation audit above, and the evidence line on roughly fifteen merged PRs, was produced by a
copy of upstream's checker living in `$env:TEMP`. finance had **no** `check-citations.mjs`, no npm
script, and no CI job. The guide cited a path — `scripts/check-citations.mjs` — that had never
existed here. Nobody else could reproduce a single one of those results, and CI had never once run
the check.

This is the failure this guide catalogues, committed by this guide. An absent verifier and a
passing verifier emit the same signal — nothing — and fifteen green PRs are exactly what both look
like. The reason it survived is that the check kept **passing**, so it never produced the one
output that would have exposed it.

Now vendored and wired:

|                |                                                              |
| -------------- | ------------------------------------------------------------ |
| Vendored to    | `config/engineering/citations/check-citations.mjs`           |
| Pinned at      | `v0.86.0`, content-hashed in `engineering-configs.lock.json` |
| Local commands | `npm run eng:citations`, `npm run eng:citations:review`      |
| CI job         | `ci-lint.yml` → **ENG Citations**                            |

**Vendored, not copied.** The script's own header says it is fetched over the network and "kept
nowhere". Pasting it into `scripts/` would fork it silently — the vendored-workflow anti-pattern
this repo already documents for reusable workflows. It goes through the existing vendor-by-ref +
content-lock mechanism instead, so `npm run eng:vendor:check` fails if anyone edits it.

#### The gate shipped with a scope that excluded two of its own citations

The job landed scanning `docs`. finance cites `ENG-*` outside `docs` in two places — `AGENTS.md`
(`ENG-TEST-004`) and `README.md` (a link into `principles/architecture/`). Both were invisible to
the gate, and the gate was green.

Demonstrated rather than reasoned. A bogus ID appended to `AGENTS.md`:

| Scope                                   | Exit                          |
| --------------------------------------- | ----------------------------- |
| `check-citations.mjs docs` (as shipped) | **0** — blind                 |
| `check-citations.mjs .`                 | **1**, naming `AGENTS.md:639` |

Now `.`: 806 files in ~1 s, node_modules skipped, same 130 citations. The count went 128 → 130 and
the file count 441 → 806.

**A scope argument is a manual list, and it goes stale exactly like a version pin.** `docs` was
correct when written and silently wrong as soon as a citation appeared elsewhere — with no signal,
because a file outside the scope cannot fail the check. That is the same absent-versus-passing
ambiguity that hid the whole checker in `$env:TEMP`, at one-tenth the scale, reintroduced in the
commit that fixed it. Enumerating a scope is the defect; `.` has nothing to keep up to date.

The lesson generalises past this gate: when a check takes a scope, the scope is the part most
likely to be wrong, because every other part announces its failures and the scope announces
nothing.

#### The link check resolves through the index, so it does not rot when a principle moves

A sibling session pointed out that a path-based lookup inherits a false negative when its subject
relocates, and asked whether citation checking has the same exposure. Tested directly: a valid
`ENG-TEST-008` citation linked to a non-existent `principles/assurance/MOVED-AWAY.md` exits **1**
with

```
expected a path ending in principles/assurance/testing.md
```

That expectation is derived from the `source` field `principles/index.json` carries per ID, not
from a hardcoded path. So if a principle moves file, the index moves with it and the checker
demands the new location — the citation is resolved by ID and the path is _checked against_ the
index rather than trusted. finance's two path-bearing links were verified correct against both the
index `source` and a live `200`.

This is the argument for ID-plus-index over grep-by-path, on a third axis after ID validity and
stated name: **path correctness is itself checkable, but only if something authoritative says what
the path should be.**

#### `TOOL_VERSION` did not distinguish two different released checkers

The temp copy declared `TOOL_VERSION = '9'`. The current upstream one declares `TOOL_VERSION = '9'`.
They differ by **732 bytes and one whole function** — `contextWindow()`, which supplies the ±2-line
window shown around a finding in the report.

This is not a branch-versus-tag artifact. Two _released_ tags disagree:

| Ref       | `TOOL_VERSION` | `contextWindow()` | bytes  | SHA-256 (first 12) |
| --------- | -------------- | ----------------- | ------ | ------------------ |
| `v0.57.0` | `9`            | absent            | 21,967 | `1ae0dda13974`     |
| `v0.66.0` | `9`            | absent            | 21,967 | `1ae0dda13974`     |
| `v0.76.0` | `9`            | present           | 22,699 | `4bc850401c2f`     |
| `v0.86.0` | `9`            | present           | 22,699 | `4bc850401c2f`     |

A declared version number is an assertion by the author; a content hash is a property of the bytes.
Only the second one caught this. That is the same distinction as [the version numeral is not a
ref](#the-version-numeral-is-not-a-ref--the-misattribution-ran-in-reverse) — the identifier agreed while the artifact did not.

> **Upstream suggestion:** `versions.json` gets machine-checked publication, but
> `check-citations.mjs` — the thing that verifies everyone's citations — has no equivalent
> guarantee. Either bump `TOOL_VERSION` on every behavioural change, or publish a hash alongside it.
> Consumers currently cannot tell two different checkers apart.

> **Extended (2026-08-12).** The four rows above are a sample. Enumerated across all 153 tags, the
> file has **14 distinct blobs**, and `TOOL_VERSION = '9'` covers **four** of them spanning 84 tags
> plus an untagged `main` — an 8,171-byte spread, not 732. See
> [`TOOL_VERSION` understated its own finding](#tool_version-understated-its-own-finding-by-a-factor-of-eleven).

#### Retraction: the missing function was not "unreleased"

While investigating, this guide was about to record that `contextWindow()` existed only on `main`
and in no tag. That was wrong, and the way it went wrong is worth keeping.

The claim rested on a sibling session's report that the latest tag was **`v0.66.0`**. That was true
when written and stale by the time it was used. The tags were then sampled across `v0.57.0`–
`v0.66.0` — a genuine, correctly-executed search — which found no `contextWindow()`, because the
newest tag is **`v0.86.0`** and the search never reached it. Twenty releases sat outside a range
chosen from a second-hand number.

The measurement was sound and the bound was borrowed. Sampling within a range inherited from
someone else's report tests the range, not reality, and returns a confident negative either way.
The `git fetch --tags` guard already recorded here applies to ranges, not just to single refs: **an
upper bound taken on report is an unverified premise even when everything inside it is measured.**

#### Both gates were proven able to fail

`ENG-TEST-008` — a check that has never failed has not been shown to work. Neither gate was
shipped on the strength of a green run:

| Control            | Injected                                     | Exit                           | Reverted |
| ------------------ | -------------------------------------------- | ------------------------------ | -------- |
| Citation check     | a well-formed SEC ID in the unused 900 block | **1**, naming file and line    | 0        |
| Vendor drift check | one appended comment line                    | **1**, naming the drifted file | 0        |

The fixture ID is described rather than quoted above, because the checker reads any well-formed
ID in any markdown file as a citation and cannot tell a citation from a description of one — a
negative-control fixture written literally would fail the very gate it certifies.

Shipping an unproven gate here would have replaced a checker nobody ran with a checker that could
not fail — a strictly worse outcome, and indistinguishable in CI.

#### The job is deliberately not path-filtered

Every other job in `ci-lint.yml` is gated on the `changes` detector. This one is not, and the
asymmetry is the point: the other jobs check finance's files against finance's rules, so "nothing
relevant changed" really does mean "nothing to check". This job checks finance's citations against
**another repository's** index, which moves independently. An upstream rename can invalidate a
citation on a PR that touches nothing at all — so a path filter would remove the check exactly when
it is the only thing that could catch the breakage. It runs on every PR, with no `npm ci` (the
script has no dependencies), and **throws** rather than passing when the index cannot be fetched.

### Re-audited under machine-verified names (`v0.16.5`)

`v0.16.5` makes a stated title checkable: a parenthesised phrase beginning with a capital after an
`ENG-*` ID is read as a claim and diffed against `principles/index.json`. Finance had 35 such names
already, written in lowercase and therefore invisible to the checker. All 35 were re-derived from
the index before being capitalised, and **all 35 were already correct** — no wrong-meaning citation
existed to find. They are now machine-verified rather than merely right:

```powershell
node config/engineering/citations/check-citations.mjs docs --index <pinned-index> --review
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

**What this changes for adoption.** `ENG-TEST-004` (Distinct static signals) is the principle at
stake; read the signals it names at the ID rather than from this paragraph. finance's `ci:check`
satisfies the structure, but a
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

### A capability list is a claim, not a report

A peer repository discovered it had run a six-versions-stale citation checker all day and reported
every number from it. Its banner named the version in every run and never varied, so it read as
decoration. That prompted two checks here, and the second one contradicts the intuitive reading.

**finance's currency guard works, and I was throwing its answer away.**

`npm run eng:vendor:check` does not merely verify the vendored bytes against the lock. It fetches
the newest upstream release and compares _content_, then says which case it found:

```
3 vendored file(s) match engineering-configs.lock.json at v0.86.0.

Notice: pinned at v0.86.0; newest release is v0.96.0, but all 3 vendored file(s)
are byte-identical there. No action needed -- refreshing the ref would produce no diff.
```

That is a direct answer to "is the tool I am running current?" — the precise question the peer
repository could not answer about itself. It was available in finance the whole time.

I have run this check on roughly fifteen pull requests and reported `vendor exit=0` every time,
because I redirected the output to a file and read only `$LASTEXITCODE`. **The exit code is
deliberately identical in the stale and the current case** — staleness warns rather than fails, by
design, so that a red build cannot pressure someone into bumping a pin they have not decided to
accept. That design is right, and it means the exit code cannot carry the currency signal. All of
it is in the text I discarded.

So the peer's defect and mine are the same defect against opposite signals: they ignored a field
because it never varied, and I ignored a field _that did vary_ because I had reduced the tool to
the one bit that never does. **Reducing a check to its exit code discards precisely the part that a
non-failing check exists to tell you.**

#### The list of checks that ran is mostly not a list of checks that ran

The stronger finding is about the capability report itself, and it applies to the checker finance
runs today, not only to stale ones.

`rangeMembers` occurs **exactly once** in the entire checker — at offset 14801 in the copy finance
runs, and at 14073 in `v0.66.0` — as a string literal inside the output array:

```js
checksRun: ['ids', 'statedNames', 'rangeMembers', ...(opts.links ? ['linkPaths'] : [])],
```

Three of the four entries are hardcoded. Only `linkPaths` is derived from runtime state. `v0.66.0`
contains no `contextWindow` function (0 occurrences, against 3 in the current copy) yet declares
`rangeMembers` in both its human banner and its machine-readable `--json` output, and the banner
text is byte-identical across the two.

**This paragraph previously drew a false conclusion from those true facts. See the retraction
below.**

**The conditional element is what makes the literals credible.** A wholly hardcoded list reads as a
label and invites no trust. A list where one element visibly responds to a flag reads as
introspection, and the three that never respond inherit that credibility. This is the same shape as
a `TOOL_VERSION` that failed to distinguish two released checkers, but more deceptive, because
`--json` `checksRun` presents itself as the machine-checkable answer to "what ran".

The general rule, which is worth stating beyond this tool: **a self-reported capability list is an
assertion by the author about intent, not an observation about execution.** It can only be trusted
if it is constructed from the checks actually performed.

**Change belongs upstream, not here.** `checksRun` and the banner should be assembled from the
checks the run actually executed, so that a build lacking an implementation cannot claim it. finance
cannot fix this by vendoring differently; the declaration is in the tool. Recorded here because
finance's own gate emits the unearned claim on every run.

One thing deliberately not repeated: the peer also reported the adjacency check as non-functional in
`v0.66.0`. `adjacen` occurs 3 times in both versions and I did not verify what those occurrences do,
so that half is unmeasured here and is not asserted.

**That caution was load-bearing, and the peer has since measured it: all three occurrences are
comments — two explanatory, one a hint string in a log call.** None is the implementation, so the
count was a count of prose. Declining to relay it avoided restating a claim that turned out to be
false in the same way, and for the same reason, as the half that was relayed.

#### Retraction: a true finding about the mechanism licensed a false finding about the instance

Everything above about `checksRun` stands. What was built on top of it does not.

This guide asserted that `contextWindow()` is _what the range-member check needs_, and, quoting a
peer, that `v0.66.0` ran "with two checks structurally unable to fire". Both are **false**, and the
peer who originally reported it has since retracted it as well.

The control is two-armed, because a one-armed control is what produced the error. A fixture citing
a PERF range whose endpoints both exist must **pass**; a fixture citing a range extending past the
highest PERF principle must **fail**. Run against both binaries:

| Binary                         | All members exist | Members absent         |
| ------------------------------ | ----------------- | ---------------------- |
| `v0.66.0` (no `contextWindow`) | exit 0            | **exit 1, 21 unknown** |
| current (3× `contextWindow`)   | exit 0            | **exit 1, 21 unknown** |

Identical, including the first offender named. `v0.66.0`'s range-member check fires. Reading the
source confirms why: the range guard is present in both, and `contextWindow()` is a **refactor** —
the older copy builds the same window inline at two call sites — and the window is _display_
context for the report, not an input to any decision.

**The shape of the error is the part worth keeping.** The reasoning was sound given a real defect.
`checksRun` genuinely is an unearned assertion. From there it follows that the declaration _could_
be false in a build lacking an implementation — and a checker that hardcodes its capability list is
exactly where a false declaration would live. But the hardcoded list happens to be **accurate in
both versions**. The defect is real; the instance deduced from it does not exist.

> **A true finding about a mechanism does not license a finding about any particular instance of
> it.** The mechanism supplies the plausibility, and the plausibility is precisely what suppresses
> the ten-second control.

Three real facts composed into a conclusion none of them supported: `TOOL_VERSION` identical across
both, `contextWindow` present in only one, `checksRun` known to be unearned. Each was measured. The
conjunction was not.

The remedy is stronger than "ask what binary ran", which this guide had already adopted and which
would not have caught this:

> **A capability question is answered by running the check against a fixture that must fail —
> not by reading the binary's self-description, and not by diffing its source.** Source-diffing
> feels like the rigorous option and is the one that failed here, because it answers "what changed"
> when the question was "what does it do".

#### One row of a measurement table was arithmetic

Correcting the above surfaced a second defect in the same section. The byte column previously read
`20,642` for `v0.66.0` against `22,699` for `v0.86.0`, a delta of `2,057`.

Measured directly from the tags: `v0.66.0` is **21,967** bytes and `v0.86.0` is **22,699**, a delta
of **732**. The method is not in doubt — it reproduces the `v0.86.0` row exactly, and the hash it
yields matches the ref pinned in `engineering-configs.lock.json`.

Note that `22,699 − 2,057 = 20,642`. The row was **derived by subtraction from the claimed delta**
and printed in a column headed `bytes`, alongside rows that were measured.

> **A derived number is indistinguishable from a measured one once it is in the table.** A column
> header is a claim about provenance that the cells cannot individually support.

The table now carries content hashes rather than sizes alone, because a hash cannot be arrived at
by arithmetic on another row. It also shows that `v0.57.0` and `v0.66.0` are byte-identical, as are
`v0.76.0` and `v0.86.0` — so the function landed between `v0.66.0` and `v0.76.0`, and four releases
collapse into two distinct artifacts, all four declaring `TOOL_VERSION = 9`.

### Enforcement is a fourth link, and finance's was broken

A peer repository found its citation gate correct in scope, correct in content, and **wired into no
CI job at all** — defined, invoked by nothing. It proposed the chain: scope, binary version, and
invocation are each silent on failure, and a green result is compatible with any link being broken.

Turning that on finance found a fourth link the chain does not name.

**Invocation here is sound, and I checked it by observation rather than by reading YAML.** On PR
#4146 the job ran, in 14 seconds, and its log reports numbers identical to the local run:

```
132 citation(s) across 39 principle(s) in 806 file(s); all IDs exist, and 42 stated name(s) match.
```

That equality matters beyond invocation: a soft-failed index fetch would have exited 2, and a
partial index would have changed the principle count. Matching numbers are evidence the fetch
genuinely resolved.

**Then the link that was broken.** `ENG Citations` is not in `main`'s required contexts:

```
ESLint & Prettier, Secret Detection, CodeQL Analysis (javascript-typescript),
CodeQL Analysis (java-kotlin), Build, Build & Test, Required Checks Gatekeeper
```

Nor is it aggregated by `Required Checks Gatekeeper`, which lives in a different workflow file and
so cannot reach it through `needs:`. **The gate ran, was correct, and could not block anything.**

This is worth stating precisely, because it is close to something already claimed here and is not
the same claim. When the gate shipped, this guide recorded that both its failure modes had been
_proven to fail_. That was true. **Proving a check can fail is not proving a failure blocks** —
they are different links, and the first is the one that feels like diligence.

#### The fix, and why it is not simply "make it required"

Adding a required context is a branch-protection change and human-gated. But finance already built
the mechanism for exactly this problem: the gatekeeper is the one required check, and it
independently re-runs lint and format precisely because the path-filtered workflow that owns them
may be skipped. The citation check now runs there too — a workflow change, not a settings change.

That introduces a hazard the existing gatekeeper steps do not have: every prior step is local, and
this one fetches an index from another repository. Making a required check depend on an external
fetch means an upstream outage blocks every merge in finance.

The checker already draws the distinction needed to avoid that, and it is measured, not assumed:

| Condition                                | Exit  |
| ---------------------------------------- | ----- |
| Citation names an ID that does not exist | **1** |
| Upstream index unreachable               | **2** |

So the step blocks on 1 and warns on 2. A local defect is finance's problem and must stop the
merge; an upstream incident is not, and must not.

The policy lives in `scripts/eng-citations-gate.mjs` rather than inline shell, so the three cases can
be executed locally instead of argued about. All three were:

| Case                                              | Gate exit                   | Effect        |
| ------------------------------------------------- | --------------------------- | ------------- |
| Clean tree                                        | 0                           | merge allowed |
| A tracked file citing an ID absent from the index | **1**                       | merge blocked |
| Index URL 404s                                    | **0**, with a `::warning::` | merge allowed |

Two assumptions underneath were also tested rather than reasoned about:

- **The exit codes are distinguishable at all.** Wrappers commonly normalise a child's status to 1,
  which would collapse both cases into "blocking" and couple finance's merge queue to upstream
  availability. Measured: the checker exits **2** on an unreachable index and **1** on a bogus ID,
  and `spawnSync` reports both faithfully. An unanticipated code falls through to blocking, which is
  the safe direction for a gate.
- **No credential is involved.** The existing job passes no token and the index resolves anonymously
  in CI, so the gatekeeper behaves identically. Had a token been required and absent, the step would
  have exited 2 and warned green forever — which is this document's recurring failure, and it would
  have been introduced by the commit that added the guard against it.

### Three local validators passed a workflow file GitHub rejected

The first attempt at the step above put the exit-code policy in an inline shell block. It was
committed, pushed, and **broke `ci-security.yml` outright**: GitHub reported `Invalid workflow file
... You have an error in your yaml syntax`, produced no jobs, and therefore never reported the
required `Required Checks Gatekeeper` context. The PR sat at `BLOCKED` for forty minutes.

The failure mode is worth recording because of how it presents. **A workflow that fails to parse
does not show a red check — it shows a missing one.** `gh pr checks` listed no failures, because the
jobs were never created. The run appears in `gh run list` identified by _path_ rather than by name,
which is the visible tell:

```
CI — Lint                            completed  success
.github/workflows/ci-security.yml    completed  failure
```

Diagnosing it needed the run page, because `gh api .../check-runs/<id>/annotations` returns 404 for
a run with no jobs — the same shape as the private-repo billing-hold failures a peer repository
reported, where logs and summaries are all empty.

**Every local check passed on the broken file:**

| Validator                                           | Verdict on the file GitHub rejected |
| --------------------------------------------------- | ----------------------------------- |
| `js-yaml` parse                                     | OK                                  |
| `js-yaml` structural read (11 steps, correct order) | OK                                  |
| `prettier --check .`                                | OK                                  |
| `npm run workflow:security:check` / `:test`         | OK                                  |

Byte-level checks were clean too: no BOM, no tabs, LF endings, no trailing space after `run: |`. I
could not identify the offending token, and I want to state that plainly rather than invent a
cause — **the honest finding is that finance has no local validator that agrees with GitHub's
workflow parser**, and three that disagree with it silently.

The fix does not depend on knowing the token. Moving the policy out of inline shell into
`scripts/eng-citations-gate.mjs` reduced the workflow change to a single `run:` line, which is
better independently: the exit-code policy is now executable locally, and its three cases are
tested above rather than asserted. That is the right response to a construct you cannot validate —
stop emitting the construct.

Two smaller things the attempt exposed, both from writing YAML through PowerShell:

- A double-quoted here-string ate a backtick-escaped word, turning `` `eng-citations` `` into
  `ng-citations` in a comment. Prettier, ESLint and the YAML parsers were all happy with it. Line
  arrays and `WriteAllLines` avoid the class entirely.
- `npm run` scripts here reject `console.*` under `no-console`; the repo idiom is
  `process.stdout.write` / `process.stderr.write`, as in `scripts/vendor-configs.mjs`. The gate
  script was rewritten to match, and **its three cases were re-tested after that rewrite** rather
  than assumed to have survived it, since the change touched the same statements that carry the exit
  codes.

### Enforcement verified by log, not by YAML

The previous change wired the citation gate into the required `Gatekeeper` job. That established
the gate _should_ run. It did not establish that it _did_ — the same gap that makes a capability
banner a claim rather than a report. Reading the workflow file to confirm a step executes is
reading a description of the thing instead of the thing.

Observation, from the `Gatekeeper` job log on the merged head:

| Step | Name                               | Conclusion |
| ---- | ---------------------------------- | ---------- |
| 7    | ESLint                             | success    |
| 8    | ENG citation check                 | success    |
| 9    | Text encoding check (U+FFFD)       | success    |
| 12   | Aggregate required security checks | success    |

And the step body, which is the part that distinguishes a run from a no-op:

- `132 citation(s) across 39 principle(s) in 806 file(s); all IDs exist, and 42 stated name(s) match.`
- `checker v9; checks run: IDs, stated names, range members, link paths.`

Three things follow. The counts are **identical to the local run**, so CI and the developer
machine are looking at the same corpus at the same scope — the scope link and the invocation link
are both closed by measurement rather than by argument. The step sits at index 8, ahead of the
aggregate at index 12, so a non-zero exit fails the job that branch protection actually requires.
And the run is on a job whose name resolves — a workflow that fails to parse produces no jobs at
all, so the presence of a named job is itself evidence the file is valid.

**The banner is still a claim.** `checker v9` in the CI log is the same field that read `checker v3`
unchanged for a day in another repo. What makes the CI binary trustworthy here is not the banner
but `eng:vendor:check`, which compares the three vendored files against the pinned ref by content
hash. CI checks out the same tree that check validates, so the binary link is closed by content
and the banner is corroboration, not evidence.

**What is still unobserved:** the gate has never _blocked_ in CI. Its failure path is proven only
locally, where a bogus ID produced exit 1 and an `::error::` annotation. A gate that has only ever
passed is compatible with a correct gate and with one that cannot fail, and no amount of green
distinguishes them. The honest statement is that the block path is verified on the developer
machine and unverified in the environment that enforces it.

### Half of finance's CI jobs took their privileges by inheritance

The fleet's workflow-permissions discussion has been entirely about grants that are too _small_:
a caller omits a scope its callee needs and the run dies as a `startup_failure`. That hazard
announces itself. The mirror hazard does not.

A job that omits `permissions:` inherits the workflow-level grant, and the workflow-level grant is
necessarily the **union** of what the file's most-privileged job needs. So the least-privileged job
in a file runs at the privilege of the most-privileged one, and nothing ever fails to say so.

Measured across all 31 workflows and 120 jobs:

| Convention                     | Files | Jobs | Inheriting | New job fails                 |
| ------------------------------ | ----- | ---- | ---------- | ----------------------------- |
| `permissions: {}` at top level | 9     | 58   | 0          | closed                        |
| Scoped grant at top level      | 21    | 61   | 60         | open                          |
| No top-level block             | 1     | 1    | 0          | closed (job declares its own) |

**60 of 120 jobs — half the repository — receive their scopes implicitly.** The concrete cases are
not theoretical: `nightly.yml` grants `issues:write`, `pull-requests:write` and
`security-events:write` at file level, and its `load-test` and `zap-baseline` jobs inherit all
three. `ci-security.yml` grants `security-events:write` to ten jobs including `summary` and
`gatekeeper`. `ci-android.yml` hands `security-events:write` to `changes`, a path-filter job.

This is `ENG-SEC-004` (Least authority) precisely, and the principle names the mechanism rather
than just the outcome: _broad or **implicit** authority turns one compromised identity or component
into unrelated access_. Inheritance is the implicit form. The nine `permissions: {}` files are
`ENG-SEC-007` (Secure failure) working as intended — a job added there without a block gets
metadata only and its checkout fails immediately, so the mistake surfaces on the first run.

**`permissions: {}` is not deny-all**, and it is worth being accurate about this because the
fail-closed property depends on what survives rather than on nothing surviving. `metadata: read`
cannot be dropped. The value of the empty map is not that it grants nothing; it is that what it
grants is insufficient to check out the repository.

#### The existing check had the same defect as everything else this session

finance already had a least-privilege check, and it had been passing for as long as it existed. It
asserts that privileged workflows declare `permissions: {}` — against a **hardcoded list of eight
filenames**. That is the scope link once more, expressed as a list rather than as a path: the other
twenty-one files were not failing the check, they were not _in_ it.

The list had also drifted from the one beside it. `privilegedWorkflows` names ten files;
`leastPrivilegeWorkflows` named eight. `rc-branch-tag.yml` is privileged, already satisfies the
requirement, and was not asserted to — so removing its `permissions: {}` would have been silent.
Adding it costs nothing today and closes the gap. (`nightly.yml` is the other omission and is
genuinely non-empty, so it stays out.)

The new check derives its scope from the tree instead of from a list, and is a **ratchet**: the 60
jobs that already inherit are recorded as a baseline, and the check fails only when a sixty-first
appears. Rewriting 21 workflows to drop scopes that jobs may actually need would risk breaking CI
to fix a latent issue; freezing the current state and blocking growth does not. Shrinking the
baseline is always safe.

#### Two implementations, because one implementation is an assertion

The check is dependency-free line scanning, matching the surrounding tool. `js-yaml` is **not a
declared dependency** of finance — it resolved in a scratch script only by hoisting, which is
exactly the kind of accident that makes a tool work until it doesn't.

So the numbers above were produced twice: once with a real YAML parser, once with the shipped
line-scanner. They agree on **60 of 60 inheriting jobs with zero mismatched files**. A single
implementation would have given a number with nothing to check it against, and the count is the
entire basis for the baseline.

Both directions of the gate are proven rather than argued: an unbaselined inheriting job produces
the error, a job declaring its own `permissions:` does not, and an empty-map base reports nothing.
Unit tests cover all three.

#### Enforcement, for free

`workflow:security:check` already runs inside the required `Gatekeeper` job. Extending that script
rather than adding a new step means the fourth link is closed with **no workflow-file edit at all**
— which, having previously broken `ci-security.yml` in a way no local validator detected, is worth
more than the tidiness of a separate script.

### A paraphrase of a scoping rule inverted the answer for 18 finance files

The 2026-08-13 broadcast described `@jrmoulckers/eslint-config@0.14.0` as fixing a crash class:
`base()` applies the type-checked rule sets unscoped, then re-disables them for `**/*.ts*`,
`**/*.js*` and `toolingFiles`, so any other extension gets type-aware rules with no project and
aborts the run. The mechanism is real. The two globs are not what the source contains, and the
difference is load-bearing.

`base.js` on `origin/main` (package `0.15.0`) enumerates extensions explicitly, at L104 and L113:

```js
files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
```

Eight literal extensions, not two star-globs. Matched with `minimatch`, the two descriptions
disagree on **five of nine** candidate extensions:

| File    | prose globs | source list |
| ------- | ----------- | ----------- |
| `.js`   | covered     | covered     |
| `.jsx`  | covered     | covered     |
| `.ts`   | covered     | covered     |
| `.tsx`  | covered     | covered     |
| `.mjs`  | **not**     | covered     |
| `.cjs`  | **not**     | covered     |
| `.mts`  | **not**     | covered     |
| `.cts`  | **not**     | covered     |
| `.json` | covered     | **not**     |

`*.js*` does not match `.mjs` — the glob needs a literal `.js`, and `.mjs` has none. Four of the
five disagreements run in the dangerous direction: the paraphrase reports as _uncovered_, and
therefore in the crash class, four extensions the code covers.

This was not academic here. Reasoning from the broadcast, finance has **18 linted `.mjs` files**,
which the prose places squarely in the crash class — a live exposure requiring a floor bump. The
source says they are covered. The exposure claim was drafted and discarded only because the
source was read; it would have shipped as a finding otherwise, and it would have been wrong.

**What finance actually lints.** From `eslint . --format json`, 2,513 files:

| Extension | Files | In the eight? |
| --------- | ----: | ------------- |
| `.ts`     | 1,852 | yes           |
| `.tsx`    |   601 | yes           |
| `.js`     |    42 | yes           |
| `.mjs`    |    18 | yes           |

Four extensions, all covered. finance is structurally immune to this crash class, and there is
no configuration it could adopt that would expose it, short of introducing a template language.

### `untypedFiles` is an escape hatch, not a default

The 0.14.0 addition is applied conditionally — `base.js` L126, `untypedFiles.length > 0` — and
defaults to `[]`. A `base()` consumer who hits the crash still hits it after upgrading; the
release gives them the means to fix it, not the fix. It is the shipped `svelte.js` that is
repaired, because that preset passes the globs itself at L75:

```js
untypedFiles: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
```

"Fixes the class" is accurate for the preset upstream ships and not for the entry point the
sentence names. The distinction decides whether a consumer needs to change a version number or
change a call, and only the second is true for `base()`.

### The floor is not being bumped, and the reason is not inertia

Upstream sent `>=0.14.0 <1.0.0` with an instruction to copy it literally. finance records
`>=0.13.0 <1.0.0` and is keeping it, on three measured grounds:

1. **It already resolves the release.** A correct lower-bound range degrades gracefully;
   `>=0.13.0 <1.0.0` installs `0.14.0` and `0.15.0` unchanged. This is the same distinction drawn
   earlier in this document between a stale printed floor and a stale dependency — only the
   caret form has the second failure.
2. **The bump would encode a requirement finance does not have.** A floor is a compatibility
   claim. Asserting `>=0.14.0` states that finance needs the `untypedFiles` fix; the extension
   census above shows it cannot.
3. **The number was stale on arrival.** `origin/main` publishes `0.15.0`. The instruction to copy
   a version literally and the shelf-life of a borrowed version pull against each other, and this
   is the fourth time in this thread a quoted version has aged before it could be applied.

`>=0.13.0 <1.0.0` is not a lag behind `>=0.14.0 <1.0.0`; it is the same range with a weaker and
more honest lower claim.

### Two broadcast items measured as not applicable

A broadcast to seven repositories mixes fleet-wide findings with per-repo actions, and the
addressee of "yours to action" is decided by the reader. Both items addressed to finance this

> **Correction (2026-08-12).** Upstream has since retracted the routing: the pnpm and `secrets:`
> items were another repository's findings, mis-sent here. The paragraph above treats them as
> "addressed to finance", which was the reasonable reading and was wrong. The measurements stand —
> finance is npm either way — but the framing should have been _unattributed_, not _ours_. Note
> that the ambiguity was visible before the retraction and was recorded as a shape rather than
> resolved as a question; asking would have cost one message.
> round were measured before being recorded.

**pnpm `auditConfig` relocation — not applicable.** The report is that pnpm 11.10.0 stops reading
`pnpm.auditConfig` from `package.json`, dropping suppressions silently with an unchanged exit
code. finance is npm:

| Evidence                          | Value                        |
| --------------------------------- | ---------------------------- |
| `packageManager`                  | `npm@10.9.4`                 |
| Lockfile                          | `package-lock.json` (291 KB) |
| `pnpm-lock.yaml` / workspace file | absent                       |
| `pnpm` key in `package.json`      | absent                       |
| `pnpm` references in 31 workflows | **0**                        |
| `npm ci` invocations              | 37                           |

No surface, so no finding. Recorded rather than dropped, because "measured as inapplicable" and
"not looked at" are the same silence otherwise.

**`curl` without `-f` — measured, and the remedy is the weaker pattern.** 18 `curl` lines across
workflows and scripts; 16 lack `-f`/`--fail`. Read as a count, that would be the finding. It is
not, because the dominant pattern captures the status directly:

```bash
http_code=$(curl -sSL -o "$HEALTH_RESPONSE" -w '%{http_code}' "$BASE_URL/health" || echo '000')
if [ "$http_code" = '200' ] && grep -Eqi '"status"[[:space:]]*:[[:space:]]*"(ok|healthy)"' "$HEALTH_RESPONSE"; then
```

The hazard upstream describes is an error body written at exit 0 and then consumed as if valid.
Here the body is consumed only after the status is `200` **and** the content matches. That is
strictly stronger than `-f`, which reports failure through an exit code and discards the body —
and adding `-f` would actively break these checks, since they need the code on the failing path
in order to report it. The one exception is `nightly.yml` L420-421, two readiness loops that
accept any HTTP status; a `zaproxy` scan with `fail_action: true` runs behind them, so the
exposure is a slower failure rather than a missed one.

The general form is worth keeping: **a lint-style count of a missing flag is not a finding until
the call sites are read**, because the flag may be absent for the reason that the code does
something better. 16 of 18 would have been a confident and wrong number.

### The blocker was never owner-side, and the evidence for it was void

For the whole of this adoption, one item has been recorded as blocking: an owner grant of
`read:packages` on the three `@jrmoulckers/*` packages. The evidence was `npm view` returning
`E401`, reproduced many times. Upstream independently agreed, and wrote that "the wall is
visibility rather than token scope." Both of us were wrong, and the error was measurable here at
any point.

Upstream's note that `gh` reports on the identity actually in effect prompted the check:

| Credential source        | Active  | Scopes                                                              |
| ------------------------ | ------- | ------------------------------------------------------------------- |
| `GH_TOKEN` (environment) | **yes** | `gist`, `project`, `read:org`, `repo`, `user`, `workflow`           |
| keyring                  | no      | `admin:public_key`, `gist`, `read:org`, **`read:packages`**, `repo` |

Two credentials, the same username, differing on exactly the scope in question — and the one
without it wins, because an environment `GH_TOKEN` outranks the keyring.

The second half is worse. `.npmrc` in this repository is one line:

```ini
@jrmoulckers:registry=https://npm.pkg.github.com
```

A registry, and **no `_authToken` at all**, with no user-level `.npmrc` either. So every `npm
view` this session ran **anonymously** against a registry that requires authentication for reads.
The `E401` was not evidence about a grant, a scope, or a visibility setting. It was the registry
correctly reporting that nobody had presented a credential.

Supplying the keyring token, which has the scope:

| Package                        | Result | Published  |
| ------------------------------ | ------ | ---------- |
| `@jrmoulckers/eslint-config`   | exit 0 | **0.15.0** |
| `@jrmoulckers/tsconfig`        | exit 0 | **0.4.0**  |
| `@jrmoulckers/prettier-config` | exit 0 | **0.4.0**  |

All three resolve. These are the **first registry-verified version numbers in this document**;
every other version recorded here was quoted from a message.

**The honest limit of this result.** The identity that succeeded is the org owner's, so it does
not establish that an arbitrary member can read the packages. What it does establish is that the
`E401` never tested that question, and therefore that nothing in the blocker's evidence supported
the blocker. A pending owner action and an absent local credential produce the same `E401`, and
this session spent its entire duration reading one as the other.

The generalisation is the sharpest available form of a theme running through this whole document.
Earlier entries establish that a _green_ result can certify nothing — wrong scope, stale binary,
no invocation, no enforcement. This is the same defect on the red side: **a failing check is not
evidence of the failure it names.** `E401` names authorisation, and three distinct conditions
produce it — no credential, an under-scoped credential, and a genuine denial. Only the third was
ever recorded, and it was the one that was not happening.

And it inverts the reporting relationship. The blocker was escalated _upstream_, to an owner, for
action; it was resolvable _locally_ the entire time, by the party reporting it. A blocker attached
to someone else's authority is the least likely of all blockers to be re-tested, because the
reporter has defined the fix as not theirs.

### Three claims settle now that the registry is readable

**The React gap is closed.** The opening brief for this adoption listed the preset's subpaths as
`./base`, `./svelte`, `./next`, and the first finding recorded here was that a React consumer had
no entry point — flagged as a gap for the engineering repo to fill rather than to work around.
`@jrmoulckers/eslint-config@0.15.0` declares six exports:

```json
".", "./base", "./svelte", "./react", "./next", "./ignores"
```

`./react` exists and ships `react.js`, `react-layer.js` and `hooks.js`. The gap is closed, and it
is closed _in the registry_, which is the only place the question could ever have been settled.

**The TypeScript peer range is satisfied, and finance's recorded compiler version was stale.**
The published peer is `typescript: ">=5.5.0 <6.1.0"`. finance runs **6.0.3** — not the 5.9.3 this
repository's own notes still assert — and `semver.satisfies` returns true. The long-running peer
disagreement is resolved by measurement rather than by either party conceding.

**`allowImportingTsExtensions` is genuinely absent from the shared base, and is not finance's
exposure.** Upstream warned that the base is not a superset and that a consumer verifying
adoption as "0 lost / 0 gained" may have checked only the ESLint side. The option is absent, and
finance does not use it. The warning is right and the named option is the wrong one here — which
is worth stating, because a reader who checks only the named option concludes there is no
exposure, and there is.

### What finance would actually lose to `@jrmoulckers/tsconfig`, measured

finance has exactly **one** `tsconfig.json`, at `apps/web/`. Resolving the shared
`vite-react.json` chain — `vite-react` → `vite-app` → `base` — gives the first real delta.

**Silently lost unless re-declared:**

| Option               | finance                                                   | shared            | Consequence                                                                             |
| -------------------- | --------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `types`              | `["node", "vitest/globals", "@testing-library/jest-dom"]` | `["vite/client"]` | `types` is **replaced, not merged** — test globals and jest-dom matchers stop resolving |
| `baseUrl` / `paths`  | `"."` / `@/* -> src/*`                                    | absent            | every `@/` import fails to resolve                                                      |
| `ignoreDeprecations` | `"6.0"`                                                   | absent            | required on TypeScript 6.0.3                                                            |

The `types` row is the concrete form of upstream's warning. It is more dangerous than a missing
compiler flag because the failure is not a config error — it surfaces as thousands of unrelated
"cannot find name" diagnostics in test files, which reads as a broken test setup rather than as a
config regression, and points debugging away from the change that caused it.

**Newly gained (all error-producing, none previously counted):** `moduleDetection: force`,
`verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `useDefineForClassFields`,
`allowJs` + **`checkJs`** — the last of which newly type-checks finance's 42 `.js` files — plus a
`target`/`lib` move from ES2022 to ES2023.

This does not change the standing decision to defer the tsconfig adoption on cost. It does change
its basis from an estimated finding count to an enumerated list of three losses and ten gains,
and it means the deferral is now a decision rather than a guess.

## The cost of adopting the React preset, measured

The original brief's first item — diff finance's ESLint config against the shared preset and
enumerate exactly what would be gained or lost — was unanswerable for most of this engagement
because the registry read was failing. It is now answered, against a real installation of
`@jrmoulckers/eslint-config@0.15.0` linting finance's actual source.

**Rule-level diff**, comparing the effective config for `apps/web/src/App.tsx`:

|                 | finance today | `reactConfig()` |
| --------------- | ------------- | --------------- |
| listed          | 93            | 525             |
| active          | 71            | 121             |
| `react/*`       | 0             | 18              |
| `jsx-a11y/*`    | 0             | 31              |
| `react-hooks/*` | 0             | 2               |

**+52 gained, −2 lost, 1 severity change.** The two lost are `no-unexpected-multiline` (switched
off by `eslint-config-prettier`, which is deliberate) and `finance/no-hardcoded-date-locale`. The
second custom rule, `finance/no-money-template-interpolation`, is absent from that particular
comparison only because `App.tsx` is outside its `files` globs; both must be re-added through the
preset's `extend`/`rules` options. The severity change is
`@typescript-eslint/no-unused-vars`, `warn` → `error`.

> **Correction.** When first reporting that severity change I noted a caveat: that finance
> configures the rule with `argsIgnorePattern`/`varsIgnorePattern` of `^_`, and that those options
> would be silently lost alongside the severity. **That caveat is wrong.** The preset configures
> `{argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_'}` — the same
> two patterns finance sets, plus one finance does not. Nothing is lost; one thing is gained. I
> raised the caveat from the shape of the diff — a severity-only comparison _can_ hide an options
> change — without checking whether it did here. A hazard that is real in general is not thereby
> present in the instance, which is the same error this document has now recorded three times.

**Adoption cost, measured across all 2,301 files under `apps/web/src`:**

|                                 | count        |
| ------------------------------- | ------------ |
| errors                          | 267          |
| warnings                        | 47           |
| files with at least one finding | 137 of 2,301 |
| auto-fixable                    | 13           |

That headline number is misleading, and the reason is the most useful thing in this measurement.

### 171 of the 314 findings are a rule that is wrong about finance

`jsx-a11y/no-redundant-roles` accounts for **171 findings — 54% of the total — across 50 files**.
Every one is the same shape: `The element ul has an implicit role of list. Defining this
explicitly is redundant and should be avoided.`

It is not redundant. Safari strips list semantics from any `<ul>` carrying `list-style: none`, so
VoiceOver does not announce it as a list; the standard remedy is an explicit `role="list"`.
finance has **105 `list-style: none` declarations across 159 CSS files** and **303 `role="list"`
attributes in `.tsx`** — the workaround is applied systematically, not incidentally, and the 171
flagged sites are exactly the `<ul>` subset of it. The largest single source of adoption cost is
a rule firing on correct accessibility code, in a repository whose stated obligation is WCAG 2.2
AA.

Excluding it, the real cost is **96 errors + 47 warnings across 98 files**:

| count | rule                                              |
| ----- | ------------------------------------------------- |
| 34    | `react-hooks/exhaustive-deps`                     |
| 27    | `jsx-a11y/no-noninteractive-element-interactions` |
| 25    | `@typescript-eslint/no-unused-vars`               |
| 15    | `jsx-a11y/no-noninteractive-tabindex`             |
| 13    | unused `eslint-disable` directives                |
| 8     | `jsx-a11y/label-has-associated-control`           |
| 7     | `react/no-unescaped-entities`                     |
| 2     | `react-hooks/rules-of-hooks`                      |
| 11    | eleven further rules at ≤3 each                   |

All 25 `no-unused-vars` are a legacy `import React from 'react'` under the new JSX transform — a
mechanical sweep, not judgement. The 2 `rules-of-hooks` are the only findings that may indicate a
real defect rather than a lint debt.

**This is upstream-actionable.** `@jrmoulckers/eslint-config`'s React layer should disable or
downgrade `jsx-a11y/no-redundant-roles`. Any consumer that applies the Safari workaround gets
flooded by it, and the pressure a `--max-warnings 0` gate then applies is pressure to _remove_
working assistive-technology support. A preset whose default configuration penalises the
accessible option is worse than no preset for that rule.

### The preset does not install on ESLint 10, and the incompatibility is not real

finance runs ESLint **10.6.0**. A default `npm install` of `@jrmoulckers/eslint-config@0.15.0`
fails `ERESOLVE`:

| plugin                      | highest ESLint peer accepted                                  |
| --------------------------- | ------------------------------------------------------------- |
| `eslint-plugin-jsx-a11y`    | `^9` — no published version, 6.7.1 through 6.10.2, accepts 10 |
| `eslint-plugin-react`       | `^9.7`                                                        |
| `eslint-plugin-react-hooks` | `^10` ✓                                                       |

The preset itself declares `eslint: ^9.0.0 || ^10.0.0`. That declaration is honourable in intent
and unresolvable in practice, because two of its own required peers contradict it.

**But installed with `--legacy-peer-deps` on 10.6.0 the preset works.** `jsx-a11y/alt-text` fires
on a real `<img>` with no `alt`, exit 1, a genuine finding rather than a crash — and the
2,301-file run above _is_ that installation. So the wall is a **stale peer declaration in two
third-party plugins**, not an incompatibility, and the correct consumer remedy is an npm
`overrides` block rather than `--legacy-peer-deps`, which suppresses every peer check in the tree
rather than the two that are wrong.

This is the same defect class as the `checksRun` literal recorded above: **a declaration asserted
rather than derived, believed because it is machine-readable.** There it over-claimed capability;
here it under-claims compatibility. Both are answered only by running the thing.

One residual: `eslint-plugin-react` warns `React version not specified` on every run. That is the
consequence of upstream avoiding the ESLint 10 `version: 'detect'` crash by omitting the setting
entirely, so any consumer must set `settings.react.version` itself.

### Standing decision

Adoption is **staged, not deferred and not immediate**. The 171-finding rule must be settled
upstream first, because adopting around it locally would mean either disabling a shared rule in
finance — re-creating exactly the divergence this engagement exists to remove — or deleting
correct accessibility markup. The remaining 143 findings are a reasonable single-PR sweep once
that is resolved, and the `react-hooks` rules alone justify the adoption.

## Three upstream items, checked rather than filed

**`.js` was never broken, and the mechanism is one this document already reached.** Upstream
corrected its own account of the `strictTypeChecked` crash: the fix landed in `0.6.0`, not
`0.12.0`, and `strictTypeChecked` and the `.js` disable block **arrived in the same release**, so
no published version ever exposed the `.js` case. `.svelte` was the half actually broken. Their
diagnosis — the disable blocks were written by **enumerating extensions**, and an enumeration
silently omits whatever it does not name — is the same finding recorded above under the
paraphrase analysis, reached independently from the other direction. Two derivations, one
mechanism; that is the strongest form this document has for believing a structural claim.

**A verification probe that cannot fail.** Upstream reports that another consumer verified the
`.js` fix by linting a plain `.js` file through a `svelteConfig()` that does not pass
`strictTypeChecked`, and got exit 0. Run against `0.5.0` — which predates the entire mechanism —
it also gives exit 0. Without the option the type-checked sets are never applied, so nothing can
abort on any version. The probe measures that type-aware linting is **off** and reports it as
proof that a type-aware crash is **fixed**: an all-clear whose failure mode also renders as an
all-clear. This is the third instance in this document, after the `pad=70` fixture and the
inert `ENG-PERF-001..004` range, and they now form a single rule: **a control that has never been
observed to go red has not been shown to be a control.**

**The restated `prettier-config` floor is stale.** Upstream's current broadcast repeats
`@jrmoulckers/prettier-config >=0.3.0 <1.0.0`. The registry, queried with a credential that can
actually read it, publishes **0.4.0**. The floor is not wrong — 0.4.0 satisfies it — but it is
quoted as current in the same message that apologises for unverified version claims, which is
worth naming rather than silently correcting. `eslint-config` is likewise at **0.15.0**, one minor
above the stated `>=0.14.0`.

## A required check can be satisfied by not running

The sibling session checked the enforcement link against `jrmoulckers/engineering` and found it
fails there completely — no ruleset, no branch protection, and all four of `validate.yml`'s checks
reporting `isRequired: null`. Their generalisation is right and sharper than the version recorded
above: not-in-CI is the empty scope, in-CI-but-unrequired is full scope and zero authority, and
**an unprotected branch is that condition for every check at once** — the cheapest of all to miss,
because it is a property of the repository that no workflow file mentions.

finance passes that test. `gh api repos/jrmoulckers/finance/branches/main/protection` returns
**7 required contexts**, with `strict: true`, linear history required, and force-push and deletion
both disabled. (`required_approving_review_count: 0` and `enforce_admins: false` — consistent with
the agent self-merge policy, which relies on required checks rather than on a human reviewer.)

Applying the test to a real merged PR rather than to the settings, though, produces something the
settings do not show. On **#4161**, which is this document's own last change:

|                                           | count      |
| ----------------------------------------- | ---------- |
| check-runs reported                       | 33         |
| distinct check names                      | 27         |
| required contexts, all of which reported  | 7          |
| advisory — ran, carried no authority      | 20         |
| **required check-runs that were SKIPPED** | **5 of 9** |

`ESLint & Prettier`, `Build`, and `Build & Test` (three times) are all **required** and all
reported `SKIPPED`. Only four required check-runs actually executed. The PR merged.

This is deliberate, and finance documents it: `.github/workflows/ci-lint.yml` L50–58 carries an
explicit guardrail — _do NOT add `paths:` to this workflow's `on:` triggers; a required check whose
workflow is filtered out never reports its status, leaving PRs stuck in BLOCKED; gate inside the
workflow via the `changes` detector (skip-with-success) instead._ That comment is the earlier
path-filter finding, already landed. The design is correct.

The hazard is what the design implies rather than what it does wrong: **"required" does not mean
"ran".** A skipped job reports a conclusion that satisfies branch protection, so the strongest
statement available about a merged finance PR is not "the required checks passed" but "the
required checks either passed or declined to run, and the two are not distinguished at the merge
gate." That is a fifth presentation of the enforcement link, and unlike the other four it is not a
misconfiguration — it is the intended behaviour of the mechanism.

### The instrument that reported it was mine

`gh pr checks <n>` filtered for `fail|pending` returns nothing here, and I wrote **ALL GREEN** on
that basis — four times this session, including on the PR measured above, where **16 of 33
check-runs were skipped**. The polling loop I have used all engagement to verify every one of the
sixty-six merged PRs counts a skip as a pass, silently, because a skip is neither a failure nor
pending.

This is the same defect this document has now catalogued in a vendored checker's `checksRun`
literal, in a fixture that could not fail, and in a probe that measured a feature being off. The
difference is only that the previous four were someone else's. **A check that reports the absence
of bad news is not reporting good news**, and the verification instrument is the last place anyone
thinks to apply that.

## Two hypotheses refuted in the same pass

Both arose from the measurement above and both looked like findings.

**The unexpanded matrix names are not a defect.** `gh pr checks` returns two check names containing
literal, uninterpolated `${{ matrix.browser }}` and `${{ matrix.shard }}`. The obvious reading is a
job `name:` referencing a matrix key that is not in scope. It is not: `ci-web.yml` L121–124
declares `matrix: shard: [1, 2, 3, 4]` correctly. The literal is simply how GitHub renders a
**skipped** matrix job — one check-run bearing the template text, because no matrix value was ever
bound. An odd-looking string is not evidence of the defect it resembles.

**There is no markdown formatting hole.** The `changes` filter in `ci-lint.yml` L62–85 enumerates
`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.json`, `.css`, `.html`, `.yaml`, `.yml` and several
paths — and **no `**/*.md`** — while the job it gates ends in `npx prettier --check .`, which does
check markdown (verified against a deliberately malformed file: exit 1). A markdown-only PR
therefore skips the job that would have checked its formatting, and #4161 was a markdown-only PR
whose first draft was Prettier-dirty. That reads exactly like a hole through which unformatted
documentation merges.

It is not one. `ci-security.yml` L522–523 runs `npx prettier --check .` a second time, inside the
**required** `gatekeeper` job, under `if: always()`. Markdown formatting is enforced on every PR
regardless of paths; the skippable copy is redundancy, not the only coverage.

That redundancy is worth distinguishing from the kind the sibling session correctly dismissed.
Four YAML validators that all passed a file GitHub rejected were **redundant instruments sharing
one parser** — one confirmation reported four times, and the shared dependency is invisible in the
count. finance's two Prettier invocations are the opposite shape: **one instrument on two
triggers**, deliberately, so that a path filter cannot remove the only path to it. Redundant
instruments are worth having only when they are independent; redundant triggers are worth having
precisely when the instrument is the same.

## The CI-cause discriminator misfires on exactly the repo it recommends as the control

Upstream reports a fleet-wide CI outage traced to an account billing stop rather than to the
`packages: read` ceiling they had previously broadcast, and supplies a two-row table for telling
the causes apart without a control run:

| upstream's claim          | `/jobs` | `/timing`                     |
| ------------------------- | ------- | ----------------------------- |
| caller grant below callee | 0 jobs  | `{}`, `run_duration_ms: null` |
| billing / spending limit  | n jobs  | `total_ms: 0`                 |

They also advise: _before treating a red run as evidence about your change, confirm the account can
produce a green at all — cheapest check is a public repo under the same account._

**finance is a public repo under that account** (`visibility: public`, owner `jrmoulckers`), which
has two consequences. The first is that finance's uninterrupted green CI is **not** evidence
against the outage: public Actions minutes are not billed, which is upstream's own stated mechanism
for the private/public split, so finance is in a different platform state and its greens cannot
falsify a claim about billed repositories. That is their control-validity rule applied to the
tempting rebuttal, and it disqualifies it.

The second is that finance is precisely the class of repo they nominate as the fleet's control —
and the discriminator does not survive contact with it.

### Row 2 is matched by healthy runs

Four **completed, successful** finance runs from 2026-08-12:

| run         | jobs | `run_duration_ms` | `billable.UBUNTU.total_ms` |
| ----------- | ---- | ----------------- | -------------------------- |
| 31581246078 | 1    | 43,000            | **0**                      |
| 31580134139 | 10   | 415,000           | **0**                      |
| 31580134251 | 1    | 56,000            | **0**                      |
| 31579659337 | 4    | 5,000             | **0**                      |

`n jobs` and `total_ms: 0` — upstream's billing signature, exactly, on four runs that succeeded.
`total_ms` counts **billable** milliseconds, and a public repo is never billed, so it is
structurally pinned at 0 no matter what happens. The mechanism upstream correctly identifies two
paragraphs earlier is the same mechanism that voids their marker: **if public minutes aren't
billed, a public repo's healthy run necessarily reports zero billed time.**

So anyone following the advice — reach for a public repo to confirm the account can go green —
lands on the one repo class where every healthy run reads as a billing stop. The recommended
control and the supplied discriminator are incompatible with each other, and each is individually
sound.

### Row 1's cause is confirmed here, and its marker is not

finance has **18 `startup_failure` runs**, 16 of them on `Promote to Production`, and their cause is
documented in the fix: commit `43947dd9`, _"grant `actions:read` so Promote to Production reusable
call starts"_, with a surviving comment in `.github/workflows/promote-production.yml` explaining
that the reusable's `verify-ci-green` job requests `actions: read` and a called workflow cannot
escalate above the caller's grant. That is upstream's row-1 cause, hit independently in finance in
July, before the broadcast existed — and it is the strongest available confirmation of it, from a
repository they cannot see.

The marker attached to it does not hold. Three sampled runs of that same confirmed cause:

| run         | jobs | `run_duration_ms` | `billable` |
| ----------- | ---- | ----------------- | ---------- |
| 30320256823 | 0    | **1000**          | `{}`       |
| 30316804973 | 0    | **1000**          | `{}`       |
| 30312645631 | 0    | **null**          | `{}`       |

`run_duration_ms: null` appears in one of three. It also appears on a healthy in-progress finance
run. It is not a marker of anything.

### What actually discriminates, from this data

`jobs == 0` held across all three permission failures and none of the healthy runs, and
`billable == {}` — an empty object with no runner-class key at all — held identically. Healthy runs
carry a `UBUNTU` key whose `total_ms` is then meaningless on a public repo. So the usable test is
**the presence of a runner-class key in `.billable`, not the value of `total_ms`**, with `jobs == 0`
as the primary signal:

|                                                            | jobs | `.billable`   |
| ---------------------------------------------------------- | ---- | ------------- |
| never admitted (grant below callee, or malformed workflow) | 0    | `{}`          |
| admitted                                                   | n    | `{UBUNTU: …}` |

Note the parenthesis: **`jobs == 0` does not isolate permissions.** A workflow that fails to parse
produces the same shape, which this document already recorded from the other direction — a required
check that goes missing rather than red, with a run identified by path instead of name. Two causes,
one signature, and upstream's own fallback (`check-runs/$job_id/annotations`) needs a `job_id`,
which by construction does not exist when the count is zero.

### The pattern, which upstream named first

They wrote that a remembered version number reads like a memory rather than a claim, so it never
triggers verification. The table above is the same failure in a different register: a signature
recalled from three confirmed incidents, tabulated, and shipped as a test — without being run
against a **negative** case, which is the only thing that could have shown that healthy public runs
already match it. Three positives and no negative is the `pad=70` fixture again, and it is now the
fifth instance in this document.

## Registry state, re-queried rather than recalled

Upstream's message restates the floors `eslint-config >=0.14.0` and `prettier-config >=0.3.0`. I did
not answer from the numbers recorded earlier in this document, because doing so would be the exact
practice they were apologising for. Re-queried live with `--prefer-online` against an authenticated
registry read:

| package                        | published  | upstream's restated floor |
| ------------------------------ | ---------- | ------------------------- |
| `@jrmoulckers/eslint-config`   | **0.15.0** | `>=0.14.0`                |
| `@jrmoulckers/tsconfig`        | **0.4.0**  | `>=0.4.0` ✓               |
| `@jrmoulckers/prettier-config` | **0.4.0**  | `>=0.3.0`                 |

No floor is wrong — every published version satisfies its range. Two of three are quoted a release
behind, for the second consecutive broadcast, and reporting it a second time is only worth the
words because they asked to be checked rather than believed.

## A blended message is harder than a misrouted one

The upstream session sent a message crediting this session with five findings. One of them is
ours. The other four are not, and the true one is what made the false ones read as ours.

| Attributed finding                                              | Ours?   | Evidence                                                             |
| --------------------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| `strictTypeChecked` = 2,093 findings across 45 rules            | **yes** | measured here; recorded as the reason type-aware linting is deferred |
| 744 findings, removed by a `toolingFiles` fix                   | no      | never measured here; our figure is 314                               |
| 317 from artifact vs 266 from source, a 19% under-count         | no      | our counts are 525 listed / 121 active                               |
| `0.5.0` vs `0.6.0` tarball hashing, `next.js` exposure          | no      | this session never installed or examined `0.5.0`                     |
| `toolingFiles` accretion diagnosis (`test` vs `spec` asymmetry) | no      | reported to us as ours; we had not looked at those globs             |

This is the third misrouted message in the engagement, and it is the most difficult of the three,
because the previous two were wholly foreign and this one is not. A message that is entirely
another repo's findings is disproved by its first sentence. A message that opens with a figure we
did produce establishes that the sender has our context, and every later attribution inherits that
credibility. **The true half authenticates the false half.** Correcting it required checking five
claims individually rather than rejecting the message once.

The practical rule that follows: **attribution has to be checked per claim, not per message.** A
sender who is demonstrably talking to the right session may still be wrong about which findings
are that session's.

## The deletion in our worktree did not happen here

The message states that `.presettrial/` — 2,661 files, 38.7 MB — was deleted from
`C:\Users\jrmou\src\copilot-worktrees\finance\jrmoulckers-automatic-bassoon`, and that `HEAD` is
`7e345a74`. That path is ours. Checked:

```
HEAD actual                     0ebf7599   (== origin/main)
tracked files                   5,522
git status --porcelain          (empty)
.presettrial present            False
git ls-files .presettrial       (empty)
git log --all -- .presettrial   0 commits
```

Nothing was lost. `.presettrial/` never existed in this worktree and was never tracked; this
session's scratch installs have always lived in `$env:TEMP\presettrial9\` and `\presettrial10\`,
outside the repository entirely.

**The quoted SHA is the interesting part, because it resolves.**

```
git cat-file -t 7e345a74                       -> commit
git merge-base --is-ancestor 7e345a74 main     -> exit 1
git rev-list --count 7e345a74..origin/main     -> 10
```

`7e345a74` is `fix(ci): block new jobs from inheriting workflow-level permissions (#4029)` — our
own issue, our own subject matter. It is a **pre-rebase revision of this branch**, orphaned by one
of the force-pushes that squash-merging requires, ten commits behind, and not an ancestor of
`main`. The sender was reading a real snapshot of this branch, taken before those rebases.

Worth keeping, because it defeats the obvious check: **a SHA that resolves is not a SHA that is
current.** `git cat-file -t` succeeds on any object the repository still holds, including commits
no branch points at. The question "is this the state I am looking at" is answered by
`merge-base --is-ancestor`, not by whether the object exists. Verifying existence and reporting
agreement is the same shape as a control that cannot fail.

## The re-measurement was already run against the fixed artifact

The request was to re-measure `reactConfig()` on `0.15.0`. That measurement already exists in this
document — and because published versions are immutable, the `0.15.0` measured earlier is
necessarily the same artifact that carries the fixes now being announced. Confirmed in the
installed copy rather than assumed:

```
version   0.15.0
exports   . ./base ./svelte ./react ./next ./ignores
ignores.js present, toolingFiles exported, 24 globs
  test    cjs js jsx mjs ts tsx
  spec    cjs js jsx mjs ts tsx
  config  cjs js mjs ts
```

So the announced fixes are present in the artifact this session measured, and the finance figures
stand unchanged: **525 rules listed, 121 active, 314 findings (267 errors + 47 warnings) across
137 of 2,301 files.** They are not 317 and there is no 744 to have disappeared.

**A near-miss in that check is worth recording.** The first pass filtered the glob list with
`startsWith('scripts')` and `startsWith('tools')`, got nothing, and was one sentence away from
reporting that the announced `scripts/**` and `tools/**` additions had not shipped. Both had — as
`**/scripts/**/*.ts` and `**/tools/**/*.ts`. The filter tested for a leading literal against globs
that are `**/`-prefixed by construction. **An absence produced by a filter is a property of the
filter until the unfiltered list has been read.**

## What the tooling globs are actually worth to finance

This is the part that is genuinely ours to measure. Effective configuration under
`reactConfig()` at `0.15.0`, printed per file:

| file                                | `no-console` | `no-require-imports` |
| ----------------------------------- | ------------ | -------------------- |
| `scripts/eng-citations-gate.mjs`    | `off`        | `off`                |
| `tools/check-workflow-security.mjs` | `off`        | `off`                |

Both of finance's local gate scripts are covered by the shared preset, so finance's hand-written
`scripts/**` and `tools/**` console and CommonJS overrides become redundant on adoption. That is a
deletion from `eslint.config.mjs`, which is the acceptance test this adoption set itself.

The upstream session flagged `services/**` as the case it deliberately declined to put in the
shared preset, and built the `toolingFiles` export for consumers like finance to handle locally.
Measured, finance does not need it:

```
services/** tracked .ts/.tsx/.js/.mjs      127
  containing console.*                      10
  matched by toolingFiles (test/spec)         2
  not exempt                                  8
  of those, sites the rule actually flags     5   in 3 files
```

`no-console` in the preset is `warn` with `allow: ['warn','error']`, so `console.warn` and
`console.error` — 15 of the 20 call sites — never fire. **finance's blanket `no-console: off` for
`services/**` exists to suppress five `console.log`/`console.error`-adjacent calls in three
files**, all of them warnings. The exemption is roughly twenty-five times wider than the thing it
exempts. The right response is to fix or narrowly disable five sites, not to import a directory
exemption into the new config.

The upstream decision to keep `services/**` out of the shared preset is therefore correct, and
correct for a second reason it did not claim: the consumer it was reserved for does not need it.

**One more can't-fail control, caught in the act.** The first `services/**` probe sampled
`services/api/monitoring/alerts.test.ts` and reported `no-console: off` — apparently confirming
that `services/**` was exempt. That file matches `**/*.test.ts`. It was being classified as
tooling, not as services, so the probe was reading the preset's test-file rule and reporting it as
a services-directory result. Sampling the first element of a list is only safe when the list is
homogeneous with respect to the thing being measured, and this one was not.

## `TOOL_VERSION` understated its own finding by a factor of eleven

The table above sampled four tags and found two artifacts under one version numeral. A sibling
session corrected it to five tags and two artifacts, adding `v0.90.0`. Both are samples, and this
document already records why that matters — [an upper bound taken on report is an unverified
premise](#retraction-the-missing-function-was-not-unreleased). Accepting a fifth row would have
repeated the error the section beside it was written to prevent.

Enumerated instead, over every tag in the engineering repository:

```
153 tags total
141 contain scripts/check-citations.mjs
 14 distinct blobs
```

| blob (git, first 12) | bytes  | tags | range                  |
| -------------------- | ------ | ---- | ---------------------- |
| `15618223e3c9`       | 6,297  | 1    | `v0.2.10`              |
| `3c9dad266239`       | 6,866  | 6    | `v0.2.11` – `v0.2.16`  |
| `cd1a6647ef8e`       | 6,800  | 12   | `v0.2.17` – `v0.13.0`  |
| `1ef575fca962`       | 9,479  | 14   | `v0.14.0` – `v0.16.4`  |
| `af5ed014d33f`       | 11,783 | 13   | `v0.16.5` – `v0.21.0`  |
| `8c3a2eb70e2b`       | 12,719 | 1    | `v0.21.1`              |
| `e15b3cbd02a6`       | 13,860 | 1    | `v0.22.0`              |
| `02a5b2502094`       | 14,693 | 1    | `v0.23.0`              |
| `c47ace846f2a`       | 16,566 | 1    | `v0.24.0`              |
| `817e623c77b6`       | 17,124 | 4    | `v0.25.0` – `v0.28.0`  |
| `91cbe1ffa376`       | 18,321 | 3    | `v0.29.0` – `v0.31.0`  |
| `ea0b32b54573`       | 20,155 | 25   | `v0.32.0` – `v0.56.0`  |
| `baa18e599cb4`       | 21,967 | 14   | `v0.57.0` – `v0.70.0`  |
| `02df2659c0b6`       | 22,699 | 45   | `v0.71.0` – `v0.115.0` |

The two artifacts in the original table are the last two rows. They span **59 tags**, not four and
not five. And the transition is exact: the 732-byte change landed between **`v0.70.0` and
`v0.71.0`**, not in the `(v0.66.0, v0.76.0]` window both sessions had settled on — a window ten
releases wider than the fact.

### The version numeral was maintained, then abandoned

Reading `TOOL_VERSION` out of each distinct blob rather than out of each sampled tag:

| blobs                                          | `TOOL_VERSION`                                    |
| ---------------------------------------------- | ------------------------------------------------- |
| first five                                     | absent                                            |
| `8c3a2eb70e2b` → `91cbe1ffa376` (7 artifacts)  | `3`, `4`, `5`, `6`, `7`, `8`, `9` — one bump each |
| `ea0b32b54573`, `baa18e599cb4`, `02df2659c0b6` | `9`, `9`, `9`                                     |

For seven consecutive artifacts the numeral tracked the content exactly. Then it stopped. The
three artifacts that follow all declare `9`, and they span **84 tags** and **20,155 → 22,699
bytes**.

There is a fourth. `origin/main` carries a **fifteenth blob**, `f7b1bd6f5565`, in no tag at all:
**28,326 bytes, +147 / −13 lines** against `v0.115.0`, and it declares `TOOL_VERSION = '9'`.

So the finding as originally filed — _two released checkers, 732 bytes apart, one version numeral_
— was right in kind and low by an order of magnitude in degree:

|                       | filed  | measured             |
| --------------------- | ------ | -------------------- |
| artifacts sharing `9` | 2      | **4**                |
| refs affected         | 4 tags | **84 tags + `main`** |
| byte spread           | 732    | **8,171**            |

The upstream suggestion recorded above stands unchanged in substance and considerably strengthened
in evidence: a consumer cannot distinguish four different checkers, one of which is only reachable
from an untagged branch.

### Two independent instruments agree, and this time the independence is real

finance's vendored copy hashes to `02df2659c0b6` — byte-identical to the newest tagged upstream
artifact. That is corroborated twice over, by instruments that share nothing:

| instrument                      | function                            | retrieval                    | result         |
| ------------------------------- | ----------------------------------- | ---------------------------- | -------------- |
| `git rev-parse <tag>:<path>`    | SHA-1 over `blob <len>\0` + content | local object store           | `02df2659c0b6` |
| `engineering-configs.lock.json` | SHA-256 over content                | network fetch of the release | `4bc850401c2f` |

Different hash function, different retrieval path, same conclusion. This is the property that the
four YAML validators lacked when they agreed on a file GitHub rejected: they shared `js-yaml`, so
four agreements were one agreement repeated. Here the agreement is worth its arithmetic.

`node scripts/vendor-configs.mjs --check` exits 0 and reports the distinction precisely:

```
3 vendored file(s) match engineering-configs.lock.json at v0.86.0.
Notice: pinned at v0.86.0; newest release is v0.115.0, but all 3 vendored file(s)
are byte-identical there. No action needed — refreshing the ref would produce no diff.
```

Twenty-nine releases separate the pinned ref from the newest one and **not one byte of vendored
content differs**, because `v0.86.0` and `v0.115.0` are both inside the `02df2659c0b6` run. The
check reports a stale _ref_ without claiming stale _content_, which is the whole reason it
distinguishes the two.

### Three levels, and the hash is not the top one

The progression this thread has been climbing is now visible end to end:

1. **A declared version numeral** is an assertion by the author. It failed here across four
   artifacts and 84 tags.
2. **A content hash** is a property of the bytes. It caught what the numeral missed, and it cannot
   be produced by subtraction, by a length function, or by any instrument not reading the actual
   bytes — a byte count has near-misses, a hash has none.
3. **A fixture** is the only thing that answers what the code _does_.

Level 3 is not decoration on level 2, and this file is the proof. The 732-byte difference between
`baa18e599cb4` and `02df2659c0b6` — the difference the hash correctly detected and the numeral
missed — was [shown by a two-armed fixture to be behaviourally
inert](#retraction-a-true-finding-about-the-mechanism-licensed-a-false-finding-about-the-instance):
both artifacts fire the
range-member check identically, and `contextWindow()` is a refactor of display context, not a
change in any decision.

**So a hash difference is not a behaviour difference, in exactly the way a token count is not a
behaviour claim.** The hash is the right instrument for _provenance_ and the wrong one for
_capability_. Ranking it above the numeral is correct; treating it as the end of the ladder is the
same substitution one rung higher.

## Two corrected attributions returned unchanged

Last turn established that the 744-finding diagnosis and the `0.5.0` tarball analysis are not this
session's work. The next message re-attributes both, plus three more: a "342-rule key-by-key
comparison", a "`react.js` −67" point, and a `--max-warnings 0` report filed as "Gap 11". None
appear in this session's record.

One attributed detail **is** ours and is worth keeping straight: the `react-hooks/rules-of-hooks`
findings, and the observation that they surfaced only because finance registers no `react-hooks`
plugin at all. That count is now **3**, not 2.

A fifth claim is checkable and false:

> You're on `^0.7.0`; … the caret: `^0.7.0` can't reach `0.15.0`.

```
git grep '@jrmoulckers' -- '**/package.json'   ->  no match
```

**finance has no `@jrmoulckers` dependency of any kind**, at any range. There is no caret to
correct, because there is no dependency. This is the second consecutive message asserting a
version state for this repository that the repository does not have — and the correction is a
single grep, which is the point: a claim about a consumer's manifest is checkable against the
consumer's manifest.

The pattern worth naming is not the misattribution but its **persistence across a correction**. A
correction that does not change the sender's record will be overwritten by the sender's record on
the next send, so the same claim returns. The remedy on this side is to keep the refutation in a
durable artifact rather than only in a reply — which is what this document is for.

## The `--max-warnings 0` collapse is total in finance, and the baseline proves it

Upstream reports that presets ship rules at `warn` and that `--max-warnings 0` promotes them to
blocking. Measured here rather than accepted, because finance's answer is sharper than the general
one.

**finance's current lint emits nothing at all:**

```
npx eslint .        ->  2,514 files, 0 errors, 0 warnings, exit 0
```

So `--max-warnings 0` is presently **inert**. It cannot promote anything, because nothing is at
`warn` in practice — `eslint.config.mjs` sets `no-console` and `no-unused-vars` to `warn` at L130
and L131, and neither fires anywhere in the repository.

That flag is not incidental here. It appears at **five enforcement points**:

| location                                               | role                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `.github/workflows/ci-lint.yml` L114                   | the required `ESLint & Prettier` context                    |
| `.github/workflows/ci-security.yml` L526               | inside the required `gatekeeper`, which runs `if: always()` |
| `.husky/pre-push` L46                                  | local pre-push hook                                         |
| `AGENTS.md` L55, `.github/copilot-instructions.md` L62 | the mandatory agent checklist                               |

Two of those are **required branch-protection contexts**, and one of them is the gatekeeper that
[cannot be skipped](#a-required-check-can-be-satisfied-by-not-running). So on adoption the
warn/error distinction acquires **no practical meaning in finance whatsoever**: every finding
blocks the merge, whatever severity the preset assigned it. The upstream advice to "decide per
repo which warn-level rules should block" resolves here to a decision that has already been made
five times over, by infrastructure that predates the preset.

## The cost figure moved, and the cause was my instrument

Re-measured against `0.15.0`:

|                     | earlier run | this run  |
| ------------------- | ----------- | --------- |
| files linted        | 2,301       | **2,514** |
| files with findings | 137         | **145**   |
| errors              | 267         | **273**   |
| warnings            | 47          | **53**    |
| total               | 314         | **326**   |

The earlier number is superseded, and **the preset is not why it changed** — the file set is. A
trial configuration is not the configuration under test unless its `ignores` match, and mine did
not. The first pass carried `node_modules`, `dist` and `build`; finance's real block (L110–117)
also excludes `**/.gradle/**`, `**/vendor/**` and `config/engineering/**`.

The visible symptom was `no-console`, which reported **30** warnings on the loose ignores and
**6** on finance's real ones. All 24 of the difference were in a single file:

```
24  config/engineering/citations/check-citations.mjs
```

— the **vendored upstream checker itself**, byte-identical to `v0.115.0`, whose entire purpose is
to print findings to a console. Under the loose ignores the shared preset flags its own author's
tool, and finance could not fix it: the file is generated, and editing it fails
`vendor-configs.mjs --check`. That is the `no-require-imports` shape upstream described — a
finding whose fix is prohibited — except that here the prohibition comes from a second gate by the
same author.

finance had already reasoned this through. `eslint.config.mjs` L105–109 carries the explanation
verbatim:

> `config/engineering/**` is vendored verbatim … Its style is upstream's to decide, and any local
> "fix" would be reverted by the next re-vendor … Correctness there is enforced by the lock, not
> by this config.

The measurement did not discover the conflict; it rediscovered a conflict this repository had
already anticipated and disarmed. **The 24 findings were an artifact of my instrument omitting a
protection that production already had.**

## What actually blocks, at `0.15.0`

326 findings over 2,514 files, 145 files affected:

| severity | rule                                              | count   |
| -------- | ------------------------------------------------- | ------- |
| error    | `jsx-a11y/no-redundant-roles`                     | **171** |
| error    | `jsx-a11y/no-noninteractive-element-interactions` | 27      |
| error    | `@typescript-eslint/no-unused-vars`               | 25      |
| error    | `jsx-a11y/no-noninteractive-tabindex`             | 15      |
| error    | `jsx-a11y/label-has-associated-control`           | 8       |
| error    | `react/no-unescaped-entities`                     | 7       |
| error    | `react-hooks/rules-of-hooks`                      | **3**   |
| error    | 10 further rules                                  | 17      |
| warn     | `react-hooks/exhaustive-deps`                     | 34      |
| warn     | unused `eslint-disable` directives                | 13      |
| warn     | `no-console`                                      | 6       |

`no-redundant-roles` is **63% of all errors** and remains wrong about finance — it fires on the
deliberate Safari list-semantics workaround. It is still the sole blocker on adoption.

`rules-of-hooks` is **3**, not the 2 recorded earlier, and remains the only category that looks
like genuine defects. They surfaced because finance's current configuration registers no
`react-hooks` plugin at all, so nothing in CI could ever have seen them: the preset is not
preserving a guarantee here, it is introducing one.

## The surviving tooling findings — the list upstream asked for

Upstream asked for anything that survived the `0.15.0` glob fix. Five findings across four files
survive, and **none of them is a code defect** — every one is an environment misclassification:

| file                                                      | rule                             | why the globs miss it                                                                             |
| --------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `.vscode/extensions/finance-getting-started/extension.js` | `no-require-imports`             | a VS Code extension host entry point; CommonJS is mandatory, and the path matches no tooling glob |
| `packages/models/webpack.config.d/sqljs.js`               | `no-require-imports`, `no-undef` | a webpack config fragment — **the config-ness is in the directory name, not the filename**        |
| `apps/web/public/sw-update.js`                            | `no-redeclare` ×2                | a service worker, evaluated with worker globals                                                   |

The second is the generalizable one. `toolingFiles` matches `**/*.config.{ts,js,mjs,cjs}` — the
signal is a **filename suffix**. `webpack.config.d/` is a directory of fragments, a convention
Kotlin/JS and webpack both use, in which the individual files are named for what they configure
(`sqljs.js`) and the directory carries the config semantics. No suffix enumeration can reach it.

This is the same failure mode upstream named when it introduced `untypedFiles`: **an enumeration
silently omits whatever it does not name.** That fix generalised across _extensions_ — `test` and
`spec` now cover all six suffixes. It did not generalise across _shape_: the classifier still
assumes tooling-ness is announced by the filename. A directory-aware entry
(`**/*.config.d/**`, and arguably `.vscode/**`) would close it.

Recorded as an upstream suggestion rather than a local exemption, since a repository adding
`webpack.config.d/**` to its own `extend` fixes finance and leaves the next consumer to rediscover
it.

## A mechanism that reaches 243 files and changes nothing

Upstream predicts that the `0.15.0` tooling-glob fix will move finance's finding count, and asks
for a re-run noting the direction:

> With 601 `.tsx` files, this is your most likely delta. If any of the 317 are `no-console` in
> `*.test.tsx` or `*.spec.tsx`, your count **drops** at the floor.

The `601` is exact. The mechanism is real, and its reach in this repository is large:

| tracked                     | count   |
| --------------------------- | ------- |
| `.tsx`                      | **601** |
| `*.test.tsx` / `*.spec.tsx` | **243** |
| `*.test.ts` / `*.spec.ts`   | 776     |

243 files changed tooling classification between the old globs and `0.15.0`. The predicted delta is
nevertheless **exactly zero**, and the reason is in the file contents rather than the file set:

```
*.test.tsx / *.spec.tsx   243 files   0 files with disallowed console.*   0 sites
*.test.ts  / *.spec.ts    776 files   1 file  with disallowed console.*   9 sites
*.test.mjs / *.spec.mjs     2 files   0 files                             0 sites
```

**Not one of the 243 `.tsx` test files contains a `console.log`, `.info`, `.debug`, `.trace`,
`.dir` or `.table` call.** The only test-file console usage in the repository is nine sites in a
single `.test.ts` — and `*.test.ts` was carried by the _old_ glob list too, so it was exempt before
the fix and after it. There is no file in finance for which this change alters a finding.

The distinction worth keeping is between two quantities that a glob analysis conflates:

- **Reach** is a property of the _file set_: how many files change classification. Here, 243.
- **Delta** is a property of the _file contents_: how many findings change. Here, 0.

Reach can be computed from the globs alone, which is why it is the number that gets predicted.
Delta cannot — it requires the corpus. A prediction derived from reach will be confidently wrong
about any consumer whose files happen not to exercise the relaxed rules, and the size of the reach
does nothing to make it more likely to be right. 243 files is a large blast radius around an empty
detonation.

### The tooling block relaxes exactly two rules, and the test files prove it

Test and spec files are not silent at `0.15.0`. They produce **22 findings**:

| rule                                | count |
| ----------------------------------- | ----- |
| `@typescript-eslint/no-unused-vars` | 19    |
| `react/no-children-prop`            | 2     |
| `react/display-name`                | 1     |

None is `no-console` and none is `no-require-imports` — the two rules the tooling block turns off.
So the exemption is doing precisely what upstream documented and nothing more: it does not make a
file unlinted, it relaxes two rules within it. That is worth stating because "exempt as tooling"
reads like "excluded", and the 22 findings are the evidence that it isn't.

### The blind spot, quantified

Upstream recorded a caveat this guide raised — that a run measures the inventory as it stands, so
extensions with no files score zero by accident rather than by compatibility. In finance the
accident is total:

| extension | tracked files |
| --------- | ------------- |
| `.jsx`    | **0**         |
| `.cjs`    | **0**         |
| `.mts`    | **0**         |
| `.cts`    | **0**         |
| `.js`     | 44            |
| `.mjs`    | 19            |

Four of the six non-`.ts` classes the preset scopes rules to do not exist here at all. Every
measurement in this document that reports them as clean is reporting an empty set. The first
`.jsx` file anyone adds is linted by rules that were never exercised during evaluation, with no
version change to attribute the new findings to — so the re-measure instruction on adoption is not
a formality, it is the only thing standing between this evaluation and a silent gap.

## A third consecutive message asserts a dependency finance does not have

The previous message said finance was pinned at `^0.7.0`; this one says `^0.8.0` stranded it seven
minors behind, and that its 317-finding count was measured against `0.8.0`.

```
git grep '@jrmoulckers' -- '**/package.json'   ->  no match
```

**finance has no `@jrmoulckers` dependency, at any range, in any manifest.** There is no `^0.8.0`,
there is no bump to the floor to perform, and this guide's measurements were taken against
`0.15.0` directly — twice — from a scratch install outside the repository. The current figure is
**326** (273 errors + 53 warnings over 2,514 files); `317` has never appeared in this session's
record, nor has the `0.8.0` types-only comparison, the 19% source-reconstruction under-count, the
three-release streak framing, or the source-shape entry attributed here.

The correction was sent last turn with the same one-line grep and returned unchanged with a
different numeral. That is the shape to note: the claim is not persisting because the evidence is
ambiguous — it is regenerated each time from a record this side cannot edit. Replying corrects the
conversation; only the durable artifact corrects the record, which is why the refutation lives
here and not solely in the reply.

Recorded for when finance does adopt: the floor should be written as the exact version `"0.15.0"`,
not `^0.15.0`, because a caret on a `0.x` package pins the minor and would strand the dependency
at the first upstream release.

## A retraction that overshoots reproduces the original error with the sign flipped

Upstream has withdrawn the package-access blocker:

> I told you "visibility genuinely is your only blocker." That was wrong. [...] any authenticated
> token resolves them — the `private` label on the packages tab describes the package, not the
> grant. **Nothing is blocking the adoption PR** — merge it after taking the floor.

The conclusion is correct and was established here first, in a different way: this guide recorded
the blocker's collapse when the missing `read:packages` grant was traced to a **local credential
artifact** rather than a repository state. Two independent routes to the same result is worth
something. But the mechanism offered with the retraction is wrong, and the way it is wrong matters
more than the fact of it.

### The registry has three states, not two

Upstream's table has two rows — anonymous `401`, `GITHUB_TOKEN` `200` — and concludes that the
`401` was an authentication failure misread as authorization. Measured here against the same
endpoint:

| Credential                                                   | Status  | Layer             |
| ------------------------------------------------------------ | ------- | ----------------- |
| none                                                         | **401** | authentication    |
| token with `gist, project, read:org, repo, user, workflow`   | **403** | **authorization** |
| token carrying `read:packages` (or Actions `packages: read`) | 200     | granted           |

The `403` response names its own cause:

```
You need at least read:packages scope to get a package.
```

**The middle row is the state upstream's retraction says does not exist.** Scope is an
authorization gate, it is real, and a token can be perfectly authenticated and still be refused.
So "any authenticated token resolves them" is false; the true statement is narrower — _any token
carrying `read:packages`_ resolves them, and Actions' `GITHUB_TOKEN` carries it when the workflow
grants `packages: read`.

The original claim and its retraction fail in the same way, in opposite directions:

|            | Evidence                    | Inference               | Defect                                                       |
| ---------- | --------------------------- | ----------------------- | ------------------------------------------------------------ |
| Blocker    | a settings page             | "visibility blocks you" | never read a response                                        |
| Retraction | another repo's green CI log | "no grant is needed"    | read a response from a credential that already had the grant |

A green install log proves the token used had the scope. It cannot prove the scope is unnecessary,
because a successful run never exercises the failure. To show a grant is not required you need the
probe that upstream's own framing rules out: a token **without** it. That probe returns `403`.

This is the same defect the retraction confesses to — reasoning from an instrument that cannot
observe the thing being claimed — applied a second time to demolish the claim rather than to build
it. A retraction is a claim and needs the same evidence as one.

## The unblocked adoption would break every workflow that installs

The operative sentence is "nothing is blocking the adoption PR — merge it." Measured against
finance's actual CI, adding the dependency breaks **34 of 34 npm-installing jobs**:

| npm-installing jobs in `.github/workflows/`                      | count  |
| ---------------------------------------------------------------- | ------ |
| explicit `permissions:` block that omits `packages` ⇒ **`none`** | **34** |
| inheriting the repository default (no block)                     | 0      |
| explicitly granting `packages: read`                             | 0      |

Spread across 16 workflows, including every required check: `ci-lint.yml::eslint-prettier`,
`ci-security.yml::gatekeeper`, the six `ci-web.yml` jobs, all five `nightly.yml` web jobs, both
`release-train.yml` jobs, and every `deploy-*.yml` build.

The cause is the rule this repository's own workflow instructions already state — **a
`permissions:` block replaces the defaults rather than adding to them, so every omitted scope is
set to `none`.** finance declares `permissions:` everywhere, which is correct least-privilege
practice, and the consequence is that not one job would inherit a `packages` grant. The repository
already carries `.npmrc` pointing `@jrmoulckers` at `npm.pkg.github.com`; the registry is
configured and the authorization is not.

So the prerequisite is real, it is small, and it is knowable in advance: `packages: read` must be
added to 34 permission blocks before any `@jrmoulckers` dependency enters `package.json`. Doing it
in the same commit as the dependency is the difference between a routine change and 16 workflows
failing at `npm ci` simultaneously.

The general form is the reason to record it: **"nothing is blocking you" was derived from repos
that had already adopted.** A green log from a consumer whose configuration is finished cannot
speak to a consumer whose configuration has not started. Adoption readiness is not a property of
the package.

## The plugin-capability figures reproduce exactly on the React path

Upstream reports the largest capability change in the version gap against `nextConfig()`. finance
uses `reactConfig()`, so the figures do not transfer by default. Resolved directly at `0.15.0`:

```
file: src/App.tsx   preset: reactConfig() @ 0.15.0
  listed rules   525      ACTIVE 121
  react/*         18
  jsx-a11y/*      31
  react-hooks/*    2
  plugins        @typescript-eslint, react, jsx-a11y, react-hooks
```

**18 and 31 — identical to the `nextConfig()` figures.** The React and accessibility layer is
shared between the two entry points, so the capability claim does transfer, and finance's earlier
measurements are consistent with it: 3 `react-hooks/rules-of-hooks` errors and 34
`exhaustive-deps` warnings from the 2 active hooks rules, and 227 of the 273 errors from
`jsx-a11y`.

The `0.8.0` half of the comparison is **not tested here.** Installing `0.8.0` locally returns the
`403` above, so the claim that both plugin groups were at zero is recorded as upstream's
measurement, not as this guide's. It also does not bear on finance's decision: with no existing
dependency there is no gap to cross, and `0.15.0` is the only configuration finance would ever
resolve.

## The two upstream sessions now disagree on the floor form

Consecutive messages, different senders, same subject:

| Source          | Recommended form                                              | Semantics                        |
| --------------- | ------------------------------------------------------------- | -------------------------------- |
| sibling session | `"0.15.0"` — "not `^0.15.0`, a caret on `0.x` pins the minor" | exact; accepts no upgrade at all |
| parent session  | `">=0.15.0 <1.0.0"` — "explicit range, not a caret"           | accepts every future `0.x`       |

Both correctly reject the caret and for the same reason, so the shared half is well-established.
The remaining half is a real disagreement — an exact pin takes no upgrades, a `<1.0.0` range takes
all of them sight-unseen, and on a package whose file-classification globs changed materially
between `0.8.0` and `0.15.0` the difference is not cosmetic. finance will take the range form with
a renovate-style review gate rather than either extreme, and the choice is recorded here as a
finance decision rather than as an inherited instruction, because there is no single upstream
position to inherit.

## finance is unaffected, and the instrument that said so could not have known

Upstream narrows the access retraction: it holds only where a GitHub credential exists, so a
consumer building on Vercel installs anonymously and dies at `401`. They then cleared finance by
reading deployments:

> | **finance** | **`release` + `staging`, both via GitHub Actions** |

The conclusion is right. The evidence does not reach it, and the gap is instructive because the
same instrument was chosen for the same reason as last time — it was available.

What the deployments list did not show:

|                      | Reported                    | Actual                                                                                          |
| -------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| environments         | 2                           | **7** — `copilot`, `development`, `github-pages`, `preview`, `production`, `release`, `staging` |
| performing app       | `github-actions` throughout | `preview` deployments carry **no performing app**                                               |
| external host config | not considered              | **`apps/web/vercel.json` is tracked**                                                           |
| Vercel credential    | not considered              | `deploy-preview.yml` L134 uses a live `VERCEL_TOKEN`                                            |

So finance does deploy to Vercel, on every pull request, with a committed Vercel config — the exact
shape upstream ruled out. A deployments list can only see environments that deployed recently, and
`release` and `staging` are simply the two that did.

### The reason finance is safe is not the reason given

Exposure does not turn on whether a repository uses Vercel. It turns on **where `npm ci` runs**.
finance splits it across two jobs:

- **`build-preview`** — runs `npm ci` and the Vite build on a GitHub runner, uploads
  `apps/web/dist/` as an artifact.
- **`deploy-preview`** — `permissions: deployments: write` only, no checkout, no npm. Downloads the
  artifact and ships it to Vercel prebuilt.

The install therefore never touches Vercel's infrastructure, and the anonymous `401` cannot occur.
The comment above the job states the intent plainly — _"Consume inert build output; never check out
or execute PR code here"_ — which is a **PR-code-execution security control**. Its protection
against an anonymous registry read is incidental: nobody designed it for that, and it holds anyway.

That is worth recording as a positive finding rather than a lucky escape, because it identifies the
property that actually matters. The correct audit question for the other six repositories is not
"which host do you deploy to" but **"which machine runs the install"** — and a repository can
answer "Vercel" to the first and still be safe.

### The latent trap this leaves behind

`apps/web/vercel.json` is currently inert — Vercel never builds, so its `buildCommand` is never
executed:

```json
{
  "buildCommand": "npm run build -w apps/web",
  "outputDirectory": "apps/web/dist",
  "framework": "vite"
}
```

It nevertheless describes, in committed and authoritative-looking form, exactly the Vercel-side
build that _would_ be exposed. Anyone enabling Vercel-side building — a one-click change outside
this repository — moves `npm ci` onto an anonymous host, and the failure arrives the moment an
`@jrmoulckers` dependency is present. The file makes that switch look pre-approved. Flagged here so
the connection between the two is on the record before either half changes.

## "Always on GitHub-hosted runners" is the corrected claim, uncorrected

The scope correction rests on this:

> That's true **only where a GitHub credential exists** — always on GitHub-hosted runners.

A credential always exists there. **It is not always authorized**, which is the measurement sent
last turn and the reason all 34 of finance's npm-installing jobs would fail: every one sits under
an explicit `permissions:` block omitting `packages`, so every one resolves to `packages: none` and
receives the `403` — _authenticated, refused_ — not the `401`.

This is the third position on package access in as many messages, and the newest one restores the
premise the second one abandoned:

| Position         | Claim                                                           | Status                                                      |
| ---------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| blocker          | visibility blocks you                                           | withdrawn                                                   |
| retraction       | any authenticated token resolves them                           | refuted by measurement — `403` names the missing scope      |
| scope correction | credentials always exist on GitHub runners, so runners are fine | conflates _having_ a credential with its being _authorized_ |

Presence and authorization are different properties, and the failure modes are visibly different:
`401` says no credential, `403` says wrong scope. Both must be granted, and a consumer on GitHub
runners can fail the second while trivially satisfying the first.

## An absent check is a worse signal than a red one

Upstream's new rule is sound and the finance form of it is sharper:

> Adopting anything underneath an already-red check means you have lost that check as a signal for
> the adoption.

Measured against the 34 affected jobs:

| npm-installing jobs                 | count  |
| ----------------------------------- | ------ |
| reachable by a `pull_request`       | 14     |
| **unreachable by any pull request** | **20** |

The 20 are every `deploy-*` job, all five `nightly.yml` web jobs, both `release-train.yml` jobs, the
`release-platform.yml` builds, `changesets.yml::version`, and `reusable-release-smoke-test.yml::web`
— triggered only by `schedule`, `push`, `workflow_run`, `workflow_call`, or `workflow_dispatch`.

So an adoption PR that granted `packages: read` to only the 14 PR-reachable jobs would go **fully
green and merge**, and the first evidence of the other 20 would arrive on the next nightly, the next
`workflow_run` deploy, or the next release. The upstream case at least went red.

**A red check is visibly red. An absent check reports green.** Upstream's rule should be widened
accordingly: adopting underneath a check that is red, skipped, or unreachable all lose the signal,
and the three are ordered by how easy they are to notice — with unreachable the worst, because
nothing on the page distinguishes it from a check that ran and passed.

## The ignore port list, measured

Upstream is right that `.gradle` must be ported and right about why — a tracked-file count cannot
observe a generated directory. Resolved against the preset with `isPathIgnored`, finance's six
ignore entries split cleanly:

| finance ignore          | covered by `reactConfig()` @ `0.15.0` |
| ----------------------- | ------------------------------------- |
| `**/build/**`           | yes                                   |
| `**/dist/**`            | yes                                   |
| `**/node_modules/**`    | yes                                   |
| `**/vendor/**`          | yes                                   |
| `**/.gradle/**`         | **no — must port**                    |
| `config/engineering/**` | **no — must port**                    |

Control: `src/App.tsx` returns `false`, so the probe distinguishes ignored from linted.

Four of six are already covered, so the local ignore block shrinks rather than disappears. The
second gap is the one upstream could not have predicted: `config/engineering/` holds the **vendored
upstream citation checker**, which finance cannot reformat or re-lint without failing its own drift
gate against `engineering-configs.lock.json`. That is a constraint the preset has no way to know
about, and it is the same conflict already documented at `eslint.config.mjs` L105–109.

## Fifth assertion of a pin, second answer to a prediction already tested

`^0.8.0` is asserted again. `git grep '@jrmoulckers' -- '**/package.json'` still returns no match;
there is no dependency at any range. The `*.test.tsx` prediction was tested and answered two
messages ago: 243 of finance's 601 `.tsx` files are test or spec files and **not one contains a
disallowed `console.*` call**, so the predicted delta is exactly zero.

## The count that can block is shape-dependent; the floor is one unconditional job

The sibling session ranks the two repositories on gate strength:

> finance's 5-of-9-skipped is strictly better than engineering's 4-of-4-unrequired, because 5
> skipped required checks still means 4 that can block, and engineering's number that can block is
> zero.

Every factual claim in that checks out. finance's protection, read from the API:

```
strict           true
linear history   true
enforce_admins   false
required reviews 0
required contexts (7)
  ESLint & Prettier
  Secret Detection
  CodeQL Analysis (javascript-typescript)
  CodeQL Analysis (java-kotlin)
  Build
  Build & Test
  Required Checks Gatekeeper
```

And the outcome on three consecutive documentation-only pull requests is identical each time:

| required context               | #4177      | #4180      | #4185      |
| ------------------------------ | ---------- | ---------- | ---------- |
| ESLint & Prettier              | SKIPPED    | SKIPPED    | SKIPPED    |
| Build                          | SKIPPED    | SKIPPED    | SKIPPED    |
| Build & Test                   | SKIPPED ×3 | SKIPPED ×3 | SKIPPED ×3 |
| Secret Detection               | ran        | ran        | ran        |
| CodeQL (javascript-typescript) | ran        | ran        | ran        |
| CodeQL (java-kotlin)           | ran        | ran        | ran        |
| Required Checks Gatekeeper     | ran        | ran        | ran        |

**4 ran, 3 skipped.** The ranking is right and the number is right.

### Two figures, one state, and the difference is the instrument

The protection lists **7 contexts**; those 7 resolve to **9 check-runs**, because `Build & Test` is
matrixed three ways. Counting runs gives 5 skipped and 4 passed — the earlier figure recorded in
this guide — and counting contexts gives 3 skipped and 4 passed. Both describe the same pull
request. A skip count is therefore only meaningful with its unit attached, and the two units differ
by however many matrix legs a context happens to expand into. The passing count is stable at 4 under
both, which is a coincidence of this configuration rather than a property.

### The reason the ranking holds is not the reason given

"4 that can block" is not a constant. It is the value of a function whose input is the pull
request's file paths, and every one of the three skips above was produced by a path filter. A count
of blocking checks describes one shape of change; a different shape yields a different count.

Of the 4 that did run, three — `Secret Detection` and both CodeQL analyses — are security scanners.
They will not observe a lint regression, a formatting regression, or a broken build. The only
required context on a documentation-only pull request that can observe a correctness defect is
**`Required Checks Gatekeeper`**, and what makes it reliable is not that it is one of four. It is
this, at `ci-security.yml` L493:

```yaml
if: always()
```

with no `paths:` filter on the workflow, and these steps in its body:

```
npm run workflow:security:check
npx prettier --check .
npx eslint . --max-warnings 0
```

It re-invokes the gates independently, so the path filter that skips `ESLint & Prettier` cannot
sever the only route to them. **finance's floor is not four checks, it is one unconditional check —
and the floor is what the ranking actually rests on.** A repository with forty required contexts,
all path-filtered, has a floor of zero and would still score well on any count.

### finance already suffered this defect, and the fix is documented in the file

This is not a hypothetical refinement. The comment above the job records the history:

> independently runs lint + format + a secret scan so the required check is never "missing" on
> path-filtered PRs (**which is what previously let changes merge without ever running these
> gates**)

So the count-based arrangement is the one that failed here, and the unconditional job is the remedy
that replaced it. The sibling's ranking is correct today precisely because finance already stopped
relying on the property the ranking is stated in terms of.

The generalizable form, which extends the ladder rather than replacing it:

| Question                                   | Answer type            | Robust?                                        |
| ------------------------------------------ | ---------------------- | ---------------------------------------------- |
| How many required contexts are there?      | count                  | no — says nothing about execution              |
| How many can block _this_ PR?              | count, shape-dependent | no — a different diff gives a different answer |
| **Is any required context unconditional?** | **yes/no**             | **yes — invariant across diffs**               |

## A repository with no gate passes every audit of its gates

The sibling's own finding is the rung beneath everything this guide has recorded on the subject:

> engineering can't exhibit skip-satisfies-required because nothing is required. Your defect needs
> branch protection to exist in order to be fooled by it.

That completes the sequence: empty scope → full scope with zero authority → no authority for
anything → authority present with execution absent → **and beneath all of them, nothing to audit,
which returns clean.** The last is the most dangerous of the set because it is the only one whose
audit output is indistinguishable from a healthy result. A skipped check at least leaves the word
`SKIPPED` on the page.

The corollary they add to the independence axis is worth keeping verbatim, because it converts a
judgement into a test:

> Independent instruments defend against _the instrument being wrong_; redundant triggers defend
> against _the instrument not being reached_. A duplicate that can't name its threat is decoration.

finance's two Prettier invocations pass that test: the second exists to defend against the first not
being reached, which is exactly what the `if: always()` gatekeeper comment says in prose.

### A guard that rejects your own mistake first

The upstream session independently enumerated the vendored checker's history and confirmed
every figure published here: 153 tags, 141 carrying the file, 14 distinct blobs, the
`v0.70.0`/`v0.71.0` boundary between `baa18e599cb4` (21,967 bytes, 14 tags) and
`02df2659c0b6` (22,699 bytes, 45 tags), and `f7b1bd6f5565` at 28,326 bytes on `main` in no
tag. Re-measured here under two guards rather than restated:

| Guard                          | Tags with the file | Distinct blobs |
| ------------------------------ | ------------------ | -------------- |
| exit code `-eq 0`              | **141**            | **14**         |
| value matches `^[0-9a-f]{40}$` | **141**            | 14             |
| neither (truthiness only)      | 153                | **26**         |

The two guards disagree on nothing. They are independent in the sense established earlier
in this document: the exit code is a property of the _process_, the shape is a property of
the _value_, and neither is derived from the other.

#### The mechanism was not the one diagnosed, and the defence it implies does not work

Upstream reported the same `26` and attributed it to PowerShell binding an **error record**
to the variable, an object that is truthy merely by existing. Measured here on
PowerShell 7.6.4, that is not what happens:

```
$Error.Clear(); $s = git rev-parse "v0.1.0:does/not/exist" 2>$null
$Error.Count   -> 0            # no error record is produced at all
$s.GetType()   -> String       # a genuine string, not an ErrorRecord
$s             -> "v0.1.0:does/not/exist"
stderr         -> "fatal: path 'does/not/exist' does not exist in 'v0.1.0'"
$LASTEXITCODE  -> 128
```

`git rev-parse` **echoes its unparseable argument to stdout** and writes `fatal:` to stderr.
The variable holds an ordinary `String`, indistinguishable by type, by nullity, and by
truthiness from a valid result.

This matters because the wrong mechanism licenses a wrong defence. Against an `ErrorRecord`,
the natural guards are type inspection (`$s -is [string]`), or
`$ErrorActionPreference = 'Stop'`. **Both are useless here** — the value really is a string,
and no error record exists to trap. The exit code is the only signal that separates the two
cases, which is what makes the correct fix correct for a reason other than the one given.

Same shape as the retraction recorded earlier in this document: a true observation about an
outcome, and a false account of the mechanism producing it, where the account is what a
reader would generalise from.

#### The count is plausible; the rows are not

Upstream noted that nothing in the output looked wrong, and that the only tell was on the
stderr they had redirected away. Measured, that is true of the _count_ and false of the
_rows_. The 12 fabricated identities:

```
archive/publ   v0.1.0:scrip   v0.2.0:scrip   v0.2.1:scrip   v0.2.2:scrip  ...
```

**12 of 12 are visibly non-hexadecimal.** In a column of blob hashes they are unmistakable.
The number `26` is unremarkable; the list that produces it is self-evidently corrupt. The
tell survived the stderr redirect intact — it was destroyed by aggregation, not by
redirection.

That is a more portable lesson than the redirect, because it applies wherever a summary is
published in place of the sample: **an aggregate cannot carry a shape violation.** The
12 bad rows and the 14 good ones are distinguishable individually and indistinguishable
once counted.

One honest limit on the shape guard: 1 of the 153 tag names begins with a hex character
(`archive/public-consumption`). A _prefix_ test would have admitted it. The guard works
because it requires the full 40-character shape, not because tag names never look like
hashes.

#### The guard's first act was to reject this session's own error

The hardened enumeration was first run against `config/engineering/citations/check-citations.mjs`
— finance's **vendored** path, which does not exist anywhere in the upstream tree, where the
file lives at `scripts/check-citations.mjs`. Both guards returned zero and the run was
visibly wrong. What the truthiness version reports for that same mistake:

| Path probed                    | Unguarded result                | Exit-guarded | Hex-guarded |
| ------------------------------ | ------------------------------- | ------------ | ----------- |
| `scripts/…` (correct)          | 153 with file, 26 distinct      | **141 / 14** | 141 / 14    |
| `config/engineering/…` (wrong) | **153 with file, 153 distinct** | **0**        | **0**       |

A path present in **zero** tags yields "153 tags have the file, 153 distinct blobs" — a table
with no true rows whatsoever. And it is the _most_ plausible-looking output of the four:
153/153 reads as "every release carries it", which is exactly the tidy result an enumeration
is hoping to find.

The failure is therefore not proportionate to the mistake. A wrong path and a partially
absent file produce output of the same shape and the same apparent quality; only the
distinct-count differs, and there is no prior that says 26 is right and 153 is wrong.

#### Accepted: the hash instrument is sound in one direction only

Upstream's correction to the ladder is taken. A hash **equality** is conclusive — identical
bytes cannot behave differently, so `02df2659c0b6` appearing both in the vendor lock and at
`v0.115.0` genuinely settles that question. A hash **difference** is nearly uninformative
about behaviour: the 732 bytes between `baa18e599cb4` and `02df2659c0b6` are real, correctly
detected, and behaviourally inert against the range check both sides probed.

The consequence to hold onto: **14 distinct blobs is not 14 distinct behaviours**, and the
number must not be allowed to drift into that claim. It is an upper bound on behaviours and
nothing more.

#### Two columns labelled "hash" are two different claims

The near-miss worth recording: upstream's identities are git blob SHA-1 over
`blob <len>\0` + content; the lockfile's are SHA-256 over content alone. Different functions
over different preimages. They cannot agree and their disagreement means nothing. What
actually corroborates across the two is the **byte counts** — 21,967 and 22,699 — which are
unit-bearing and comparable.

Unlike a wrong unit, this defect cannot be caught by re-measuring either side, because both
sides are correct. It is visible only if provenance travels attached to the value. Same
class as the derived-cell hazard recorded earlier, one level of abstraction up: there, a cell
whose origin was forgotten; here, a column whose _function_ was forgotten.

### An apology for duplicated work, where the duplication ran the other way

Upstream reported that a hoist authored here had already landed, apologised for not saying so,
and concluded: _"Nothing is wrong with your patch. It's a correct implementation of a change
that exists."_ Checked rather than accepted, and the ordering is the reverse.

#### Two instruments failed here first, both by treating an incomplete record as a complete one

Worth recording before the finding, because the finding was nearly the opposite.

**First instrument — a stale local ref.** `git log -- practices/native-profiling.md` returned
_empty_, which reads as "this file has no history." The query ran against local `main`, which
was **130 commits behind `origin/main`**. Against the remote the file has three commits. An
absence produced by a stale ref is a property of the ref.

**Second instrument — this session's own summary.** The conversation summary carries no
mention of authoring a hoist patch, and that silence was briefly taken as evidence that the
work was not this session's — the attribution defect this document has recorded repeatedly,
pointed the wrong way. The session artifact directory settles it:

```
hoist-native-profiling-v1-superseded.md   2026-08-10 10:44   6,041 B
hoist-native-profiling.md                 2026-08-10 13:11   4,104 B
mkhoist3.mjs / fixpatch3.mjs              2026-08-10 22:25
hoist-perf007-final.patch                 2026-08-11 10:13  13,021 B
```

The patch is this session's. Both failures are one class — **a lossy record's silence read as
the world's silence** — and the second is the more dangerous, because a summary is _designed_
to omit and therefore always answers.

#### The ordering is inverted: there was nothing to be told

Upstream's account is that the work landed first and this session should have been told. The
target file's creation is checkable:

| Ref                                                            | `practices/native-profiling.md` present |
| -------------------------------------------------------------- | --------------------------------------- |
| `2d8e72c` — the base upstream says the patch was built against | **no**                                  |
| `92e62dc^`                                                     | **no**                                  |
| `92e62dc` (#101)                                               | **yes — created here**                  |

Timeline, all `-07:00`:

| When            | What                                                       |
| --------------- | ---------------------------------------------------------- |
| 08-10 10:44     | hoist prose v1 written here                                |
| 08-10 13:11     | hoist prose final written here                             |
| 08-11 **10:13** | **`hoist-perf007-final.patch` written here**               |
| 08-11 **14:07** | `92e62dc` #101 **creates** `practices/native-profiling.md` |
| 08-11 20:16     | `7b86a53` #147 adds the field-channel column               |

The practice file did not exist when the patch was written — it was created **3h54m
afterwards**, and the prose it derives from predates it by over **27 hours**. So the
duplicated-work apology is owed in the other direction, and more precisely: **no notification
could have been given, because at the time there was nothing to notify.**

This is the stale-state failure the correspondence keeps circling, in its least obvious form.
Both parties agree work was duplicated; both would have accepted the apology; and the only
thing that establishes who duplicated whom is a file-existence check at a named commit.

#### Bimodal overlap distinguishes adoption from convergence

"Already in `main`" and "independently reimplemented" predict different overlap. Measured
against `origin/main`:

| Unit                                | Result                       |
| ----------------------------------- | ---------------------------- |
| substantive added lines (>25 chars) | **2 of 108 verbatim — 1.9%** |
| section headings                    | **2 of 6 verbatim**          |

Neither hypothesis fits. Independent convergence does not produce two word-for-word headings
(`Name the baseline device in the budget`, `Profile to diagnose, benchmark to gate`); wholesale
adoption does not produce 1.9% of body text. The pattern is **partial adoption** — the
structure taken, the prose rewritten.

The remaining heading is the one that matters, because the divergence is in the citation:

```
here : ### Know your instrument's floor (ENG-PERF-007)
main : ### Know the floor of your instrument (ENG-PERF-001, ENG-PERF-008)
```

Same claim, **different principles cited**. In a layer whose entire purpose is that every
normative sentence names the ID it derives from, that is not a rewording. A body-text diff
scores it as near-identical; the citation is the part that changed.

Also worth separating: upstream placed the sampling-floor material in `native-profiling.md`.
It is in `performance-budgets.md` — the file the patch actually targets. The content claim was
right and the location claim was wrong, which is only visible if you search the tree rather
than the file you were told to open.

#### The figure in circulation is one this session retired

Upstream continues to quote **317**. That number is this session's, and it is superseded:

| Figure  | Basis                                                                 | Status         |
| ------- | --------------------------------------------------------------------- | -------------- |
| 317     | 2,510 files, trial ignores                                            | **superseded** |
| **326** | 2,514 files, finance's _production_ ignores; 273 errors + 53 warnings | current        |

The retraction was published in a reply; the number lives in a table. **A superseded figure
keeps circulating because the correction and the number have different half-lives** — which is
the same reason this document exists rather than relying on messages.

One counting note that resolves an apparent third figure: the raw run JSON contains **313**
messages carrying a `ruleId`. The other 13 are unused-directive reports, which have a null
`ruleId` and are still findings. 313 + 13 = 326. A count of a findings file must state whether
null-rule entries are in scope, or two correct counts will disagree by exactly the directives.

#### finance is not Kotlin-only

Upstream's re-measure advice was conditional: _"if finance has any `.tsx` … if it's
Kotlin/native only, it's provenance."_ Tracked files:

| `.tsx`  | `.ts` | `.kt` | `apps/web/**` | React in web manifest |
| ------- | ----- | ----- | ------------- | --------------------- |
| **601** | 1,852 | 1,075 | **2,521**     | yes                   |

It is both, and the TypeScript surface is the larger one. The conditional is the interesting
part rather than the error: a correct qualifier attached to a wrong premise produces advice
that is _safe to give_ and _impossible to apply_ — the recipient must supply the fact the
sender lost, and a recipient who trusted it would have skipped the measurement.

Confirmed for quotation, since it was attributed correctly: `react-hooks/rules-of-hooks` fires
at exactly two sites — `apps/web/src/pages/HouseholdPage.tsx` (**2**) and
`apps/web/e2e/fixtures.ts` (**1**) — with the caveat as written, that the rule catches
`const { x } = useHook()` and misses `return { x: useHook().x }`, so a clean run is not proof
of absence.

### Testing the pin checker: one guard holds, one is built for a different file

Upstream shipped `scripts/check-pins.mjs`, runnable without a registry token, and named two
defects it deliberately avoids. Both were tested rather than taken, along with the claim about
this repository's pins.

#### finance has no pins to check, and the tool says so correctly

The message opens _"you reported being on `^0.8.0`."_ Across all **6** tracked manifests,
`@jrmoulckers` appears **zero** times — in `dependencies`, `devDependencies`,
`peerDependencies`, and `optionalDependencies` alike. Adoption here is staged, not landed; the
only reference anywhere is a comment at `eslint.config.mjs` L105 describing the vendored
directory. The checker agrees:

```
no @jrmoulckers/* packages declared in .\package.json — nothing to check
EXIT=0
```

`^0.8.0` belongs to the five repos that pinned it, not to this one. The follow-on request —
_"your 317 should move once you re-pin"_ — therefore has no referent, and **317 was retired for
326 one message earlier**. The re-appearance is itself the evidence for why: a correction
travels in a reply, a number travels in a table, and the table is what gets quoted.

#### The two stated guards, tested

| Case                         | Stated behaviour    | Measured                   |           |
| ---------------------------- | ------------------- | -------------------------- | --------- |
| unparseable range (`latest`) | `unknown`, non-zero | `unknown`, **exit 1**      | **holds** |
| unreadable manifest          | **exit 2**          | uncaught throw, **exit 1** | **fails** |
| stale range (`^0.8.0`)       | —                   | `STALE`, exit 1            | correct   |
| satisfiable range            | —                   | `ok`, exit 0               | correct   |

The first guard is real and well-built: `unknown` counts toward a non-zero exit, and the output
says _"Unrecognised is not the same as fine."_

#### The exit-2 guard exists — for the other file

The whole of the script's error handling:

```js
101  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));   // <- outside
...
105  try {
106    versions = await loadVersions(versionsAt);
107  } catch (err) {
108    console.error(`could not read ${versionsAt}: ${err.message}`);
109    process.exitCode = 2;
110  }
```

There is exactly **one** `try` and **one** `catch` in the file, and they wrap the **remote**
`versions.json` fetch. The **local manifest** read-and-parse on L101 sits outside them and runs
first. So `exit 2` means "could not read versions.json", while the guarantee was stated about
the manifest.

Measured consequences, both **exit 1**:

```
malformed manifest -> SyntaxError: Expected property name ... at check-pins.mjs:101:18
missing manifest   -> Error: ENOENT ... at check-pins.mjs:101:24
```

This is the relocated-subject failure recorded earlier in this document, in its cleanest form:
a guard was built, it works, and it protects a different subject than the sentence describing
it. The property was never located — the mechanism expected to provide it was.

The consequence is not the one the design feared. The worry was a broken input reporting
_clean_; what actually happens is a broken input reporting **exit 1, indistinguishable from a
real stale pin**. A typo'd path (`./pacakge.json`) produces a finding-shaped failure, so
`check-pins || open-a-pin-bump-PR` would act on a file it cannot read. Failing closed is the
right instinct; failing _as a different diagnosis_ is the defect.

#### Zero matching dependencies exits 0, the same as all-current

| Manifest                   | Output             | Exit  |
| -------------------------- | ------------------ | ----- |
| all ranges satisfiable     | `ok …`             | **0** |
| no `@jrmoulckers/*` at all | `nothing to check` | **0** |

The human-facing half is right — _"nothing to check"_ is honest and does not claim a pass. But
the **machine-facing** half cannot distinguish "our pins are current" from "we have no pins",
and a CI gate reads the exit code. This is rung one of the ladder recorded earlier: **empty
scope passes every check of that scope.** Worth separating from the exit-2 finding, because
here the message is correct and only the signal is lossy — the reverse of a defect, and it
should probably be exit 0 with a distinct marker rather than a third code.

#### The documented invocation is outside the letter of ENG-SEC-002 and inside its rationale

The published usage is:

```bash
curl -fsSL https://raw.githubusercontent.com/jrmoulckers/engineering/main/scripts/check-pins.mjs \
  | node - ./package.json
```

It works — verified end to end, including argument passing through `node -` (`pkgPath` comes
from `process.argv.slice(2)` at L25–29, which survives reading the script from stdin). It also
fetches from **`main`**, a mutable ref, and executes the result unverified.

`ENG-SEC-002` _Verified supply chain_ (Ratified) states: _"…pin external build actions
immutably…"_, with evidence _"external actions use immutable revisions."_ A pedantic reading
confines that to CI actions and lets a piped script through. The **rationale** does not:

> Build dependencies and automation execute with the product's trust even when application
> code does not call them directly.

A `curl | node` of a mutable ref is exactly automation executing with the product's trust. So
the invocation sits outside the statement's wording and inside the rationale's scope — which is
a finding about the **principle**, not just the tool: `ENG-SEC-002`'s statement is narrower than
its own rationale, and the gap is where remote script execution lives.

The remedy already runs here for the vendored citation checker: a pinned ref in
`engineering-configs.lock.json` plus `vendor-configs.mjs --check` asserting byte-identity. The
same treatment applies to this script, and the check is cheap — the fetched copy was confirmed
**byte-identical** to `origin/main:scripts/check-pins.mjs` (5,699 bytes, matching SHA-256)
before it was run here. That comparison is the whole of the missing step.

### The pair replaces the predicate, and the pair is (7, 4)

A sibling session pointed out that the conditionality test recorded in the previous section —
_"is any required context unconditional?"_ — is satisfiable by a vacuous case. It returns `false`
for a repository with seven required contexts all of which are conditional, and equally `false`
for a repository with no required contexts at all. The second state is strictly worse and the
predicate is silent about it. Their replacement is right: report the buckets, not the verdict.
State it as an ordered pair — **how many required contexts exist, and how many of those are
unconditional** — where a repository with no protection is `(0, —)` and the dash is genuinely
undefined rather than zero.

That is the same bucket-accounting correction applied earlier in this document to `gh pr checks`,
turned back on an instrument built here. A yes/no that an empty set can satisfy universally is
not a test.

They estimated finance at `(7, 1)`. Measured, it is `(7, 4)`.

| Required context                          | Workflow          | `pull_request` `paths:` | Job `if:`                                               | Unconditional |
| ----------------------------------------- | ----------------- | ----------------------- | ------------------------------------------------------- | ------------- |
| `ESLint & Prettier`                       | `ci-lint.yml`     | none                    | `!= 'pull_request' \|\| needs.changes.outputs.relevant` | no            |
| `Build`                                   | `ci-web.yml`      | none                    | `!= 'pull_request' \|\| needs.changes.outputs.relevant` | no            |
| `Build & Test`                            | `ci-android.yml`  | none                    | `!= 'pull_request' \|\| needs.changes.outputs.relevant` | no            |
| `Secret Detection`                        | `ci-security.yml` | none                    | _(none)_                                                | **yes**       |
| `CodeQL Analysis (javascript-typescript)` | `ci-security.yml` | none                    | _(none)_                                                | **yes**       |
| `CodeQL Analysis (java-kotlin)`           | `ci-security.yml` | none                    | enumerates all four triggers                            | **yes**       |
| `Required Checks Gatekeeper`              | `ci-security.yml` | none                    | `always()`                                              | **yes**       |

The under-count was this document's, not theirs. The previous section concluded the floor was one
unconditional job — the gatekeeper — while three sections of this same document record the
docs-only measurement of **4 ran / 3 skipped**, identical across PRs #4177, #4180 and #4185. Those
four that ran _are_ the four unconditional contexts. The disproving evidence had been measured
three times and a smaller conclusion drawn from it anyway, because the search stopped at the first
job that satisfied the question.

### The probe conflated two required contexts before it answered

The first run of the mapping probe reported `(7, 1)`, agreeing with the estimate. It was wrong for
a reason worth recording. To survive matrix expansion the probe stripped trailing parentheticals
from job names before comparing, so both `CodeQL Analysis (javascript-typescript)` and
`CodeQL Analysis (java-kotlin)` reduced to `CodeQL Analysis` and matched the same job. The
javascript row was reporting java-kotlin's `if:`, and the two remaining unconditional contexts
were never examined.

A normalisation applied to make matching robust made two distinct required contexts
indistinguishable. The tell was not in the probe's output — `(7, 1)` was plausible and matched the
figure offered — but in the contradiction with the observed run counts. **A normaliser that maps
two required contexts onto one identity silently halves the population it was built to survey**,
and only an independent count exposes it.

### An `if:` that enumerates its own trigger set is not a condition

`CodeQL Analysis (java-kotlin)` carries
`github.event_name == 'push' || 'schedule' || 'pull_request' || 'workflow_dispatch'`.
`ci-security.yml` declares exactly those four triggers (L10, L12, L14, L17). The guard is a
tautology over the workflow's own trigger set: it cannot be false for any event that reaches it.

This matters for auditing rather than for behaviour. A conditionality audit that greps for the
presence of `if:` scores this job as gated; a pair measurement that evaluates the expression
against the declared triggers scores it as unconditional, which is what it is. Both the presence
test and the absence test are wrong here — presence of a guard is not evidence of gating, in the
same way that absence of a failure record is not evidence of no failures.

### No required context is filtered at the `pull_request` trigger, and that is deliberate

Every one of the seven reports `paths: none` on `pull_request`. The `paths:` filters that exist in
`ci-lint.yml`, `ci-web.yml` and `ci-android.yml` are attached to `push` only. Conditionality on
pull requests lives entirely in a `changes` job whose output gates the real job's `if:`.

This is the correct arrangement and it is forced. A `paths:`-filtered `pull_request` trigger means
a required check does not report at all on a non-matching diff — not skipped, absent — and branch
protection waits for a context that will never arrive, so the PR is permanently blocked. The only
way to keep the check required and still let unrelated diffs merge is to trigger unconditionally
and skip inside, which produces a `SKIPPED` conclusion, which satisfies the requirement.

**The mandatory remedy for one GitHub trap manufactures the exact condition of the other.** The
skip-satisfies-required defect is not a mistake in finance's workflows; it is the residue of
avoiding a worse one. That is why the count of checks that can block is not the property to
measure, and why the pair has to distinguish the contexts that no diff shape can silence.

### On the receipt, and on attribution

Their sharpening of the L486–488 comment in `ci-security.yml` is accepted: an authority with no
gate cannot produce a record of a gate having been evaded, not because it has not been evaded but
because it has no mechanism capable of recording one. The absence of a failure record is evidence
about the recording apparatus before it is evidence about the failures.

One correction owed in the other direction. A previous section attributed the figure "3 of 7" to
the sibling session. They never used it; they only ever quoted this document's "5 of 9" back at
it. The figure is arithmetically true of finance — three of the seven required contexts are
conditional, as the table above shows — which is precisely what makes it durable. **A true value
with false provenance survives review**, because the check a reader performs is on the number.
Same family as the derived-cell hazard recorded earlier: the defect is upstream of the arithmetic,
so re-deriving the value confirms it and confirms nothing about where it came from.

### The Playwright artifact defect was already live in finance, and CI cannot see it

`@jrmoulckers/eslint-config@0.17.0` adds `playwright-report/` and `test-results/` to its shared
ignores, after one repo measured lint going from 16 problems to 5439 once a failed Playwright run
left a bundled HTML report on disk. finance has not adopted the preset, so the natural reading is
that this is a note for later. It is not. **The same defect was already present in finance's own
`eslint.config.mjs`**, and adoption is irrelevant to it.

Measured directly, by writing a probe file containing `var unusedProbeVar = 1` at each path
Playwright can write to and asking ESLint what it does with it:

| Path                               | Before     | After   |
| ---------------------------------- | ---------- | ------- |
| `apps/web/playwright-report/`      | **linted** | ignored |
| `apps/web/test-results/`           | **linted** | ignored |
| `apps/web/blob-report/`            | **linted** | ignored |
| `apps/web/playwright-report-live/` | **linted** | ignored |

All four are in `.gitignore` at L103–106. **Flat config does not read `.gitignore`**, so the two
lists are independent statements about the same paths with no shared source, and the one that
happened to be complete was the one that governs nothing about linting. A path being untrackable
is not a path being unlintable — the repository knew about all four artifact directories and the
linter knew about none of them.

Fixed in this change by adding the four globs. A control file under `apps/web/src/` still reports
its error afterwards, so the ignores drop the artifacts rather than the tree.

### The gate that would catch it is structurally incapable of encountering it

Across all 31 workflows, 16 jobs run either Playwright or ESLint. **Zero run both.**

| Jobs invoking    | Count |
| ---------------- | ----- |
| Playwright / E2E | 13    |
| ESLint           | 3     |
| **both**         | **0** |

`ci-lint.yml`'s `eslint-prettier` and `observability-guardrails`, and `ci-security.yml`'s
`gatekeeper`, are the only jobs that invoke ESLint, and none of them runs a browser test. Every
E2E job is in a different job on a fresh runner. So CI could never have reported this, on any diff,
in any state — not because a check was skipped or filtered, but because the artifact that triggers
it cannot exist in the working directory of the job that lints.

That is a different failure from the skip-satisfies-required ladder recorded above, and it is worth
keeping distinct. There, the gate was reachable and reported green because it was skipped. Here,
the gate ran, genuinely passed, and its green was **true** — true about CI, which is the only thing
a CI result is ever about. The defect lives exclusively in a developer's working tree, and it
surfaces at the single worst moment: immediately after a local test failure, when the next
`eslint .` reports thousands of problems in files nobody wrote, while the developer is already
debugging something else.

**A green CI result is a claim about the runner's filesystem, not about yours.** The upstream note
frames this as "adopting while green shows nothing, so it surfaces later"; in finance's arrangement
the stronger statement holds — it could never have surfaced in CI at all.

### The reporter is environment-split, and the upstream fix covers only one half

`apps/web/playwright.config.ts` L16–18 selects the reporter by environment:

```ts
reporter: isCI
  ? [['blob', { outputDir: 'blob-report' }], ['github']]
  : [['html', { open: 'never' }]],
```

CI writes `blob-report/`; local runs write `playwright-report/`. `0.17.0` ignores
`playwright-report/` and `test-results/`, so **`blob-report/` is not covered**. finance is not
exposed on that leg, because no CI job lints after an E2E run — but a consumer that does run both
in one job, which is the ordinary shape for a repo with a single `test` job, would be. The blob
reporter is also the standard choice for sharded runs, so the repos most likely to hit it are the
ones large enough to shard.

**Reported upstream as an incomplete-glob gap** rather than worked around here: this change carries
`blob-report/` locally because finance's config names it explicitly, and the glob can be dropped if
the preset takes it.

### `node.json` would fail every package in finance, all six of them

The upstream note that `@jrmoulckers/tsconfig`'s `node.json` bundles `types: ["node"]` together with
`allowImportingTsExtensions` — so extending it repo-wide raises `TS2688` in any package without
`@types/node` — has an exact measurement here. finance has six tracked `package.json` files:

| Manifest                                                  | declares `@types/node` |
| --------------------------------------------------------- | ---------------------- |
| `package.json` (root)                                     | no                     |
| `apps/web/package.json`                                   | no                     |
| `services/api/package.json`                               | no                     |
| `packages/design-tokens/package.json`                     | no                     |
| `config/engineering/prettier/package.json`                | no                     |
| `.vscode/extensions/finance-getting-started/package.json` | no                     |

**Zero of six.** There is no package in finance where `node.json` is currently the correct base,
which makes the "root gets `base.json`, `node.json` only where `@types/node` is declared" guidance
degenerate to "never use `node.json`" here. That is a real datum for the deferred tsconfig
adoption, and a stronger reason for the deferral than the one previously recorded.

### The stale-baseline principle, applied to the message that stated it

The upstream note that _"a sound measurement against a stale tree is still wrong"_ — a careful
`--print-config` diff run on a branch 88 commits behind `main` — is correct and generalises well:
rigour in the measurement does not survive a stale baseline, and a "verified clean" claim older
than the branch it was made on is unverified rather than verified.

It was applied to this repository's **317**, with advice to re-measure at the `0.16.0` floor before
putting it in a PR body. Two prior sections already retired that figure: **326** is the current
number, measured at `0.15.0` against finance's real ignores (273 errors + 53 warnings; the raw JSON
carries 313 non-null `ruleId` messages plus 13 unused-directive reports with `ruleId: null`). And
the accompanying premise — that finance is pinned at `^0.8.0` — was measured and refuted in the
section before that: **`@jrmoulckers` appears in zero of finance's six manifests**, and
`check-pins.mjs` confirms it with `nothing to check`, exit 0. There is no range here to be stale.

Recorded without any claim of a gotcha, because it is precisely the class the note names. The
advice was sound reasoning against a picture of finance that two merged changes had already moved.
**The principle's own scope includes the channel that carries it**: a correction travels no faster
than the message that reports it, so any advice about another repository is a measurement against a
tree the sender does not hold. The remedy is the same one the note recommends — re-measure at the
point of use — and it applies symmetrically in both directions.

### The independent pair is jointly defeated, and the standard remedy does not fix it

The previous section endorsed a two-guard pair for `git rev-parse` — exit code (a property of the
process) and full 40-hex shape (a property of the value) — on the grounds that neither is derived
from the other. A sibling session accepted that and added that the two would fail differently: a
command exiting 0 while printing garbage defeats the exit guard alone, and one exiting non-zero
while echoing something hex-shaped defeats the shape guard alone.

Both of us were wrong about the second arm, and the correct version is worse. Measured:

| Input                        | exit  | 40-hex? | object exists? | exit guard | shape guard |
| ---------------------------- | ----- | ------- | -------------- | ---------- | ----------- |
| `deadbeef…` ×5 (nonexistent) | **0** | **yes** | **no**         | passes     | passes      |
| `v9.9.9-does-not-exist`      | 128   | no      | no             | catches    | catches     |

`git rev-parse` does not verify that a full-length hex argument names an existing object. It
accepts it as already-resolved and echoes it, **exiting 0**. So the failure is not "one guard or
the other" — it is both at once, on the single most natural input for a SHA-checking probe.

Independence of _derivation_ does not imply disjointness of _failure sets_. The two guards really
are computed from unrelated things, and they still admit exactly the same wrong value, because the
input class that breaks one is the input class that satisfies the other: a string shaped like the
answer is passed through as the answer. **Two guards are only redundant if their failure sets
differ, and that is a claim about inputs, not about derivations.** This corrects the endorsement
made a section earlier, which reasoned about how the guards were computed and not about what could
satisfy both.

And the obvious remedy is insufficient:

| Command on a nonexistent 40-hex         | exit                 |
| --------------------------------------- | -------------------- |
| `git rev-parse <sha>`                   | 0                    |
| `git rev-parse --verify <sha>`          | **0**                |
| `git rev-parse --verify <sha>^{commit}` | **128**              |
| `git rev-parse --short <sha>`           | 0, prints `deadbeef` |

`--verify` is what most guidance recommends and it does not close this. Only peeling to an object
type — `^{commit}`, `^{object}` — or an explicit `git cat-file -e` actually tests existence. The
`--short` row is the sibling's tidiness observation at eight characters instead of forty: the
output is a well-formed abbreviated SHA of an object that is not there.

### Finance's nine call sites, and the invariant three of them rest on

| Workflow                 | Line     | Form                                        | Safe because                      |
| ------------------------ | -------- | ------------------------------------------- | --------------------------------- |
| `deploy-production.yml`  | 243, 783 | `--verify --quiet "$VERSION^{commit}"`      | **peels**                         |
| `deploy-production.yml`  | 957      | `-q --verify "refs/tags/v…"`                | ref path, never hex               |
| `deploy-staging.yml`     | 79       | `--verify "${TARGET_SHA}^"`                 | `^` peels to parent               |
| `rc-branch-tag.yml`      | 178      | `--verify "origin/${BRANCH}"`               | ref path, never hex               |
| `deploy-progressive.yml` | 154      | `git rev-parse "$VERSION"`                  | input is `vX.Y.Z`, never hex      |
| `rc-branch-tag.yml`      | 242      | `git rev-parse "$RC_TAG"` as existence test | input is `vX.Y.Z-rc.N`, never hex |
| `release-train.yml`      | 426      | `git rev-parse "$TAG"` as existence test    | input is `vX.Y.Z`, never hex      |
| `deploy-staging.yml`     | 101      | `git rev-parse --short "$TARGET_SHA"`       | upstream invariant, below         |

The two existence tests are the interesting ones. `if git rev-parse "$TAG" >/dev/null 2>&1` is a
correct existence test **only for arguments that are not full hex** — it would report "exists" for
any 40-hex string whatsoever. Version tags are never 40-hex, so both sites are correct. They are
correct because of a property of their inputs, not because of a property of the check, which is
the same shape as the `apps/web/vercel.json` trap recorded earlier in this document: inert only
while an external convention holds, with nothing local that would notice if it stopped.

`deploy-staging.yml` L101 is the one that takes a variable literally named `TARGET_SHA`, and it is
also safe — but not by any local mechanism. L75 sets it from `workflow_run.head_sha` or
`github.sha`, and L70 checks out that exact ref, so the object is present by construction. Nothing
at L101 would detect a violation of that invariant.

**No change is made here.** These are production deploy workflows, the invariant holds, and
hardening a non-bug on a release path is the kind of widening this document has declined
elsewhere. The finding is recorded so that a future change to how `TARGET_SHA` is sourced is
understood to be load-bearing.

### `set -euo pipefail` cannot fire on a command that succeeds while being wrong

`deploy-staging.yml` L77 sets `set -euo pipefail`, and it is reasonable to read L101 as protected
by it. It is not, and cannot be: the failure mode under discussion **exits 0**. `set -e` is a
guard on exit status, so it is defeated by exactly the class of defect where the exit status is
the thing that is wrong.

That is the same structure as the two guards above, one level up. A repository can hold three
apparently distinct protections — `set -e`, an exit-code check, and a shape check — and have all
three admit the same value, because all three are satisfied by a command that confidently returns
a well-formed answer about an object that does not exist.

### The tidiness signature has a detector

The sibling's formulation — **real data is ragged; fabricated data is tidy** — is right, and the
mechanism supplies a test. When `git rev-parse` fabricates, it echoes its argument, so the output
column becomes a copy of the input list. If the inputs are distinct (tags, paths), the outputs are
distinct too, and `distinct == rows` follows necessarily.

So `distinct == rows == length(inputs)` is the signature of total fabrication, and it is exactly
the result that reads as a clean sweep. The corruption is inversely legible to its severity, as
they put it, and the reason is that a fabricated column inherits the shape of the query rather
than the shape of the data. A genuine enumeration of a file across 153 tags produces collisions,
because content repeats; only a fabricated one is perfectly distinct.

## A dead guard is a permanently green security check, and it is one deletion away

Upstream retracted a figure it had published for finance — `(7,1)` — on the grounds that it was
never measured here but borrowed from an undercount of mine and reformatted into upstream's own
notation. That retraction is correct and the general form is worth more than the correction:

> A borrowed value laundered through someone else's notation reads as independent confirmation.

It collided with a real defect on this side. My probe returned `(7,1)` because its normaliser
stripped trailing parentheticals and collapsed `CodeQL (javascript-typescript)` and
`CodeQL (java-kotlin)` onto one identity. Agreement between the two figures was therefore not
evidence: one was my undercount, and the other was my undercount wearing different units. The
true pair is `(7,4)`, caught only because three earlier sections of this guide record 4 ran /
3 skipped on docs-only PRs — a contradiction with observed run counts, not a better probe.

Worth recording that the instrument survived the error inside it. `(7,1)` and `(7,4)` are both
non-vacuous, so the ranking against a repo with `(0,—)` never depended on which was right. The
predicate it replaced — _is any required context unconditional?_ — would have returned `true` for
both and hidden that one of us was wrong by a factor of four.

### Tautology is a property of the guard against its trigger set

Upstream's sharpening is right and it is the actionable part: an `if:` cannot be classified by
reading it. `github.event_name == 'push'` is live, dead, or tautological depending entirely on the
`on:` block — a different part of the file, which never mentions the job, and which changes
independently.

Classified every guard in the 31 workflows on that basis. 81 jobs carry an `if:`; 33 reference
`github.event_name`. Of the guards decidable from the trigger set alone:

| Workflow / job                           | Guard covers | Declared triggers | State     | Margin to DEAD |
| ---------------------------------------- | ------------ | ----------------- | --------- | -------------- |
| `ci-security.yml` / `codeql-java-kotlin` | 4 of 4       | 4                 | TAUTOLOGY | 4              |
| `housekeeping.yml` / `add-to-project`    | 2 of 4       | 4                 | LIVE      | 2              |
| `ci-web.yml` / `e2e-pr-smoke`            | 1 of 2       | 2                 | LIVE      | **1**          |
| `ci-security.yml` / `dependency-review`  | 1 of 4       | 4                 | LIVE      | **1**          |

**0 DEAD guards exist today.** That zero is what makes the next part a ratchet rather than a
migration.

### The loop closes on the gatekeeper

`ci-security.yml`'s `Required Checks Gatekeeper` was built to defeat skip-satisfies-required at
the branch-protection level: it runs `if: always()`, takes 8 security jobs as `needs:`, and fails
if any of them failed or was cancelled. That aggregation is correct.

But at L603–606 it accepts `skipped` as passing, and the comment at L597–599 says why:
`dependency-review` only runs on pull requests, so on every push it is legitimately skipped.
Making `skipped` fail would break every push. **The skip tolerance is forced.**

So delete `pull_request:` from that `on:` block — one line, in a block that never names
`dependency-review` — and the job is skipped on every event forever. The gatekeeper reports
success, correctly by its own rules, and nothing in the repository can tell the difference between
a job that is correctly skipped and one that can never run again.

This is the same shape recorded earlier in this guide one level down. A `paths:`-filtered
`pull_request` trigger makes a required check _never report_, which blocks the PR forever; the
only remedy is trigger-always/skip-inside, which yields `SKIPPED`, which satisfies the
requirement. The mandatory remedy for one trap manufactures the exact condition of the other — and
the mechanism built to contain the consequence reproduces it at the level above.

### The ratchet

`tools/check-workflow-security.mjs` now exports `findDeadEventGuards`, wired into
`scanWorkflowSecurity`, so the gatekeeper's own security check fails any workflow carrying a guard
no declared trigger can satisfy.

Three design constraints, each from a failure this guide already records:

**It decides only what it can decide.** `pureEventDisjunction` returns the accepted events only
for a plain `||` chain of `github.event_name == '<event>'`, and `null` for anything containing
`&&`, `!`, or parentheses. 29 of the 33 event-referencing guards mix in `needs.*` outputs,
`always()`, or `github.ref`, and their reachability is not a function of the trigger list. A
checker that guessed at those would report violations against correct workflows.

**Reusable workflows are exempt.** Inside a `workflow_call` target, `github.event_name` is the
_caller's_ event, so the callee's own trigger list says nothing about which values are reachable.
This is not hypothetical: `reusable-detect-changes.yml` declares `on: workflow_call:` and nothing
else, and carries `if: github.event_name == 'pull_request'` at L65. The first draft flagged it.
The file is correct; the checker was wrong. 3 workflows declare `workflow_call`.

**It uses the real parser.** The file previously imported only node builtins, and matching that
would have meant hand-rolling a folded-scalar parser — 22 of the guards are written as `if: >-`
or `if: |`, including the tautological one. A bespoke parser would have silently skipped exactly
the cases with the most room to hide. `js-yaml` is already a direct dependency at `^4.3.1`.

Verified both directions. Against the 31 workflows as they stand: **0 violations, exit 0**.
Against `ci-security.yml` with `pull_request:` removed from the trigger block and nothing else
changed:

```
job 'codeql-java-kotlin' step 2 is guarded on 'pull_request', which no declared
  trigger (push, schedule, workflow_dispatch) can satisfy — it can never run
job 'dependency-review' is guarded on 'pull_request', which no declared
  trigger (push, schedule, workflow_dispatch) can satisfy — it can never run
```

11/11 unit tests pass, including the reusable-workflow exemption and the case where a disjunction
names one undeclared event alongside a declared one — that guard is live, and a checker requiring
every term to be reachable would have been wrong about it.

## My "0 violations" omitted the denominator

The sibling's amendment is the sharpest instrument in this thread:

> Shared oracle is sufficient for correlated failure, not necessary. The right question is
> "name an input that defeats guard A but not guard B" — and if you can't, the second guard is
> decoration.

Applied that to the checker shipped in the previous section rather than to their example, and it
found the defect in my own reporting.

`findDeadEventGuards` returned **0 violations across all 31 workflows**, and I reported that
figure without stating what it ranged over. The denominator:

| Class                                         | Count  |
| --------------------------------------------- | ------ |
| `event_name` guards in non-reusable workflows | **42** |
| Decided by `pureEventDisjunction`             | **6**  |
| Skipped as undecidable                        | **36** |

**0 of 6 is a very different claim from 0 of 42.** The conservative gate that prevents false
positives against correct workflows _is_ the blind spot, and it is the same object viewed from
either side — so an input that defeats it defeats nothing else, because nothing else is looking.
The reusable-workflow exemption and the `null`-on-complex-expression return are not two guards; the
second is the only guard, and the first narrows it further.

This is the sibling's §3 turned on me before I could enjoy it being about them. Their enumeration
was safe by a property of its inputs — every argument carried a `:path` suffix, so `rev-parse`
could not take the pass-through branch — and mine was clean by a property of its coverage. Neither
is the property the result appears to assert.

### A second decidable class, measured before building it

The obvious response is to widen coverage, and the obvious risk is widening it into guesswork. So
the reach was measured first:

| Bucket                                             | Count  |
| -------------------------------------------------- | ------ |
| Decided today (pure `\|\|` disjunction)            | 6      |
| **Newly decidable by top-level conjunct analysis** | **10** |
| Genuinely opaque (negation, parenthesised groups)  | 26     |

The new class is sound rather than heuristic. If any top-level conjunct is
`github.event_name == '<event>'` and no trigger declares that event, that conjunct is permanently
false, so the whole conjunction is — **regardless of what `needs.*` or `always()` evaluate to**.
That is what makes it decidable without evaluating them. `always() && github.event_name ==
'pull_request' && needs.build.outputs.ok` is dead in a workflow with no `pull_request` trigger, and
the previous version could say nothing about it.

Coverage goes from **6 of 42 to 16 of 42**. 26 remain opaque and are still reported as nothing,
which is now a stated figure rather than an omitted one.

Two boundaries held deliberately:

- **`(A || B) && C` is not decided.** A parenthesised disjunction naming one undeclared event is
  still satisfiable through the other term. Reported as null, with a test asserting it.
- **Negation is never decided.** `github.event_name != 'schedule'` constrains nothing about
  reachability from a trigger list.

The `&&` splitter respects parenthesis depth. A quoted string containing `&&` could mis-split, but
the failure is one-directional: the fragments then fail the strict conjunct pattern and the guard
falls back to undecided. **The parser can under-decide; it cannot over-report.** That asymmetry is
the property worth having, because a false positive here fails the gatekeeper on a correct
workflow.

### Verified in both directions again

Against the 31 workflows as they stand: **0 violations, exit 0**, now over 16 guards rather than 6.
13/13 unit tests. Against `ci-web.yml` with `pull_request:` deleted from the trigger block and
nothing else changed:

```
job 'e2e-pr-smoke'  is guarded on 'pull_request', … it can never run
job 'e2e-pr-report' requires event 'pull_request', … the guard can never be true
```

`e2e-pr-report` is caught **only** by the new class — the version shipped in the previous section
was silent on it. That is the concrete answer to "name an input that defeats guard A but not guard
B", and it is worth noting that the input had to be constructed by mutating a real file rather than
found in one. A guard whose distinguishing input does not occur naturally is still doing work; it
just cannot prove it from the current tree.

### `set -e` is one signal installed twice

Taking the sibling's §4 as the portable form:

> A defence stack is only as independent as the signals it reads, and exit status counted twice is
> one signal.

This is the same shape as the redundancy distinction recorded earlier in this guide — redundant
triggers buy coverage, redundant instruments reading one channel buy confidence without evidence.
Applied to the two guards here: `pureEventDisjunction` and `deadEventConjunct` read the same two
inputs (expression text, trigger list) but decide **disjoint syntactic classes** — one returns null
exactly where the other applies. They are not redundant, and they are not independent either;
they partition. That is a third relation worth distinguishing from both, and the coverage table is
the only thing that shows which one you have.

## The marker is load-bearing, and no gate in this repo would notice its removal

Upstream reported the `"type": "module"` gap fixed in `vendor-configs.mjs` and told finance it could
drop its workaround file. Both halves needed checking, and checking them corrected one of my own
claims mid-investigation.

### First, a correction to something I asserted this turn

I searched for the workaround with `git ls-files | Select-String 'vendor.*package\.json'` and
reported that finance had none. That pattern requires the literal string `vendor` in the path. The
file is at `config/engineering/prettier/package.json`. **The search returned clean because it was
looking in the wrong place**, which is the exact failure mode recorded earlier in this guide about
remedies phrased as "look in your config" — and I produced it while responding to that very item.

The marker is tracked, and `git log` names the commit: `3a423b13`, PR **#4077**, "adopt vendored
@jrmoulckers/prettier-config at v0.15.1". I added it myself, and it is **not** in the lock's file
list — the lock records 3 files and the marker is not one of them.

### The instruction to drop it is wrong for finance, measured

The first measurement said it was safe to drop. On Node 24.3.0, with and without the marker, the
config resolves identically (`printWidth: 96`, `proseWrap: preserve` for `.md`) and `import()`
succeeds. That measurement was sound and the conclusion did not follow, because **the runtime I
measured on is not the runtime the repo declares**:

| Source         | Node         |
| -------------- | ------------ |
| My shell       | 24.3.0       |
| `.nvmrc`       | 22           |
| `engines.node` | **>=22.0.0** |
| CI (36 refs)   | 22           |

Node enabled module syntax detection by default in **22.7.0**. `engines` permits 22.0–22.6, and
`.nvmrc: 22` can resolve there. Re-measured with `--no-experimental-detect-module` to simulate that
window:

| State          | `import()` of the vendored config     |
| -------------- | ------------------------------------- |
| With marker    | ok, `printWidth = 100`                |
| Without marker | **FAILED `ERR_REQUIRE_CYCLE_MODULE`** |

**The marker is load-bearing inside the range this repository's own manifest permits.** My first
test could not have found that, because it ran above the floor. A compatibility hedge tested on one
runtime tells you nothing about the floor it hedges.

### The part that makes it worth a gate

With the marker removed _and_ detection disabled, `npx prettier --check` still **passes, exit 0**.
Prettier loads its config through its own resolver, so `format:check` is not a proxy for
loadability. Deleting the marker would have produced a fully green repository containing a config
that Node cannot import at the declared engines floor.

That is upstream's own point about hashes — every byte matching the lock, every file individually
correct, the directory still not a loadable package — with one addition: **the marker was outside
the lock entirely**, so `--check` was not silent about it by accident, it had nothing to say.

### The fix

`scripts/vendor-configs.mjs --check` now also verifies module markers. For each vendored `.js`
using ESM syntax, a sibling `package.json` must declare `"type": "module"`. `.mjs` is skipped — its
extension already declares the module system.

Verified in three directions:

| State                               | Result                                |
| ----------------------------------- | ------------------------------------- |
| As-is                               | 3 files match, **exit 0**             |
| Marker deleted                      | **exit 1**, both ESM files named      |
| Marker present, declares `commonjs` | **exit 1**, reports the declared type |

The third case matters because upstream is right that a marker stating the wrong type is worse than
none: it _overrides_ detection, converting a runtime that would have coped into one that cannot.
Checking only for presence would have passed it.

This runs in CI already — `ci-lint.yml` invokes it at L117 and L288 — so no new wiring was needed.

### Do not re-pin yet, and why the re-pin was tested rather than reasoned about

Upstream reports `v0.116.0` merged as #217. It does not exist:
`git/refs/tags/v0.116.0` → **404**, and `releases/latest` → **`v0.115.0`**. Upstream's own advice in
the same message — _re-resolve rather than copying the literal out of this message_ — is what
caught it. A version number stated before it is published is the same class as `versions.json`
recording registry state and being unable to lead a publish.

Vendoring at the real latest was then run rather than argued about, and produced a result no
reasoning would have predicted:

```
Vendored 9 file(s) from jrmoulckers/engineering@v0.115.0
Ref moved v0.86.0 -> v0.115.0; 6 file(s) changed content.
```

`git diff --stat` showed **only the lock file changed** — because the six were _untracked_, and
`git diff` does not show untracked files. The set had silently grown from 3 to 9, adding six
`config/engineering/tsconfig/*.json` files that finance deliberately defers (2,691 diagnostics, and
0 of 6 manifests declare `@types/node`). By upstream's own §4 — _vendor in the change that adopts_ —
vendoring configs nothing extends is the anti-pattern, and re-pinning would have committed exactly
that.

Reverted. finance stays at `v0.86.0`: the three vendored files are byte-identical at `v0.115.0`,
the `v0.112.0` declaration floor concerns `index.d.ts`, which finance does not vendor, and the
marker fix that would justify moving is not released.

## A required check can be green and cancelled at the same time, and the rollup shows only the green one

PR #4208 sat at `MERGEABLE` / `BLOCKED` for nine polling cycles while `gh pr checks` reported
**zero failures**: `SUCCESS=20, NEUTRAL=1 (CodeQL), SKIPPED=12`. Every documented remedy for a
green-but-blocked PR points at `--admin`, which `AGENTS.md` Category 2 permits on an
agent-authored PR once local gates are verified. All local gates were verified. The override was
one command away and would have been wrong.

The block was real and visible, but not in the rollup. On the same head SHA:

| Source                     | Total check-runs | `cancelled` | `ESLint & Prettier` entries            |
| -------------------------- | ---------------- | ----------- | -------------------------------------- |
| `gh pr checks 4208`        | 33               | **0**       | (one, green)                           |
| `commits/<sha>/check-runs` | **38**           | **1**       | **2 — one `success`, one `cancelled`** |

`ESLint & Prettier` is one of the seven required contexts. Two workflow runs
(`31604747956`, `31604747970`) both produced a check-run of that name on commit `c9502316`; one
finished, one was cancelled by concurrency. Branch protection saw a required context that was
not satisfied. The rollup saw a green one and said so.

**What is measured, and what is not.** The rollup is not the set protection evaluates — that much
is certain, because 33 ≠ 38 and the missing row is the one that matters. But the rule producing
33 is _not_ name-deduplication either: the SHA carries 27 distinct names, so 33 is neither the
raw set nor the deduplicated set. Six names were duplicated (`changes / Detect relevant changes`
×6, `Build & Test` ×3, and four pairs), and eleven rows are surplus to the distinct count while
only five are dropped. **I do not know the selection rule and am not going to guess it** — this
document already carries two retractions where the outcome was right and the mechanism invented,
and the mechanism is the part a reader generalises.

The counterfactual holds. Rebasing onto `main` produced head `d04239f7` with **33 check-runs, 0
cancelled, and exactly one `ESLint & Prettier`** — `CLEAN` on the next poll, merged without
`--admin`.

Three things worth keeping:

- **`gh pr checks` is a diagnostic, not the gate.** A zero-failure rollup is consistent with an
  unsatisfiable required context. When `BLOCKED` contradicts a green rollup, the rollup is the
  thing to distrust, and `commits/<sha>/check-runs` is where the contradiction resolves.
- **The omission licenses the bypass.** This is the sharp edge: the tool's silence is not neutral,
  it actively supplies the premise (`no failures`) that makes `--admin` look like the correct and
  policy-compliant next step. A diagnostic that under-reports on a gate is worse than no
  diagnostic, because it converts a blocked merge into an apparently-justified override.
- **Duplicate check-run names are normal here.** Six names duplicate on an ordinary push, because
  reusable jobs report under the caller's name. So "a required name appears twice" is not itself
  the anomaly; a required name appearing twice with _disagreeing conclusions_ is.

## My `v0.116.0` refutation went stale inside a single session

Earlier in this adoption I recorded that upstream's `v0.116.0` did not exist — `git/refs/tags/v0.116.0`
returned 404 and `releases/latest` returned `v0.115.0`. That was correctly measured and is now
false: `releases/latest` returns `v0.116.0`, and `vendor-configs.mjs --check` reports the tag as
available. The tag was published between the measurement and the merge of the PR that recorded it.

The lesson is one this document already states in the other direction — a sound measurement against
a stale tree is still wrong — and it is worth noting that the _refutation_ ages exactly like the
claim. "That version does not exist" has a shelf life measured in hours when upstream ships
daily; "that version is not what I am pinned to" does not. **Prefer the durable form.** finance
remains pinned at `v0.86.0` because its three vendored files are byte-identical there, which is a
statement about content and does not expire when a tag lands.

## Two correct controls, deadlocked: a security update blocked for four days

Chasing the claim that skip tolerance is _conserved_ rather than eliminated, I measured the
gatekeeper's dependency set and then its actual outcomes. The tolerance question resolved
immediately and unremarkably; the outcome tally did not.

**The tolerance is forced for two of eight.** Of the gatekeeper's 8 `needs:`, only
`codeql-java-kotlin` and `dependency-review` carry an `if:` at all. The other six —
`codeql-javascript`, `secret-scanning`, `gitleaks`, `npm-audit`, `gradle-dependency-check`,
`license-check` — are unconditional, and across 40 runs every one of them concluded `success`
40/40. So blanket `success|skipped` tolerance is load-bearing for 25% of the set and pure slack
for the rest. That is a real if minor widening, and it is _not_ what the runs were failing on.

**A 12/12 coincidence that wasn't a correlation.** `Dependency Review` was `skipped` 12 times and
`Required Checks Gatekeeper` failed 12 times, which looked like the documented tolerance not
working. Crosstabulating refuted it outright: `dr=skipped → gk=success` ×11 (all `push`), and all
12 gatekeeper failures were `pull_request` runs where dependency-review **succeeded**. The
tolerance does exactly what its comment claims. Two equal counts, zero overlap — worth recording
because the matching totals were the entire basis for suspecting it.

**What the failures actually were.** All 8 required checks green, gatekeeper red. The failing step
is a different one in the same job:

```
Workflow security regression check failed:
- reusable-detect-changes.yml: reviewed local reusable drifted
    (expected f67ce0e2…, found 642d6e29…)
- reusable-release-smoke-test.yml: reviewed local reusable drifted
    (expected 74ff29d0…, found bba5f8f3…)
```

10 of the 12 failures are the **same pull request** — #4012, a Dependabot bump of 12 actions
across 28 workflow files, open since 2026-08-08 and still failing on the most recent run in the
sample. The other two were transient and self-healed on the next push.

### The deadlock

`tools/check-workflow-security.mjs` freezes two privileged `workflow_call` targets to a reviewed
SHA-256 of their **whole file** (`localReusableBaselines`, added in `517d0116` / #4025 — this
predates the engineering-practice adoption and is not something this work introduced).
`GH-ACT-003` requires every `uses:` to be pinned to a full 40-character commit SHA. Dependabot's
entire function is to rotate those pins. Both files contain pinned actions.

So: the pinning rule mandates the pins, Dependabot updates the pins, and the freeze reads a pin
update as an unreviewed edit to a privileged workflow. Each control is correct in isolation and
neither can yield to the other. The result is that **a security-relevant dependency update is
blocked by a security control**, and the longer it stays blocked the staler the pins it was
trying to refresh — the failure mode compounds in the direction of less security, not more.

This is the sibling session's structural finding in a second instance, and a stronger one: there
the mandatory remedy for one trap _manufactured the condition_ of another. Here two mandatory
controls manufacture a deadlock with no third position available.

### The fix, and precisely what it gives up

`normalizeReviewedPins()` elides an already-pinned reference before the baseline hash is taken,
so the baseline tracks a workflow's **logic** rather than the specific SHAs it pins:

```
uses: actions/checkout@11bd71901bbe…  # v4.2.2   →   uses: actions/checkout@<PINNED>
```

Four properties, each held by a test:

- **`owner/repo` is preserved.** Repointing a step at a different action still drifts. Verified by
  mutating a real pin to `attacker/evil` — exit 1.
- **Only a full 40-hex reference is elided.** A pin replaced by `@v4` does not match, so it drifts
  here _and_ is independently reported by `findMutableReferenceViolations`, which runs over every
  workflow at L416 and requires a 40-hex SHA on every `uses:`.
- **The trailing `# vX.Y.Z` comment is elided with the reference,** because Dependabot rewrites it
  in the same edit. Leaving it in would have reintroduced exactly the drift being removed — the
  normalisation would have looked right and changed nothing.
- **Non-`uses:` lines are untouched,** so a SHA appearing in a `run:` is still hashed.

Residual risk, stated plainly: an in-place rotation of a valid 40-hex SHA on an
**already-trusted `owner/repo`** is no longer caught by _this_ control. That is the exact change
Dependabot makes, which is why the deadlock existed. It remains covered by the 40-hex pin
requirement, by dependency-review and CodeQL on the same PR, and by the canonical-comparison
assertion these two files also carry.

### Verified against the real failing input, not an analogue

The raw hashes computed locally reproduce the CI log **exactly** — `f67ce0e2…` expected /
`642d6e29…` found, and `74ff29d0…` / `bba5f8f3…` — so this was measured on the input that failed
rather than a reconstruction of it. Under normalisation, `main` and #4012 produce an identical
hash for both files, which also establishes that the entire delta in those files was pin
rotation and nothing structural.

Six directions checked end to end: `main` → 0; #4012's content → **0** (deadlock resolved);
injected job → 1; restored → 0; repointed action → 1; final → 0. 17/17 unit tests.

**The portable form:** a content freeze over a file that a bot is _required_ to edit is a deadlock
with a delay fuse. It passes review, passes CI, and passes every run until the bot's first edit —
and the component that finally reports red is neither of the two controls that conflict.

## Auditing my own guard pair with a coverage table

PR #4214 claimed that what the pin-normalised baseline gives up is "still covered by
`findMutableReferenceViolations`". That is a _they fail differently_ claim published without an
input table — the same defect as reporting `0 violations` without a denominator. Both checks react
to a `uses:` line, so redundancy was the null hypothesis and I had not tested it.

Tabulated at the scan level, with both reviewed files present:

| Input                                       | reviewed baseline | 40-hex pin check | separates? |
| ------------------------------------------- | ----------------- | ---------------- | ---------- |
| A control, as committed                     | —                 | —                | no         |
| B pin rotation, same repo                   | —                 | —                | no         |
| C repointed to `attacker/…`                 | **FIRES**         | —                | **yes**    |
| D pin replaced by `@v4`                     | FIRES             | FIRES            | no         |
| E structural edit, no `uses:` change        | **FIRES**         | —                | **yes**    |
| F unpinned action in an unreviewed workflow | —                 | **FIRES**        | **yes**    |

**Three separating inputs, in both directions.** C and E defeat the pin check; F defeats the
baseline, because the baseline's domain is 2 files and the pin check's is all 31. So the pair
_partitions_ — neither is decoration, and the #4214 claim holds as measured rather than asserted.
Row B is the deadlock case, and both being silent on it is the fix working.

Encoded as four tests (A, C, E, F), so the separation is maintained rather than observed once.
Mutation-tested: dropping the normalisation kills 2, widening the elision to unpinned refs kills 1,
dropping the `owner/repo` capture kills 4.

### Three instrument bugs, and only one of them a control row could catch

Building this table went wrong three times, in three different ways, and the pattern in _which_
row noticed is the actual finding.

1. **Over-matching predicate.** My first attempt passed `scanWorkflowSecurity` a map containing
   only the file under test. The _other_ reviewed file was then absent, read as `''`, and drifted —
   so the baseline column read `FIRES` on every row. **The control row caught this**, because a
   known-negative that fires is a loud failure.
2. **Under-matching predicate.** My drift predicate was `/reviewed reusable drifted/`; the code
   emits `reviewed **local** reusable drifted`. It matched nothing, ever. **The control row passed
   — vacuously.** So did row F's negative half. Only the positive rows C and E failed, and they are
   the reason I looked.
3. **A no-op input.** Row C mutated `uses: actions/` → `uses: attacker/`, but
   `reusable-detect-changes.yml` references no `actions/*` at all; its only action is
   `dorny/paths-filter`. The edit changed nothing. **An `assert.notEqual(after, before)` guard
   caught it** — a line I added only because of the mutation-testing lesson below.

The asymmetry is worth stating plainly: **a control row protects against a predicate that
over-matches, never one that under-matches.** A control is a known negative, and a predicate that
can never match satisfies every known negative perfectly. Both of my first two bugs produced a
table; one was visibly wrong and one looked clean. Negative rows are load-bearing only in the
presence of positive rows that share the same predicate.

### A mutation that never applied looks exactly like a surviving mutant

Mutation-testing this, my second mutation reported **0 failures** — apparently a coverage gap. It
had not applied: I searched for `uses:\s*([^@\s]+)@[0-9a-f]{40}[^\n]*$` while the source reads
`uses:\s*)([^@\s]+)@…`, one paren different, so `String.replace` matched nothing and I
mutation-tested the unmutated file.

**Mutation testing has no natural failure signal for the mutation itself.** A mutant that was never
introduced and a mutant that survives are the same observation — `0 failures` — and the tooling
reports them identically. Every other check in this document at least fails loudly when
misconfigured. The remedy is one line: assert the edit landed before trusting the run, which is now
done for all three mutations and, in row C, for the test input too.

**Portable form:** verify the mutant exists before concluding anything from the suite that ran
against it. An experiment that silently did nothing reports as a finding about the thing you were
testing.

## The globals drift the sibling reported, reproduced by accident and fixed at the class

Writing the separation tests above needed `new URL(...)` to resolve a workflow path. ESLint failed
with `'URL' is not defined`. That is the sibling session's report arriving unprompted: finance's
`eslint.config.mjs` hand-listed **13** globals for its tooling files — `console`, `process`,
`require`, `module`, `config`, `__dirname`, `__filename`, `Buffer`, `fetch`, `setTimeout`,
`clearTimeout`, `setInterval`, `clearInterval` — and Node has long since moved past that list.

Two properties make it worse than an ordinary omission:

- **It is invisible to a rule-by-rule config diff.** The defect lives in `languageOptions`, not in
  `rules`, so every comparison this document has published between finance's config and the shared
  preset scored it zero. Selection and configuration are two comparisons.
- **It surfaces only when the first file needing the global is written.** The list had been wrong
  for as long as Node has shipped a global `URL`; nothing in the repo had used one in a tooling
  file. The check was green because of a property of the inputs, not of the config — the same shape
  as the `:path` suffix that made an earlier probe safe by accident.

Fixed by sourcing from the runtime instead of restating it: `...globals.node` plus
`config: 'readonly'`, which is a real local global for Kotlin/JS `webpack.config.d` and has **no
Node equivalent**. Of the 13 hand-listed, **12 are in `globals.node` and only `config` is not**, so
the spread is a strict superset apart from that one name. This makes the drift _unrepresentable_
rather than merely corrected — the argument for the shared preset's `toolingFiles`, and a better
argument than any rule comparison can produce, because the rules were never the difference.

**`globals` was a phantom dependency.** It resolved only because ESLint pulls it transitively;
importing it directly without declaring it is a build that works until an unrelated dependency bump
hoists it away. Now declared in `devDependencies`.

A measurement note on myself: I probed the transitive copy at `17.9.0`, then `npm install` resolved
`^17.9.0` to **`17.11.0`**. My `URL`-is-present evidence was gathered against a version that is no
longer the one installed, so I re-ran the probe against `17.11.0` (81 keys, `URL` present, `config`
absent) before claiming anything. **A pre-install probe is evidence about the tree you had, not the
tree you shipped** — the same staleness recorded twice already in this document, here at a
two-minute interval rather than a two-week one.

### The lock was wrong in a way `npm ci --dry-run` certified as fine

Declaring `globals` broke CI on three jobs with
`npm ci ... Missing: conventional-commits-parser@6.4.0 from lock file`. Three facts, in the order
they mattered:

- **My `node_modules` had drifted from `main`.** Dozens of merges had landed since it was last
  installed, and `globals@17.9.0` was present locally while appearing **nowhere in `main`'s lock**.
  Every `npm install --save-dev globals` I ran resolved against that drifted tree, so each
  regenerated lock was wrong in a different way — one of them declaring `globals` in
  `devDependencies` with **no `node_modules/globals` entry at all**, which is exactly the
  inconsistency `npm ci` refuses.
- **`npm ci --dry-run` returned exit 0 on that broken lock.** It is the check whose entire purpose
  is lock integrity, and it passed the lock that CI then rejected. `eslint` and `prettier` passed
  too, which is unsurprising — but the dry run is the one that claimed the relevant thing.
- **The fix was to stop generating and start from a known tree.** `npm ci` against `main`'s lock
  first (3 min, 731 packages), _then_ `npm install --save-dev globals` (1 package), then a real
  `npm ci` to confirm (5 min, 732 packages, exit 0).

**A lockfile is a statement about a tree, and you cannot amend it from a tree that has drifted.**
The generated result is a function of local state that no diff displays, which is why three
successive attempts produced three different wrong answers with no visible cause.

The portable rule matches the mutation-testing one above: **the cheap check that models the
expensive one is evidence about the model.** `--dry-run` is a simulated invocation, and this
document has now recorded three separate occasions where a simulated invocation certified something
the real command rejected.

### The real cause: my npm is two majors ahead of CI's

The lock kept failing CI because **`.nvmrc` pins Node 22 and CI runs npm 10, while this machine
runs Node 24 / npm 11**. npm 11 _prunes_ an optional peer entry that npm 10 _requires_:
`node_modules/git-raw-commits/node_modules/conventional-commits-parser@6.4.0`, marked
`"optional": true, "peer": true`.

So every regeneration produced a lock that was **correct for the npm that wrote it and invalid for
the npm that reads it**. Four attempts, four rejections, with a local `npm ci` passing every time —
because my local `npm ci` is npm 11.

Two things this falsifies, both of which I had been treating as settled:

- **"Verified with the real command" was not enough.** The earlier note in this document said the
  fix for a bad simulation is to run what CI runs. I did: `npm ci`, twice, exit 0. The command was
  right and the _runtime_ was wrong, which no amount of re-running locally would surface. Running
  `npx npm@10 ci` reproduced CI's failure immediately and confirmed the fix (738 packages, exit 0).
- **A lockfile is not a portable artifact.** It is a statement about a tree _as resolved by a
  specific npm major_, and the repo pins the Node version precisely so everyone shares one. I was
  outside that pin and nothing warned me — `.nvmrc` is advisory unless a version manager reads it.

The fix was to stop regenerating and restore the pruned entry surgically, taking the exact object
from `main`'s lock and re-inserting it at its original position. The diff against `main` is then
**14 insertions, 0 deletions** — purely the `globals` addition, which is what the change was
supposed to be.

**Portable form: match the runtime, not just the command.** `.nvmrc` exists to make that
checkable, and a pre-push check that compares `node --version` against it would have converted four
CI round-trips into one local error. Recorded as a follow-up.

## Destroying uncommitted work with a sync habit

Between finishing the tests above and committing them, I ran `git reset --hard origin/main` to
check sync state and lost every uncommitted change: the ESLint fix, the four tests, both doc
sections. All were reconstructible from context, so the cost was time, not content.

The command was not a mistake in isolation. It is recorded in this session's own operating notes as
the way to sync — a habit formed over dozens of PRs where it ran against a **clean tree**, and
correct every one of those times. Applied to a dirty tree it is a destructive operation with no
confirmation and no undo, because uncommitted work is not in the reflog.

**The invariant lived in the state of the tree, not in the command**, and nothing local would
notice it changing — which is precisely the defect class this document has been cataloguing in
`git rev-parse` guards, in the `:path` suffix, and in the globals list above. Having written that
sentence three times about other people's code, I then shipped it as behaviour.

The cheap remedy is `git stash --include-untracked` before any sync, or `git status --short` read
_before_ rather than after. The durable one is the same rule as everywhere else: a command whose
safety depends on an unstated precondition should state it.

## Re-pinning across 34 tags, and what actually changed

Upstream reported that `publish.yml` triggers only on tag push, tagging was manual, and **30 PRs
merged without a tag** — so `releases/latest` served a stale script and fixes reported as shipped
were unreachable from any ref a consumer could pin.

Measured before re-pinning. The claim understates it:

| ref        | `scripts/vendor-configs.mjs` | sha256 (first 16)  |
| ---------- | ---------------------------- | ------------------ |
| `v0.86.0`  | 303 lines                    | `35241DC829A49D63` |
| `v0.100.0` | 303 lines                    | `35241DC829A49D63` |
| `v0.110.0` | 303 lines                    | `35241DC829A49D63` |
| `v0.115.0` | 303 lines                    | `35241DC829A49D63` |
| `v0.116.0` | 873 lines                    | `04B70C5F5BBA4F00` |
| `v0.120.0` | 903 lines                    | `2054166291D5F983` |

**Byte-identical across 29 tags.** Three distinct scripts across the six sampled tags. So the
`v0.15.x` pin cluster recorded earlier in this document was not the failure it looked like — for
`vendor-configs.mjs`, `v0.86.0` and `v0.115.0` were _the same artifact_, and re-pinning between
them would have changed nothing while appearing to be diligence.

**The notice was itself stale on arrival.** It announced `v0.116.0` as the head; `releases/latest`
resolved to **`v0.120.0`**, four tags further on. This is the fourth stale literal recorded here and
the first to appear inside a message _about_ stale literals. Re-pinned to the resolved ref, not the
quoted one — the habit the upstream doc itself prescribes.

### What actually changed, which is the question that was asked

finance vendors **3 files**. Across 34 tags, **exactly 1 changed**:

| vendored file                                      | v0.86.0 → v0.120.0            |
| -------------------------------------------------- | ----------------------------- |
| `config/engineering/prettier/index.js`             | unchanged                     |
| `config/engineering/prettier/svelte.js`            | unchanged                     |
| `config/engineering/citations/check-citations.mjs` | **changed** (532 → 666 lines) |

The two unchanged files are the control: had the hashing pipeline been wrong, all three would have
differed. The vendoring tool independently reported `1 file(s) changed content`, agreeing with the
measurement.

The checker's delta is `+147 / -13`, and every one of the 13 removals is upstream evolution, not a
finance-local edit — so the file was a clean vendored copy and replacing it lost nothing. Its
self-reported version string is **`v9` before and after**, so the version is not a usable signal for
what a re-pin brings.

The one observable capability gain is a new check: **`link anchors`**.

### The new check is vacuous in every consumer repo

`--check` and the citation gate both went green, and the parent's own caution applies: _a
newly-silent tool and a broken tool look identical from outside_. Tested rather than assumed.

A citation with a correct file path and a deliberately nonexistent `#fragment`:

```
node config/engineering/citations/check-citations.mjs .
  142 citation(s) ... checks run: IDs, stated names, range members, link paths, link anchors
  exit 0
```

**Silent.** The mechanism is one line:

```js
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
```

In the engineering repo the script lives in `scripts/`, so `..` is the repo root and
`principles/operations/observability.md` resolves. Vendored into
`config/engineering/citations/`, `..` is **`config/engineering/`**, and the checker looks for
`config/engineering/principles/operations/observability.md` — which no consumer has.
`readHeadingSlugs` returns `null` on a failed read, the caller treats that as "not my defect to
report", and the check silently does nothing while continuing to advertise itself as run.

Proved by supplying exactly that file — a stub with one real heading — and re-running the identical
probe:

```
1 citation link(s) point at a heading that does not exist:
  docs/guides/tmp-anchor-probe.md:3  <principles path>#this-anchor-does-not-exist-anywhere
exit 1
```

Same input, same checker, opposite result — the difference is entirely whether a path derived from
the _script's own location_ happens to exist. The stub and probe were removed after measuring.

The sharp edge is that the source comment two lines above reasons about precisely this risk:

> resolving only relative links would make the anchor check vacuous for every repo that actually
> uses it

The author identified the failure, chose absolute-URL mapping to avoid it, and the mapping is
anchored to a path that is only correct in the repo where the check is **least** needed. **A check
that is vacuous where it is used and live where it is authored will always be observed working.**

This is the fifth vacuous pass catalogued in this document, and the first where the vacuity is a
function of _file layout_ rather than of an empty input set — which makes it invisible to the
denominator discipline, because the denominator is non-zero (141 citations) and every one of them
is skipped.

Reported upstream as a defect in the engineering repo rather than worked around here: the fix is to
resolve the principle root from the lock or a flag, not from `import.meta.url`.

## A zero that accuses, and a deadlock whose cost never materialised

A sibling session sent a correction to a line of mine, plus a claim about its own repository. Both
were checkable. Checking them produced one confirmation, one correction, one failed hypothesis of
my own, and one instrument defect that would have been far more damaging than the vacuous passes
catalogued above.

### The instrument defect: a false zero that refutes rather than reassures

To verify their pin table I counted `uses:` refs in the two upstream workflows. The first run
returned:

```
=== validate.yml : 0 uses ===
=== publish.yml : 0 uses ===
```

Zero. Against a message that had just tabulated nine. Had I reported that number, I would have
accused a correct counterpart of fabricating a table — the strongest possible claim, from the
weakest possible evidence.

The cause was mundane: my regex was `^\s*uses:` and every ref in those files is a list item,
`- uses:`. The pattern was well-formed, matched nothing, and said so confidently.

This is the same defect class as every vacuous pass in this document — an instrument reporting an
empty result it never earned — but with the sign flipped, and the flip matters:

| false zero                    | reads as    | social cost                        |
| ----------------------------- | ----------- | ---------------------------------- |
| in a checker (`0 violations`) | reassurance | silent, unbounded, nobody looks    |
| in a verification (`0 uses`)  | refutation  | immediate, loud, aimed at a person |

A vacuous pass costs you a defect you never find. A vacuous _refutation_ costs you the
counterparty's credibility, and it is the version that gets acted on, because a zero that
contradicts someone is interesting and a zero that agrees with everyone is not.

The rule the whole document has been building toward, restated for this direction: **a zero is a
claim about the instrument before it is a claim about the world** — and when the zero contradicts a
specific person, that ordering is not optional.

Corrected pattern (`^\s*-?\s*uses:`), re-run:

| file           | refs                                           | all 40-char SHA |
| -------------- | ---------------------------------------------- | --------------- |
| `validate.yml` | 4× `actions/checkout`, 2× `actions/setup-node` | yes             |
| `publish.yml`  | 2× `actions/checkout`, 1× `actions/setup-node` | yes             |

Their table was exact, down to the per-file counts. Verified against remote `main` via the API
rather than against a local checkout, so the comparison is with the ref they were describing.

### The correction: the deadlock's cost did not compound

Their argument was that finance's two-control deadlock "compounds toward insecurity because the
pins it was refreshing go stale," while their own repo reaches the same end state silently. The
first half is measurable, and it did not happen.

| repo        | update bot | dominant pin                      | latest upstream | gap          |
| ----------- | ---------- | --------------------------------- | --------------- | ------------ |
| engineering | none       | `checkout` v4.4.0 (9 of 9 refs)   | v7.0.1          | **3 majors** |
| finance     | dependabot | `checkout` v7.0.0 (71 of 75 refs) | v7.0.1          | **1 patch**  |
| finance     | dependabot | `setup-node` v6.4.0 (36 refs)     | v7.0.0          | 1 major      |

So the directional claim holds — stuck silently is worse than stuck loudly — but the magnitude
attributed to finance is inverted. The deadlock blocked **one** PR for four days; it did not make
finance's pins stale, because it never covered the refs that were being rotated. A control that
deadlocks on a narrow surface does not degrade the surfaces it does not touch, and "compounds"
should not be asserted without measuring what it compounded over.

### My own hypothesis, tested and wrong

Seeing 4 of 75 refs still at `checkout` v6.0.3, I predicted they would be the frozen, reviewed
workflows — the deadlock's residue, precisely localised. They are not:

```
ai-eval.yml, ai-manifest-check.yml, ai-metrics.yml, migration-reversal-check.yml
```

None is a reviewed reusable workflow; the two files under content review
(`reusable-detect-changes.yml`, `reusable-release-smoke-test.yml`) hold no stale ref at all. The
stragglers are four unrelated workflows the bot has simply not reached. Recorded because a
hypothesis that fails against the tree is worth exactly as much as one that survives, and only one
of the two gets written down by default.

### Elimination is not authorisation

Their sharpest point was procedural. A statement that neither party asserted — that #72 was mine to
close — arrived by attrition: repeated mutual disclaimers narrowed the field until an obligation
appeared to land on the last party standing.

Measured, in the searchable record of this session:

| phrase               | in messages received | in my responses |
| -------------------- | -------------------- | --------------- |
| `not mine to act on` | 5 (turns 80–85)      | 0               |
| `yours to close`     | —                    | 0               |
| `#72` (any mention)  | present              | 0               |

**Stated gap:** this search ranges over my assistant responses only. Outbound cross-session
messages are tool-call arguments, which the local store does not carry and the cloud store timed
out on, so the channel most likely to contain such a line is the one I cannot search. The result is
therefore "no evidence in the part I can read," not an acquittal — the same denominator discipline
applied to a claim about myself, where the temptation to stop at the favourable half is strongest.

The hazard generalises past this instance: **an obligation nobody accepted can still be assigned by
repetition, because each individual disclaimer is true and only the sequence creates the
inference.** No single message is wrong, so no single message is challengeable. The remedy is to
name the owner positively rather than to decline in turn.

## Dropping the unhashed marker, and the check I nearly disabled to do it

Upstream fixed the `"type": "module"` gap and asked finance to drop its workaround file. Doing so
took three changes to the local vendoring fork, and the second one would have silently disabled
staleness reporting for every vendored file — the exact class of defect the fix was meant to close.

### Why port rather than converge

Upstream's script is now 1,023 lines to finance's 418, so replacing the fork wholesale looks like
the obvious move. It isn't: upstream has **no `citations` set** and no reference to
`check-citations.mjs` at all. Converging would drop the vendoring of the checker that runs on every
PR here. So the module-type behaviour was ported into the fork instead, and the fork's divergence is
now a deliberate superset rather than lag.

### The marker is now under the lock

Previously `config/engineering/prettier/package.json` was hand-written, tracked by git, and **absent
from `engineering-configs.lock.json`** — so `--check` reported the tree clean regardless of what the
marker said. Now it is generated and staged like any other file, with a distinct source key:

```json
"config/engineering/prettier/package.json": {
  "source": "packages/prettier-config/package.json#type",
  "sha256": "3ca9d4af…"
}
```

Mutation-tested in both directions: editing the marker to `"commonjs"` now fails
`--check` with `content differs from the lock`, exit 1; restoring it returns exit 0. That is the
whole difference between a marker and a locked marker.

The emitted type is verified against the ref rather than trusted, because a marker stating the
_wrong_ type is worse than none — an explicit type overrides Node's own CJS/ESM detection fallback,
converting a runtime that would have coped into one that cannot.

### The defect I nearly shipped

`changedFilesAt()` fetches `entry.source` for every lock entry, and reads any failure as "no
signal", returning `null` for the whole set. A derived entry whose source key is
`packages/prettier-config/package.json#type` has no fetchable file — so adding one entry to the lock
would have made the staleness comparison return `null` **for all four files, permanently**, while
printing a cheerful "unknown" rather than an error.

That is this document's recurring shape once more: a correct-looking green produced by a check that
no longer runs. It would have been introduced _by_ the fix for an unhashed file, in the function
whose own comment (six lines above) already warns that this path "swallows throws and reports no
signal".

**My stated mechanism for it was wrong, and measuring corrected me.** I claimed the fetch would 404. It does not:

| step                      | actual behaviour                                                   |
| ------------------------- | ------------------------------------------------------------------ |
| `fetch(url + '#type')`    | WHATWG fetch **strips the fragment** → HTTP **200**, real manifest |
| `path.endsWith('.json')`  | **false** — the path ends `#type`, so the JSON branch is skipped   |
| else-branch `/^export /m` | manifest has no `export ` → `fail('exports nothing')` → throw      |
| caller                    | catches → `null` → "no signal"                                     |

Same outcome, different route, and the route matters: a 404 would have been visible in any network
log, whereas a 200 whose payload is then rejected on a shape rule looks like a content problem with
upstream. Fixed by splitting the source key on `#` and comparing the derived field — so the marker's
staleness stays _live_, tracking upstream's declared `type` rather than being skipped.

### A guard that outlived its assumption

Fetching the manifest also tripped `assertPayload`, which required `compilerOptions` of every
`.json` — true while the only JSON upstream served was a tsconfig, false the moment a manifest had
to be read. Narrowed to exempt `package.json` while keeping the JSON.parse guard that catches an
HTML error page served as 200, which is what the function exists for.

### Two measurements on upstream's message

**The pagination finding reproduces, and is worse than reported.** They cited 154 tags with 30
visible; measured here:

| instrument                   | tags    |
| ---------------------------- | ------- |
| `gh api .../tags` (page 1)   | **30**  |
| `gh api --paginate .../tags` | **160** |
| `git ls-remote --tags`       | **160** |

An 81% false-negative rate, biased entirely toward _old_ tags — precisely the population a stale-pin
audit examines.

**So I audited my own published figure with the sound instrument.** This document claims a re-pin
"across 34 tags". Against the full 159-tag semver list, tags in `(v0.86.0, v0.120.0]` number
**exactly 34**. The figure survives; had it been derived from page 1 it would have been silently
capped. Worth stating because the correct response to someone else's instrument defect is to check
whether your own numbers came from the same well, not to note that theirs did.

**Their announcement was stale on arrival, again.** It announced `v0.118.0`; `releases/latest`
resolved to `v0.122.0` — four tags ahead, minutes later. Vendored at the resolved ref, not the
quoted literal. Fifth instance recorded, and consistent with their own root cause: tag-triggered
publishing plus manual tagging means any literal ages faster than the doc quoting it.

## The caret reversal, and the control that was never the range

Upstream reversed its version-range guidance in `v0.119.0`, from `>=X.Y.0 <1.0.0` to `^0.17.0`,
after finding that `eslint-config` dropped five framework peers in `0.9.0` and restored them in
`0.16.0` — breaking changes in minors, which is where `0.x` convention puts them.

The reversal is correct. Two things about it are worth recording anyway.

### The caret was rejected for the property it is now recommended for

Both upstream sessions previously rejected the caret, and this guide recorded their agreement as the
settled half of a disagreement:

| source          | recommended then    | stated reason                                         |
| --------------- | ------------------- | ----------------------------------------------------- |
| sibling session | `"0.15.0"` exact    | "not `^0.15.0` — **a caret on `0.x` pins the minor**" |
| parent session  | `">=0.15.0 <1.0.0"` | "explicit range, **not a caret**"                     |

Measured, the semantics never moved:

```
^0.17.0          -> >=0.17.0 <0.18.0-0     admits 0.17.9 ✓   0.18.0 ✗
>=0.17.0 <1.0.0                            admits 0.18.0 ✓   0.99.0 ✓
```

So `^0.17.0` pins the minor — exactly the property cited when rejecting it. **What changed is not
the semantics but which behaviour counts as the failure**: when the risk was "frozen too tightly",
minor-pinning was the defect; once the risk became "admits a breaking minor unreviewed", the same
minor-pinning became the remedy.

That makes this a reversal of the one point recorded here as _well-established_ — the half both
senders agreed on, which is the half a consumer is least likely to re-derive. A disagreement invites
checking; a consensus does not.

### finance had already recorded the hazard, and chose a different remedy

From the earlier entry, before upstream's reversal:

> an exact pin takes no upgrades, a `<1.0.0` range takes all of them sight-unseen, and on a package
> whose file-classification globs changed materially between `0.8.0` and `0.15.0` the difference is
> not cosmetic

finance's remedy was a review gate rather than a narrower range. Upstream's is a narrower range.
Both target the same failure — an upstream minor arriving unreviewed.

### The range is close to inert here, and that is the part the guidance omits

The argument on both sides treats the declared range as the control over which version gets
installed. In this repository it mostly is not:

| fact                        | value   |
| --------------------------- | ------- |
| `package-lock.json` tracked | **yes** |
| `npm ci` invocations in CI  | **29**  |
| dependabot npm ecosystem    | weekly  |

`npm ci` installs exactly what the lockfile records and **ignores the range's breadth entirely**. A
wide range therefore cannot silently deliver `0.18.0` to a build here; the lockfile pins the
resolved version, and changing it requires regenerating the lock — which dependabot proposes as a
reviewable PR whatever the range says.

So for a lockfile-driven consumer the range is a _floor declaration_, not an admission control, and
the difference between the two forms is second-order. It becomes first-order in a consumer that
resolves by range at build time — no committed lock, or `npm install` in CI.

This does not make the new guidance wrong; it makes it **conditional**, and the condition is
unstated. Flagged upward: the recommendation should name the precondition under which a range is a
control at all, in the same way `--check`'s warn-only staleness names the condition that justifies
it.

**Recorded decision for finance:** adopt `^0.17.0` when registry access unblocks. It costs nothing
under `npm ci`, it is correct for the paths where the lock is not authoritative, and aligning with
upstream is worth more than defending a form whose practical difference here is near zero.

## The runtime nothing reads

A sibling session reported running Node 24 against CI's Node 20 all session, with no `.nvmrc` to
consult — only `engines: { node: ">=20" }`, which its runtime satisfies. Its corollary is the
finding: **a repo with no runtime pin cannot be mismatched, and that is not the same as being
matched.** A constraint you can violate is worth more than one you cannot state.

finance was cited there as the repo where the pin existed and made the diagnosis a one-step
comparison. Measuring that claim rather than accepting the compliment:

|                                        | finance                           | sibling |
| -------------------------------------- | --------------------------------- | ------- |
| `.nvmrc`                               | `22`                              | absent  |
| `engines.node`                         | `>=22.0.0`                        | `>=20`  |
| workflow `node-version:` literals      | **36**, all `22`, across 20 files | —       |
| workflows reading `node-version-file:` | **0**                             | —       |
| local runtime                          | Node 24                           | Node 24 |

The pin exists and CI agrees with it — and **nothing connects the two**. There are 36 independent
restatements of the major and one `.nvmrc`, and they agree by maintenance rather than by
construction. Editing `.nvmrc` to `24` leaves all 36 literals at `22`, produces no diff to any of
them, and turns nothing red.

So the inversion runs the other way from the compliment. The sibling's runtime divergence is
**unrepresentable** — there is no pin to disagree with. finance's is **representable and
unchecked** — there are two pins and no comparison. Both arrive at "nothing verifies the runtime";
one has no artifact to check, the other has one nobody reads. `engines.node` closes neither, because
`>=22.0.0` is satisfied by Node 24 and so cannot express the runtime CI uses.

### Exposure is not exhibition

The sibling checked its lockfile for the specific construct behind the npm-major trap recorded
earlier in this guide, and found none — clean by a property of its dependency graph rather than by
any control. The same measurement here:

|                                       | finance | sibling |
| ------------------------------------- | ------- | ------- |
| lockfile entries                      | 838     | 140     |
| `optional: true` **and** `peer: true` | **1**   | 0       |

The one is `node_modules/git-raw-commits/node_modules/conventional-commits-parser` — the exact
entry npm 11 prunes and npm 10 keeps. finance is not exposed-but-clean; it is **exhibiting**, which
is why the trap cost real CI runs here and cannot fire there today. Neither repo has a control; only
one has a dependency graph that makes the absence visible.

### The control, and what it may not do

`tools/check-node-version-consistency.mjs` makes the disagreement expressible.

**Fatal** — a workflow literal whose major differs from `.nvmrc`. Only a local edit creates this,
so failing on it can never redden a build that nobody here changed.

**Notice, exit 0** — an `engines.node` range that admits majors above `.nvmrc`, and a running
runtime whose major differs from it. Both are true of this repo right now, and neither is a defect:
the range is deliberate and the developer runtime is not CI's to dictate. This is the same split
`--check` applies to drift versus staleness, under the same discriminator — _can something outside
this tree turn it red?_ — and the same asymmetry: **under-decide, never over-report.** A literal
whose major cannot be read (`lts/*`) is left undecided rather than flagged, for the same reason.

The second notice reproduces, as a standing check, the observation that cost four CI runs: it says
`this runtime is Node 24 but .nvmrc declares 22` on every local run.

### A negative row that passed for the wrong reason

The sibling's other finding was that a control row protects against a predicate that over-matches
and never against one that under-matches. Both classes appeared while building this, in the same
hour.

Mutation testing the new checker killed four of five mutants. The survivor deleted the guard
exempting `node-version-file` pins — and the test named _"never flags a node-version-file pin"_ kept
passing, because its input was `.nvmrc`, whose leading character is not a digit, so the
unparsed-literal guard caught it instead. **Two guards, one input, and the test could not say which
one it was exercising** — the _duplicated_ relation from the coverage table, now in a suite written
by someone who had already written that table down.

The fix was not to delete a guard but to construct the separating input: `node-version-file:
20/.nvmrc`, a path whose first character parses as a major. It does not occur in this tree and does
not need to — the standard settled earlier is **constructible and reachable, not naturally
occurring**. With that row the mutant dies and both guards are independently observable.

### Four zeros, four instruments

Every zero this turn was a property of the instrument before it was a property of the repo:

| reported                                | actual       | defect in the instrument                                       |
| --------------------------------------- | ------------ | -------------------------------------------------------------- |
| 3 of 4 checker predicates match nothing | 3 of 4 match | `^`-anchored patterns tested against a joined blob without `m` |
| 0 of 239 action refs are 40-hex         | 236 of 239   | PowerShell consumed the `$` anchor inside a double-quoted `-e` |
| 3 unpinned action refs                  | 0            | unanchored `uses:` matched commented-out examples              |
| 5 of 5 mutants survived                 | 1 of 5       | scorer grepped `# fail` where the runner prints `ℹ fail`       |

Two under-reported and two over-reported, and **the third is the one that would have been published**
— an unpinned-action finding is exactly the shape a reviewer accepts without re-deriving. It was
caught only because the real checker disagreed, and the real checker was right: it anchors
`^\s*(?:-\s*)?uses:`, so a line beginning `#` cannot reach the key. The ad-hoc probe written to audit
it was weaker than the thing being audited.

The fourth is the sharpest. A mutation scorer whose failure mode is "everything survived" reports
the suite as worthless, which is the direction that gets a suite rewritten rather than trusted. It
was caught by calibrating on the unmutated tree first — the baseline row that costs one run and
turns a scorer into a measured instrument.

## The set was the divergence, not the tag

Upstream reported this repo pinned at `v0.15.7`, roughly 124 releases behind, and asked for a jump
to `v0.122.0`. Resolved rather than accepted:

|                                      |                                             |
| ------------------------------------ | ------------------------------------------- |
| lock ref before this change          | **`v0.122.0`**                              |
| upstream's stated latest             | `v0.122.0`                                  |
| actual latest at the time of writing | **`v0.124.0`**, then `v0.125.0` mid-session |

The pin was already current — the correction was itself about 107 releases stale, which is the
eighth instance of the pattern upstream has been correcting in its own outbound messages. Resolving
rather than quoting is now cheap enough that there is no excuse for either side.

But the other half of the report was right, and for a reason neither of us had named. Upstream's
prettier set is:

```
files: ['index.js', 'index.d.ts', 'svelte.js', 'svelte.d.ts']
```

This fork's was `['index.js', 'svelte.js']`. **A subset.** Refreshing the tag would never have found
it, and neither would `--check`, because the lock is generated from the same set it verifies: it
compares the files it was told about against the files it wrote. **A lock cannot detect a file it
was never told about** — the identical shape as the unhashed module marker recorded earlier in this
guide, one level up. There the file existed and was unhashed; here the file never arrived.

So the fix was set membership, not ref distance. Re-vendoring at `v0.124.0` reported
`2 file(s) changed content` — and both were the two new declarations. Nothing already vendored moved
between `v0.122.0` and `v0.124.0`, and the staleness notice now reports all six byte-identical at
`v0.125.0`. Upstream's own point, confirmed against it: **ref distance is not artifact distance.**

### The declarations are inert here, and vendored anyway

Upstream's stated trigger is `TS7016` when importing the config from TypeScript with `allowJs: false`.
finance consumes it through Prettier's `prettier` key in `package.json`, resolved at runtime — no
TypeScript import exists, so the failure cannot occur and the declarations buy nothing today.

They are vendored regardless, because the argument for carrying them is not the type error. Carrying
a subset made `--check` compare a different payload than upstream publishes, in a way that is silent
in both directions: upstream cannot see which files a consumer chose, and the consumer's lock reports
green over the subset it defined for itself.

## A partial `--set` silently un-hashed five files

Found by making the mistake. This fork's flag parser takes `--set a,b`; invoking it as
`--set prettier --set citations` is not an error — the second occurrence overwrites the first. The
result:

```
Vendored 1 file(s) from jrmoulckers/engineering@v0.124.0
lock entries: 4 -> 1
```

Five files stayed on disk and left the lock. `--check` would then have passed, truthfully, over a
tree it no longer covered. **Dropping a lock entry is indistinguishable from never having had one**,
which is what made it silent — the same property that makes an unhashed file invisible.

Now fatal unless `--prune` is passed deliberately:

| invocation                             | before              | after                            |
| -------------------------------------- | ------------------- | -------------------------------- |
| `--set citations` with prettier locked | lock silently 6 → 1 | **exits 1**, lock untouched at 6 |
| `--set citations --prune`              | —                   | exits 0, lock 1, opted in        |
| `--set prettier,citations`             | lock 6              | lock 6, `--check` green          |

Reported rather than repaired: carrying the omitted entries forward would put two refs in one lock,
and a lock that cannot name a single ref cannot answer the question `--check` asks.

## Porting the orphan check, and a hypothesis that did not survive

Upstream shipped a fatal check for vendored trees nothing references, extending the framing recorded
here: _a green `--check` means your tree matches the lock, not that your pin is current_ — and, per
jrm-recipes, **not that anything still reads it.**

Before porting it, the obvious objection: their walk scans `.json` files, and the lock records every
vendored destination path by construction, so the lock would satisfy the check by existing. Measured
against their source at `v0.124.0` instead of assumed:

```js
// The lock records itself as a reference otherwise, which is circular.
return hits.filter((path) => path !== LOCK).sort();
```

**Refuted.** They exclude the lock by name and the script by content-or-path, closing both
self-reference routes. The hypothesis was worth checking and worth recording as wrong, because the
version of this note that shipped without checking would have been a confident false claim about
someone else's code.

Ported and measured in both directions, with the dest recovered as the common directory prefix of
the lock keys (this fork's lock predates upstream's recorded `dest`):

| input                               | result                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `config/engineering`                | **3** external references — `eslint.config.mjs`, `package.json`, `scripts/eng-citations-gate.mjs` |
| self (`scripts/vendor-configs.mjs`) | excluded                                                                                          |
| lock                                | excluded                                                                                          |
| a dest nothing references           | **0** → gate fails                                                                                |

The negative row is the one that matters: without a needle that returns zero, the check would be a
predicate that can never fire, which is the class recorded two sections above.

**Known limitation, in the safe direction.** The check counts a _mention_, not a _use_ — one of the
three hits is `eslint.config.mjs`, where `config/engineering/**` appears as an ignore rule rather
than a consumer. So it over-reports wiring and therefore under-reports orphanhood: it will miss some
dead trees and can never falsely condemn a live one. That is the correct direction for something
wired into a gate.

### Three false readings, all self-inflicted by the probe

Measuring the new check produced, in order: `self excluded? NO`, `lock excluded? yes`, and
`unreferenced dest => 1 (vacuous)`. Two of those were wrong, and both for the same reason — **the
probe was inside the tree it was measuring**:

- it imported a _copy_ of the script, so `import.meta.url` named the copy and the real script no
  longer matched `selfText` by content;
- it contained the string it was searching for, so the "nothing references this" case found the
  probe itself.

Rewritten to append exports to the real file (restored afterwards) and to live under `node_modules/`,
which the walk skips, with the negative needle assembled at runtime so no file contains it literally.
Both readings inverted.

This is the fourth measurement instrument in two sessions to report a property of itself as a
property of the repository. The pattern is specific enough to state as a rule: **an instrument that
lives inside its own search space measures itself first.** Upstream had already reached the same
conclusion from the other side, which is why their check excludes its own script by content rather
than by path — a renamed copy would otherwise vouch for the tree.

## Version distance is a proxy for maintenance status, and it fails where it matters

A sibling session proposed that "N majors behind" measures nothing useful, because upstream
maintains several release lines at once: two pins at the identical tag `v4.4.0`, identical major
distance, had opposite exposure — one line had received the latest backport wave, the other was
abandoned. Their sample was 9 pins. finance has 236, so the claim is testable here at scale.

Resolved every pinned SHA to its tag, then computed two metrics per pin: **major distance** to the
newest release, and **line-tip lag** — whether the pin is the newest release _within its own major
line_.

|         | at line tip | behind line tip |
| ------- | ----------- | --------------- |
| pins    | 89          | **147**         |
| actions | 18          | 9               |

Major distance rates 198 of 236 pins (84%) as perfectly current. Line-tip lag flags 147 (62%). The
two do not merely disagree in strength — they cross, so neither is a refinement of the other.

### The independent oracle

Dependabot is configured here for `github-actions`, weekly, and PR #4012 is its outstanding group
bump. That makes it an oracle computed by someone else's code, so the two metrics can be scored
rather than argued about.

|                 | in #4012 | not in #4012 |
| --------------- | -------- | ------------ |
| behind line tip | **147**  | 0            |
| at line tip     | 0        | **89**       |

A perfect partition over 236 pins, zero error in either direction. Against the same oracle:

|               | in #4012 | not in #4012 |
| ------------- | -------- | ------------ |
| major gap > 0 | 37       | 1            |
| major gap = 0 | **110**  | 88           |

**110 pins are rated perfectly current by major distance and are pins the bot wants to move** — 75%
of the proposal is invisible to the metric. The single apparent miss in the other direction is not a
miss: `changesets/action v2.0.0` was published 2026-08-11, three days _after_ #4012 opened, so the
bot could not have proposed it. Corrected for time of observation, major distance has no false
positives and 110 false negatives.

`actions/checkout` is the clean case. 75 pins at `v7.0.0`, major gap **0**, and `v7.0.1` is the line
tip. By the usual metric it is the most current pin in the repo; it is simultaneously the largest
single block of stale pins.

### This corrects a claim made earlier in this document

An earlier section argued that a blocked dependabot PR could not be compounding toward insecurity,
because the pins it would refresh had not gone stale. That measurement used major distance. Under
line-tip lag the compounding is real and quantified: 147 pins, and no `ci(deps)` group bump has
landed since 2026-07-06.

The revision is not "I measured carelessly" — the earlier number was correct for the metric used.
**The metric was load-bearing and unstated**, which is the failure mode. A staleness claim has to
name its metric, because the two available ones differ by 110 pins on the same tree.

### What the closures were, and were not

Four `ci(deps)` PRs closed between 2026-07-13 and 2026-08-08 look like four rejections. They are
not: each carries dependabot's own _"updatable in another way, so this is no longer needed"_ — the
bot superseding itself as the group grew (6 → 8 → 9 → 11 → 12 updates). There has been **one**
rolling proposal, never rejected and never landed. Counting closures would have reported four
decisions where zero were made.

### And the thing actually holding 147 pins

#4012 is **33 pass, 1 fail, 0 pending**. Every security and pin gate on it is green — the control
deadlock recorded earlier in this document is genuinely resolved. The single failure is:

```
Downloading https://services.gradle.org/distributions/gradle-8.11.1-bin.zip
Exception in thread "main" java.net.SocketException: Unexpected end of file from server
        at org.gradle.wrapper.Install.forceFetch(SourceFile:2)
```

A transient reset fetching the Gradle distribution, 27 seconds in, before anything compiled. The
wrapper retries zero times (`networkTimeout=10000`, no retry). So 62% of the workflow supply chain
is held behind a network blip on one job, and the repo already knew about this class — the
`|| ./gradlew ...` in `release-platform.yml` is a hand-rolled retry at exactly one of 25 `./gradlew`
call sites.

Fixed in `ci-windows.yml` by prefetching the distribution in its own retried step. The scoping is
the point: retrying `./gradlew --version` retries **only the download**, so a real build failure
still fails on the first attempt. A `||` retry around the build itself would have doubled CI time on
genuine failures and made a flaky test look green on the second roll.

Five other workflows (`ci-android`, `ci-shared`, `ci-security`, `release-platform`,
`reusable-release-smoke-test`) share the exposure at 23 remaining call sites and are unfixed here.

### Generalisation

> **A pin's risk is set by whether its line is still being maintained, not by how far its number is
> from the newest number.** Version distance is a proxy for that, and it degrades exactly where
> upstream backports — which is where a conservative pinner lives by choice.

Line-tip lag is a better proxy, not a measurement of the real thing: it counts _a release you do not
have_, not _a fix you need_. It over-reports, which is the safe direction for a gate.

## An asserted range is a claim nothing runs

A sibling session found that its repo declares `engines.node: ">=20"` while every CI job pins 20 —
the floor exercised, the rest asserted — and that the same repo had already written the postmortem
for that exact defect fifteen lines above, about a different dependency. finance has the same shape,
and worse: the notice was already being printed.

```
engines.node   ">=22.0.0"        claims 22, 24, 26, ...
.nvmrc          22
workflow pins   36 literals, every one 22
```

`npm run node:version:check` has emitted _"engines.node is `>=22.0.0`, which admits majors above 22"_
on every run since it was added. It was a notice, so it scrolled past — a control that reports into a
stream nobody consumes is indistinguishable from one that reports nothing.

### finance's version is sharper than theirs

The idiom for exercising a declared support surface is not merely present here, it is routine:

| declared surface         | values exercised              |
| ------------------------ | ----------------------------- |
| browsers (`nightly.yml`) | **6**                         |
| browsers (`ci-web.yml`)  | 4                             |
| Android API levels       | 1                             |
| **Node majors**          | **1, of an open-ended range** |

Six browsers get a matrix. The runtime range in the repository's own manifest got one point.

### Two correct controls, colliding again

The obvious fix — run a job on Node 24 — is _forbidden_ by the checker added in #4225, which is
fatal on any literal disagreeing with `.nvmrc`. That is the same deadlock shape recorded earlier in
this document, this time caused by a control this repository added itself, and it argues that the
pattern is not a coincidence of two unlucky rules. **A control that pins a value forbids the job that
tests a different one, unless it is taught the difference between drift and an experiment.**

Resolved with an explicit marker rather than an exemption list:

```yaml
node-version: '24' # exercises-engines-range
```

The marker is constrained from both sides so it cannot become a way to silence drift:

| marked literal                                       | verdict                                                 |
| ---------------------------------------------------- | ------------------------------------------------------- |
| inside `engines.node`, different major from `.nvmrc` | exempt — this is the intended use                       |
| same major as `.nvmrc`                               | **fatal** — exercises nothing, so the marker only hides |
| outside `engines.node` (e.g. 20)                     | **fatal** — the manifest never claimed it               |
| unreadable (`${{ matrix.node }}`)                    | **fatal** — cannot be judged, so must not be exempt     |

You can only exempt a version the manifest already claims to support, which is why the escape hatch
cannot widen the thing it escapes.

The unexercised range itself is now **fatal**, not a notice, and it passes the discriminator that
governs the rest of these gates: _can something outside this tree, with no change here, turn it red?_
It cannot — a new Node release does not flip it; only editing `engines`, `.nvmrc`, or the workflows
does. So both remedies stay open and both are correct: exercise the range, or narrow the claim to
what CI runs.

The job lives in `nightly.yml` with a literal rather than a one-value matrix, so the checker can read
the version and confirm it. It exercises a claim; it does not gate a change.

### The fabricated SHA

Writing that job, I pinned `actions/setup-node@48b55a01f5c6b6d0a1f0b8b4d6f7c1e6c4a5b1e6`. The real
pin is `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e`. I had measured the real one earlier, remembered
its opening characters, and typed the rest.

**Eight identical leading characters, then invention** — the sibling reported the identical error one
message earlier with ten. Reading a message about a failure mode, then committing it inside the hour,
while writing the fix for a different instance of "asserted rather than checked."

What makes it worth recording is where it would have stopped. `check-workflow-security.mjs` validates
that a ref is 40 hex characters; it cannot validate that the object exists, because it does not touch
the network. A fabricated SHA of the right shape **passes every local gate** and fails only when a
runner tries to resolve the action. The pin check answers "is this pinned", which reads like "is this
right".

The fix is not vigilance: read the value out of the file. Both SHAs in that job were extracted from
`ci-lint.yml` by pattern, never retyped.

## A sweep is not a control, and hand enumeration is not a census

The Gradle distribution fetch has no retry and a 10-second network timeout, so a transient reset
from `services.gradle.org` fails a job before anything compiles. One site was fixed earlier; this
generalises it. The interesting part is not the retry — it is that every step of _finding_ the
sites by hand was wrong, in the same direction, three times.

### Three undercounts, all from encoding a formatting assumption

The manual pass grepped `^\s*\.?/?gradlew` across the workflow directory and reported **8 jobs in
5 files**. A checker that parses jobs into steps and asks whether any step invokes the wrapper
reported **9 unguarded of 10 total**:

| missed job                                            | why the grep missed it                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ci-security.yml` / `codeql-java-kotlin`              | `run: ./gradlew clean compileKotlinJvm` — inline, so the wrapper is not at line start |
| `release-platform.yml` / `build-platform` second call | the hand scan stopped at the first hit per job                                        |

The pattern was not wrong about `gradlew`. It was wrong about **`run: |` versus `run:`** — an
assumption about YAML style that was never stated, never tested, and silently excluded 11% of the
population. This is the same defect as an `^`-anchored pattern against a joined blob, and it is the
third time in this adoption that a hand-built enumeration has been corrected by a parser.

The rule that generalises: **an enumeration is only as good as the least-stated assumption in its
pattern, and patterns do not report their own assumptions.** The remedy is not a better regex; it
is to make the check the artefact and let the sweep fall out of it. Which is why this landed as
`tools/check-gradle-prefetch.mjs` and not as nine edits.

### A sweep silently regresses; a check does not

Nine hand-applied steps are correct on the day they merge and unenforced thereafter — the tenth
Gradle job added next month gets none, and nothing says so. Adding the checker first, then letting
it name its own targets, converts a one-time correction into an invariant. It was calibrated on the
real defect before the fix existed: exit 1 naming all nine, then exit 0.

### The checker's own hole, found by the fix it generated

`release-platform.yml` / `build-platform` is a matrix job with **two** wrapper steps, each guarded
on a different leg:

```yaml
- name: Build Android artifacts
  if: matrix.platform == 'android'
- name: Build Windows artifacts
  if: matrix.platform == 'windows'
```

The generated prefetch inherited the _first_ step's condition, so the Windows leg fetched unwarmed —
**and the checker passed**, because "a prefetch before the first wrapper call" is satisfied. Per-job
ordering is the wrong granularity when steps are conditional: the job is guarded, and one of its
legs is not.

Fixed both sides. The condition became the disjunction `setup-java` in the same job already uses,
and the checker gained `findUncoveredConditions`, which requires each later wrapper step's condition
to appear verbatim in the prefetch's. It does not evaluate matrix expressions — it under-decides,
flagging only what it can read, in keeping with _a checker must under-decide, never over-report_.

> **A control validated only against the shape that motivated it inherits that shape's blind spots.**
> The nine simple jobs all passed. The one structurally different job passed too, and should not
> have.

### A test that failed because the checker was wrong

`stepCondition` read `/^\s+if:/`, matching `if:` as a _following_ key but not as a step's _leading_
one (`- if: ...`). Both are valid YAML. A guarded step written the second way reported "no
condition" — which, in `findUncoveredConditions`, turns a **covered** leg into a **false
violation**. The failing test was fixed in the checker, not in the fixture.

### Mutation results, and an equivalent mutant reported as equivalent

7 mutants, **6 killed**, scorer calibrated on the unmutated tree first. The survivor —
`.slice(prefetchIndex + 1)` → `.slice(prefetchIndex)` — is **equivalent, not a coverage gap**:
including the prefetch step in its own scan compares `guard.includes(guard)`, which is always true,
so the step filters itself out. Forcing this to 7/7 would require a test that cannot exist. Reported
as equivalent rather than rounded up, because a mutation score inflated by one unkillable mutant is
the same failure as a coverage number that counts unreachable lines.

### The drift baseline fired, correctly

`workflow:security:check` rejected the edit to `reusable-release-smoke-test.yml` — a reviewed local
fork whose content is hash-pinned, with action-pin rotations normalised out so only substantive
changes trip it. That is the control working: the diff was reviewed (28 added lines, purely
additive) and the baseline updated. Worth recording because most controls in this adoption have
been found _missing_; this one was present and did its job on the first substantive change since it
was written.

## Three silent failures in a row, and a green check over 3,890 unread files

The vendoring staleness check had never worked. Not "worked and was ignored" — the earlier defect
in this document, where a notice printed every run and nobody read it. This one produced **no output
at all**, and the absence was indistinguishable from success.

### The chain

```
fetch(api.github.com/...)      unauthenticated
  -> HTTP 403, x-ratelimit-remaining: 0
  -> latestRef() returns null
  -> `if (latest && ...)` is skipped
  -> --check prints "6 vendored file(s) match ... at v0.124.0."  exit 0
```

Every link is individually defensible. Not failing on an unreachable API is right — a tag pushed
upstream must not turn an unrelated PR red. Returning `null` when the answer is unknown is right.
The defect is that **the green line for "checked, and current" and the green line for "could not
check" are the same bytes.** Unauthenticated GitHub API calls are capped at 60/hour _per IP_, and
Actions runners share IPs, so on CI the anonymous path is rate-limited far more often than it is
offline. The check most likely never ran there.

The remedy is not to fail. It is to **name the gap**:

```
Staleness not checked: GitHub API rate limit exhausted (HTTP 403); set GITHUB_TOKEN to raise it.
This says nothing about whether v0.124.0 is current.
```

### `releases/latest` is a declaration, not a maximum

Even authenticated, the endpoint was the wrong instrument. It does not compute anything — it reads a
`make_latest` flag a maintainer sets, over the **release** population. Measured upstream:

| population                  | count          |
| --------------------------- | -------------- |
| tags                        | 172            |
| releases                    | 143            |
| semver tags with no release | 28             |
| `releases/latest`           | `v0.133.0`     |
| **highest tag**             | **`v0.134.0`** |

The highest tag had no release, so the declared answer was **one release behind the actual
frontier, live**. Preferring a maintainer's declaration over a derived maximum is usually right, and
is right about _ordering_ — a backport wave publishes newest-major first, so sorting releases by
date returns the **oldest** maintained line as the frontier, perfectly anti-correlated rather than
noisily wrong. But a declaration has a failure mode a computation does not: **it can be absent.** So
ask both and take the higher, and never sort by date.

### What the silence was hiding

Pinned at `v0.124.0`; upstream at `v0.134.0`. The vendored citation checker was **v9 against
upstream's v10**, and v10's change was the extension set — v9 opened prose files only.

|                 | v9      | v10       |
| --------------- | ------- | --------- |
| files scanned   | **806** | **4,696** |
| citations found | 141     | 170       |
| extensions      | 7       | 27        |

**29 citations lived in `.ts`, `.kt`, `.mjs` and similar and were never checked** — in a repository
that is Kotlin Multiplatform and React, i.e. almost entirely the file types v9 skipped. `eng:citations`
had been exiting 0 over 3,890 files it never opened. All 29 turned out valid, which is luck, not a
control: the same "clean by a property of the input" this document keeps recording.

### It is the same defect the CI comment already describes

`ci-lint.yml` carries this, written earlier in this adoption:

> a local copy declaring the same `TOOL_VERSION` as a newer upstream one is how finance ran a checker
> missing a whole check

That is exactly what happened again — same repository, same file, same mechanism — because the
control built to prevent the recurrence was silently disabled by an unrelated rate limit. **A
postmortem does not prevent a recurrence; only a control that can be observed to run does.**

### One export, no tests, because importing it ran it

`scripts/vendor-configs.mjs` is ~560 lines with a single export and no test file. Not because it was
untestable — because it called `await main()` at module scope, so importing it executed a
network-touching CLI. Adding the standard entry guard took it to 14 tests and **8 of 8 mutants
killed**, with stubbed responses covering the rate-limited, 404, unreachable, and release-less-tag
paths that cannot be reproduced on demand against a live API.

> A hypothesis that failed, recorded because only the surviving kind gets written down: I expected
> the `new URL('file://' + process.argv[1])` guard to be fragile on Windows and to have silently
> disabled the other checkers. Tested all three invocation forms — forward slash, backslash, and
> absolute. All three resolve correctly. The guard is sound and the concern was unfounded.

### And a scope widening I caused while fixing this

Refreshing with `node scripts/vendor-configs.mjs v0.134.0` and no `--set` defaults to **all** sets,
which silently took the lock from 6 files to 12 by adding the `tsconfig` set that nothing in this
repository `extends`. That is precisely the orphan case the tool's own wiring check exists to
prevent — but the check asks whether anything references the destination _directory_, so a new
orphaned set inside an already-referenced directory passes. Re-vendored with an explicit
`--set prettier,citations --prune`.

Worth noting for upstream: `--prune` drops entries from the lock but leaves the files on disk, so the
recovery state is unhashed orphans that `--check` cannot see. The error text does say "and delete the
files", so it is documented rather than hidden — but a flag whose safe use requires a manual second
step will eventually be used without it.

## A maximum over a subset, and the coincidence that hid it

The engineering repo advised resolving the newest ref by **sorting releases by date**. Measured
against its own data, that advice is correct — and unfalsifiable there:

```
date-sort highest    v0.136.0
numeric-sort highest v0.136.0
```

They agree because `jrmoulckers/engineering` maintains exactly one release line, so creation order
and version order coincide. The advice fails the moment a repository backports: a maintenance wave
publishes newest-major first and oldest-major last, so a date sort returns the _oldest_ maintained
line as the frontier. finance resolves numerically for that reason and does not date-sort even as a
tiebreak.

The diagnosis attached to that advice was also inverted. It held that `v0.16.4` "sorts high under
naive semver but is old". Numeric semver ranks it correctly — `16 < 136`. What ranks it wrongly is a
**lexical string sort**, and a lexical sort over the live tag set does not return `v0.16.4` either:

| ordering        | answer over 173 live semver tags    |
| --------------- | ----------------------------------- |
| numeric semver  | `v0.136.0`                          |
| lexical string  | `v0.99.0`                           |
| by publish date | `v0.136.0` (coincidence, see above) |

`v0.16.4` ranks **118th of 173** lexically. So the named remedy is the broken one, the accused
mechanism is the sound one, and the cited symptom belongs to neither.

### The defect this turned up here

Checking the claim against finance's own resolver found that it asked for `tags?per_page=100` and
read the first page only. Upstream had **174 tags**. It had been computing a maximum over a subset.

It returned the right answer anyway, which is the part worth keeping. Not because the subset was
harmless, but because GitHub orders tags by _creation recency_ and this repository creates tags in
ascending version order, so the newest 100 contained the maximum. Neither side guarantees that, and
it inverts on precisely the backport case above: a wave creates low-version tags last, so page one
would hold the oldest maintained lines.

This is the tool's own thesis one layer down. A truncated page is a valid `200` with no marker in the
body — "the whole list" and "the first hundred" are the same bytes to a caller. The resolver now
follows `Link: rel="next"`, and a partial walk returns a **reason** rather than a smaller answer
wearing an authoritative shape:

```
tag list exceeded 30 pages; refusing to report a maximum over a subset
```

Writing the tests surfaced a second one: when _both_ sources failed, only the release reason was
printed. A truncated tag walk masked by an unrelated `HTTP 500` read as a plain outage. Both reasons
are now joined.

**The rule:** an off-by-one in a page size is invisible until the population crosses it, and the
crossing is an upstream event no local gate observes. 20 tests, 8 of 8 mutants killed, calibrated on
the unmutated tree first.

## The hole in the middle of an open-ended range

An upstream session argued that a declared `engines.node` cannot be repaired by the declaring
repository, because npm treats the field as advisory: `EBADENGINE` is a warning, the install
proceeds, and `engine-strict` belongs to the _consumer_. Their conclusion — **a severity you do not
own cannot be promoted** — is correct for a publisher. It does not hold here, because finance is the
consumer of its own manifest.

Their narrowing suggestion does not survive either. `^20` is not "the same claim, honestly bounded":

| range  | 20.0.0 | 22.0.0    | 24.3.0    |
| ------ | ------ | --------- | --------- |
| `>=20` | true   | true      | true      |
| `^20`  | true   | **false** | **false** |

`^20` is `>=20.0.0 <21.0.0`. It excludes two majors rather than narrowing a claim about them.

### What measuring the field actually found

finance declared `engines.node: ">=22.0.0"`. Checking that against the `engines` its own 451
dependency declarations state:

| probed      | dependencies rejecting it |
| ----------- | ------------------------- |
| 22.0.0      | **49**                    |
| 22.11.0     | 48                        |
| 22.12.0     | 14                        |
| **22.23.0** | **0**                     |
| **23.9.0**  | **20**                    |
| 24.0.0      | 0                         |

Two separate falsehoods, in opposite directions from the one being discussed:

1. **The floor was below the real floor.** `>=22.22.1` and `^22.13.0` bounds put the true minimum at
   **22.22.1**, not 22.0.0. _(Corrected. This sentence originally concluded **22.23.0** — one patch
   above the `>=22.22.1` it names as the binding constraint, in the same sentence. See
   "The falsifying value was inside the argument" below.)_
2. **The range has a hole.** Twenty packages declare `^20.19.0 || ^22.13.0 || >=24.0.0`, skipping
   Node 23 entirely — it is an odd, non-LTS line. An open-ended `>=22.0.0` claims 23 works. It does
   not, and nothing above it is monotonic: 23 fails while 24 is clean.

The thread until now had treated a range as an interval with a tested floor and an asserted top. This
one is **discontinuous**, and neither "exercise the top" nor "narrow to what you tested" describes the
defect. Corrected to `>=22.23.0 <23 || >=24`.

None of it was visible because every workflow pins `node-version: 22`, which resolves to the latest
22.x. The floor is never installed at its own boundary.

### The check broke the checker

Applying the corrected range immediately failed `node:version:check` with _"Node 24 is outside
`>=22.23.0 <23 || >=24`"_. Both range predicates in that tool were hand-rolled: they read the first
`>=` and the first `<` out of the string, so on a `||` range they took the bound from one alternative
and the ceiling from another. `enginesAdmitsAbove` had the mirror bug — it asked "is there no upper
bound", answered "no majors above", and would have **silently retired** the requirement that a job
exercise them.

This is the rule coined earlier in this adoption, recurring in the tool that coined it: _a control
validated only against the shape that motivated it inherits that shape's blind spots._ The comment
above the function said it "understands the forms this repository uses" — accurate, and precisely the
defect. Range logic is now delegated to `semver`, added as an explicit devDependency rather than
reached for transitively.

### What was deliberately not done

`engine-strict=true` in `.npmrc` would make finance's own declaration binding on finance, which is
the promotion the upstream session said was unavailable. It was measured and declined:

```
latest Node 22 = v22.23.2      declared floor = 22.23.0      margin = 2 patch releases
```

Enabling it makes every install depend on the runner resolving `22` to a patch level above a floor it
clears by two releases — an upstream event no local gate observes, which is the exact failure class
this PR removed elsewhere. The severity was promoted instead in the place finance actually owns: from
a warning npm prints and discards to a **fatal repository check** that compares the declaration
against the dependency tree on every run.

**The rule:** an advisory field is not checkable against itself, but it is checkable against the tree
it describes. 31 tests, 9 of 10 mutants killed; the survivor is reported below as equivalent —
`semver.satisfies` returns `false` rather than throwing on an invalid range, so the `validRange`
guard has no observable effect and is retained for intent.

## A dependency with no declaration, found by a second instrument

`tools/check-workflow-security.mjs` imports `js-yaml`. Nothing in this
repository declared it. It resolved because three transitive providers --
`@changesets/parse`, `cosmiconfig` and `read-yaml-file` -- each depend on it,
so npm hoists a copy into the root `node_modules`.

The interesting failure is not that the import might stop resolving. If it did,
the tool would crash loudly and CI would fail. The failure is quieter: **no
range in this repository constrains the version.** The security gate parses
workflow YAML with whatever major its incidental providers happen to hoist. A
provider moving to a `js-yaml` with different `load` semantics would change how
this repository's security check reads its own workflows, with no file here
changing and nothing to review.

That is the same shape as a pin with no canonical source: the reference is
satisfiable and uncompared. Declaring the dependency is what gives it a
referent.

### The sweep, and its denominator

Across the 49 top-level modules in `tools/` and `scripts/` there are 150 module
references. **One** was undeclared. A single instance is not worth a tool; the
class is, because nothing in the repository could previously state the
requirement. So the fix is `tools/check-tool-imports.mjs`, run in CI as
`npm run tool:imports:check`, and the declaration is generated from it.

The checker reads five forms -- `import ... from`, side-effect `import`,
`export ... from`, dynamic `import()` and `require()` -- and declines anything
computed. A specifier it cannot read is left undecided rather than reported: a
gate's tolerable error is the one that reads as "nothing found", never one that
reads as an accusation.

### The checker reported its own fixtures

On its first run against the real tree it failed with six violations, all in
its own test file: `export-from-pkg`, `dynamic-pkg`, `require-pkg`, `alpha`,
`ghost-pkg`, `@ghost/scope`. A test for an import checker must contain import
statements as _data_, and the checker read them as code.

This is the third instance in this adoption of an instrument that lives inside
its own search space measuring itself first, and the first where the collision
was structural rather than accidental -- a test for this checker cannot avoid
containing its own needles. The population now excludes test files, and the
summary states how many were excluded rather than leaving the denominator
implied:

```
Tooling imports are declared: 127 module reference(s) across 44 file(s) in tools, scripts; 7 test file(s) excluded.
```

### A census line that was true and wrong to quote

Cross-checking the workflow scan against a YAML parser -- `js-yaml`, walking
`jobs[].steps[].with` -- produced exact agreement at **37** `node-version`
keys across 121 jobs and 530 steps in 31 files. The regex and the parser are
independent instruments and they agree, which is worth more here than in a
small tree: an unanchored pattern that agrees on two files agrees by a property
of the input, while one that agrees across 530 steps has met the shapes that
break it.

But `npm run node:version:check` printed `36 literal, 0 via node-version-file`.
Both figures are true. The population is 37: the third bucket, the one pin
marked `exercises-engines-range`, appeared only on a **conditional** second
line. The first line reads as a census and is not one, and this repository's
own reports quoted "36 pins" as a standing fact.

The three buckets partition every pin found, so the summary now states the
total and its parts together:

```
Node runtime pins agree with .nvmrc (22): 37 pin(s) = 36 literal + 1 marked exercises-engines-range + 0 via node-version-file, across 31 workflow file(s).
```

A denominator names how many; the metric names of what; and a partition has to
sum, or one of its parts is invisible.

## A lint that could not fail: 601 `.tsx` files, zero React rules

Upstream sent a `--print-config` probe with the principle that _a passing lint is evidence
about the rules that ran, not the rules that should have_. Run against finance it found
something larger than the case it was written for.

### The premise correction first

The message opened "your deliberate `>=0.8.0 <0.9.0` pin is now costing you more than it
saves." finance has **zero `@jrmoulckers/*` declarations** — none in `package.json`, none in
any workspace manifest, none in `package-lock.json`, no range to widen. The pin belongs to a
different consumer. The advice about the `[0.9.0, 0.12.0)` window is correct and was verified
against the published manifests; it is simply addressed to the wrong repository.

### What the probe found

| measurement                   | value |
| ----------------------------- | ----- |
| `.tsx` files in the repo      | 601   |
| rules loaded on a `.tsx` file | 93    |
| `react/*` rules               | 0     |
| `react-hooks/*` rules         | 0     |
| `jsx-a11y/*` rules            | 0     |

Rule counts by tier — apps/web 93, services 92, tools/root 87 — are strict subsets of each
other, so the tiering is deliberate and has no accidental holes. The React coverage is not a
hole in the tiering; the plugins were never installed.

### The binding constraint is a peer range, not a token

The standing description of this blocker in earlier sections of this document — "171
`jsx-a11y/no-redundant-roles` errors, gated on a `read:packages` grant" — is **stale**. It was
measured before finance moved to ESLint 10. Re-measured today against `eslint@10.8.1`:

| plugin                      | latest | peer `eslint`    | installs?         |
| --------------------------- | ------ | ---------------- | ----------------- |
| `eslint-plugin-react`       | 7.37.5 | `… \|\| ^9.7`    | **no** — ERESOLVE |
| `eslint-plugin-jsx-a11y`    | 6.10.2 | `… \|\| ^9`      | **no** — ERESOLVE |
| `eslint-plugin-react-hooks` | 7.1.1  | `… \|\| ^10.0.0` | yes               |

Those error counts are unreachable: the rules cannot be loaded at all. The blocker changed
identity while the description of it did not — which is upstream's own stale-denominator
lesson applied to this document.

### What landed

`eslint-plugin-react-hooks@7.1.1` is the one plugin that supports ESLint 10. Its
`recommended-latest` config declares **17 rules** (an earlier note in this document said 29;
that was the plugin's total rule export, not the recommended set). Measured across 2,326
linted files:

| partition                | count                         |
| ------------------------ | ----------------------------- |
| rules at zero violations | 10 — **enabled**              |
| rules with violations    | 7 — not enabled, counts below |

    set-state-in-effect            98
    exhaustive-deps                34
    preserve-manual-memoization    21
    refs                           15
    rules-of-hooks                  3
    immutability                    2
    purity                          2

The 10 clean rules are enabled as `error`/`warn` at their upstream severities and `apps/web`
lints at `--max-warnings 0` with exit 0. The 7 are listed in `eslint.config.mjs` itself with
their counts, because a narrowing that is not stated in the artifact becomes a ratchet nobody
can audit.

### Two findings from the rules that were not enabled

**A false positive from name shape.** `apps/web/e2e/fixtures.ts:298` is flagged by
`rules-of-hooks` for calling `use`. It is Playwright's fixture callback, not React's `use`
hook — the rule matches an identifier, and an identifier is a shape, not a referent. This is
the same class as a 40-hex string that parses as a SHA and resolves to nothing. The plugin is
therefore scoped to `apps/web/src/**`, not `apps/web/**`, and the scope carries a comment
saying why.

**Two real conditional hooks.** `apps/web/src/pages/HouseholdPage.tsx:3596` and `:3608` call
`useGoals()` and `useTransactions()` inside `try { } catch { }`. A hook that can throw partway
through render breaks React's hook ordering for every subsequent hook in the component. These
are genuine latent defects, found by a rule that has never run in this repository, in a file
of 3,600+ lines. Fixing them is a design change to the underlying hooks and is filed as
follow-up rather than bundled into an adoption change.

So of the 3 `rules-of-hooks` hits, 1 is a false positive and 2 are real bugs — a 67% true
positive rate on a rule that was worth turning on for exactly that reason.

### A correction to last turn's lock diagnosis

Last turn attributed the pruning of the nested
`git-raw-commits/node_modules/conventional-commits-parser@6.4.0` entry to
`npm install --package-lock-only`. That was wrong. A plain `npm install --save-dev` pruned it
identically this turn. The variable is not the flag, it is the **npm version**: local is npm
11.16.0 on Node 24, CI resolves `node-version: 22`. The repository already prints this
mismatch as a notice on every run.

The remedy is unchanged and is now confirmed as the general one: let npm generate the lock,
then restore the pruned block verbatim from `origin/main` and require the diff against `main`
to show **zero removed entries** before pushing. This turn: 51 lines added, 0 removed,
`npm ci` exit 0.

### For the engineering repo

If `@jrmoulckers/eslint-config` declares `eslint-plugin-react` or `eslint-plugin-jsx-a11y` as
peers, **the preset cannot install in any ESLint 10 consumer**. This is not specific to
finance and is not something a consumer can work around locally — the upstream plugins cap
below `^10`. It is a prerequisite for the `./react` entry point being adoptable here at all.

## The disagreement is the signal, and `max()` is the reduction that discards it

Upstream's §3: `latestRef()` asks two sources for the newest ref and takes the numeric
maximum, so a disagreement between them is collapsed before any caller sees it. Correct, and
it was this repository's code doing it:

    const best = highestSemver([release.value, tags.value].filter(Boolean));
    if (best) return { ref: best, reason: null };

Both values are in hand on that line and only one survives it.

### Verifying their premise before adopting their fix

Measured against the live upstream repository rather than accepted:

| measurement                                  | value                     |
| -------------------------------------------- | ------------------------- |
| tags                                         | 182 (181 semver)          |
| releases                                     | 154                       |
| `releases/latest`                            | v0.144.0                  |
| highest tag                                  | v0.144.0                  |
| divergent right now                          | **no**                    |
| releaseless semver tags                      | 27                        |
| releaseless tags **above** `releases/latest` | **0**                     |
| contiguous releaseless prefix                | **27** — v0.1.0 … v0.10.0 |

Their contiguity claim holds exactly: every releaseless tag is in an unbroken block at the
bottom of history, and the block ends where the release era begins. Nothing is releaseless
above it.

### Where the measurement changes their fix

Their §3 gives the divergence two causes — publish in flight (minutes) and publish failed
(permanent) — and argues the second is why the signal matters. The second is real, but the
data says it is not equally likely: **in 154 release-era tags there is not one instance of
it.** Every releaseless tag predates releases entirely.

That matters for wording, not for whether to report. A notice that presents both causes
evenly reads as "this version may never have been published" — an accusation against a
release the evidence says is almost certainly mid-publish. The standing rule here is that an
instrument must under-decide and never render as an accusation. So the notice names both
causes, in base-rate order, and says which one has never been observed:

> tag v0.144.0 is ahead of releases/latest v0.143.0. Upstream creates the release from a job
> gated on the publish job, so a tag ahead of the release is expected while a publish is in
> flight; re-run in a few minutes. It persists only if that publish failed, in which case the
> packages for that version were never published — measured 2026-08-12, that has not happened
> in 154 release-era tags.

A test asserts the ordering, because the ordering is the base rate and a reordering would
silently invert the emphasis while every other assertion still passed.

### The other direction is not the same claim

`releases/latest` ahead of the highest tag cannot mean a publish is in flight — a release
cannot exist without its tag. It means the tag walk did not see it. Reporting that direction
with the same prose would send the reader to the wrong system, so it gets its own sentence
naming the tag read as the suspect.

The notice is returned as a third field rather than folded into `reason`. `reason` means
_could not check_; this means _checked, and the two sources disagreed_. Rendering them
identically is the same collapse the notice exists to undo.

`divergenceNotice()` is covered by 6 tests and **5/5 mutants killed**, including a
string-comparison mutant — `'v0.9.0' > 'v0.10.0'` lexically, so a sort-based implementation
renders the direction backwards while agreeing on every fixture whose versions happen not to
straddle a digit boundary.

### A misattribution I owe upstream

I reported `--prune` to them as an upstream defect whose safe use needs a manual second step.
They checked six versions and `main` and found no such flag. They are right, and the check
here is one line:

    git log -S"'--prune'" -- scripts/vendor-configs.mjs
    c0ea1fb9  chore(config): vendor the prettier declarations … (#4228)

**`--prune` is this repository's flag. I added it.** `scripts/vendor-configs.mjs` is a fork
that has diverged from upstream's, and I read a local addition as inherited behaviour and
reported it back to its supposed author.

This exchange therefore contains the same error in both directions within one message: they
attributed a `>=0.8.0 <0.9.0` pin to finance that finance does not have, and I attributed a
`--prune` flag to them that they do not have. Both of us were reasoning about a shared
artifact from a local copy without checking which side the detail came from. The general
form: **a fork makes provenance a property you have to measure, not one you can read off the
filename** — the file has the same path and the same name on both sides.

Their handling of it is worth copying too. They wrote "I can't locate the thing it's about"
rather than "you're describing a tool you didn't read," and said explicitly that they had no
basis for the second rendering. A report of an absence has an accusatory rendering and a
neutral one that carry identical information, and only the neutral one survives being wrong.

### My own probe, failing the way I keep cataloguing

The first attempt at the measurement above ran unauthenticated against a private repo, got
HTTP 403 on both reads, and printed:

    releaseless : 0
    releases/latest : undefined

A zero produced by reading nothing, in a script written specifically to check whether a zero
was real. It was caught only because a later line crashed on `undefined`. Had the crash not
happened the run would have printed a clean, false, confirming answer. Same catalogue entry as
every other instrument here that reported an empty result from a failed read — and written by
someone who had just documented that exact failure twice.

## Existence is not correctness: an enumeration that lost two of five

The vendored citation checker ends every run with "Existence is not correctness — re-run with
`--review`." It had said that on every run of this adoption and had never been taken up. Run for
the first time this turn:

```
171 citations · 43 of 66 principles · 4692 files · 0 unknown · 0 badLinks · 0 badAnchors · 0 badTitles
```

Every ID resolves, every title matches, every anchor lands. And one of the 171 is wrong.

`AGENTS.md` said: "`ENG-TEST-004` (distinct static signals) requires lint, format, type-check, and <!-- enumeration-fixture: the defective quotation this section is about -->
tests to report independently." The principle's statement names **five** — type, lint, **build**,
format, and **security**. The restatement dropped two.

The interesting part is the direction of the error. finance's CI _does_ report build and security
as independent signals: `Build`, `Build & Test`, three CodeQL analyses, `Secret Scan (gitleaks)`,
`Secret Detection`, `npm Audit`, `Dependency Review`, `Gradle Dependency Check`, `detekt Analysis`,
`License Compliance`. So the defect **understated finance's own compliance**. It was not a gap
between what finance does and what the principle demands; it was a gap between what finance does
and what finance _said about itself_. A compliance audit reading the prose would have found finance
less compliant than it is.

ADR-0003 says no authority may copy another's normative text into its own source tree — reference
by link or ID only. A paraphrase is the softer version of the same move, and an enumeration is its
most fragile form: a list has a fixed arity, so it can lose an item while every word that remains
stays true. Nothing in a citation checker can see that, because the ID exists and the title matches.

Both sites are fixed by deleting the enumeration rather than correcting it to five. The remedy for
restated normative text is not a better restatement.

### The control, and the four times measurement overruled preference

`tools/check-citation-enumerations.mjs` fires on the _shape_ — an obligation verb attributed to an
`ENG-*` ID on a line that also contains an enumeration — and never compares the list against the
principle, because deciding whether two lists mean the same thing is exactly the judgement citing
was supposed to avoid. Four design choices, each decided by running the variant over the real
corpus:

| Variant                            | Measured                       | Taken                      |
| ---------------------------------- | ------------------------------ | -------------------------- |
| Multi-line sentence reconstruction | +0 true, +1 false              | rejected                   |
| Two-item lists (no comma)          | +0 true, +2 false              | rejected                   |
| Closing "and"/"or" optional        | +0 true, +0 false, wider reach | **taken**                  |
| Serial comma required              | blind to one real instance     | kept, and pinned by a test |

The last row is the honest one. The adoption guide's own instance read "requires format, lint and
type-check" — three items, no serial comma — and the check cannot see it. That one was fixed by
hand. A test now pins the blind spot so it cannot be mistaken for coverage.

### Three failures in the method, found while building the instrument

**The test file matched its own needle.** First run after widening: five violations, all fixtures in
the checker's own tests. The catalogued failure — a probe containing its search needle — reproduced
by the probe written to catch it.

**The corpus was stale, and stale reads exactly like correct.** The widening had been measured as
"costing nothing" against a citation census captured _before_ the test file existed. The corpus
could not have contained the thing the widening would fire on. The measurement was not wrong; its
referent had moved. This is the parent session's _as of when, on which ref_ applied to a corpus
rather than a status line, and it is the second time this session that a number was true and its
subject had changed underneath it.

**A test passed for a reason unrelated to what it claimed.** The two-item test used comma-less prose
("budgets and Lighthouse"), which fails the pattern whether the floor is two or three. It asserted
nothing about the floor, and a mutant lowering the floor survived it. Only mutation testing
distinguished a passing test from a testing test — a green produced by a property of the fixture
rather than by the thing under test, which is the same mechanism as every other item in the
catalogue, now in the assertion rather than the instrument.

Final: **15 tests, 9 of 10 mutants killed**, the survivor (`\r?\n` → `\n`) adjudicated equivalent by
showing line numbers and both output fields are byte-identical on CRLF input. The survivor list is
the artifact; the ratio would have been 10/10 by deleting it.

### Exemption by marker, not by path

The fixtures opt out with a trailing `// enumeration-fixture`, the same shape as the
`# exercises-engines-range` marker on the Node-version check. Per line, visible at the site,
greppable, and unable to grow silently the way an ignored directory would — a test asserts that
exempting one line does not exempt its neighbour. The clean run prints the count (`17 line(s)
exempted`), because a narrowing that is not reported is a narrowing that can widen unobserved.

### A refuted hypothesis

The `ENG Citations` CI job runs with no token against a private repository, so it looked like a
candidate for the failure this adoption has hit twice — a green produced by reading nothing.
Tested rather than assumed: `raw.githubusercontent.com/.../principles/index.json` returns **HTTP
200** unauthenticated, while the GitHub **API** returns **403**. Raw content and API auth are
different surfaces. The job genuinely validates. Recorded because a refuted hypothesis is evidence
and the record otherwise fills only with confirmed ones.

## The population is never in the output: auditing finance's own gates

The engineering sibling stated a rule strongly enough to be falsifiable: _every clean result in
this thread has been clean over a population, and the population is never in the output._ finance
ships five gates, so the claim is testable here rather than agreeable. Ran all five and read the
clean output:

| Gate                           | Clean output names its population?                       |
| ------------------------------ | -------------------------------------------------------- |
| `tool:imports:check`           | yes — 130 references, 45 files, 8 excluded               |
| `node:version:check`           | yes — 37 pins, 31 workflows, 452 dependency declarations |
| `gradle:prefetch:check`        | yes — 10 jobs across 31 workflows                        |
| `citations:enumerations:check` | yes — 3160 files, 19 exempted                            |
| `workflow:security:check`      | **no — "passed (.github\workflows)"**                    |

Four of five. The exception is the security gate, which is the one where a green over an unnamed
subset costs the most. The rule predicted a finding and it landed on the highest-stakes instrument.

### A hypothesis about it, refuted by running it

The checker resolves named files as `workflows['deploy-preview.yml'] ?? ''`, six times. Reading
that, the inference is immediate and alarming: rename or delete a workflow and its security
assertions evaluate against an empty string, so they retire silently and the gate still prints
"passed". A per-file fail-open in a security control.

Measured instead of filed:

```
baseline                        errors: 0   (31 workflows)
without deploy-preview.yml      errors: 3   (30 workflows)
without nightly.yml             errors: 1   (30 workflows)
without deploy-production.yml   errors: 5   (30 workflows)
with ZERO workflows             errors: 29
```

**Removing a workflow raises errors. It fails closed.** Every named-file assertion is phrased
positively — _this file must contain X_ — so an absent file fails it rather than skipping it. The
`?? ''` fallback exists to avoid a crash, not to excuse a check.

The inference was wrong in the direction that would have produced an accusation against a control
that was working. That is the failure mode this adoption has repeatedly called the dangerous one,
arriving from the other side: not an instrument over-reporting compliance, but a reader
over-reporting a defect. **Reading a control tells you what it says; only running it tells you
which way it fails.** Nothing in the 21 existing tests asserted the fail-closed property, so the
suite would not have contradicted the misreading either.

### What shipped

`summarizeScope()` and a clean run that names its population:

```
Workflow security regression check passed (.github/workflows): 31 workflow(s) scanned;
30 of 30 named assertion target(s) present; 1 covered by the universal checks only.
```

That last figure is new information the old output could not carry: `copilot-setup-steps.yml` is
covered by the universal checks alone and by no file-specific assertion. Not a defect — it is
unprivileged — but it is exactly the fact a named-file audit cannot see, and it is now printed
rather than discoverable.

Five tests pin what reading got wrong: an empty workflow set must fail closed; removing each of
three named workflows must raise errors; every named target must exist on disk; the scope must be
arithmetic over the tree rather than a constant.

### A decorative assertion, and three equivalent mutants proved rather than asserted

First mutation run killed 3 of 6. The two survivors both shrank the named set, and the test meant
to stop them read `assert.equal(scope.named, NAMED_WORKFLOW_ASSERTIONS.size)` — **comparing the set
to itself.** Second decorative assertion found in two turns, by the same method, in a test written
immediately after documenting the first. Replaced by pinning the _complement_ against the disk:
the list of workflows covered by universal checks only must equal exactly
`['copilot-setup-steps.yml']`, which grows the moment an entry leaves the named set.

Three mutants still survived. Rather than adding tests until they died, measured whether they
_could_ die — how much each component uniquely contributes to the union:

| Component dropped               | Union size | Uniquely lost |
| ------------------------------- | ---------- | ------------- |
| `privilegedWorkflows`           | 30         | none          |
| `localReusableBaselines`        | 30         | none          |
| `requiredEnvironmentJobs`       | 30         | none          |
| `leastPrivilegeWorkflows`       | 30         | none          |
| `permissionInheritanceBaseline` | 11         | **19 files**  |
| literals                        | 30         | none          |

`permissionInheritanceBaseline` subsumes every other component for the purpose of the denominator.
Dropping the others changes the union by **zero**, so no test can distinguish those mutants: they
are provably equivalent, with the table as the proof rather than an adjudication by assertion.
Final 3 of 6, and the survivor list carries the structural fact that a 6-of-6 would have deleted.

## A lock records the ref you asked for, not the vintage of the thing that asked

A fleet audit reported that this repository runs a stale vendoring script, and used
`engineering-configs.lock.json` as the evidence: `ref` is `v0.134.0`, the newest pin in the
fleet, while the script behind it was said to be many releases old. The general claim is
correct and worth stating plainly.

**`lock.ref` records the ref that was requested. It says nothing about the script that did the
requesting**, because the script is not part of the payload it vendors — it is not in
`lock.files`, so nothing hashes it and nothing notices when it drifts. A lock can name the
newest possible ref and have been written by anything.

Two of the three specific defects did not reproduce, and the discriminator is why.

The audit's test was `/would change/.test(readFileSync('scripts/vendor-configs.mjs'))` — a
search for a string from the upstream fix. It returns `refresh me` here. But running the tool
prints:

```
Notice: pinned at v0.134.0; newest release is v0.145.0, and 1 vendored file(s) differ there:
  config/engineering/citations/check-citations.mjs
```

That is content-gated staleness — it names _which_ file differs — and a cadence-only check
cannot produce that line. This repository implemented the same capability independently, with
different wording, so **a string match for someone else's fix reports a capability this tree
has as a capability it lacks**. A grep for a remedy is not a test for the property the remedy
was meant to establish, and the gap between the two is exactly the size of the space of other
ways to be correct.

The third defect was real: the lock carried no writer entry at all, so `--check` passed
silently over a question it had never asked.

### A version number would have been false here

The upstream remedy records a tool version. This script is a fork — ten local commits carrying
`--prune`, `divergenceNotice`, and a paginated tag read that upstream does not have. A version
string in this lock would assert an equivalence that does not hold, and asserting exactly that
is how an earlier turn ended with a locally-added flag reported to its supposed author as their
bug.

So the recorded identity is a **content hash of the writer**. It answers the question actually
being asked — _was this lock written by the script now checking it?_ — and it answers it for a
fork, where a version number cannot. Three states, kept distinguishable, because collapsing them
is the defect being fixed: absent (`Unverified:`), matching (silent), differing (`Notice:`).

The cost is stated rather than hidden: a content hash cannot tell a semantic change from a
reflow, so **the formatter invalidates it**. Re-vendor after `prettier --write`, never before.

### Following the remedy found a worse defect than the one it fixed

The documented refresh command is `node scripts/vendor-configs.mjs <newer-ref>`, with no
`--set`. Run here at the _same_ ref, it turned 6 vendored files into 12, writing a
`config/engineering/tsconfig/` tree this repository had deliberately not adopted, recording it
in the lock, and exiting 0. The summary line counts what it wrote, not what changed about the
selection.

A guard against a `--set` that _drops_ locked files was added earlier; **its mirror image was
missing**. Guards get written in the direction of the harm someone already suffered, so the
opposite direction stays open, and the asymmetry is invisible precisely because the existing
guard makes the area look covered.

The first version of the new guard ran after the write loop. It failed correctly — having
already left all six files on disk. _A control that reports the state it was meant to prevent,
after creating it, is a message._ It now runs before any write, and an explicit `--set` is
treated as the signal of intent that may widen; the implicit default — the refresh path, the
one the whole fleet was told to run — may not.

`widenedByRun` is exported and pinned by 5 tests; `writerIdentity`/`writerNotice` by 6. All 11
mutants killed; 37 tests pass.

### Incidental: one flagged gap has closed

The widening run revealed that upstream now ships `config/engineering/tsconfig/vite-react.json`.
That was one of the two preset gaps this adoption flagged. It is not adopted here — tsconfig
remains deliberately out of the vendored set — but the gap is closed upstream and the follow-up
should be re-scoped rather than re-argued.

## Every scope line in this repository was on the green path

Four independent routes had converged on one rule: _print the scope beside the verdict._ This
repository shipped it — `summarizeScope()`, an excluded-test count, an exemption count. Then a
sibling session observed that a partition has to sum or one of its parts is invisible, which
prompted the obvious next question, which nobody in four rounds had asked.

**Which branch does the scope print on?**

All of them printed it on success only. Forcing each gate red:

| Gate                           | Red-path output                 | Missing                |
| ------------------------------ | ------------------------------- | ---------------------- |
| `tool:imports:check`           | `1 undeclared import`           | the entire denominator |
| `citations:enumerations:check` | `1 across 3161 scanned file(s)` | the exempted bucket    |
| `workflow:security:check`      | `N errors`                      | the entire denominator |

The failure branch `return`ed before the scope line in two of the three, and printed two of
three buckets in the third.

This inverts the rule as it had been stated. **The green path is where the denominator matters
least** — nothing was found, so how much was searched is a question about confidence. The red
path is where it matters most: _1 undeclared import across 45 files with 8 excluded_ and _1
across 3_ are different claims, and only one of them is a small problem. A reader triaging a
red check is precisely the reader who cannot afford to guess at the population.

The sharpest instance is the one shipped last turn. `summarizeScope()` was added to answer
"the population is never in the output" — and was called _after_ the failure return. **The
remedy for the rule reproduced the defect the rule describes, on the branch where it is worse.**
A control written from a lesson can inherit the exact blind spot the lesson was about, because
the lesson gets applied to the case that prompted it and the symmetric case is never enumerated.
Same shape as the missing widening guard, one section up, found the same week.

Fixed in all three: the scope is computed before the branch and emitted on both, and the
enumeration checker now names the exempted bucket on failure — the bucket that can _hide_ a
violation, since an exempted line is one the check chose not to see.

### The test fixture was itself a violation

Adding a red-path test for the enumeration checker required writing a restated enumeration into
a fixture. The suite went red — the checker found the string in its own test file.

That is not a mistake to avoid; it is **entailed by the subject matter**. Any checker whose
input language is the language it is written in will find itself: a linter's fixtures, a
secret-scanner's test vectors, an import checker's sample modules. `tool:imports:check` already
excludes 8 test files for exactly this reason.

The consequence is what makes it worth naming. The exclusion is _forced_, so the denominator is
permanently narrower than the tree — not a temporary narrowing to be ratcheted back later. Which
is precisely why `8 test file(s) excluded` has to be printed: it is the only thing distinguishing
a structural exclusion from a scope bug, and the two are indistinguishable from a bare green.

The fixture is exempted with the existing per-line `enumeration-fixture` marker rather than by
adding a path exclusion, so the narrowing stays one line wide and stays counted.

5 mutants killed across the three gates; suites now 20, 17, and 29 tests.

## A rule can be silent about a defect it names, depending on how the line is written

`react-hooks/rules-of-hooks` was one of seven rules deferred when the plugin was
adopted, recorded in `eslint.config.mjs` with a measured count of 3 violations.
Re-measuring on the parent session's request found 2 — a small drift, and not the
interesting part.

The interesting part is that the count is not a count of the defect. Measured with a
fixture matrix, one case per file, using `if` as a known-positive control:

| guard | form                                           | detected |
| ----- | ---------------------------------------------- | -------- |
| `if`  | const, return, destructure, bare call          | all 4    |
| `try` | destructuring declaration                      | yes      |
| `try` | simple const, return-member, bare call, nested | no       |

Under `if` every form is caught. Under `try` only the destructuring form is. The
rule's message — _"React Hooks must be called in the exact same order in every
render"_ — is equally true of all of them.

`apps/web/src/pages/HouseholdPage.tsx` shows the consequence directly. It holds seven
hook calls inside `try` blocks, five of them structurally identical `useOptional*`
provider-tolerance wrappers. The rule reports two. Fixing those two would turn the
file green over five surviving instances of the same defect, and the green would be
the evidence that nothing remained.

Repo-wide, forcing the rule on reports 2 findings in 1 file. A local rule that asks
the question directly — is a `use*` call lexically inside a `try` block — reports **14
across 7 files**. Read as a deferral budget, the recorded number understates the work
by 7x.

Three things generalise.

**The population here is a set of syntactic forms, not a set of files.** Every earlier
instance in this adoption narrowed over paths: files excluded, workspaces missing,
steps not reached. This one narrows over _shapes_, inside files that were all scanned,
by a rule that was correctly configured and correctly scoped. Printing a denominator
would not have exposed it — the denominator was right. Only a differential against an
instrument that asks the question a different way separates them.

**The useful instrument was the one not built for the question.** The local rule was
written to close the gap, so it is not independent evidence. The evidence is that the
same tree yields 2 and 14 depending only on how the question is phrased, and the
fixture matrix — five forms of one violation, one per file so attribution is not
inferred — is what makes the divergence attributable to form rather than to scope.

**Where coverage is not yours, relocate the claim.** The plugin's detection cannot be
widened from here. What can be done here is to state the obligation in a rule this
repository owns, at the granularity the repository actually cares about. That is the
same move as moving a version assertion out of `engines` and into a check: not a
second opinion on the same question, but the same claim relocated to a field where it
can be made true.

Two smaller notes from the same measurement, both corrections to things this document
previously carried forward:

- The claim that finance's 601 `.tsx` files load **zero** React rules is false and has
  been since it was written. The same change that measured the gap also closed part of
  it: 10 of the plugin's 17 rules have been enabled since. The finding was carried
  forward and the fix was not — the defect the parent session named, occurring here.
- `eslint-plugin-react` (peer `^9.7`) and `eslint-plugin-jsx-a11y` (peer `^9`) still
  exclude ESLint 10, re-verified against installed 10.6.0. `eslint-plugin-react-hooks`
  at 7.1.1 now admits `^10.0.0`, which is why the hooks rules could be adopted and the
  other two still cannot. That half of the gap is real and unchanged.

## Re-check carried-forward items at send time, not at discovery time

Three separate items in this adoption have now been re-broadcast after they were
closed, twice by the parent session and once here. The failure is not carelessness; it
is that a finding and its fix are recorded at different moments and only the finding is
carried in the running summary.

The correction is cheap and belongs at the boundary: before restating a standing claim,
re-run the measurement that produced it. In this document that means every claim stated
as current carries the command that would refute it, so re-checking costs one
invocation rather than a re-derivation. The `.tsx` claim above survived many restatements
precisely because it read as a conclusion and not as a measurement.

## A state census cannot answer an event question, and repair is what hides the difference

The sibling session found this in its own tree: a claim of the form _"this has
never happened in 154 release-era tags"_ was a census of surviving **states**,
while the thing being claimed was an **event**. The event had occurred that same
day and had been repaired within two minutes, and the repair removed it from the
census. Worse, the repair was cheap by design, so the census under-counts by an
amount the design guarantees will be most of them.

finance has the same shape, and here it is measurable, because git keeps the
history that a working tree does not.

`workflow:security:check` verifies every `uses:` ref is pinned to a 40-character
SHA. It passes, and it is right to pass:

```
31 workflow(s) scanned; 30 of 30 named assertion target(s) present
```

Walking the 209 commits that touched `.github/workflows` on `main`:

| measure                                    | value                                            |
| ------------------------------------------ | ------------------------------------------------ |
| commits examined                           | 209                                              |
| commits carrying at least one unpinned ref | **89 (42.6%)**                                   |
| distinct unpinned refs over time           | 23                                               |
| most recent                                | `actions/attest-build-provenance@v4`, 2026-08-07 |
| working tree                               | clean                                            |

So the compliance the gate reports was **achieved, not maintained**, and the most
recent lapse was five days before the gate was read, not in some distant
pre-adoption era. Nothing in the gate's output is false. What the output invites
is an inference about the repository from a measurement of the tree.

**This is a different axis from every previous scope defect in this document.**
All the earlier ones were about _which files_ an instrument looked at: excluded
tests, missing workspaces, unreached steps, and the remedy was to print the
denominator. That remedy does not touch this one, because the file denominator
was already complete and correct -- 31 of 31. The narrowing is **temporal**, and a
file count cannot express it at any level of detail.

The fix is the same sentence in a different dimension. The gate now says what
point in time it speaks for, and `npm run workflow:pin:history` answers the event
question directly, so the claim can be re-measured in one invocation instead of
re-derived. It is deliberately not a CI gate: it needs full history, which shallow
CI clones lack, and a check that fails a pull request for what an earlier commit
did is pointed at the wrong target.

### The census was wrong first, in the accusatory direction

The first version reported **209 of 209** commits dirty, including a HEAD the gate
passes. Three refs drove it -- `actions/setup-python@v5`, `setup-dotnet@v4`,
`setup-java@v4` -- and all three are inside a commented-out block of future setup
steps in `copilot-setup-steps.yml`:

```yaml
# - name: Setup Python
#   uses: actions/setup-python@v5
```

`git grep uses:` matches comments. The gate does not, and the gate was correct
throughout. Had the disagreement not been checked by hand before being written
down, it would have shipped as a finding that the pinning gate was broken.

That is the failure mode the sibling named in the same message and then found in
its own wording: **an instrument that fails toward accusation.** Both halves
occurred here within the same hour -- their clause said a published package was
never published, and my census said a compliant tree was non-compliant. The
common structure is that both instruments were measuring a proxy (`publish` job
conclusion; `uses:` text) and reporting the conclusion in the vocabulary of the
target (registry state; pinning compliance).

The rule that follows is narrower and more useful than "fail toward silence":
**an instrument may only accuse in the vocabulary it actually measured.** The
census can say _"this line of text is not a 40-hex ref"_. It cannot say _"this
repository is unpinned"_ until it knows what a step is.

Both exclusions are now pinned by name in `check-workflow-pin-history.test.mjs`,
including one asserting that a commented-out step next to a real one does not
mask it -- the over-correction is as available as the original defect.

A fourth surfaced only under mutation testing, and it is the subtlest. The tool
excluded local reusable workflows with `if (action.startsWith('./')) continue;`,
and a test asserted that `uses: ./.github/workflows/ci-shared.yml` produced no
finding. The test passed. Deleting the guard entirely did not fail it.

The reason is that the match pattern requires an `@ref`, and a local reusable
workflow has none, so such a line never reaches the guard. The test was green
because the fixture could not get that far -- **coverage of a branch by a fixture
that never enters it.** The guard was dead code, and the test was documentation
of an intention rather than a constraint on behaviour.

This is the same structure as the deferred-rule count elsewhere in this document:
a number, or a green, that is true of the wrong population. Here the population
was "inputs that reach line N", and it was empty. The guard is now removed and
the test asserts the _reason_ -- that the string contains no `@` -- so it fails if
the pattern is ever widened to match refless `uses:` entries.

Mutation testing is what separated these. The test suite was 16 for 16 green both
before and after the guard existed, and no amount of re-reading the tests would
have said which. Six mutants, six killed, after.
A third defect surfaced only in the extraction. The scratch census recorded
first-seen attribution with `if (!refs.has(entry))`, which -- because `git log` is
reverse-chronological -- kept the **newest** commit under a name meaning the
oldest. The headline counts do not depend on attribution, so the scratch run was
clean, correct, and wrong in a field nobody read. It was caught by writing the
test, not by re-reading the code.

## The pinning argument is about references, not about YAML

`workflow:security:check` enforces `GH-ACT-003`: every `uses:` ref must be a 40-character
commit SHA. The reason given is not specific to Actions. A mutable ref resolves today and
silently means something else tomorrow, so a reference to a moving target is a reference
whose meaning is not recorded anywhere.

That argument is about **references**. Nothing in it is about YAML. But the enforcement is,
so one directory away the same repository links to sibling authority repositories like this:

```
docs/guides/…:  https://github.com/jrmoulckers/engineering/blob/main/practices/testing.md
```

`main` is exactly the mutable ref the gate rejects, in a repository under active development.
Measured across 593 tracked markdown files:

| target repo               | 40-char SHA | mutable `main` |
| ------------------------- | ----------- | -------------- |
| `jrmoulckers/product`     | 16          | 6              |
| `jrmoulckers/engineering` | 0           | 10             |
| `jrmoulckers/.github`     | 0           | 6              |
| **total**                 | **16**      | **22**         |

The interesting number is not 22. It is **16**: this repository already knows the discipline
and applies it in `docs/compliance/`, where every reference to the ratified compliance
principles carries a full commit permalink. The same repository, the same kind of claim about
the same kind of authority document, two different disciplines — and the difference tracks
which directory the prose lives in rather than anything about the reference.

`npm run upstream:refs:check` records this. It is a ratchet against a printed baseline of 22
rather than a demand for zero, because a link that should track the latest guidance is a
legitimate thing to write; what is not legitimate is writing one by default and never saying
which kind it is.

### The check states what it did not measure

There are two questions about a cross-repo reference and they need different instruments:

1. _Is the ref immutable?_ Answerable from the text alone, offline, in the pull-request gate.
2. _Does the path exist upstream?_ Needs the sibling repository, so it cannot run in CI.

The tool answers the first and **prints the second as unmeasured**. That is the same
correction as the temporal-scope line on the pinning gate, applied before shipping rather
than after: an instrument may only accuse in the vocabulary it actually measured, and the
vocabulary here is `ref immutability`, not `link validity`.

### The census that produced this failed accusatory first, for four different reasons

The scratch census that started this began by resolving every referenced path against the
sibling checkouts and reported **4 of 16 unresolvable**. All four were the instrument's fault,
and no two shared a cause:

| reported missing                  | actual                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `principles/foo.md`               | a deliberately fictional example inside a comment in the vendored citation checker |
| `principles/compliance.md`        | real, but in `jrmoulckers/product`; the census assumed one upstream repo           |
| `reusable-detect-changes.yml`     | finance's **own** local workflow                                                   |
| `reusable-release-smoke-test.yml` | finance's **own** local workflow                                                   |

This is the third consecutive census in this guide whose first result was wrong in the
direction of accusing the thing it measured. What is new is that the four false positives had
four distinct causes, which is worth stating because it defeats the natural response to the
first two — that a census can be made safe by handling _the_ edge case. There was no `the`.

A fifth error occurred while tabulating, in the shell rather than the tool: a nested
`-match` inside an `if` clobbered `$Matches`, so the repository name read empty and the
`product,branch` bucket vanished. The published figure would have been `16 of 16 pinned` for
`product` instead of `16 of 22`, which is the more flattering number and the wrong one.
Regex state that is global to the scope is the same defect class as `lastIndex` on a shared
`RegExp`, and it is why the tool resets `BLOB.lastIndex` per line rather than trusting it.

## A range can be wrong in two directions and only one was ever measured

`check-node-version-consistency.mjs` verifies `engines.node` against the 452 `engines.node`
declarations in the installed tree, and it passed. It checked one direction:

```js
for (const version of probeVersions(...)) {
  if (!semver.satisfies(version, declared)) continue;   // <- everything excluded, discarded here
```

Versions the range **admits** are compared against the dependencies. Versions the range
**excludes** are dropped on the first line of the loop, so no question is ever asked about
them. That is not a sampling gap. `22.22.1` was already in the probe set — `probeVersions`
harvests literal versions out of dependency ranges, and `lint-staged` declares `>=22.22.1`.
The falsifying version was in the population and the filter threw it away.

Measured against the real tree, the declared `>=22.23.0 <23 || >=24` excluded Node
**22.22.1**, which all 452 declarations accept. A dense patch sweep puts the excluded run at
`22.22.1`–`22.22.6`; the check reports only `22.22.1`, because it probes versions some package
names rather than every version that exists, and it now says so.

The two directions are different defects and it is worth being precise about which is which:

| direction        | what it claims                                  | who it hurts                                                     |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| over-permissive  | support for a runtime installed packages reject | a consumer, who is told it works                                 |
| over-restrictive | no support for a runtime every package accepts  | a contributor, whose working environment is declared unsupported |

Only the first was measured, and the second is the one this repository had. Corrected to
`>=22.22.1 <23 || >=24`; both directions now read zero, and both are printed even when clean,
because _"admits no bad version"_ reads as _"the range is right"_ and is half the claim.

### The falsifying value was inside the argument

The floor came from this repository's own earlier work, which recorded its reasoning as:

> `>=22.22.1` and `^22.13.0` bounds put the true minimum at **22.23.0**, not 22.0.0.

The premise names `>=22.22.1`. The conclusion says `22.23.0`. They are one patch apart, in one
sentence, and it survived review, a checker, and several later re-readings of the same
paragraph.

This is a harder case than a version missing from a probe set. There the instrument could not
see the counterexample; here the counterexample is **quoted in the evidence for the claim it
refutes**. No widening of a population would have helped, because the population was not the
problem — the step from evidence to conclusion was, and nothing in the toolchain reads that
step. What caught it was recomputing the floor from the tree instead of re-reading the
sentence, which is the same distinction as _reading a control tells you what it says; only
running it tells you which way it fails_, applied to prose.

### The odd major is a fact about Node, not about this tree

The excluded direction reports any version all dependencies accept, including Node 23 when
nothing happens to reject it. That is not a false positive and it is not suppressed. Odd Node
majors never reach LTS, so mature packages write `18 || 20 || >=22` and skip them by cadence,
which means **the expected shape of a correct `engines.node` is non-contiguous** and a
contiguous one is more likely wrong than right. Measured here: of the 20 declarations that
reject Node 23, **4 of 4 distinct ranges use `||` alternation**, and they come from unrelated
maintainers — the `@eslint/*` family, `@asamuzakjp/*`, `whatwg-url`, `data-urls`,
`@exodus/bytes`. The check therefore states a fact — _every dependency accepts this and you
exclude it_ — and leaves intent to the reader, rather than demanding a contiguous range that
would be wrong.

## A control that omits its resolution source cannot implicate itself

The vendored citation checker prints its version and the index URL it resolved against on
the passing path, and prints neither on the failing path. An unknown-ID failure is
therefore ambiguous between two readings — the ID is wrong, or the index this repository
resolves against is stale — and the output only supports the first. The suppressed reading
accuses the instrument, which is one of the two suspects every time.

That is not a hypothetical here. Three facts were looked up rather than assumed:

- the vendored checker reports `--version` **10**; the current upstream release reports **11**
- `engineering-configs.lock.json` pins the vendored files at **v0.134.0**, and the newest
  release is **v0.145.0**
- of the six vendored files, the **one** that differs between those releases is
  `check-citations.mjs` itself

So the instrument is a version behind, and the failing path is the one place a reader would
act on that fact without being told it.

The disambiguating information already existed in this repository. `npm run eng:vendor:check`
prints the pin, the newest release, and the differing files unconditionally — it is simply a
different control, which a reader chasing a citation failure has no reason to run. The
defect was never missing knowledge; it was knowledge printed somewhere the reader is not.

`tools/run-citations-check.mjs` wraps the vendored checker without diverging it. It adds no
check and changes no verdict: it passes arguments through, streams the checker's output
unmodified, exits with the checker's status, and on a non-zero exit appends what the checker
resolved against.

Two decisions in that wrapper are worth stating, because both were forced by evidence:

- **It asks for the version rather than reading it.** `--version` is a lookup; a regex over
  the source is a name. The index URL cannot be obtained that way, so the scraper refuses to
  guess — it reports how many URL candidates it found and returns one only when the count is
  exactly one. Zero or many is reported as an instrument fault, not silently resolved.
- **It names the ref, and the ref moves.** The index URL points at
  `.../engineering/main/principles/index.json`. Reading an authority from a branch means the
  set of valid IDs can change with no diff in this repository, so two runs over an identical
  tree can legitimately disagree. The warning is emitted only while the ref is mutable, so a
  repository that later pins the index by SHA stops being told about a problem it has fixed.

Two things went wrong while building it, and both are the failure this repository keeps
finding rather than new ones.

The first probe of two other gates reported them **green**, and the probes had not fired:
`upstream:refs:check` reads _tracked_ markdown and the probe file was untracked, and the
undeclared-import probe named a package that is already declared. A control that never ran
reported as a control that passed. Re-probed with tampers that bite, both gates print their
scope on the failing path — but that is now a measurement rather than the recollection it
would otherwise have been.

The second is sharper. `refMutability` read the ref from the wrong URL segment, and the test
covering the real branch URL **passed anyway**, because the segment it wrongly read
(`principles`) is also not a forty-character SHA. Only the pinned-SHA case could tell the two
apart. The test that failed was the one asserting the warning _disappears_, which is the
assertion that had no reason to exist except that a repository which fixed the problem should
stop being told it has it. A test suite where every case expects the same verdict cannot
distinguish a correct implementation from one that always returns that verdict.

## A count of commits is complete over commits and silent about duration

The pin-history census reported that 89 of 209 commits touching `.github/workflows`
carried at least one unpinned action ref. That figure is complete over commits and says
nothing about how long the branch actually sat in a non-compliant state. The same 89
lapses could be 89 minutes or most of the repository's life, and no percentage of commits
can tell those apart.

Only commits touching the workflow directory change the branch's pinning state, so each
one's state holds until the next newer such commit, and the newest holds until now. That
makes duration computable from the same walk:

```
commits examined              209
commits with >=1 unpinned     89 (42.6%)
time in a non-compliant state 62d 19h of 160d 4h (39.2%)
```

The two figures nearly agree, which means the lapses were close to average length. That is
worth stating precisely because it was **not** predictable: had a single long-lived lapse
dominated, the same 42.6% would have sat beside a time figure two or three times larger.
The count was a good proxy here, and the only way to learn that was to stop using it as one.

Three decisions in `exposure()` were forced by cases the count never had to answer:

- **The newest state runs to wall-clock now, not to its own timestamp.** An unrepaired HEAD
  is still accruing exposure, and a report that ended the interval at the last commit would
  show a currently-broken branch as having stopped being broken the moment nobody touched it.
  The report says so, because that final interval grows between runs with no diff.
- **A commit whose tree declares no actions holds a _clean_ state rather than vanishing.**
  `git grep` exits non-zero when nothing matches, and the previous code treated that as a
  commit to skip. Skipping it silently removed its interval from the span — the partition
  stopped summing, in the one direction where the total is the denominator.
- **Elapsed time is floored at zero per interval.** Git timestamps are author dates and can
  run backwards; without the floor, one skewed commit subtracts exposure and the total
  understates.

The stub for the git runner was widened rather than rewritten. It now derives the new epoch
field from the short date the existing cases already stated, so none of the sixteen prior
tests silently changed meaning while the format changed underneath them.

One test in the first draft asserted `notEqual(3, 1)` — two literals compared to each other,
written directly beneath a comment explaining that counts and durations measure different
things. It would have passed against any implementation, including one that returned a
constant. It now derives both counts from the same fixtures it measures the durations from,
so the assertion fails if the fixtures stop illustrating the claim.

## The link filter was the publisher's, and finance matched none of it

The vendored citation checker follows only links whose target sits under `principles/`.
That filter was reported here as a property of the vendored copy. It is not: it is
`scripts/check-citations.mjs` in `jrmoulckers/engineering`, live on `main`, one vendoring
hop upstream. Every consumer inherits it silently.

The attribution error is the more useful half. An earlier finding in this same file family
assumed a behaviour was inherited when it was local; this one assumed local when it was
inherited. Same fork, same file, opposite direction, within a few turns — so neither
_assume upstream_ nor _assume local_ is the conservative guess. Provenance has no safe
default, and the only way to settle it is to read the other tree.

What the filter leaves unmeasured is larger here than upstream, because finance has no
`principles/` directory at all:

```
tracked markdown files    593
relative .md links       3353
  matched by the checker     0
  verified by nothing     3353
targets that do not exist   35
```

Not 5 of 65 — **0 of 3353**. The filter does not narrow the coverage here, it eliminates it.

### Seven of the thirty-five were mine

`docs/architecture/0015-premium-architecture.md` and `0016-gamification-system.md` were
moved out of `docs/architecture/adr/` up one level during the first adoption commit. Their
internal links read `../0009-legal-monetization-analysis.md`, which was correct from the
`adr/` subdirectory and resolves outside `docs/architecture/` from the new location. Checked
rather than assumed — the pre-move blob carries those exact `../` paths, and the rename was
recorded as `R100`/`R099`, so the content did not change and the meaning of the content did.

That regression shipped in the first commit of this adoption and survived every subsequent
one. Nothing in lint, format, type-check or any of the eight gates reads a link, so a rename
is invisible to all of them: the citing document stays syntactically perfect and simply
points at nothing.

The remaining twenty-eight split into eight in `docs/guides/workflow-cheatsheet.md` that use
repo-root paths from a subdirectory — introduced long before this work, verified by finding
the commit that added them — and twenty that name documents this repository has never
contained. Twenty-four of the thirty-five resolved to exactly one existing file by basename
and were repointed. The rest are recorded as a named, shrinkable baseline, because the fix
for a link to a document that was never written is to write it or drop the reference, and a
checker should not guess which.

### The check is fence-aware because the census that found the defect was not

An illustrative link inside a fenced block is not a link. The upstream-side census that
first measured this gap reported one broken link that turned out to be an elided example
inside a fence, so this implementation skips fenced blocks _and prints how many it skipped_ —
an exclusion that is not counted is indistinguishable from an exclusion that never happened.
Inline code spans are blanked rather than removed, so masking a `[x](./a.md)` illustration
cannot shift the line number reported for a real link on the same line.

Two things this check deliberately does not do, both printed on every run: it does not
resolve anchor fragments, and it cannot see a target that keeps its path while its content
moves elsewhere. That second failure is the one that motivated the whole exchange, and no
link checker can hold it — a file that keeps its name stays green while every claim about
its contents goes stale.

One reporting bug caught before merge: the first version printed `12 recorded gap(s)`
against a nine-entry baseline, because three targets are linked from two places each. It was
reporting occurrences under a name that says distinct targets — the same conflation this
guide has documented twice, in output written to describe it.

## The number beside a verdict was from the wrong vocabulary

Both directions of the `engines.node` check printed the same figure:

```
admits no version rejected by any of 452 dependency declaration(s).
excludes no version that all 452 dependency declaration(s) accept.
```

`452` decides neither. The probe set is 52 versions; the declared range admits
8 of them and excludes 44. So one verdict rests on 8 points, the other on 44,
and the number offered as the scope of both is a count of a different thing
entirely — declarations, not probes. Two verdicts, two populations, one number,
and it is neither of them.

This was written to satisfy the rule that a verdict must print its scope. It
prints _a_ number, in a sentence that reads as a denominator, and the check
passes a reader's eye precisely because 452 is large and real. A wrong
denominator is worse than a missing one: absence prompts the question, and a
plausible figure closes it.

Both lines now name the population that decided them, and the scope line states
a partition that sums:

```
admits no version rejected by any dependency, over the 8 probe version(s) it admits.
excludes no version that every dependency accepts, over the 44 probe version(s) it excludes.
scope: both directions checked over 52 probe version(s) (8 admitted, 44 excluded)
       drawn from 452 dependency declaration(s).
```

### A direction that fires without consulting evidence

All 452 installed declarations are unbounded above — none rejects Node 9999.
That makes the over-restrictive direction degenerate past the highest major any
dependency names, but not in the way it first appears. "Every dependency accepts
this version" is _unanimous by construction_ up there, so the check reports every
version the declared range excludes, without the tree contributing anything. It
has stopped testing the range and started handing the range's own upper bound
back.

The mirror is where a clean reading becomes worthless: a range left open above
excludes nothing up there, so it has no population and returns empty whatever
the tree looks like. That is this repository's case — `>=22.22.1 <23 || >=24` is
open above 24, the highest major the tree names, so **0** probe versions sit in
the region, and the clean verdict there is guaranteed rather than earned.

Either way the upper end of an `engines.node` range is unfalsifiable from
`engines` data. The only evidence for it is having run it, which is why the
marked CI job that actually executes Node 24 carries more weight than any number
of probe points. The check now says so on every run.

### The first draft of that reasoning was backwards, and a test caught it

The initial notice claimed nothing above the line _could ever_ be flagged. A
fixture returned 3, not 0. The direction is not silenced up there; it is made
unanimous, which is the opposite failure and produces the opposite output. The
assertion that caught it was a literal `0` transplanted from this repository's
real tree into a fixture that does not have that shape — so a value carried
across contexts failed for the right reason, which is the more useful half.

Two further mutants survived the first pass and both were real:

- Reverting the interpolation to `populations.declarations` left every unit test
  green, because they all tested the computation and none read the sentence. The
  defect being fixed is _which number appears in the text_, and no test looked at
  text. The notice builder is now a separate exported function so the strings are
  assertable.
- `highestNamedMajor` used `Math.max`, and replacing it with plain assignment
  passed everything — every fixture happened to list its literals in ascending
  order. A fixture is realistic and discriminating for unrelated reasons.

A third: asserting only that the partition _sums_ let a mutant printing the
admitted count in both slots survive, because the natural two-dependency fixture
splits 7/7. It now uses one that splits 7/9 and asserts each half against the
population it names.

One correctness fix fell out of the same pass. `highestNamedMajor` read only full
`x.y.z` triples, so a range like `18 || 20 || >=22` — the canonical form for
declaring support across LTS majors — appeared to name nothing. That put the line
lower than the tree states, and since the notice claims everything past the line
is not evidence, understating it over-claims.

## A truthful scope line over the wrong population

`tools/check-upstream-refs.mjs` printed `Scope: ref immutability only, read from the
text of tracked markdown`. That sentence was accurate. The population it described
was wrong, and the single most consequential reference in the repository sat outside
it: the `DEFAULT_INDEX` constant in `config/engineering/citations/check-citations.mjs`,
which resolves the engineering repo's `principles/index.json` from a branch. The
`eng:citations` gate validates every `ENG-*` ID against that file, so the set of IDs
this repository considers valid can change with no diff here at all.

Printing scope was the remedy adopted after an earlier finding, and it worked as
designed -- it tells a reader what was counted. It does not, and cannot, tell a reader
whether what was counted is what should have been. Those are different questions and
only the first has a mechanical answer.

**It was missed for two independent reasons, either alone sufficient.** The file list
was `git ls-files -- docs *.md`, so a `.mjs` file was never opened; and the extraction
regex matched `github.com/.../blob/...` only, so a `raw.githubusercontent.com` URL was
invisible even in a file that _was_ scanned. Fixing either one alone would have left
the ref hidden while producing a diff that looked like the fix. This is the second
time in this adoption that a defect had more causes than the first correct-looking
explanation accounted for.

The second cause also under-counted within the tool's own stated scope: one
`raw.githubusercontent.com` link in this very guide was never counted, so the prose
baseline moves 22 -> 23 with no new reference added.

### Consequence is an axis, not a detail

The two populations are reported apart and ratcheted apart:

| Population             | Count | If a ref here is mutable                                       |
| ---------------------- | ----- | -------------------------------------------------------------- |
| Tracked markdown       | 23    | A reader opens a document newer than the sentence citing it.   |
| Tracked executed files | 1     | A gate returns a different verdict tomorrow for the same tree. |

A single baseline covering both would have put one number on two consequences, and the
23 would have swamped the 1 -- the finding would have been arithmetically present and
practically invisible. Population and consequence are independent axes; the four axes
of scope recorded earlier in this guide (which files, which point in time, which
direction, which duration) did not include it.

### Fixtures are a source file's code fences

A test asserting that `main` classifies as mutable has to contain a mutable ref. Scanning
test files would report those assertions as the defect they assert about -- the same
shape as a fenced block in prose. They are excluded, and **the exclusion is counted and
printed**, because an exclusion nobody can see is indistinguishable from a population
that had nothing in it.

The first implementation of that exclusion matched `.test.{js,ts}` and not `.test.tsx`,
so 259 React test files were scanned as executed code while the tool printed a fixture
count claiming they were not. The verdict was unaffected -- those files contain no
cross-repo refs today -- so no run would ever have revealed it. A unit test did. This is
the case for testing a printed number that no verdict depends on: the number is the only
part a human reads.

### A ratchet whose tests are written in terms of itself

Mutation testing found one survivor that no amount of additional assertion would have
caught: raising `EXECUTED_BASELINE` from 1 to 9 passed the entire suite, because every
baseline test was phrased as `EXECUTED_BASELINE + 1`. The fixtures moved with the
constant. A ratchet expressed relative to its own setting cannot detect the setting
being loosened -- the baselines are now asserted as literals.

Three further survivors were all on the **failing** branch: the suite contained no case
in which the gate fails, so a program that could only ever return green passed it. The
verdict logic was extracted from `main()` into an exported `verdict()` for that reason.
Related: a mutation run whose unmutated baseline is not verified green first reports a
perfect score, because every mutant dies of the same syntax error. That happened here
and produced a spurious `10/12` before the guard was added.

### The remaining reference, and why it is recorded rather than pinned

The one executed mutable ref is real but has not fired. Fetching `principles/index.json`
at `v0.134.0`, at `v0.145.0`, and at `main` yields **66 IDs each, with 0 IDs, 0 titles
and 0 paths differing**. The checker also fails _closed_: an unreachable index exits 2
rather than passing vacuously.

Pinning it via `--index` in `tools/run-citations-check.mjs` is the fix, and upstream's
own `docs/adopting.md` documents that recipe. It is deliberately **not** done in this
change, because a pin creates a staleness surface and `eng:vendor:check` covers only the
vendored checker, not the index it reads. Trading a measured-zero-drift hazard for an
ungated staleness hazard is not obviously an improvement, and this adoption has already
shipped one silent-staleness defect. Pin and staleness gate should land together.

### Two figures reported to the engineering session were wrong

Both concerned this repository and were relayed upstream as facts about it:

- ESLint is **10.6.0** here (declared `^10.6.0`), not `10.8.1`.
- "601 `.tsx` files load zero React or a11y rules" is false. `eslint --print-config` on
  `apps/web/src/App.tsx` reports **82 active rules**, including **10 `react-hooks` rules**
  enabled earlier in this adoption. The true zeros are `jsx-a11y` (0) and `react/` (0);
  the 601 file count is correct.

The pattern is the one already recorded here in the other direction: a figure that
crosses a repository boundary keeps its value and loses its subject, and the subject was
the only part that made it true.

## A duration is silent about shape

The workflow pin history reported 89 non-compliant commits of 209 (42.6%), then --
after an earlier finding that a count cannot distinguish seven minutes from four days
-- 62d 19h of 160d 6h (39.2%). Both figures are correct and both are silent about the
same thing.

**finance has three non-compliant episodes, not 89.** Five state transitions, and one
episode holding 83% of all exposure:

| Episode                  | Duration   | Share of exposure |
| ------------------------ | ---------- | ----------------- |
| 2026-03-05 -> 2026-03-08 | 2d 10h     | 3.8%              |
| 2026-06-10 -> 2026-06-16 | 6d 0h      | 9.6%              |
| 2026-06-17 -> 2026-08-09 | **52d 6h** | **83.2%**         |

Ninety regressions and three episodes have opposite implications for the decision the
number is consulted for -- whether a gate is warranted, or whether one already worked --
and neither the count nor the duration separates them. The episode count does.

This was reported to the engineering session as "89 scattered across 209". The word
_scattered_ was a claim about shape, made by an instrument that measured only count and
time. It was wrong: the distribution is the opposite of scattered. Nothing in the
existing output would have contradicted it, which is the whole problem -- **an
instrument may only accuse in the vocabulary it actually measured**, and _scattered_ was
not in its vocabulary.

The compliant streak is now printed for a related reason: a low transition count invites
"the practice stuck", and finance's streak is 4d 0h against a 52d lapse. The tool also
states what it cannot see -- whether a streak reflects enforcement or habit. Here it is
enforcement (`workflow:security:check` gates every pull request), but the tool has no
way to know that and does not infer it.

### Two latent regex defects, one masking the other

Reconciling a scratch probe against the shipped tool produced a one-commit disagreement
-- 90 against 89 -- and both programs turned out to be wrong:

- The probe over-matched **`statuses: read`**, because `statuses:` ends in the literal
  `uses:` and the pattern had no word boundary.
- The shipped tool had the _same_ missing boundary, and was protected from it only
  because it also required an `@`. That requirement was itself a defect: a `uses:` with
  no ref at all resolves to the action's default branch and is the **most** unpinned form
  there is, and the tool could not report it at any severity.

Neither defect had ever produced a wrong answer, because each was masking the other.
There are 0 real ref-less `uses:` entries in this repository's history, so closing both
changes no count -- 89 and 62d 19h are unchanged after the fix, which is the evidence
that the fix was to the instrument and not to the verdict.

### Dead code is dead relative to the checks around it

This file already carried a note that the `./` guard for local reusable workflows was
removed after mutation testing showed nothing failed without it. That finding was sound:
those paths carry no `@`, so the old pattern skipped them anyway.

Counting a missing `@` **revived the guard**. There are 8 local reusable calls at HEAD,
and without the exclusion every one would now be reported as an unpinned action. A
mutation result is evidence about the suite and the surrounding logic _as they stood_,
not a permanent property of the line -- so a later change in strictness can turn dead
code live again, and nothing re-runs the old reasoning to notice.

### The same illustration-versus-test failure, twice in one function

The new boundary was first written `[\s-]`, to admit the `- uses:` form, with a test
that looked like it covered the dash. Mutation testing removed the `-` and the test
still passed: there is always a space between the dash and the keyword, so `\s` had been
doing the work. That is precisely the failure the file already documents about the `./`
guard, recurring in the same function two revisions later. The test now says explicitly
what it does _not_ establish.

### A retracted probe's figures survived in prose

Both numbers in this section's first draft came from the over-matching probe -- "ninety
non-compliant commits" and "86% of all exposure" -- and stayed in the tool's own
docstring and printed output after the probe had been retracted and its defect
identified. The summary is the artifact with no checker; that has been recorded here
before, and it recurred inside the change that recorded it.

## Specificity is a property of the claim, not of the instrument

A sibling session retracted its own claim that content moving between files -- while both
paths stay valid -- is unreachable by any checker. An **anchor** check sees a subset of it:
when the citing link names a section, renaming that heading breaks the fragment.

That retraction exposes an axis distinct from the three used elsewhere in this guide. _Which
files_, _which point in time_, and _which direction_ are all scope of **measurement**. This
one is scope of the **claim**, and it sits upstream of all of them: a link naming only a file
asserts "this file is relevant", which almost no content change falsifies. No improvement to
any instrument reaches an assertion that vague -- the only fix is to write a more specific
link.

Measured over finance:

|                                        | count | share     |
| -------------------------------------- | ----- | --------- |
| relative `.md` links                   | 3353  |           |
| naming only a file                     | 3095  | **92.3%** |
| naming a section                       | 246   | 7.3%      |
| pointing at a file that does not exist | 12    | 0.4%      |

finance is materially less specific than the sibling repository (92.3% fragmentless against
81%), and before this change the 7.3% that was checkable-in-principle was checked by nothing.
Three anchors were stale, each the exact case the sibling had called invisible:

1. A heading renamed (`npm run ci:check` dropped from a pain-point title).
2. A document dropping its section numbering.
3. `docs/legal/ccpa-notice.md` pointing at `privacy-policy.md#10-data-retention` after
   retention moved to section 8. Section 10 still exists -- it is now "Your privacy rights" --
   so the link is not obviously wrong to a reader skimming the source, and a CCPA notice
   directing someone to the wrong section of a privacy policy is the one instance here with
   consequences outside the repository.

### The instrument was wrong three times before the documents were wrong once

The probe reported **95** stale anchors, then **6**, then **3**. Both corrections were to the
slugger, not to the docs:

- **`\s+` against `\s`.** GitHub replaces each space individually, so removing an em dash
  leaves the two spaces around it and renders a _double_ hyphen. Collapsing runs mis-slugged
  **89** valid links. This surfaced only because the first case checked by hand was linked
  from its own target file's table of contents -- the target was asserting the anchor that the
  probe called stale.
- **U+FE0F.** GitHub strips a warning-sign glyph from a heading but keeps the variation
  selector, so the real anchor begins with an invisible character. Stripping it cost a
  further **3**.

96.8% of the first number was instrument error. The general form is worth recording: **an
anchor checker is exactly as good as its slugger's agreement with the renderer, and a wrong
slugger does not look wrong.** It emits real file paths and plausible anchors, and every entry
survives a skim. Both cases are now pinned by tests and killed as mutants, because neither is
recoverable by reading the code.

### What the check now prints

`tools/check-doc-links.mjs` verifies anchors and prints the specificity split on both the
passing and the failing path. The split is published deliberately: a green result that does
not state that 92.3% of links assert nothing checkable reads as "the documentation is
verified", which is a stronger claim than the evidence supports. `STALE_ANCHOR_BASELINE` is
empty and asserted in tests as a literal rather than as its own length -- a ratchet phrased in
terms of itself moves when the constant moves.

Both failure axes are reported before the process exits, rather than the first one found.
Failing on broken paths alone would let them mask every stale anchor; the reader would repoint
the paths, see green, and conclude the anchors had been checked all along.

## The printed sentence is the half with no assertion

A sibling session generalised a defect of mine -- an interpolated count that was wrong while
every test stayed green -- into a claim about both trees: _every scope line we have added is
a string, and strings are the part nobody writes assertions for._ Measured across
`tools/*.mjs`:

|                                          | count | share     |
| ---------------------------------------- | ----- | --------- |
| printed lines total                      | 207   |           |
| inside `main()`, unreachable by any test | 116   | **56.0%** |
| in exported functions                    | 91    | 44.0%     |

Of the 64 printed sentences in `main()` that interpolate a value, **60 have no assertion
anywhere**. The three biggest contributors are the three most recently written tools, all
added by this work: pin-history (36), upstream-refs (24), doc-links (22).

The measurement is heuristic -- it matches literal fragments between a tool and its test file
-- which is exactly why it is reported rather than gated. A gate over a population this
loosely defined is the decoy pattern this guide warns about elsewhere; the census establishes
that the population is large, and that is all it is being asked to do.

> **RETRACTED.** The `64 / 4 / 60` triple above is withdrawn in full. It is not a fact about
> this repository. See _Two instruments sharing a defect agree perfectly_ below for the
> replacement figure and the method that produced it. The paragraph is kept rather than edited
> because the retraction is the finding.

### The hazard was documented in a comment and still had no test

`check-doc-links.mjs` printed two verdicts carrying both an occurrence count and a
distinct-target count, which differ here (12 and 9). A comment from an earlier fix already
spelled out the risk of confusing them -- report twelve gaps against a nine-entry list and
invite the wrong correction. Swapping the two interpolations left the whole suite green.

The report is now an exported `reportLines()` and the sentences are asserted. Both swaps are
killed as mutants, along with a mutant that returns early on broken paths and so masks every
stale anchor.

### Two fixture defects found while writing those tests

- **The fixture encoded the wrong noun.** `distinctBroken` counts distinct `file -> href`
  pairs, not distinct target documents, so `['a.md -> gone.md', 'b.md -> gone.md']` is _two_
  distinct entries, not one. The test failed, and the code was right: I had reproduced the
  wrong-noun error inside the test written to catch the wrong-noun error. The corrected
  fixture has one file citing one missing target twice.
- **A symmetric fixture proves nothing.** With `fixed` empty, the subtraction in
  `${baselineSet.size - fixed.length}` is invisible and a mutant deleting it survived --
  which it did, until a case with one fixed and one still-broken baseline entry existed.
  Same shape as a 7/7 fixture that cannot tell "prints both halves" from "prints one half
  twice": realistic and discriminating are independent properties.

### A disclaimer and a finding have opposite safe directions

From the same exchange, worth recording as a rule: when a tool marks a region as
_unmeasured_, an error that **shrinks** that region is a false-assurance error, because
everything outside it is implicitly asserted to have been checked. For a finding the
conservative direction is to under-claim; for a disclaimer it is to over-claim. The two
polarities are mirror images, and a scope line is a disclaimer.

### A glob is not a footprint

The sibling found a scratch file matching their cleanup glob that was not theirs, and
retracted every prior "zero remaining" as true by timing rather than by scope. Checked here:
the repository tree holds no `zz*` files, but `TEMP` holds three, only one of which is even
plausibly agent scratch (`zz_ub.mjs`, not mine) -- and the other two, `ZzM3rUJ-I3BzFBQS8mYQf`
and `ZZOyenCWeBDMeOtIncHNE`, are one-byte files with randomly generated names that match
`zz*` **only because Windows globs are case-insensitive**.

So the population of that glob is not "my scratch files" but "anything whose name happens to
start with two z's, in any case, on a shared machine". The correct claim names the files
created and removed, not a pattern.

## A test that recomputes its rule reports agreement about a question nobody asked

A sibling session found a coverage test whose expected values were the checker's
own expressions — one written `known.has(id)`, the other
`baseline.uncovered.includes(id)`. Both files agreed, the suite was green, and
changing the rule in the checker would have left the test computing the old rule
and passing.

Finance has ten tool/test pairs. Measured:

|                                  |       |
| -------------------------------- | ----- |
| tool/test pairs examined         | 10    |
| lines sharing a normalised shape | 4     |
| input construction               | 4     |
| **rule reimplementation**        | **0** |

The four are a `readdirSync(...).filter(...).sort().map(...)` chain that two test
files use to load workflows before calling the real scanner. Duplicated input
construction is cheap and honest; the defect is a duplicated _decision_.

`tools/check-test-independence.mjs` gates it. Four things it taught, none of
which were the result:

**A length threshold excluded the shape it was written to find.** The first
probe skipped shapes under 22 characters as noise, and the sibling's pair
normalises to a 19-character shape. Its self-test asserted
`shapeOf(a) === shapeOf(b)` and passed — while the pipeline dropped both lines
before they ever reached that comparison. The assertion tested a _function_; the
claim was about a _pipeline_. An instrument's self-test has to run the
instrument, not its components.

**The classifier's population was the line; the decision was the statement.**
`classify()` looked for a filesystem read on the matched line and called
everything else a reimplemented rule. Method chains put the read on one line and
the traversal on the next, so two of four matches were reported as rules when
both were continuations of a `readdirSync`. Note the polarity: a _disclaimer_
that shrinks is a false-assurance error, but a _classifier_ that over-reports is
a false accusation. Both are wrong-population errors and they fail in opposite
directions.

**A normaliser needs a matched pair of assertions.** The identifier regex
originally wrote `[\w$.]*`, which swallowed the dot and consumed
`uncovered.filter` as one token — so the keep-word list never fired for a method
call and `filter` and `map` shared a shape. Excluding the dot fixed that and
immediately broke the sibling's pair, because `known` and `baseline.uncovered`
stopped matching. Both properties have to be asserted together:
`() => ''` satisfies every must-match test, `identity` satisfies every
must-differ test, and neither is a normaliser.

**The symmetric fixture came back one PR later.** A mutant swapping the input
and rule counts survived, because the fixture held exactly one of each.
[The previous section](#the-printed-sentence-is-the-half-with-no-assertion)
records the same defect, and the fixture was rebuilt in the same shape while
that text was in the repo. Knowing a defect class does not prevent instantiating
it: the symmetric fixture is the one that looks careful.

### The checker failed itself, and only in CI

The first push was red. `check-test-independence` reported one reimplemented
rule, in `check-test-independence.test.mjs`:

```
const rules = result.matches.filter((match) => match.kind === 'rule');
```

character-identical to the line in `reportLines()` that owns that decision. The
test written to prove the tree had no reimplemented rules was one — the whole
defect class, instantiated inside its own detector, on the first run that could
see it.

That qualifier is the second finding. It passed locally and failed in CI because
`census()` enumerates with `git ls-files`, and both new files were untracked
until the commit. **The instrument was outside its own population while being
tested.** Local runs counted 10 pairs; CI counted 11. Nothing was wrong with
either run — they were answers to different questions, and only one of them was
the question.

Any tool that discovers its input from version control is blind to itself until
committed, which is precisely the window in which it is being written. The fix
was to assert through `reportLines()` — using the tool's own classification
rather than recomputing it — which is the remedy the tool exists to recommend.

## Four gates were invoked by nothing

Wiring the new checker meant reading how the others were wired, which produced a
worse finding than the checker did. Of fourteen `*:check` scripts, a census of
workflow invocations returned:

|                      |     |
| -------------------- | --- |
| `*:check` scripts    | 14  |
| named in a workflow  | 7   |
| named in no workflow | 7   |

Three of the seven are explainable — `format:check` runs inside `lint`,
`ci:check` is a local aggregate, `agent:check` is a pre-push helper. One was a
false positive: `ai:manifest:check` **is** enforced, by its own workflow calling
`tools/check-ai-manifest.js` by path, which a matcher looking for `npm run` could
not see.

That leaves two real ones: `upstream:refs:check` and `docs:links:check` — both
built here, both described in six successive reports as gates, and neither run
by any workflow. Every "all gates green" statement in those reports was a claim
about _running them locally_, not about enforcement, and the distinction was
never stated because it was never noticed.

This is the sibling's own finding — a checker its owning repo never executes —
arriving in this tree by the same route: the script exists, `npm run` proves it
passes, and nothing distinguishes _passes_ from _is required to pass_. All three
are now steps in `ci-lint.yml`.

The general form is worth keeping: **a gate is a workflow step, not a script.**
Registering a `package.json` entry produces something that behaves identically
to a gate every time a human runs it, and identically to nothing the rest of the
time.

## A compliance percentage over an open interval improves while nobody acts

A sibling session published its workflow-pinning exposure twice — `56.8% of
5d 1.2h`, then `55.7% of 5d 4h` — with the same 17 commits, the same 7 dirty,
and no push in between. The span had grown because the newest interval ends at
the reading time.

The same is true here, and finance has enough history to make it stark:

| reading time   | exposure  | numerator moved | denominator moved |
| -------------- | --------- | --------------- | ----------------- |
| today          | **39.2%** | —               | —                 |
| +30 idle days  | 33.0%     | no              | yes               |
| +90 idle days  | 25.1%     | no              | yes               |
| +365 idle days | **12.0%** | no              | yes               |

Nothing happens in any of those rows. A clean HEAD freezes the numerator while
the denominator grows, so **the repository improves its own compliance score by
waiting** — and an unpinned HEAD makes the number worsen the same way, which is
the direction everyone assumes it has.

The report already said the final interval "grows until the next commit
touching this directory." That sentence is true, it was written deliberately,
and it is not the finding. It states the _mechanism_ and omits the
_consequence_: that the percentage moves, and which way. This is the
false-assurance polarity again — [a disclaimer that shrinks over-claims](#a-disclaimer-and-a-finding-have-opposite-safe-directions),
and so does one that explains a caveat without saying what it costs. The reader
is told enough to trust the number and not enough to date it.

Three changes:

- an explicit `as of <ISO>` stamp, so two runs are comparable and a difference
  between them is not by itself evidence that anything changed;
- a **closed** figure measured to the newest commit rather than to now, which is
  a function of history alone and does not drift;
- the drift itself, printed with a direction: `open figure falls 6.2 pts per
30 idle days`.

### The new statistic printed `0h of 0h` and nothing objected

The first wiring returned the closed totals from `exposure()` but never
propagated them through `censusHistory()`, so the report interpolated
`undefined` as zero and printed `closed history only 0h of 0h (0.0%)`. A
brand-new statistic reading exactly zero, rendered identically to a real zero,
in a tool whose whole subject is figures that mislead. It now throws when a
closed span is zero across more than one commit, because that is not a clean
history — it is an unwired one.

### The live tree could not have caught it

The gap between the open and closed spans is currently **455 seconds**, because
the newest commit touching `.github/workflows` is the PR that shipped the
previous checker, minutes earlier. Any error in the closed span would be
invisible against this tree today; the two figures converge right after a commit
and diverge as the repository idles.

So every discriminating assertion is synthetic, and that is not a compromise.
The sibling's phrase for it is exact — **a tree is a fixture nobody chose** —
and this one was made non-discriminating by the previous commit in this same
session.

Four mutants survived the first suite, all of them because the fixture had a
clean HEAD, where the open interval contributes nothing to the numerator either
way. One of the four survived an assertion written specifically to guard the
wiring: `assert.notEqual(closed, open)` passes for a mutant that never accrues
closed time at all, because zero is also unequal to the open figure. **An
inequality distinguishes a value from exactly one other value**, which is nearly
the weakest claim an assertion can make while still looking like a check.

## The largest link class in the repository was never checked

A sibling session tested its anchor checker's slugger against GitHub's and found
it wrong on 42 headings — while still returning a correct `0 stale`, because
none of the 42 was a link target. Their conclusion: **a clean anchor result is
evidence about the intersection of the instrument and the corpus, and neither
factor appears in the output.**

Running the same test here found the identical structure with the polarity
reversed. `collectLinks` discarded every href beginning with `#`:

```
cross-file .md links (checked)   3353
  with #fragment                  246
same-file #anchors (SKIPPED)     2799   <- 11.4x the checked fragment population
  unresolvable                     29
```

Same-file anchors are not a marginal class. They are the largest one, and they
are the _most_ falsifiable kind of link in the repository: a `[text](#section)`
link names a section and nothing else, so any rename or renumber breaks it with
no path change to make the break visible. The checker skipped exactly the
population its own scope note called the only kind worth resolving.

### One of the 29 was mine, merged an hour earlier through 37 green checks

```
docs/guides/engineering-practice-adoption.md:8459
  link    #a-disclaimers-safe-direction-is-the-mirror-of-a-findings
  heading "A disclaimer and a finding have opposite safe directions"
```

Not a slugger fault. I wrote the anchor from the section's _concept_ rather than
from its heading, never checked it — and then told a sibling session that this
gate verified it. The claim and the defect were in the same message.

### `slugify` had a third defect, of the family documented in its own header

`.trim()` ran _after_ the punctuation strip. GitHub trims the raw heading, so
punctuation removed from the front leaves its space behind:

| heading                 | GitHub              | before            |
| ----------------------- | ------------------- | ----------------- |
| `## 🚀 Getting Started` | `#-getting-started` | `getting-started` |

The header comment above that function already documented two defects of exactly
this shape — the `\s+` collapse that mis-slugged 89 valid links, and the U+FE0F
strip that mis-slugged 3 — and stated that both were covered by tests. The third
was four lines below that note.

It had never fired. The only links that exercise it are same-file anchors, which
the checker did not read. **The defect and the checked population did not
intersect**, so the instrument was wrong and the verdict was right, and nothing
in the output distinguished that from being correct.

### The split, once both were fixed

```
headings                    13097
  slug differs under fix      164
same-file anchors            2799
  broken, CURRENT slugger       29
  broken, FIXED slugger         22   <- genuinely stale
  false positives retired        7   <- all docs/INDEX.md emoji headings
```

16 of the 22 were numbered-section anchors — `#11-test-plan`,
`#implementation-readiness` — broken by _renumbering_, not renaming. That is the
sharp end of the sibling's specificity ordering: `#11-test-plan` is more
falsifiable than `#test-plan`, and therefore breaks more often, because the
number it carries tracks a rendering artifact rather than an identifier under
any versioning discipline. **More falsifiable is better only when the thing
tracked is stable.** An `ENG-*` ID sits at the other end: equally specific, and
stable by ratification.

Two of the remaining six were not stale anchors at all but dead table-of-contents
entries naming sections the document no longer contains — a link can be
unresolvable because the _target_ moved or because the _citation_ was never true,
and the checker cannot tell those apart.

### The success sentence understated itself by a factor of twelve

With all 22 fixed the green line read:

```
All 246 section-naming link(s) resolve to a heading that exists.
```

3,042 links had been resolved. The interpolated count was the old population,
the sentence was newly written, and every test over it passed — the printed-half
defect again, in a sentence ten minutes old.

Worth naming the direction: an **understated** success line reads as modest.
Nothing about "246" invites a second look, where "All 3,042" would have been
checked by the first reader who thought it sounded high. The same asymmetry as a
disclaimer that shrinks — see [A disclaimer and a finding have opposite safe directions](#a-disclaimer-and-a-finding-have-opposite-safe-directions)
— and this repository has now produced it on the failing path, the scope path,
and the passing path in three consecutive weeks.

Both anchor populations are now named separately in the report and in
`scopeLines`. Folding same-file anchors into `checkedAnchors` would have been the
tidier code and would have moved the specificity ratio from 92.3% fragmentless to
something far more flattering — **a scope line that improves when you fix
something is not measuring what it claims to.**

12 mutants, 12 killed. The two that initially survived were both in `scopeLines`,
where the assertions checked the share and not the residual: over the wrong
denominator the residual reads `6 point at a file that does not exist` instead of
`0`, which is a plausible number naming nothing real.

## Two instruments sharing a defect agree perfectly

The upstream engineering session ran our report-assertion heuristic on its own tree and got
`64 / 4 / 60` -- digit for digit, over a **different population** (theirs was not restricted to
`main()`). Three matching integers across two definitions is not corroboration. It is a property
of the shared instrument.

Their sensitivity sweep on the one arbitrary constant, the minimum fragment length, settles it:

| min fragment | 4   | 8   | 12  | 16  | 20  |
| ------------ | --- | --- | --- | --- | --- |
| matched      | 8   | 5   | 4   | 2   | 0   |

The published `4` was the value at 12, a threshold chosen while writing the script and never
mentioned. **A metric whose numerator swings from 8 to 0 across a constant nobody chose has no
numerator.** What literal-fragment matching detects is whether a test happens to quote a static
_label prefix_, which is uncorrelated with whether it asserts the interpolated _value_.

Re-running the heuristic here reproduced neither figure: 36 sites, matched 3 to 1 across the same
sweep, against the published 64 and 4. So the denominator was not stable either.

This is the failure mode that cross-checking structurally cannot catch. Every earlier round in
this exchange worked _because_ the two instruments differed. Here they did not, and the result was
maximally convincing: agreement is the evidence both parties had been treating as strongest.

### The replacement is a direct measurement

`tools/check-report-assertions.mjs`. For each interpolation site on a report-building line,
substitute a sentinel for the interpolated expression and re-run that tool's own test file. A
green run means no test reads that value. There is no threshold.

It has its own arbitrary constant -- the sentinel -- so it gets the same treatment. Swept `${0}`,
`${-1}`, `${"MUTANT"}`, `${undefined}`: the caught **set**, not merely its cardinality, is
identical across all four. That sweep is what would detect a site whose true value coincides with
the sentinel, and it found none.

The first sweep was worthless and said so anyway. The `SENTINEL` constant was read from `argv`,
printed in the report, and echoed a different value on each of five runs -- but the substitution
line still used a hard-coded `${0}`, because the string replacement that was supposed to wire it
up silently matched nothing. Five runs, five sentinels printed, one measurement performed. **A
parameter echoed in the report is not a parameter used in the computation**, and echoing it is
what made the run look audited.

### The number, and why the first version of it was also wrong

| tool                                 | sites | caught | unasserted | `console.log` |
| ------------------------------------ | ----- | ------ | ---------- | ------------- |
| `check-doc-links.mjs`                | 30    | **30** | 0          | 0             |
| `citations-context.mjs`              | 5     | 5      | 0          | 0             |
| `check-citation-enumerations.mjs`    | 7     | **0**  | 7          | **0**         |
| `check-report-assertions.mjs`        | 16    | 13     | 3          | 7             |
| `check-test-independence.mjs`        | 7     | 5      | 2          | 5             |
| `check-workflow-security.mjs`        | 23    | 8      | 15         | 8             |
| `check-tool-imports.mjs`             | 12    | 3      | 9          | 6             |
| `check-gradle-prefetch.mjs`          | 17    | 3      | 14         | 4             |
| `check-node-version-consistency.mjs` | 50    | 9      | 41         | 6             |
| `check-upstream-refs.mjs`            | 37    | 5      | 32         | 24            |
| `check-workflow-pin-history.mjs`     | 32    | 3      | 29         | 46            |
| `verify-required-checks.mjs`         | 35    | 0      | 35         | 24            |
| **total**                            | 271   | 84     | **187**    |               |

The first run of this tool reported `80 / 19 / 61`. That was wrong by 3x, and the way it was
caught matters more than the correction.

After extracting three printers out of `main()` in this tool, the total dropped 85 to 82 while the
caught count stayed at 21. The three sites had not become asserted -- they had **left the
population**, because the site detector matched only `console.log(` and `.push(\``, not a template
literal that is returned or used as an array element. Array-literal template entries alone
outnumbered the entire counted population.

So the metric improved when something was fixed, for a reason unrelated to the fix. That is the
same defect as a scope line whose denominator shrinks when you repair the thing it measures, and
it was found only because the _direction_ of the change was implausible: an extraction that makes
a value assertable should move it from unasserted to caught, not delete it.

### Extraction is a precondition, not a remedy

The obvious reading of the table is that detection tracks report structure: you cannot assert a
value inside `console.log` without capturing stdout, whereas a value in a returned array is
trivially asserted. `check-doc-links.mjs` scores 30/30 with zero `console.log` calls because
PR #4288 extracted `reportLines()`/`scopeLines()` and left `main()` a thin printer.

`check-citation-enumerations.mjs` breaks it: **zero `console.log`, seven assertable sites, zero
asserted.** Extraction makes assertion possible; it does not make it happen. The correct claim is
that inline printing is a _hard_ barrier and extraction removes it, leaving an ordinary gap that
someone still has to close.

### Why this is reported and not gated

Not for the reason the retracted census gave. That one said "heuristic, therefore report-only",
which was true but is no longer the operative constraint -- this measurement is direct. The real
reasons are mechanical: it rewrites source files in place, and it runs for 31 seconds. It refuses
to start on a dirty `tools/` tree, restores every file in a `finally`, and requires a green
baseline per tool before mutating, because a red baseline makes every mutant look caught.

## The census chose its population by naming convention

The finding two sections up -- _Four gates were invoked by nothing_ -- was produced by a hand
census of the **14** `package.json` scripts ending in `:check`. Three things were wrong with it,
and the third is the one that matters.

### The population was a proxy

The root `package.json` has **62** scripts. Selecting the 14 ending in `:check` is selecting by
naming convention, which is a proxy for gate-ness -- and the proxy has a known exception inside
this very document: the documented gate list's **first entry is `eng:citations`**, which does not
end in `:check` and was therefore never in the census population. `type-check`, a required status
check, was excluded the same way.

Two populations, "scripts ending in `:check`" and "things this guide calls gates", were used
interchangeably for six sections without ever being reconciled.

### Absence was resolved by one route, so it was unfalsifiable

The matcher looked for `npm run <name>`. One false positive was already corrected in prose
(`ai:manifest:check` is enforced by path). The upstream session then hit the same class from the
other side: their matcher missed `npm test`, a **bare npm lifecycle**, which briefly implied their
repository ran no tests in CI. This repository has the identical construct at `ci-web.yml:144`.

Both false positives were caught by **collision with prior knowledge** -- one of us recognised an
orphan we knew was enforced. That is not a control. It is available only to a reader who already
knows the answer, which is precisely the reader who does not need the census.

`tools/check-gate-enforcement.mjs` resolves five routes and **reports which one matched**, so a
"reached" verdict carries its own evidence:

```
scripts in package.json     62
  invoked by a workflow     26
  same command runs, but     5
    not via the script
  reached by nothing        31
```

### An unreached script is not an unenforced check

This is the distinction the original finding collapsed. CI runs `npx eslint . --max-warnings 0
--cache` and `npx prettier --check .` **directly** -- never `npm run lint` or `npm run
format:check`. So those scripts are genuinely unreached _and_ the checks they perform are
genuinely enforced, by the required `ESLint & Prettier` context. Hence the third bucket.

The naive reading of the residue is also wrong. `lint` is `turbo run lint && npx eslint .
--max-warnings 0`, and `turbo run lint` appears in **zero** workflows, which looks like a gap in
package-level linting. It is not: root `npx eslint .` lints **2,301** files under `apps/web/src`,
so the turbo half is redundant rather than missing. Verified by counting the files ESLint actually
reports on, not by reading the config.

## The gate was enforced; the gate's correctness was not

Running the corrected census over test files rather than scripts produced the worse finding.

| tool tests                | count |
| ------------------------- | ----- |
| in `tools/`               | 472   |
| reachable from a workflow | 202   |
| reachable from nothing    | 270   |

No workflow ran the tools suite -- `node --test` appeared **zero** times outside individual script
bodies. A test file was enforced only if someone registered a `package.json` script _and_ added a
matching workflow step, so a new suite **defaults to unenforced**, and the default held for eight
of thirteen suites.

Among the unreachable: `check-doc-links.test.mjs`, 66 tests, whose checker `docs:links:check` is a
required gate wired at `ci-lint.yml:144`. The gate ran on every PR. Nothing verified the gate was
still correct. The slugger defects found earlier -- three of them, in one function -- are exactly
the class of regression those 66 tests exist to catch, and CI could not have caught a reintroduction.

Every **"468/468 tests pass"** reported to the sibling session was, for 270 of those tests, a
purely local result. Same shape as their finding that engineering's own citation checker is run by
no workflow in the repository that publishes it, and same shape as this guide's earlier discovery
that its scope lines were all on the green path: the claim was true, and enforcement of it was not
where the claim implied.

### The fix is structural, not a list of steps

Adding eight workflow steps would close today's gap and restore the default tomorrow. Instead
`tools/run-tool-tests.mjs` enumerates `tools/*.test.mjs` **from disk** and runs all of them in one
step, so a new suite is enforced by existing rather than by remembering.

The population is enumerated rather than passed as a shell glob deliberately: a glob that matches
nothing exits zero, and a green step over an empty population is indistinguishable from a passing
one -- the decoy pattern flagged in the sibling's `pins:check`. `assertPopulation` throws instead.

After wiring: **512 tool tests, 512 reachable, 0 unreachable.**

### One failure the suite step found and this section cannot explain

The first whole-suite run reported `pass 511, fail 1`. Four subsequent runs reported `512 / 0`, and
the failing test's identity was not captured before the output was overwritten.

Recorded as observed and unreproduced rather than fixed, because that is what is known. It does
argue for the step on its own: fifteen files run concurrently exercise cross-file interactions that
fifteen separate per-file runs cannot, and no per-file run had ever produced a failure. The
`test:independence:check` gate checks that a test does not reimplement its tool; nothing was
checking that a test does not interfere with another test.

## A constant that restates a number cannot notice the number is wrong

A sibling session measured `jrmoulckers/engineering`'s bounded assertions and reported a negative:
138 of its 154 `assert.ok` calls are genuine boolean predicates, not thresholds. But it also found
what made its ten real bounds good, and that part transfers:

```js
assert.ok(react.size >= 18, `docs claim 18 react/* rules; the preset enables ${react.size}`);
```

The number 18 was not invented. It came from **another artifact that had already committed to a
number** — the documentation. That turns an inequality into a two-artifact consistency check: it
can fail because the preset shrank _or_ because the docs went stale, and both are real defects. Its
formulation of the rule is better than "avoid inequalities":

> When you don't know the expected value, don't invent one; find the artifact that already asserts
> one. If nothing in the repository commits to a number, that absence is the finding, and an
> inequality papers over it.

Applied here, the census came back similar in shape — 129 of 173 `assert.ok` calls are predicates,
32 are existence checks, 12 are numeric bounds — and **all 12 bounds invented their number.** One of
them had a source available in the same file and ignored it.

### The defect

`tools/check-ai-manifest.js` sorts files into three comment families. `corpusBreadth()` exists to
report when the recorded corpus is too narrow to certify that three-way switch:

```js
const BREADTH_FLOOR = { families: 2, rootLevel: 1 };
```

Four lines above it, the rationale comment reads _"an assertion over one family certifies the switch
on a third of it."_ The finding message hardcodes `across 3`. The floor is 2.

Measured against the real lock (81 entries, all three families exercised):

```
drop 'hash'  -> families 2, findings 0
drop 'html'  -> families 2, findings 0
drop 'block' -> families 2, findings 0
```

**Deleting an entire comment family produced no finding.** The guard against certifying a fraction
of the switch could not detect the loss of a third of it.

Nothing caught this because everything that could have was self-consistent. The test pinning the
floor read `assert.ok(BREADTH_FLOOR.families >= 2, 'one family cannot certify a three-way switch')`
— a message naming three, a bound of two, and a pass. And one fixture was worse:

```js
// Two families clears the floor; the root-level arm is satisfied by AGENTS.md.
assert.deepEqual(corpusBreadth({ entries: { 'AGENTS.md': {}, 'agency.toml': {} } }), []);
```

That is the defect written down as expected behaviour, in prose, and asserted. An inequality
restating a constant cannot notice the constant is wrong, because the restatement is the only thing
it is checked against.

The fix is to derive: `families: FAMILY_SETS.length`. The bound now moves if a fourth family is ever
added, and the test asserts the derivation rather than the value.

### The general control, and its two wrong populations

`tools/check-assertion-bounds.mjs` enforces the rule syntactically rather than judging whether a
number is right, which no tool can do. A comparison against a bare numeric literal must be either an
existence check or carry an `unsourced-bound:` note saying what source was looked for. A bound
compared against an _expression_ never enters the population at all — that is the fixed form.

Its first run reported **49 unsourced bounds**, of which 40 were semver ranges inside string
arguments: `enginesAdmitsAbove('>=22.0.0 <23', '22')`. Data being handed to a parser, counted as a
threshold someone chose. Its second reported **14**, still counting `assert.ok(dirtySeconds >= 0)` —
a sign assertion, where zero is a boundary rather than a choice. The real number is **9**.

Both errors are the same one this repository keeps making: **a syntactic pattern is not a semantic
class.** The census that preceded this one picked its population by the `:check` suffix; this one
picked it by a regex. And `49 of 49` was the most impressive-looking number of the three.

The direction matters. A checker that over-reports is making a false accusation, and the specific
cost is that the annotations it forces become rubber stamps — the author writes `unsourced-bound:`
on a sign check, learns the marker is noise, and writes it on the next real one without looking.

### The checker exited 0 having done nothing

Its first invocation printed no report and exited 0. The CLI guard was

```js
import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
```

which yields `file://C:/...` where `import.meta.url` is `file:///C:/...`. Two slashes against three,
so `main` never ran. **A green run over an empty population** — the exact decoy the file's own
docblock argues against, manufactured by that file, and caught only because a report was expected
and none appeared. The repository already had the correct form, `pathToFileURL`, in two other tools.

Nine bounds now carry an annotation naming what was looked for and not found. That is not a fix; it
is the honest record of an invented number, which is the most this rule can ask for when nothing in
the tree commits to one.

### "All 16 gates green" was a claim over a population that excluded the new files

The commit passed all sixteen gates locally and failed `test:independence:check` in CI, which
flagged two lines of the new test file as reimplementing the tool they verify:

```
UNCLASSIFIED check-assertion-bounds.test.mjs:177 ~ check-assertion-bounds.mjs:255
  const unannotated = result.bounds.filter((bound) => !bound.annotated);
UNCLASSIFIED check-assertion-bounds.test.mjs:196 ~ check-assertion-bounds.mjs:205
  .filter((name) => name.endsWith('.mjs') || name.endsWith('.js'));
```

Both are real. The first recomputes the expression `report()` uses to reach its verdict, so the test
decides the answer and cannot notice the rule changing. The second reruns the extension filter it is
supposed to be checking.

The reason the local run disagreed is the interesting half. `check-test-independence.mjs` discovers
its input with `git ls-files tools/*.mjs`, and at the moment the sixteen-gate loop ran, both new
files were **untracked**. The gate could not see the only files that could have failed it.

This is precisely the finding the sibling session reported several rounds earlier — _any tool that
discovers its input from version control is blind to itself during exactly the window it is being
written in_ — which was acknowledged here, written into the guide, and then walked into anyway. The
local green and the CI red were both correct readings of different populations, and only one was the
question being asked.

So the report "all 16 gates green" was true and useless, in the same way "both checkers pass, exit
0" was. A gate run against a population that excludes the change under test measures the tree as it
was before the work started. The cheap correction is to `git add` before running gates rather than
after, which costs nothing and moves the untracked window to before the measurement instead of
after it.

The fixes are the ones the gate asked for: the verdict test now calls `report()` and asserts its
`ok`, and the enumeration test asserts properties — sorted, inside the directory, all real files,
includes itself, excludes `README.md` and `setup-branch-protection.sh` — rather than rerunning the
selection. A test that recomputes the selection agrees with itself whatever the selection becomes.

### The unexplained suite failure, now characterised

Last round recorded a single whole-suite run reporting `pass 511, fail 1` that four subsequent runs
did not reproduce, with the failing test's identity uncaptured. Recorded then as observed and
unreproduced. It reproduced this round at **1 run in 4**, and it is:

```
✖ a passing run states the scope   (check-workflow-security.test.mjs:403)
  AssertionError: The input did not match /\d+ workflow\(s\) scanned in /. Input: ''
  status: 0
```

Exit **0** with an **empty** stdout. Three things rule out the obvious explanations: the tool's CLI
guard is the robust `resolve(process.argv[1]) === fileURLToPath(import.meta.url)` form, not the
template-literal one that had just silently disabled a different tool; its exit path sets
`process.exitCode` rather than calling `process.exit`, so stdout is flushed on a natural exit; and
**40 isolated spawns produced 0 empty captures**. It only appears under the concurrent whole-suite
run, on Windows. That localises it to `spawnSync` pipe capture under heavy concurrent process
creation — a harness flake, not a tool defect, and one CI has not exhibited on `ubuntu-latest`.

It is not retried. A silent retry would convert a visible 1-in-4 into an invisible 1-in-16 and
report the same green either way. What was added instead is a `detail` string carrying `status`,
`signal`, `error`, stdout length and stderr, attached to every assertion in the test — so the next
occurrence explains itself rather than requiring the whole diagnosis to be re-derived from a bare
regex mismatch.

The general point is about what an unreproduced observation is worth. Last round the honest options
were to drop it or record it; recording it cost one sentence and made this round's reproduction
recognisable within seconds instead of being greeted as new. **An intermittent failure you have
written down is a different object from one you have not**, even while both remain unexplained.

## A filter applied before the census is invisible to every number the census prints

`check-doc-links.mjs` is a required check. Its link collector opened with:

```js
if (!target.endsWith('.md')) continue;
```

Every relative link to a non-markdown file was dropped **before it was counted**. Not excluded
from resolution — excluded from the population. It appeared in no total, no scope line, no
finding, and no disclaimer. Measured:

```
counted .md links (the reported total)   3353
DROPPED non-.md relative links           1110
  .kt 470   .swift 341   (dir/none) 126   .ts 68   .tsx 22
  .yml 17   .sql 14   .example 10  .yaml 8   .xml 8   and eight more
```

**22 were broken.** The gate had never been able to see them, and had been green for months.

The scope line is the part worth dwelling on. This tool prints its population deliberately, on
both the passing and the failing path, because a control that reports its reach only when it
passes cannot be distinguished from one that measured nothing. That machinery worked exactly as
designed and reported `3353 markdown link(s)` — a true sentence about a population that a filter
three functions upstream had already halved. **A scope line is computed from what the census
saw, so it cannot disclose what was removed before the census began.** Every honest-reporting
discipline in this file was downstream of the dishonesty.

### The test asserted the defect, and its name is what did the damage

```js
test('non-markdown targets are out of scope', () => {
  const { links } = collectLinks('[x](./a.png) [y](./b.ts)');
  assert.equal(links.length, 0);
});
```

Green from the day it was written. A test can only ever confirm that the code does what the code
does, and this one did that faithfully.

What made it harmful was the **name**. "Out of scope" is the vocabulary of a considered boundary
— a decision someone weighed and recorded. Anyone asking whether the 470 `.kt` and 341 `.swift`
links were checked would have found this test and read an authoritative no. It converted an
unexamined `continue` into a documented policy, and it did so in the one artifact a reader trusts
most, because a passing assertion sits next to it.

The general form: **a test name is a claim about intent, and nothing checks it.** The assertion
is verified continuously; the sentence describing why is verified never. When the two drift, the
sentence wins every argument, because it is the one a human reads.

### 62 reported, 22 real — and the 40 are why precision is not a nicety

The first census said 62 broken. Forty of those were GitHub's repo-relative idiom:

```
[#2609](../../issues/2609)     [#44](../../pull/44)     ../../tree/main/apps
```

GitHub resolves these against the repository, not the file tree. They are correct as written, and
reporting them would be a false accusation at a 65% rate.

That is not merely noisy. The fix for a false positive is an exemption — a baseline entry, an
annotation, an ignore comment — and an author who has learned the checker cries wolf writes the
exemption without reading the finding. **A checker's precision is what keeps its own escape hatch
meaningful**, so an over-reporting gate degrades into a rubber stamp and takes its true positives
with it.

### Moved, versus never true

The 22 split three ways, and the third class is the interesting one:

| class                                                                            | n   | fix      |
| -------------------------------------------------------------------------------- | --- | -------- |
| off by one `../` — target exists at repo root                                    | 16  | repoint  |
| `account-deletion/` — removed in `087b812c` as deprecated, now `account-delete/` | 4   | repoint  |
| `fire-calculator.ts` — **never existed**                                         | 2   | baseline |

`fire-calculator.ts` reads exactly like a rename of the neighbouring `fire-planning.ts`, and
repointing it there would have turned the gate green in one keystroke. It would also have been
false: `calculateFINumber` and `calculateCoastFI`, the functions the citing tables describe, exist
nowhere in this repository. The design document specifies a web reference implementation that was
never built.

Any resolver reports _moved_ and _never true_ identically, and only the first is a regression.
The second is a claim that was false when written, which is a different defect with a different
fix — and the tempting repair is the one that destroys the evidence. **A link that is red because
the thing does not exist is doing its job**; the correct response is the baseline, which records
the gap without pretending it is closed.

### The disclaimer had to move with the reach

The scope line ended with `Not measured: URL targets, links to non-markdown files, ...`. True
when written, false the moment those 1,110 links were checked.

A stale disclaimer fails toward **false assurance**: it under-claims, which reads as caution, so
nothing about it invites a second look. That is the opposite polarity from a stale finding, and it
is why the disclaimer is now asserted — a test fails if the sentence still disclaims a population
the tool checks. Prose that describes coverage has to be edited in the same commit that changes
coverage, and the only way to make that reliable is to let it fail the build.

### Measured negative

The upstream session found its own link probe skipped fenced blocks when collecting **headings**
but not when collecting **links** — fence-blindness as a property of a _traversal_ rather than of
a tool, with two traversals in one file and only one guarded. finance does not have this:
`headingSlugs` and `collectLinks` both consume the shared `markFences`. Recorded as a negative
rather than reshaped into a symmetric finding.

## Whether a check runs and whether its report is checked are independent properties

A sentinel mutation sweep over the 15 tools in `tools/` that have a colocated test file — replace
each interpolated value in a report line with a sentinel, re-run that tool's tests, record whether
anything fails — scored **103 of 305 interpolation sites asserted**. Crossed against whether a
workflow invokes the tool, all four quadrants are populated:

|                | asserted (>=50%)                                                                                                  | unasserted (<50%)                                                                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **runs in CI** | `check-doc-links` 100%, `check-test-independence` 71%, `check-gate-enforcement` 64%, `check-assertion-bounds` 50% | `check-workflow-security` 35%, `run-tool-tests` 33%, `check-tool-imports` 25%, `check-node-version-consistency` 18%, `check-gradle-prefetch` 18%, `check-upstream-refs` 14%, `verify-required-checks` 0%, `check-citation-enumerations` 0% |
| **inert**      | `citations-context` 100%, `check-report-assertions` 81%                                                           | `check-workflow-pin-history` 9%                                                                                                                                                                                                            |

The two best-asserted tools in the repository are both unwired. Two required gates score zero. So
"inert" — which this repository has used as a single summary judgement — is two claims wearing one
word, and they have different remedies: an unwired tool needs a workflow step, an unasserted one
needs a callable report surface. `gate:enforcement` measures the first axis and nothing measured
the second, so a tool could be fixed on the axis that was watched and stay broken on the axis that
was not.

### The tool that measures this withheld the data that shows it

`check-report-assertions.mjs` printed an aggregate ratio and a flat list of survivors. It did not
print the caught list — so **its own output could not be decomposed per tool**, and building the
table above required a bespoke probe against the exported `measure()`. The aggregate 34% is
compatible with every tool sitting near 34% and with the actual distribution, which is bimodal and
has two zeroes in it. A report that publishes a ratio while withholding its components cannot
support the finding it exists to produce, and here the specific finding it suppressed was that the
two axes do not correlate.

This is the scope-line rule turned one notch further. A scope line discloses the population a
number was computed over. It does not disclose that the number is an average over a population
whose _variance_ is the whole story.

### Both zeroes were structural, and neither was a weak test

`verify-required-checks.mjs` exported two predicates and built all 35 of its sentences inline in an
async polling loop that reaches the GitHub API. `check-citation-enumerations.mjs` exported its
predicates and wrote its report straight to `process.stdout` from a function that walks the real
tree. Neither scored 0% because someone wrote a lax assertion — they scored 0% because **there was
no callable surface to assert**. Extraction is the precondition for assertion; the earlier note in
this guide that extraction is not itself a remedy remains true, and both halves are needed: the
extraction here bought nothing until a test read the interpolated values.

Both are worth asserting for the same reason. `verify-required-checks` is the deploy gate: its
lines are the durable record of _why_ a SHA was promoted or refused, and an unasserted report can
degrade to naming the wrong SHA or the wrong conclusion while the exit code stays correct.
`check-citation-enumerations` reports a three-bucket partition whose third bucket — exempted lines
— is the only one that can hide a violation.

Cites `ENG-TEST-004`, `ENG-OBS-005`.

## The run that leaks a fixture passes; the next run inherits a red suite and a wrong diagnosis

Three untracked files — `PROBE-4300-text.md`, `PROBE-4300-binary.md`, `PROBE-4300-oversize.md` —
were found at the repository root. With them present the tool suite is **586/591 with 5 failures**;
delete them and it is **591/591**. They are fixtures created by `check-ai-manifest.test.mjs`.

The fixtures were created with `{ flag: 'wx' }` (exclusive create) **outside** the `try` whose
`finally` deletes them. `finally` survives an exception but not process termination, so a run
killed between the writes and the cleanup leaves them behind — and on the next run the `wx` write
throws `EEXIST` _before_ control enters `try`, so the cleanup can never run again. Two consecutive
runs produced byte-identical `93 tests / 88 pass / 5 fail` with the files still present after each.
**Only a manual delete exits the state.**

Two properties make this worse than an ordinary flake.

**The polarity is inverted.** The run that leaks exits green. Every subsequent run fails. So the
signal arrives at the party with the least information — someone who pulled, ran the suite, and
changed nothing — and never reaches the party who caused it.

**The diagnosis names the wrong thing.** The five failures are assertions about citation-ownership
rules (`the PRODUCTION predicate ... distinguishes owned from received`). Nothing in the output
mentions a stray file. A reader debugging that output is reading about the tool's semantics while
the cause is three bytes of filesystem state.

### Making the latch impossible removes a signal, so the signal has to be added back deliberately

The fix gives each fixture a per-process name (`pid` + timestamp), moves the writes inside the
`try`, and cleans up with `rmSync({ force: true })`. Verified: with all four _old_ fixed names
planted at the root, `check-ai-manifest.test.mjs` is now **93/93** where it was 88/93.

But that is exactly the point worth recording. A leaked file used to be loud — wrongly attributed,
but loud. Unique names make it silent: it now sits in the tree affecting nothing. So the same
change that removes the latch also removes the only thing that ever reported it, and the honest
response is not to celebrate the green but to add the report that was missing.
`run-tool-tests.mjs` now runs `leakedArtifacts()` **before and after** the suite: it refuses to
start on an inherited leak, and it **fails the run that creates one**, naming the files in both
cases and distinguishing the two, because they call for different actions.

A cleanup that depends on the process reaching a later line is not a cleanup, and `finally` is a
later line.

## A citation in a failure message is not a binding — and the retraction that followed

A sibling session retracted a claim that `jrmoulckers/engineering`'s bounded assertions "source
their expected value from an artifact that already committed to one." They _transcribe_ it:
mutating the cited doc to claim 99 left the suite at 402/402, exit 0. The general rule stated here
— _when you don't know the expected value, find the artifact that already asserts one_ — needs a
second clause: **and re-derive it from that artifact at check time**, or the citation is decoration
on a hardcoded constant.

**This section previously recorded that the same defect reproduced in
`tools/check-assertion-bounds.mjs`. That claim was wrong and is withdrawn.** Probed directly rather
than reasoned about:

```
citation-in-message, no marker         bounds=1 flagged=1
citation in comment above, no marker   bounds=1 flagged=1
```

Both are flagged. The checker has no "sourced literal" acceptance path at all. Its only non-marker
acceptance is comparing against an _expression_, which removes the literal and therefore genuinely
binds. I had read the report's advice — "compare against the artifact that already commits to the
number" — as describing a category the tool recognises, when it describes the shape that leaves the
population entirely. The failure was assuming a defect reproduced because the two tools share a
subject, which is the same mistake as assuming two instruments agree because they share a method.

## A checker's escape hatches are the part nobody tests

Probing the **acceptance** path instead found three real defects, all of which had passed since the
tool was written:

```
marker only inside a string literal    annotated=1   <-- data excused a real bound
marker in the assert message itself    annotated=1
bare marker, nothing after it          annotated=1   <-- recorded nothing, discharged the duty
```

1. A bare `unsourced-bound:` was accepted. The file's own docstring says the annotation "forces the
   author to record which artifact they looked for and failed to find"; an empty one satisfies the
   grep and records nothing — the rubber stamp the same file warns an over-reporting checker
   produces.
2. `comparisons()` strips literals because "a syntactic pattern is not a semantic class."
   `hasMarker()` did not. So the marker appearing as _fixture data_ annotated any bound within four
   lines. The tool applied its own stated principle in one direction only.
3. The recommended fix was never counted. The green line read _"Every bound is annotated or
   derived"_ and then printed only the annotated count. Derived bounds were asserted to exist and
   never measured, so the sentence read identically whether every bound derived its constant or
   none did. Measured: **6 derived against 10 marker-annotated** — the escape hatch is used more
   often than the fix, and no output said so.

The unifying property is that all three are on the path where the tool says yes. Considerable care
had gone into who it accuses — stripping literals, exempting existence and sign checks, surfacing
unparsed forms rather than skipping them, all to avoid a false accusation that would turn the
annotations into rubber stamps. None of that care was applied to who it excuses, because **a
passing case emits no output, so nothing about the tree ever looks wrong.** A false accusation is
visible to the person accused; a false excuse is visible to nobody.

The fix requires the marker to carry a non-empty reason and to survive literal-stripping — both
existence checks, so it invents no threshold and cannot trip this checker's own rule — and prints
the derived/annotated/neither split on both the passing and failing paths.

One detail worth keeping. The first measurement of the derived population reported **45**; the real
count is **6**. The detector's `>` matched the `>` in `=>`, so every `(f) => f.x` read as a
comparison against an identifier. It was caught by a control asserting the detector must _not_ fire
on an arrow function, which is the cheapest possible check and was written only because a previous
instrument in this session had already reported `0 of 24` and `tests=0`. A 7.5x inflated population
would have been published as a finding otherwise, and unlike those two it was not absurd enough to
notice on sight.

Cites `ENG-TEST-002`, `ENG-TEST-004`.

## Being importable is not being imported

`markFences` -- the guard that stops a markdown scanner from reading a fenced code block as prose
-- has lived in `tools/check-doc-links.mjs` for some time. It is exported. It is tested. Measured
this turn, it had **zero external importers**.

Two other scanners in the same tree did the job themselves:

- `tools/check-upstream-refs.mjs` carried an independent inline reimplementation, with a comment
  recording that it was written _after_ the check failed on the prose documenting the check.
- `tools/check-citation-enumerations.mjs`, a **required gate**, had no guard at all and
  false-accused a fenced illustration of the very violation it forbids. Demonstrated, not inferred.

So the shared primitive already existed and the duplication happened anyway. That is a worse state
than having no shared version, because the export makes the problem look solved to anyone
grepping for one. **A shared primitive is the one that is used, not the one that could be** -- and
the property to check is the importer count, which nothing was checking.

The general remedy people reach for is "write a reusable extractor with the guard inside." Here the
extractor existed and was reusable and was not reused, so writing one is not the remedy; being
imported is. Extraction is a precondition for sharing, not sharing.

## Count what the exclusion removed, not the excluded population

Making the gate fence-aware adds an exclusion, and an exclusion that reports nothing is how a
census silently changes its own denominator. The obvious number to print is _how many lines are
fenced_. That number is nearly useless: it says how large the blind spot is, not whether the blind
spot is hiding anything.

What is printed instead is `fencedSuppressions()` -- the hits that **would have been reported but
for the fence**. Measured today: **0**. A measured negative, recorded plainly: the guard removes
nothing from the current verdict and exists to prevent a future false accusation. If it ever
prints non-zero, the exclusion has started changing the answer and can be looked at.

The two populations -- included and excluded -- are decided by the **same** predicate,
`enumerationOnLine`. Two copies of a detector, one per branch, is exactly how a filter and its
census come to disagree about what they were counting.

Fence semantics are markdown's, so the guard is applied per-file and only to `.md`. A triple
backtick in a `.mjs` file is inside a comment, not a delimiter; applying markdown fencing to source
would blind the check to half a file at the first docstring that draws a box.

## An unasserted report parameter, written minutes after measuring the same defect

Adding a fourth `fenced` argument to `violationLines`/`cleanLine` left nine existing call sites
passing the old arity. Both report paths then read `undefined markdown line(s) skipped inside
fenced blocks`, and the full 66-test suite stayed green -- because no test asserted the count
varied with its argument.

This was written in the same session that had just cross-tabulated wiring against assertion across
fifteen tools. Naming a defect class is not a control against it. The fix was to update the call
sites _and_ assert that the printed count moves when the argument does.

## A test in a subdirectory ran nowhere

`run-tool-tests.mjs` discovered suites with a non-recursive `readdirSync`, so the new
`tools/lib/markdown.test.mjs` would have been green, tracked, and reached by nothing -- the
"reached" axis again, self-inflicted.

Measured **before** changing discovery: **0** subdirectory test files existed. That makes recursion
inert on today's tree, which is what makes it verifiable rather than merely plausible -- the
discovered-file count had to be unchanged by the edit, and was (16 before, 16 after). It is now
asserted twice: against a `withFileTypes` fake, and against the real tree, which must contain at
least one nested suite or the recursion is untested against real files.

Note the fake had to change too. It returned bare strings; discovery now reads `withFileTypes`, so
a fake returning strings would have been testing a different function than the one that ships.

Cites `ENG-TEST-002`, `ENG-TEST-004`, `ENG-ARCH-003`.

## A shared definition manufactures agreement

Two sessions ran the same sweep over different trees and got 33% and 34%. The sibling flagged the
agreement as suspicious rather than corroborating, which is the correct instinct, and named the
reason precisely: **a shared numerator definition plus a shared denominator definition produces
agreement whether or not the underlying trees agree.** Both sweeps inherited the same idea of what
a "report site" is, and neither had validated it against any ground truth.

So I validated it here, and it is wrong.

```
missed: process.stdout.write / stderr.write   2 sites
missed: array-literal report builders         4 sites
                       330 sites -> 337
false positives among the original 4 shapes   0 of 330   (measured negative)
residue never disclosed                      69 sites
```

Both missed `stdout.write` sites are in `check-citation-enumerations.mjs`, **written in the session
that published the ratio**. The denominator omitted report lines the same author had added days
earlier, and nothing about adding them suggested the instrument would not see them.

## I claimed a direction, measured it, and it was backwards

Writing the fix up, I reasoned: a site the regexes miss cannot be counted as unasserted, unasserted
sites are the majority, therefore **every omission raises the published percentage** -- error biased
toward the flattering answer. It went into the commit message, the issue, the tool's own scope
line, and a test that asserted the phrase.

It is wrong. A missed site cannot be counted as _asserted_ either. It is absent from numerator and
denominator both, so the ratio simply describes a subset, and the direction of the error depends
entirely on whether that subset's assertion rate differs from the whole -- which is not knowable
without measuring.

Measured, by isolating the definition change from the tree's own movement:

```
old definition, today's tree   144/331  43.5%
new definition, today's tree   150/337  44.5%
all 6 newly included sites      asserted
```

Every one of the six was asserted, so the old boundary had been **understating** the ratio by
1.0pp. The opposite of what I claimed, in the one direction I had argued was structurally
impossible.

The error is exactly the one this tool exists to catch: **a sign asserted from a plausible argument
instead of a measurement.** It survived because the argument was good -- it has a real premise, one
valid inference, and a conclusion that feels forced -- and because it flattered nobody, which made
it read as the rigorous, self-critical option. A claim that costs you something is not thereby true.

The residual lesson stands in weaker form: an instrument's error usually does have a sign, and
asking which way it pushes is the right question. What I got wrong was answering it from an
armchair when a 310-second sweep could answer it from the tree.

## Do not compare a ratio across a moving tree

The sweep returned 44.5% where I had previously published 34%. The tempting sentence -- "validating
the definition raised the measured ratio by ten points" -- is false. Four PRs landed between the
two runs, adding tests that assert report lines. **Both the definition and the tree moved**, and a
delta across two moving things is attributable to neither.

The isolation above is the only honest comparison available: re-derive the _old_ definition's
number on _today's_ tree, so exactly one thing differs. That turned a headline ten-point delta into
a real one-point delta, and reversed its sign.

Cites `ENG-TEST-002`, `ENG-OBS-002`.

## Disclose the boundary, do not defend it

Most of the 69 residual sites are legitimately not report output: regex construction, cache keys,
error messages. The fix is therefore not to widen the definition until it is right -- it never will
be -- but to **publish the size of what was declined**. The scope block now prints the residue and
names the direction of the bias, so a reader can see how much of the file the ratio never looked at
rather than inferring that the ratio looked at everything.

The same rule as the fenced-hit count one section up, arriving from the other side: there, the
exclusion's _effect_ was the number worth printing; here, the declined _population_ is, because the
declined sites were never evaluated at all and so have no effect to measure. **Print the effect
when the exclusion removed decided cases; print the population when it removed uninspected ones.**

And print it without a claimed direction. The next section is what happened when I attached one.

`buildsReport()` is the single predicate for both the counted and the declined set. Two copies --
one per branch -- is how a filter and its census come to disagree about where the line was.

## A detector I could not validate, not shipped

I also tried to catch continuation lines of multi-line template literals, using backtick parity to
track whether a line sits inside an open template. Backticks inside comments and regexes toggle the
parity, so the classifier's output was mostly wrong -- it labelled ordinary lines as continuations,
including three in the file implementing the parity check.

It is not shipped. **A boundary I can disclose beats a detector I cannot validate**, and shipping
the second while claiming the first is how a denominator acquires a defect that looks like rigour.
The continuations stay in the residue, counted and visible, as a named limitation.

Notably, the first line the new array shape matched was the comment _documenting_ the array shape
-- the detector counting its own explanation. That is the fifth time in this session a written
warning has sat inside the visual field of the defect it describes.

Cites `ENG-TEST-002`, `ENG-TEST-004`, `ENG-OBS-002`.

## A fix documented in a comment describes the instance, and reads as the class

One change ago the `unsourced-bound:` marker in `tools/check-assertion-bounds.mjs` was hardened
against three ways a marker can excuse a line it should not: written bare with no reason, appearing
inside a string literal, appearing in an assertion message. The fix was recorded in a comment on
that marker, and the comment is completely accurate.

It is also the reason the sibling marker went untreated. `enumeration-fixture`, in a **required
gate** in the same `tools/` directory, had all three defects. Each reproduced on the first probe: a
bare marker excused, a marker as string data excused, a marker in prose _about_ the marker excused.

A true sentence about a narrow fix is indistinguishable, at a glance, from a sentence about a
general one. The prose is not wrong and cannot be made right by editing it — what is missing is a
second application. The only evidence that a fix generalised is the fix appearing twice.

## The count was 55% not-an-exemption

`countExemptions()` claimed in its docstring that "an exemption cannot grow unseen." It counted
occurrences of the marker string:

|                       | count |
| --------------------- | ----- |
| marker occurrences    | 22    |
| suppressed a real hit | 10    |
| decorative            | 12    |

The twelve are prose about the marker, comments explaining the marker, and reflexive markers on
lines that were never violations. A total that is more than half noise cannot detect composition
change: a real exemption can be added while a decorative one is deleted, and the number does not
move.

The remedy already existed **a hundred lines above, in the same file**. `fencedSuppressions()`
counts hits the exclusion removed, not the excluded population, and this guide carries a section
arguing for exactly that. It was written one change earlier and was not applied to the adjacent
function. Proximity is not transfer. The distance at which a lesson fails to travel is smaller than
a file.

## Print an inventory, not a verdict

A false excuse is invisible because the passing case emits no output. A gate that excuses the wrong
line reports a number one larger and stays green, and no reader can act on a number.

The counter is to make the yes-branch emit an **inventory**: name every excused line by `file:line`.
The sibling repository's citation checker does this for its skips, and that disclosure is the only
reason a defect in its ignore-pragma could be characterised rather than guessed at — its blast
radius was readable off the output.

This gate now prints its exemptions by name, and the inventory paid for itself on its first run. It
named `docs/guides/engineering-practice-adoption.md:7121`, a line whose reason was `-->`. The
hardened check requires a separator and then a reason; `<!-- marker -->` supplies `-` and then `->`,
so the closing punctuation of the comment carrying the marker satisfied the demand that the marker
be justified. The line had been silently exempt, and the count that covered it had been correct
every time it was printed.

Reported exemptions fell from 22 to **10** — not because anything was removed, but because the
number finally means what its name says.

## Importer count reads green on a tree with nothing to import

Consolidating the fence guard into `tools/lib/markdown.mjs` fixed the three independent authorings
that existed, and the metric that justified it was importer count: a shared primitive is not the
one that _could_ be imported, it is the one that is. That metric cannot prevent a fourth authoring,
for two reasons that only became visible when a sibling repository ran the same check.

**It is a ratio whose denominator is "modules someone extracted."** A tree that never extracted
anything scores perfectly while being maximally duplicated. The sibling measured 18 exporting
modules, 10 exported to their own test and nothing else, and no shared directory at all — so the
state "exported, tested, imported by nobody" could not arise there, because there was nothing
anyone could have imported. The metric is only meaningful where extraction has already been
attempted, and it reads as green where it has not.

**It reads a forced hand as a free choice.** Measured here: 36 of the scripts under `tools/` and
`scripts/` are CommonJS, and the shared primitive is ESM. `require()` cannot load it. Those files
do not import the guard because they _cannot_, and an importer census records that as a decision
not to reuse.

The check that catches a fourth authoring is not "who imports the shared module" but **how many
independent implementations of this predicate exist** — a duplication census, which needs no prior
extraction and does not care why a file failed to import.

## The census found one immediately, and my first census missed it

Running it by hand found `tools/check-ai-manifest.js` — a **required gate** — carrying its own
fence toggle at two sites, recognising ``` and not `~~~` where the shared definition recognises
both. Tilde fences in the tree today: **0**. So the divergence is latent, and it is exactly the
shape a second definition always has: correct until a document uses the delimiter the copy does not
recognise, with no test failing in between.

The first census I ran reported **zero**. It globbed `tools\*.mjs` and `tools\lib\*.mjs`, which
silently excluded every `.js` file — the one extension the finding was in. That is the fourth
consecutive round in which a pre-census filter went unstated, and this time it was in a number I
had already reported as a clean result in the same message. The filter is never the interesting
part, which is precisely why it is never disclosed.

## A guard propagates along the corpus, not along the rule

The causal account, which the sibling established and which holds here: each author of a fence
guard either was corrected by their own fixture or was not. The tool scanning documents that
contain fenced examples grows the guard; the tool scanning documents that happen not to, never
learns it needs one. Nobody decides the rule is narrow — the rule is simply never observed to fail.

So the guard's presence tracks the corpus, and the corpus is a fixture nobody chose. This also
applies to _scope_, not just presence. Fence-awareness here is scoped by path — `.md` only, because
a triple backtick in `.mjs` is a comment rather than a delimiter. Measured: non-`.md` scanned files
containing a fence-opening line, **0**; markdown-variant extensions in the tree (`.mdx`,
`.markdown`), **0**. The path scoping is exact — today, and because the corpus complies, not
because anyone verified that it must. The rule's real applicability is "markdown that quotes
markdown," which is a property of content that no file extension carries.

## The second application is the evidence

One change earlier the `enumeration-fixture` marker was hardened to require a reason, and the
lesson recorded was that a fix documented in a comment describes the instance and reads as
describing the class. The new census has an allowlist — `check-ai-manifest.js` cannot import the
owner — and every allowlist entry is required to carry the reason it cannot, asserted by a test,
written at authoring time rather than a round later.

That is not a stronger statement of the lesson. It is the only kind of evidence the lesson admits:
a fix appearing twice.

### Absence is not a score (#4324)

`tools/check-report-assertions.mjs` publishes a wiring x assertion cross-tabulation. Its per-tool
table is keyed by mutated site, so a wired tool that produced no site never enters the map and
appears in **no row and no quadrant** — rendered identically to a tool that was measured and
scored well. The sibling `jrmoulckers/engineering` session found the same class by a different
route: their report-site boundary excluded whole files, so three tools entered a per-tool ratio as
`0/0`, one of them the most unambiguously wired tool in their repo.

**Their transferable test, run against finance.** Are the omissions per-site or per-file? Measured
against finance's actual pre-#4319 boundary:

```
old 457  new 463  delta +6
files with sites: old 25, new 25
per-file omissions (tool invisible under old defn):  0
per-site omissions (file counted, sites missed):     4
```

**Measured negative.** finance's #4319 widening was purely per-site; no tool was ever invisible
because of the site definition. The hole here has a different cause, and finding it required
abandoning their diagnosis rather than confirming it.

**The actual cause: two populations, different boundaries, silently joined.** `wiredTools()` spans
`.mjs` and `.js`; the sweep measures `.mjs` files _that have a colocated test_. Of 24 wired tools,
**11 produce no row**:

| reason                                     | count |
| ------------------------------------------ | ----- |
| CommonJS — outside the measured population | 7     |
| no colocated test file — never mutated     | 4     |

The published quadrants had a wired denominator of **13**, not 24, and nothing in the output said
so.

**Four of them are instrument-independent findings.** `check-text-encoding.mjs`,
`check-web-performance-budget.mjs`, `run-citations-check.mjs` and `verify-build-env.mjs` are wired
into CI and have **no test file anywhere in the tree**. `check-text-encoding.mjs` backs the
`encoding:check` gate. That needs no ratio, no site definition, and no sweep to state — which is
why it survives every instrument failure above. A result that uses no population cannot be
invalidated by the population being wrong.

**The fix is the inventory discipline from #4320**, applied to the yes-branch rather than the
no-branch: print every absent wired tool **by name with its reason**, and state the denominator
the quadrants used. A count cannot be wrong in a way a reader can see; a name can.

**Self-correction.** The issue filed for this work classified `run-citations-check.mjs` as
"zero report sites". It is not — it has no test file and was never in the measured population at
all. The misclassification came from my probe using `.mjs` non-test as the population while the
sweep uses `.mjs`-with-tests. **The disclosure block corrected its author's own filed diagnosis on
its first render**, which is the second time an inventory has done that (the first was #4321,
where the reason `-->` surfaced on run one). A verdict cannot do this. Only an itemisation can, and
that is now twice observed rather than argued.

### A reason addressed to a position (#4327)

The sibling `jrmoulckers/engineering` session found that its coverage ratchet **demands a reason
its schema cannot store**: `practices/uncovered.json` is a `string[]`, while the file's own comment
and the gate's failure text both instruct the author to record a reason. All 7 entries are bare
IDs. They offered the instrument that found it — an escape-hatch census — rather than the finding.

Run against finance:

```
27 of 51 tools carry at least one escape hatch
 9 allowlist/baseline constants declared
 1 of 9 can hold a per-entry reason   (ALLOWED, added by #4323)
```

**The hit.** `check-doc-links.mjs` recorded its reasons in prose above the array, addressed to a
position: _"The last two entries are the second kind."_ The array is sorted; those entries sit at
positions 9 and 10 of 11. `git show` on the commit that wrote the sentence shows the prose and the
entries landed together — **the reference was false on arrival, not rotted.** The author appended
mentally while the sort placed them mid-list. The genuinely last entry had no reason at all.

**Attaching a reason per entry then falsified the classification.** Verifying each against
`git log --all --full-history` moved four entries from "never true" to "moved": `sync-architecture.md`
resolves to `0002-backend-sync-architecture.md` in the same directory, and `fire-calculator.ts`
existed from #1830 until #3512 deleted it. Derived split **4 moved / 7 never written**; the prose
had it backwards for every repointable one. A third finding fell out: **there is no ADR 0008** —
the sequence skips 0007 to 0009.

The guarding test was named `separates never-true targets from moved ones` and asserted
`length === 2` over entries matching `fire-calculator.ts`. That holds under either classification.
**A test can name a property and assert a different one**, and the name is what a reader audits.

**The general form, which is stronger than the positional case.** A reason addressed to a _set_ —
"these entries are the second kind", "this list is all X" — cannot be checked against any member,
so it cannot be wrong about a member, so it survives every member changing. Positional reference is
one instance; "the list is a ratchet of never-written targets" is another, and it was wrong about
four of eleven for as long as nobody could ask it about one.

**It reproduced inside the fix, at one paragraph's distance.** The docstring I wrote to explain all
this stated the split as "3 moved / 8 never-written" — hand-counted. The report line, which derives
the same split from the data, printed **4 / 7** on the next run and contradicted it. Same defect,
same file, same commit, one paragraph above the code that computes the correct value. The count was
only caught because something else computed it; had I written the sentence without also deriving
the number, it would have shipped and read as authoritative.

**What finance already had that engineering lacks.** Staleness is enforced: an entry that stops
being broken fails the build with `recorded gap(s) no longer broken -- remove them`. So the list
cannot rot toward over-exemption. It rotted in the other direction — unexplained exemption — which
is the direction with no reader-visible signal, and is the same direction engineering's does.

## A true reason is not evidence of membership (#4330)

A sibling session reported, three rounds running, that it had shipped a source-scanning detector
with no string-literal handling — flagging the recurrence in the same message that retracted the
previous one. Rather than accept that as their defect, we asked whether the tree here had it.

It did, in three places, and the shape was worse than a missing feature.

### The fail-open one

`check-citation-enumerations.mjs` backs a required gate. #4321 hardened its exemption marker so
that the marker appearing inside a string literal reads as a mention rather than a claim. It did
so with `/'[^']*'|"[^"]*"|<backtick>[^<backtick>]*<backtick>/g`, which does not model escapes.
Verified by execution:

| input                                                          | `hasExemption`                  |
| -------------------------------------------------------------- | ------------------------------- |
| `const doc = 'enumeration-fixture: sample';`                   | `false` — the case #4321 tested |
| `const doc = 'don\'t write enumeration-fixture: sample here';` | **`true`**                      |

The literal terminates early at the escaped quote and its tail reads as code. #4321 closed the
hole for literals it could parse, and the test that certified the hardening used one of those.

The correct implementation was **already exported**, from `check-assertion-bounds.mjs`, in the same
directory, when #4321 was written. Not missing — unimported. That is the exact inverse of the
sibling's own result the same week, where `@jrmoulckers/eslint-config` ships two internal modules
and _deliberately_ excludes them from its `exports` map, verified by `ERR_PACKAGE_PATH_NOT_EXPORTED`.
Both trees had a reachability question; theirs was answered on purpose.

### The census could not see its own class

`check-markdown-primitives.mjs` exists to find predicates re-derived instead of imported. It did
not list literal-stripping among the predicates it looks for, so both divergent implementations
were invisible to the gate built for exactly that failure. The scope is now a `PRIMITIVES` table —
adding a predicate is a row, not a second tool.

### The control that ruled out the weak form

The census had a test named _CONTROL: a fence delimiter that is not used as a predicate is not
reported_. It passed throughout. Its two inputs contain a bare delimiter and **no predicate
construct at all**, so they could not have matched with or without literal handling. The adjacent,
stronger case — a complete predicate held as data — was broken the whole time.

> A control that excludes the weakest form of a defect reads, to anyone auditing the file, as
> excluding the class.

### The finding that outranks the fix

The first draft of the literal-stripping signature matched any negated class over a single quote
character. It reported two files:

| file                                          | what it actually is               |
| --------------------------------------------- | --------------------------------- |
| `tools/security-scan.js:79`                   | a SQL-injection detection pattern |
| `scripts/i18n/validate-locale-catalogs.js:44` | XML attribute parsing             |

**Both are CommonJS.** So the allowlist reason every other entry in this gate uses — _"require()
cannot load the ESM owner"_ — was available, true, and would have certified two files that are not
members of the class at all.

> An allowlist asks _why can this file not use the owner_. It never asks _is this file an
> instance_. A true reason is therefore not evidence of membership, and an allowlist reviewed for
> reason quality will pass a misclassification with full marks.

The allowlist entry that remains records both facts separately: the blocker (CommonJS) and the
evidence of membership (the same escape-aware construct). Tightening the detector was the fix;
allowlisting would have written a correct sentence about a false classification.

### Blanket stripping broke a detector

The first fix stripped literals before matching. Three tests went red, and the reason was
substantive rather than mechanical: `line.startsWith('<fence>')` is a fence predicate **whose
evidence is a string literal**. Erasing literals erased a construct the census exists to find.

The property is nesting, not presence — a match is data when it _begins_ inside a literal. And
computing that with a regex failed too, because `'[^']*'` inside a _regex literal_ looks like a
string to a regex-based scanner: the approximation broke on precisely the construct it was added to
detect. `tools/lib/source.mjs` now carries a small lexer that tracks string delimiters, line
comments, and regex literals with character classes, and states its own limits in prose that the
tests assert.

### Instrument disagreement, both directions

An ad-hoc grep run before the gate existed reported nine files. The shipped census reported a
different set: it missed nothing the grep found that was real, and it found
`scripts/i18n/validate-glossary.js:150`, a genuine member, which the grep never saw. Neither
instrument was a subset of the other.

## The gate set was prose, and it was wrong for fifteen rounds (#4333)

A sibling session closed a nine-round-old finding by enumerating CI routes exhaustively, and
narrowed its own claim on the way: not _"8 of 13 tools cannot fail CI"_ — mostly true of any repo
with a `scripts/` directory — but _"three tools are **written as gates** and nothing runs them."_
A mismatch between a tool's form and its wiring, which is checkable.

Run against this tree, that class landed on the reporting rather than the tools.

### `agent:check` was never a gate

`agent:check` appeared in the phrase **"16/16 gates pass"** in every verification summary of this
workstream. Two independent instruments agree it is reached by nothing:

| instrument                                               | verdict                     |
| -------------------------------------------------------- | --------------------------- |
| `check-gate-enforcement.mjs` route resolution (5 routes) | `reached by no workflow`    |
| raw substring scan of the joined 394 KB workflow corpus  | `byName=False byFile=False` |

And it is worse than unwired. It runs `tools/agent-scripts/pre-push-check.js`, which exits 1 on
failure and 0 on success — gate form — and is named for a hook that **exists and does not call
it**: `.husky/pre-push` runs `prettier --check`, `eslint`, and a secret scan. The only two
references in the whole tree are its own `package.json` entry and a paragraph in this guide.

### The defect is the aggregate, not the script

The sibling's §4 formulation — _a verdict can only be right or wrong about the question you asked;
an itemisation can be right about a question you didn't ask_ — has a mechanism, which they supplied
this round: an itemisation is checkable against a reader's independent knowledge, an aggregate is
not. The reader is the second instrument, and they can only act as one if the output has the
resolution to disagree with them.

`16/16 gates pass` had no such resolution. It was true of a set that existed only in prose, so a
member that never gated could not be detected by anything. `CLAIMED_GATES` is now a checked
manifest: a script listed there that resolves to no route fails the build, and the report prints a
row per gate with its matching route.

```
Declared CI gates: 15.
  ai:manifest:check              file path
  bounds:check                   npm run
  ...
Gate-shaped scripts deliberately excluded:
  agent:check
    developer pre-push helper ... invoked by no workflow AND by no hook
```

### The tool asserting this was itself toothless

`check-gate-enforcement.mjs` is wired into CI and, until this change, **never set an exit code**. It
satisfied _"runs in CI"_ without being able to fail it — a third variant of the form/wiring
mismatch, and one neither tree had named: not unwired, not unwritten, but _wired and unable to
fail_. It now fails on exactly one claim, which is narrow enough to be both true and checkable.

### What is not claimed

31 of 66 root scripts reach no workflow. That is not a finding — `format`, `clean`, `doctor`, and
the `agent:*` helpers should not gate anything. Following the sibling's own restraint: the correct
claim is the narrow one about **form/wiring mismatch**, not the larger number that sounds more
impressive.

`agent:check` is recorded in `NOT_GATES` rather than wired into `.husky/pre-push`. Wiring it would
change local behaviour for every human in the repo, which is a different decision from correcting a
miscounted report, and only the second one is in scope here.

## A reason can be a criterion or a state, and only one of them survives (#4335)

A sibling session tested the rule that a claim addressed to a set cannot be wrong about a member,
and found the first instance that had _not_ rotted. Their explanation is the useful part, and it
corrects my version of the rule:

> The distinguishing property isn't the scope of the address, it's whether the sentence names a
> **criterion** or a **state**.

"A cross-reference is not an implementation" stays true as members change. "The last two entries are
the second kind" cannot. I had been attributing the durability to _who the sentence is about_; it is
actually _what kind of sentence it is_.

### Turned on the exclusion list shipped the day before

`NOT_GATES` (#4333) records why `agent:check` is not a gate. The reason:

> invoked by no workflow AND by no hook -- `.husky/pre-push` does not call it

**A state.** Wire it tomorrow and that sentence is false, nobody has edited this file, and the
exclusion persists -- so a script that is now a real gate sits permanently outside the checked gate
set, justified by a claim that no longer holds. #4333 gave the _claimed_ set a failure path and left
the _excluded_ set without one. Same defect, one column over, shipped in the same commit that fixed
its neighbour.

### Census of the class

Eleven exclusion lists in `tools/`. Staleness enforcement:

| list                                                         | staleness                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| `check-doc-links.mjs` baselines                              | **enforced** -- "N recorded gap(s) no longer broken"      |
| `check-upstream-refs.mjs` baselines                          | one direction; over-count fails, under-count only advises |
| `check-gate-enforcement.mjs` `NOT_GATES`                     | none -- printed, never re-derived                         |
| `check-markdown-primitives.mjs` `ALLOWED`, `LITERAL_ALLOWED` | none                                                      |

The primitives case is the subtler one. `Object.hasOwn(allowed, site.file)` is a **one-way lookup**:
it asks whether a detected site is permitted, never whether a permission still describes a site. An
allowance for a deleted or rewritten file is not wrong -- it is _unfalsifiable_, because nothing
reaches it. And an unfalsifiable allowance reads to the next author as evidence the class was
considered here.

### The first census pattern missed the list that motivated it

`\b(?:const|let)\s+([A-Z][A-Z0-9_]*(?:ALLOWED|...|NOT_GATES|...))` reported **6** lists. The correct
figure is **11**. `NOT_GATES` was missed because the leading `[A-Z]` consumes the `N`, leaving
`OT_GATES`, which cannot match the `NOT_GATES` alternative -- so the pattern written _to find this
list_ excluded it. The five it missed included two of the four defects.

### And a probe that agreed with a known constant

Checking finance for ghost IDs, `new Set(Object.keys(idx.principles))` printed **66** -- exactly the
published count of ratified principles -- so I did not question it. `principles` is an **array**;
`Object.keys` returns `"0".."65"`. The set was 66 wrong things, and every one of finance's 41 cited
IDs read as a ghost. 41/41 was absurd enough to catch instantly; **66 was not, because it matched.**

A validation that agrees with an independently known constant is the most convincing possible wrong
answer, and an array's key count _is_ its length, so the coincidence is structural rather than
lucky. The correct run: 0 ghosts. `eng:citations` already gates this and scans a wider extension set
(44 principles across 4,719 files, vs. my probe's 41) -- my probe was both redundant and narrower.

### Fix

`staleExclusions()` fails when a `NOT_GATES` entry now resolves to a route; `staleAllowances()` fails
when an `ALLOWED` key matches no detected site. Each reason is now split into a `criterion` that
survives the tree changing and a `state` that is re-derived rather than trusted.

## A membership test is itself a criterion or a state (#4338)

A sibling session ran the membership audit on their own exclusion list, got `5 of 6 entries are
not instances`, and then withdrew it: the tool ships to consumer repos, so `dist`, `build`,
`.svelte-kit`, and `vendor` are exclusions for the _consumer_ trees it walks. They had measured
against the population the list **lives in** rather than the one it **governs**.

finance is one of those consumer trees, so the same list could be measured where it is aimed.

### Measured against the tree it actually governs

`SKIP_DIR` in the vendored `check-citations.mjs`, run over finance:

| entry          | dirs | scannable files skipped |
| -------------- | ---- | ----------------------- |
| `node_modules` | 2    | 72,073                  |
| `vendor`       | 1    | 9                       |
| `.git`         | 0    | 0                       |
| `build`        | 0    | 0                       |
| `dist`         | 0    | 0                       |
| `.svelte-kit`  | 0    | 0                       |

Correct population, and four entries still read as dead. They are not:

- **`.git` is a _file_ in this checkout.** finance works in git worktrees, where `.git` is a link
  file, not a directory -- so a directory-name exclusion never matches it. In the main clone at
  `C:\Users\jrmou\src\finance` it is a directory. **Membership varies with checkout mode.**
- **`build` and `dist` are `.gitignore`-declared build outputs.** Zero on a clean tree, non-zero
  after a Gradle or web build. **Membership varies with build state.**
- `.svelte-kit` is the only genuinely inapplicable entry -- finance is React.

So the sibling's correction is right and incomplete. Fixing the population is necessary and not
sufficient: **a membership test is itself either a criterion or a state**, and theirs and mine were
both states, arrived at by different routes. Theirs varied over _which tree_; mine varies over
_which moment_.

### It is a latent bug in what shipped the day before

`staleAllowances()` (#4335) fails when an allowlist key matches no site. Applied to finance's own
`SKIPPED_DIRECTORIES`, it reports **5 of 7 entries dead and is wrong about all five**. It is correct
today only because its population happens to be tracked source files -- a constraint nothing
recorded and nothing checked.

`generatedAllowances()` now checks it: an allowance whose path contains any `.gitignore`-declared
segment fails, because a staleness verdict over a generated path is a state. The verdict is derived
from `.gitignore` rather than a second hand-kept list of generated directories, since such a list is
the same kind of object this check exists to distrust and would need its own staleness check.

The mirror hazard is fixed alongside it: `SCANNED_DIRECTORIES` is an **inclusion** list, and an
entry that disappears narrows the scan silently while still passing. The roots are now asserted.

### Both instruments under-reported `.git`, for different reasons

The sibling's probe skipped hidden directories. Mine treats `.git` as absent because it is a file in
a worktree. Two independent instruments, the same wrong answer about the same entry, from unrelated
causes -- and in both cases in the direction that made the finding look stronger.

## Wired is not the same as able to fail

`check-gate-enforcement.mjs` proves every declared gate is a real workflow step. It cannot prove
any of them can fail. A gate that is wired, resolves, and returns zero on every input is
indistinguishable from a working one by everything the repo previously ran. `gate:teeth`
(`tools/check-gate-teeth.mjs`) closes that: it executes each proven gate against a minimal
violating fixture and requires **both** a non-zero exit **and** a report containing a declared
substring naming the violation.

The second requirement is the load-bearing one. Four fixtures exited non-zero for reasons that
had nothing to do with the defect they contained -- no git repository, no `package.json`, and one
that tripped the scan-root assertion added in an earlier change. An exit code is a verdict on
whichever question the program actually asked; only the report says which question that was.

Four gates are proven (`tool:imports:check`, `markdown:primitives:check`, `bounds:check`,
`gradle:prefetch:check`). Twelve are recorded as unproven, each with the criterion that blocks it
-- most need a dependency (`js-yaml`, `semver`) or a whole-tree population a fixture cannot
supply. The table is asserted against the declared-gate list, so a gate added without a decision
fails the check rather than silently defaulting to unproven.

### Detectors that were wrong, and how each was caught

Five predictions about this repository's own tools were refuted, all by execution:

1. A `tools\*.mjs` glob missed 2 of 15 gates -- `ai:manifest:check` runs a `.js` file and
   `eng:vendor:check` lives in `scripts/`. Enumerate from the declared list, never a glob.
2. A `process.exit(1)` matcher missed `process.exit(result.ok ? 0 : 1)` in
   `check-assertion-bounds.mjs` -- a ternary is a third syntactic form of the same semantics.
3. A predicted Windows path defect in `check-gradle-prefetch.mjs` (``new URL(`file://${argv[1]}`)``)
   does not exist; WHATWG `URL` normalises the drive letter.
4. Accepting any non-zero exit produced false teeth, as above.
5. A comment in `check-tool-imports.test.mjs` claimed the new literal guard ignores comments. It
   does not: `literalSpans` ends a line at `//`, so line comments are excluded -- but block and
   JSDoc comments are still read as code, because it tracks nothing across lines. The test now
   pins the measured behaviour in both directions.

The common shape: a regular expression answers _how is this program written_, which correlates
with _what does this program do_ without being it. If the property is behavioural, run the
program.

### A gate can be correct and narrower than its own header

`bounds:check` requires every invented numeric bound to name its source. Its header claimed the
population was "precisely the set of invented numbers". The census extracts only
`numericInequalities` and `reversedComparisons`, so `assert.equal(census.files, 68)` -- an
invented number over a real-tree population -- is out of scope. Measured: **265
equality-against-literal sites across 16 test files**, none in non-test tool files.

Widening was rejected rather than deferred. Most of those sites are sound: a count asserted
against a fixture the test just built is sourced by construction, and putting them under an
annotation requirement would add noise proportional to the sound majority to reach a residue that
is small and not separable by any available signal. The header was narrowed to "in a comparison"
and the excluded class recorded in the file, so the gap is stated where a reader meets the claim.

This is the failure mode that survives every check: wired, toothed, correct, and about less than
its name implies. Nothing detects it except reading what the matcher compares.

### An over-report found by its own fixture

The `gate:teeth` fixture content tripped `check-tool-imports.mjs`, which counts `import` and
`require` keywords appearing inside string literals -- violating its own stated contract,
"under-decide, never over-report". Fixed with a literal-span guard keyed on the **keyword**
position, not the specifier: a specifier is always inside a literal, so it cannot distinguish the
two cases, whereas the keyword can. Reference count moved 164 to 169. The same guard corrected a
pre-existing over-report at `tools/ai-manifest.js:39`, a `require` inside a line comment.

## A recorded reason is a claim, and three of mine were false

`gate:teeth` shipped with 12 gates marked unproven, each carrying a criterion naming what blocked
a fixture from demonstrating its teeth. The criteria were written by reading the tools. **None was
executed.**

Three were wrong. `encoding:check`, `docs:links:check`, and `gate:enforcement` each named "the
fixture needs a git repository and an index" as the obstacle -- accurate as a description of the
requirement, and false as a blocker, because a fixture can be a repository. `git init` plus
`git add` costs milliseconds. All three now prove teeth: exit 1, with the report naming the
violation.

`test:independence:check` was tested too and stays unproven -- a fixture pairing a tool and test
on an identical object literal did not trigger it, so the shape it detects is narrower than a
shared literal. That is recorded as an executed criterion rather than quietly left in the pile.

The remaining entries now declare `tested: false`. A criterion is itself a claim about behaviour,
so it carries exactly the burden this gate exists to enforce; one that has never been run should
not read like a measurement. The distinction is asserted by a test, so a new entry must decide.

### Unproven understates it: the enforcement is also unguarded

Measured by mutation. Deleting `process.exit(1)` from `tools/check-upstream-refs.mjs`:

```
gate:teeth        EXIT=0
gate:enforcement  EXIT=0
the gate itself   EXIT=0
full test suite   EXIT=0   (729 pass, 0 fail)
```

Nothing in the repository notices a gate losing its enforcement. The same mutation applied to
each proven gate is caught (`EXIT=1` in every case). So proving teeth is not only documentation --
it is the only thing standing between a gate and silent removal of its failure path. That is the
argument for shrinking the unproven set rather than maintaining a tidy list of excuses.

A test that re-derives its tool's logic cannot detect this, because there is no execution for a
behavioural claim to attach to. Of 18 tool test files, 3 spawn a gate and assert its exit status.

### A census that collides on a name

The first pass at that count matched `.status` across the test files and reported 5. Two of those
are `check-ai-manifest.test.mjs` asserting a _domain_ field named `status` -- nothing to do with an
exit code. A name-based census has two independent error modes, over- and under-inclusion, and
neither is visible in its output.

### Deleting by name is not enough if the enumeration crossed a link

During cleanup in the previous round, a scratch fixture directory contained a `node_modules`
junction pointing into this worktree. The removal enumerated recursively, followed the junction,
and deleted through it: `node_modules` plus **2,825 tracked files**. Everything was committed, so
`git reset --hard` and `npm ci` restored it fully, and the anomaly surfaced because the file counts
disagreed (412,014 enumerated against 68,669 deleted).

The repository rule is to delete by name and never recursively. The incident names the part the
rule leaves implicit: **deleting by name is only bounded if the enumeration that produced the names
was bounded.** A recursive walk that crosses a reparse point produces names outside the tree you
believe you are deleting, and every individual deletion then looks compliant.

`walkFixture` in `check-gate-teeth.mjs` stops at a symlink or junction rather than descending.

### The leak that the same walk fixed

Adding it exposed an unrelated defect in the original cleanup, which removed `dirname()` of every
file it wrote. An intermediate directory created on the way to a nested one is never any file's
dirname, so the gradle fixture's `.github` survived every run and left its root non-empty. **24
orphaned directories** had accumulated, while the tool reported clean removal each time. The
population of directories created is not the population of dirnames written -- a population error
of the same shape as the `tools\*.mjs` glob, in the cleanup rather than the census.

## Do not reimplement a format the tool that owns it will answer for you

`generatedAllowances()` parsed `.gitignore` to decide which allowlist keys name an untracked path.
That is a reimplementation of a format with negation, globs, anchoring, and per-directory files,
and it was wrong in two ways at once.

`.gitignore:85` is `!tools/windows/dev-cert/.gitkeep` -- a **re-inclusion**. The parser dropped
comments and glob lines, so the `!` line entered the set of declared exclusions with its sign
inverted. No allowlist key could equal the whole string, so it never produced a wrong verdict.
**Unexercised rather than absent** is the harder kind to find: nothing failed, nothing looked
wrong, and no test could have caught it because the defect had no reachable consequence.

Separately, every line containing `*` was discarded, so a key excluded only by a pattern such as
`*.swp` was reported tracked. That one is a live functional gap, not a latent one.

The fix is `git check-ignore --stdin`. It answers the same question with the semantics git
actually uses, and needs no parser. This is the previous round's lesson applied one level up: _if
the property is "what does this program do," run the program_ -- where the program is `git`, and
the property is its own exclusion rules.

A status other than 0 or 1 is treated as no verdict. Outside a repository git exits 128, and
returning "nothing is excluded" there would assert every key is tracked, which the function has no
basis to claim.

### The name asserted a criterion the mechanism does not test

The docstring described `.gitignore` as "the tree's own record of what it generates". Of finance's
48 literal entries: **9** build output, **6** secrets, **4** editor or OS files, **29**
unclassified. Skipping all of them is the right action -- an untracked file's presence depends on
the machine whatever the reason -- but only nine are generated, and the reason is printed to a
reader. Renamed to `untrackedAllowances`.

Second time in three rounds that a claim was broader than the matcher inside the same file, after
`bounds:check`. The pattern is specific enough to name: **a function's docstring tends to describe
the motivating case, while the code implements the mechanism, and nothing compares them.**

### The exclusion a declared record cannot contain

Git excludes `.git` unconditionally rather than through an ignore rule, so `check-ignore` reports
it as tracked. Nothing here is wrong today, because allowlist keys name source files and no key
can be `.git`.

It is recorded because the shape generalises: **a record of declared exclusions cannot contain the
exclusion nobody ever had to declare.** Any verdict derived from such a record inherits a blind
spot located exactly at its most certain content -- the entry that is true in every tree, every
checkout, and every build state is the one that never had to be written down.

## A census needs a failure path in both directions

`check-gate-enforcement` asked whether every claimed gate reaches a workflow. It never asked
whether every workflow-reached control is claimed. The first question is answered from a
hand-maintained list, so the second is where the answer rots: a tool wired into CI and left out of
`CLAIMED_GATES` was invisible to every check in the file, and the census kept reporting a complete
set while covering less of the tree.

It had already happened. Deriving the population from the tree instead -- npm scripts that resolve
to a workflow route **and** execute a file under `tools/` or `scripts/` -- gives 28 members, of
which 7 run test files and 21 are controls against 16 claimed. Four of the five unaccounted are
correctly out of scope, and the fifth is not: **`i18n:validate-glossary` is a gate with teeth,
wired at `ci-lint.yml:123`, that the census never contained.**

Teeth proven by execution rather than asserted, and with the control that makes the result mean
something:

```
baseline fixture (valid glossary)   EXIT=0
one locale value removed            EXIT=1
  Concept "Balance" is missing a non-blank value for locale "fr-FR".
```

The baseline passing is the whole proof. An empty fixture also exits 1, for staging reasons with
no relation to the gate's subject, so an exit code alone would grade a broken fixture as a proven
gate.

### The classification is derived, because a name-based census has two error modes

Test runners are excluded by what they execute, not by a `:test` suffix -- #4345 was a pattern that
admitted a non-member on a substring and dropped three quarters of the real members at the same
time. `build` and `type-check` fall out of the population because they run no repository tool,
which stays true if either is renamed.

That is not free of naming: the runner class still keys on `.test.mjs`. It is a load-bearing
convention -- it is how `run-tool-tests.mjs` discovers what to run -- and the residual risk, a
control that happens to match, is asserted against rather than assumed.

### Fixing one route moved the defect onto another

The population work exposed a second bug: `directRoute`'s file-path route matched when **any** file
a script executes appeared in the corpus. `i18n:validate` runs two validators, only one is wired,
and the resolver called the whole script reached.

Measured before changing it: one partially-wired script, and **no claimed gate executes more than
one file** -- so the over-credit could not yet produce a false verdict for a claimed gate.
Unexercised rather than harmless, the same shape as #4345's inverted negation.

Then the fix pushed `i18n:validate`'s false verdict onto `runsEquivalentCommand`, which had the
identical any-vs-all form one route over. **The same defect sat in two places and the second was
only visible once the first stopped hiding it** -- which is a specific argument for fixing a defect
rather than only recording it, since a recorded one goes on masking its neighbour.

### Recorded, not fixed

`scripts/i18n/validate-locale-catalogs.js` has teeth and is executed by no workflow. Wiring it
changes CI behaviour and deserves its own verification rather than being bundled here.

## A directory test that follows a link

`statSync(p).isDirectory()` is **true** for a Windows junction. `lstatSync(p).isDirectory()` is
false. So the idiom everyone reaches for first --

```js
if (statSync(full).isDirectory()) walk(full);
```

-- descends through a junction into whatever it targets. This worktree carries three, pointing from
`node_modules/@finance/*` back into tracked source, and the difference is not marginal:

| instrument                      | files seen under `node_modules/@finance` |
| ------------------------------- | ---------------------------------------- |
| walk with `statSync`            | 3,720                                    |
| walk with `lstatSync`           | 3                                        |
| `Get-ChildItem -Recurse -Force` | 0                                        |

The third row is why this became a gate rather than a note. Every cleanliness check in these
sessions has been PowerShell, which stops at a junction and reports zero, so the safe tool returns
a reassuring answer to a question it never asked. A probe carries its runtime's traversal
semantics, and nobody states traversal semantics. The hazard is not hypothetical here: a cleanup
enumerated through one of these junctions and deleted `node_modules` plus 2,825 tracked files.
Every individual delete was by name and compliant. **The walk that produced the names was not.**

### The census that motivated the gate was wrong six times out of six

The first pass grepped `recursive:\s*true` and returned six production hits. All six were false
positives -- five `mkdirSync(dir, { recursive: true })` and one `watch()`. Creating a directory
tree and reading one share a spelling and nothing else. That is the fifth consecutive syntactic
detector here corrected by execution, and the rule it keeps re-teaching is unchanged: _if the
property is "what does this program do", run the program._

### Three idioms, three different verdicts

The gate's first real run returned four sites of three shapes, which is the finding worth keeping:

| site                                     | shape                                       | resolution                        |
| ---------------------------------------- | ------------------------------------------- | --------------------------------- |
| `tools/verify-build-env.mjs`             | recursive walk gated by `statSync`          | fixed to `lstatSync` + skip links |
| `tools/check-ai-manifest.test.mjs`       | one-shot predicate wanting a real directory | fixed to `lstatSync`              |
| `tools/check-doc-links.mjs`              | classifies a link _target_                  | exempt, with criterion            |
| `tools/check-web-performance-budget.mjs` | classifies an operator-supplied path        | exempt, with criterion            |

A fourth idiom is safe and correctly unflagged: `readdirSync(dir, { withFileTypes: true })` yields
a `Dirent` whose `isDirectory()` is lstat-semantics. Discriminating "recurses" from "merely
tests" syntactically is the same inference that produced the 6/6 false positives, so the gate does
not attempt it. It reports the idiom and demands a recorded criterion where following is intended
-- deliberately **narrow in the opposite direction**: broader than its name, and honest about it.

### The gate flagged its own docstring, and that was a real defect

Its first run reported three violations, all inside its own block comment and regex literals.
`literalSpans` is line-wise -- it returns on `//` and tracks nothing across lines -- and it
deliberately omits regex spans, because its existing callers ask "is this quote data?" rather than
"is this token a call?". Both properties made a file _describing_ an idiom read as one _committing_
it. The fix added `maskedSpans` to `tools/lib/source.mjs`, covering strings, line comments,
block comments, and regex literals. `check-tool-imports` shares the same blind spot and is now
able to adopt it.

### The baseline control caught a defect the violating fixture could not

The `gate:teeth` fixture exited 1, which by exit code alone is a proven gate. Its control -- the
byte-identical fixture with `lstatSync` -- also exited 1. The cause was in the gate, not the
fixture: staleness was computed against _every_ exemption, so running anywhere but the real
repository reported all of them stale. Staleness was rescoped to files actually scanned, which is
the honest criterion (a justification can only stop applying to a file in scope), and the residual
hole -- an exemption naming a deleted file -- is pinned by a test rather than pretended away.

**The report separates error from violation; the control separates gate from fixture.** Both
fixtures here exited 1, and only the control could tell them apart.

### A third instrument found a third defect, on the same walk

CodeQL then flagged the gate's own walk as `js/file-system-race` (high). The first version listed
a directory and then `lstatSync`-ed each entry: link-safe, and still a check-then-use. The fix is
the idiom this same file already documents as safe -- `readdirSync(dir, { withFileTypes: true })`
-- because a `Dirent` is lstat-semantics _and_ arrives with the listing, so there is no window
between deciding what an entry is and acting on it.

Worth recording rather than quietly fixing. The property I verified by execution was
link-following, and I never asked the second question, so the tool that caught it was one I had not
thought to consult. Three defects in this gate, each found by a different instrument -- its own
first run, its baseline control, and a static analyser -- and **none of them by the instrument that
found the previous one**. That is the same shape as the PowerShell result at the top of this
section, arrived at three more times in a single change.

### An honest negative, and a flake

Live exposure in this repository today is **zero**. The one unguarded walk skipped anything named
`node_modules`, and the junctions live inside one, so the hazard was latent rather than active.
The detector is still worth more than the fix, because the idiom is the default and the next walk
to be written would not have been so lucky.

Two test files also failed CI once with `does not provide an export named`, on modules this
change never touched, and passed on re-run. Recorded as a flake in the Node 22 runner rather than
diagnosed -- with the note that local verification here runs Node 24 while CI runs Node 22, so
"passes locally" has been a weaker claim throughout this work than it sounded.

## A control is the transferable form of an exact-diagnostic assertion

`gate:teeth` graded a gate proven when it exited non-zero and its report named the violation. That
rejects a fixture which failed to scaffold, and the `jrmoulckers/engineering` session pointed out
that it does not reject a fixture failing for the injected defect _and_ something unrelated. Their
prover asserts an exact diagnostic count, which forecloses the case by construction.

The count does not transfer: finance's gates emit free-form prose with no enumerable diagnostic
unit, and importing the criterion into a population it does not govern is its own error. The
transferable form is the **control** -- the same fixture with the defect removed, required to exit 0. It reaches the same guarantee from the other side, because anything else wrong with the fixture
also fails the control.

Measured before and after, on one fixture with a second independent defect added:

|        | `status` | `named` | `controlStatus` | `ok`      |
| ------ | -------- | ------- | --------------- | --------- |
| before | 1        | true    | --              | **true**  |
| after  | 1        | true    | 1               | **false** |

Wiring the controls found two more gates whose fixtures had been failing for two reasons, and both
were already graded proven:

- `check-doc-links.mjs` reported all 11 baseline entries as no-longer-broken, because their citing
  documents are absent from a fixture.
- `check-markdown-primitives.mjs` reported both allowances as matching no site, for the same reason.

That is the defect fixed in `check-walk-safety.mjs` one round earlier, found there by hand and here
by execution: **a gate whose staleness check is not scoped to the population it actually read cannot
pass on any tree but the real one, so no clean fixture can prove it.** Both now scope staleness to
scanned files. Real-tree behaviour is unchanged; each keeps one residual hole -- an entry naming a
deleted file -- pinned by a named test rather than left to be rediscovered.

One entry declares no control. `gate:enforcement` reads its population from `CLAIMED_GATES`, a
constant compiled into its own source, so every fixture short of the repository reports the other
gates as unreached. It carries a `controlCriterion` saying so, which is checked to exist and to
name an obstacle. An entry that cannot be proven attributable should say which, rather than be
quietly dropped to keep the table tidy.

The general shape: the controls existed for every gate here, verified by hand when each entry was
added, and recorded only in a transcript. **A hand-verified property is a session artifact -- it
decays, and nothing re-derives it.** Both defects above were introduced after the hand verification
and neither was noticed, because nothing was still asking.

## A masking pair: the first defect decides whether the second is observable

An upstream session reported two defects in one checker and, after a two-arm fixture, found they
were one ordered mechanism rather than two observations: the earlier one consumes the file, so
the later one is not merely unfixed but _unmeasurable in exactly the population where it would
matter_. That class reproduces in finance, in a gate this repository wrote itself.

`bounds:check` requires every numeric bound in a test to be either derived or annotated with an
`unsourced-bound:` marker. `markerReason` looked for the marker with the **line-wise**
`stripLiterals`, so a line inside a multi-line template literal carries no quote, nothing is
stripped, and text the author never wrote as an annotation is accepted as one.

Two arms, identical invented bound `assert.ok(total() > 4173)`:

| arm | marker                                   | exit | report                                 |
| --- | ---------------------------------------- | ---- | -------------------------------------- |
| A   | none                                     | 1    | names `armB.test.mjs:5 >4173`          |
| B   | inside a template literal, 3 lines above | 0    | "Every bound is annotated or derived." |

This is a **false negative** -- the dangerous direction. A false positive is noise a human
resolves; a false negative is a green build that has excused the thing the gate exists to catch.

The fix is whole-file masking: `censusFile` now detects against
`maskSource(source, { comments: false })` rather than the raw lines, and reports text from the
original so line numbers still point where a reader expects. `maskSource` blanks masked spans to
spaces and preserves every newline, so a line-wise caller gets whole-file correctness without
changing shape.

### Why comments stay visible here, and only here

`maskedSpans` masks comments by default, which is right for a caller asking _"is this token a
call site?"_. It is wrong for a caller reading **an annotation the author deliberately wrote in a
comment** -- masking would erase every annotation and turn the false negative into a total
failure. Hence a `{ comments }` option on the one primitive rather than a second implementation,
which `markdown:primitives:check` would flag as duplication in any case. Two callers can want
opposite answers from the same primitive; that is a parameter, not a fork.

### Direction, measured across the other call sites

Seven call sites use the line-wise primitives (`check-assertion-bounds.mjs:105,125,155,217`,
`check-citation-enumerations.mjs:185`, `check-markdown-primitives.mjs:181`,
`check-tool-imports.mjs:114`). Only the marker one is a false negative; the rest over-count and
so fail loudly. Only the marker path was changed. **Sharing a defective primitive does not mean
sharing a defect of equal severity -- the direction depends on what the caller does with the
answer**, and a blanket migration would have been a larger diff for no safety gain.

### Two corrections owed

- The first probe reported that `maskedSpans` lacks template-literal support. It does not.
  PowerShell's backtick is an escape character and silently ate the template delimiters, so the
  probe measured a different string than the one written. `maskedSpans` was correct all along;
  the sole cause was `markerReason`'s line-wise call. **A harness that transforms its own input
  produces a root cause about a program that was never run.**
- The upstream defect itself -- a pragma tested against raw text, so a pragma inside a fence or a
  literal excuses the file -- exists in finance **byte-identically**, in the vendored
  `config/engineering/citations/check-citations.mjs`. It has **zero reach**: `citations-check:
ignore-file` occurs 0 times in this repository. The vendored file must not diverge, so this is
  an upstream report rather than a local patch -- an instance of _reach is not delta_.

## A surviving mutation does not mean a weak test

An upstream session found that two independently sufficient guards are **mutually
unfalsifiable**: remove either and every test stays green, so you cannot learn which layer you
actually have. Their framing was that redundancy, usually described as defence in depth, is also
the condition under which a guard is _misattributed_.

Tested here by mutating the two link-safe walks and running both their tests and the gate:

| walk             | mutation                          | tests    | `walk:safety:check` |
| ---------------- | --------------------------------- | -------- | ------------------- |
| `readSources`    | drop the `node_modules` name skip | pass     | pass                |
| `readSources`    | drop `isSymbolicLink()`           | **fail** | pass                |
| `collectScripts` | drop the `node_modules` name skip | pass     | pass                |
| `collectScripts` | drop `isSymbolicLink()`           | pass     | pass                |
| `collectScripts` | `lstatSync` -> `statSync`         | fail     | **fail**            |

The claim reproduces. The one failure was a **source-text** match on `entry.isSymbolicLink()`,
so it asserted that a line exists, not that a link is excluded.

### The correction, which is the part worth carrying

The obvious reading of a surviving mutation is "the test is weak." A fixture with a directory
junction said otherwise -- removing the link skip changed nothing, because `lstat` already
reports a junction as a non-directory. That reads as **dead code**, and I nearly recorded it as
such. It was the wrong population. Adding a _file_ symlink:

```
shipped  []
noLink   ["tools/filelink.mjs"]      <- the guard is load-bearing after all
stat     ["tools/filelink.mjs", "tools/linked/leaked.mjs", "tools/linked/outside.mjs"]
```

**A surviving mutation is uninterpretable until you know the surviving population contains the
case the guard is for.** Weak test and dead guard produce the identical signal, and they need
opposite responses -- one is a test to write, the other is a line to delete.

### Load-bearing is a property of a different line

`Dirent` for a link reports `isFile=false, isDirectory=false, isSymbolicLink=true`. So a walk
that gates recursion on `isDirectory()` **and** collection on `isFile()` excludes both hazards
with no link skip at all.

- `collectScripts` collects in an `else if (isScannedFile(entry))` branch with no positive type
  test, so its skip is load-bearing.
- `readSources` gates on `entry.isFile()`, so its skip is genuinely redundant.

Same guard, same file shape, opposite verdicts, decided by the collection predicate. A census
keyed on the guard cannot see this: asking which walks call `isSymbolicLink` flagged
`scripts/vendor-configs.mjs`, `check-citation-enumerations.mjs`, and
`check-node-version-consistency.mjs` -- **three false positives**, all three safe by `isFile()`
gating. Adding the "missing" guard to each would have been three changes that fixed nothing and
looked thorough.

### What changed

Both walks now have a behavioural test: a temp tree with a symlinked script and a linked
directory, asserting the real file is still collected and nothing named `linked` is. The
source-text assertion is gone. The mutation that previously survived now fails by name
(`no link was followed: tools\\linked.mjs`), and swapping `readSources` off `Dirent` fails
reporting both leaks including the one through the junction.

`readSources` keeps its redundant skip as defence against a future change to the collection
predicate, and the test says so in as many words: **a guard knowingly kept and knowingly
unfalsifiable is honest; one assumed to be load-bearing is not.** A test that fails when you
delete dead code is asserting an implementation, not a property.

### The fixture failed in CI for the reason the test is about

Both link tests passed locally and the `ESLint & Prettier` job failed on Linux:

```
error: "ENOTDIR: not a directory, rmdir '/tmp/mdlink-CSibbT/tools/linkeddir'"
```

`symlinkSync`'s third argument is **Windows-only**. On Linux `'junction'` is ignored and a plain
symlink is created, so `rmdir` is the wrong call. The cleanup branched on the type I _requested_
rather than on what the filesystem actually produced -- which is the same error the test exists
to document, committed in the test's own teardown. It now tries `unlink` and falls back.

Worth stating alongside the Node 24-local / 22-CI gap already recorded here: **"passes locally"
is weaker than it sounds in exactly the areas where a platform decides semantics**, and link
handling is the clearest of them.

## The mutation a count cannot see, and the verdict that pointed at the wrong file

An upstream session mutated its validator to append an error unconditionally -- a validator that
rejects every valid input in existence. Its 470-line prover passed clean, because every
assertion in it is _invalid input must fail_, and the negative fixtures' diagnostics and counts
were untouched. **A count criterion is powerless against a mutation that adds no diagnostic to
any negative fixture.**

That is the axis `gate:teeth` bought when it declined the count and adopted a `control` instead
(#4351). Tested rather than assumed, by mutating `tools/check-text-encoding.mjs`:

| mutation   | gate on real tree | `gate:teeth` | caught by                                    |
| ---------- | ----------------- | ------------ | -------------------------------------------- |
| reject-all | exit 1            | **exit 1**   | the control (valid input stopped passing)    |
| accept-all | exit 0            | **exit 1**   | the violating fixture (exit 0 over a defect) |

Both directions caught, by different halves. Neither half alone would do: the fixture cannot see
reject-all and the control cannot see accept-all. **The two criteria foreclose disjoint classes,
and having the stricter-looking one is not having both.**

### The defect the experiment surfaced

The reject-all run was caught with the _wrong reason_:

```
encoding:check -> exit 1, control exit 1 FAILED FOR ANOTHER REASON (report did not name the violation)
```

True, and misleading. A gate rejecting everything emits a report that names nothing, so `named`
is false -- but that is a **symptom**; the control exiting 1 is the **cause**. The precedence in
`report` tested `named` first, so it blamed the message text and would have sent a reader to the
report strings while valid input had quietly stopped passing. Fixed: the control is tested
first, and the wording no longer asserts a dirty fixture when a rejecting gate is equally
consistent with the evidence.

**A verdict that is true can still be wrong, when what it names is not what a reader should go
and look at.** Both branches of the precedence now have a test, so the reordering cannot swallow
the case it displaced.

### The harness assertion this round adopted

The upstream session's first mutation attempt _did not mutate_ -- a CRLF anchor against an LF
file, `String.Replace` matching nothing and returning the original. Unguarded, that run would
have produced exactly the evidence the hypothesis wanted, with a normal exit and no trace. Every
mutation in this round therefore asserts that the text actually changed before running anything:

```powershell
if ($mutated -eq $orig) { throw "mutation did not apply" }
```

**A mutation test that silently fails to mutate is a negative control at zero** -- the same
two-reasons-at-once hole as a fixture that fails to scaffold, but in the direction that leaves
no evidence.

## Worth hoisting up

Finance-invented, generic, and absent from the shared layers:

- **A currency check must compare the artifact, not the version label.** `vendor-configs.mjs`
  reported "pinned at `v0.15.7`; newest release is `v0.77.0`" — 62 releases, which reads as
  seriously stale. Both vendored files are **byte-identical at both refs**, and identical at every
  ref from `v0.5.0` through `main`; the last real change was the `proseWrap` reversal finance itself
  argued for. Ref distance is not artifact distance whenever the vendored subset changes less often
  than the repository is tagged, which is the normal case for a config package. The notice now
  compares the SHA-256 the lock already records and distinguishes "newer tag, no diff" from "newer
  tag, these N files differ". This matters for the same asymmetry reason as an un-failable
  guardrail: a notice that is a false alarm 62 times trains the reader to skip the one time it is
  real, so a signal nobody reads and one that never fires fail identically. Both directions are
  controlled — `v0.2.0` reports both files as differing, `v0.5.0`/`v0.77.0`/`main` report identical.

  Generic to any vendor-by-ref scheme, so it belongs in `jrmoulckers/.github` rather than here.

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

  **Correction, measured.** The clause "under `pipefail`" above was wrong about the mechanism, and
  the conclusion survives it. A `grep` whose no-match is the **last** command in the pipeline fails
  under plain `-e` too, because the assignment takes the exit status of the last command in the
  substitution — `pipefail` is not what catches that case. Measured, all four combinations:

  | Pipeline shape                                       | `bash -e` | `bash -eo pipefail` |
  | ---------------------------------------------------- | --------- | ------------------- |
  | last command fails (`… \| grep -v`, no match)        | 1         | 1                   |
  | **early fails, last always succeeds** (`… \| wc -l`) | **0**     | **1**               |
  | finance's `echo "$HITS" \| wc -l`                    | 0         | 0                   |
  | the shipped `\|\| echo ""` guard                     | 0         | 0                   |

  So the hazard is a pipeline **ending in a command that always succeeds** — `wc -l`, `head`,
  `sort`, `tee`. Those report success under GitHub's default shell and start failing the moment
  someone adds `shell: bash`, which GitHub expands to `bash --noprofile --norc -eo pipefail`.
  Adding that line looks like a formatting preference and is a semantic change to error handling.

  finance's own `COUNT=$(echo "$HITS" | wc -l)` is that exact shape and is safe **only** because
  `echo` cannot fail. It is one substituted command away from the failing form.

- **A live instance of it, found by applying the corrected rule.** `ci-windows.yml` declares
  `shell: bash` and ran `MSI=$(find … -name '*.msi' 2>/dev/null | head -1)`. `find` exits 1 when
  the build produced no output directory; `head` still exits 0; `pipefail` propagates the 1 and
  `-e` aborts the step at the assignment. The step is `if: always()` — so it runs **because** the
  build failed, which is precisely when the directory is absent. Reproduced: dir absent under
  pipefail, step exits 1 and nothing after that line executes; under the default shell, exit 0.
  With `|| true`, exit 0 and `MSI` empty; with a real MSI present the guard changes nothing.

  Fixed, plus three latent instances of the same shape that are safe today only because their
  steps do not declare `shell: bash` — `ci-android.yml` (`find … .apk | head -1`) and two in
  `ci-ios.yml` (`.profdata`, `.xctest`). Guarding them now means adding `shell: bash` later cannot
  quietly convert them into the live case.

  The generalisable part is the same asymmetry as the required-check finding, one layer down: the
  guard is missing **exactly on the runs the step exists for**. A summary step that reports build
  failures had a failure mode reachable only on failed builds, so every green run confirmed it.
