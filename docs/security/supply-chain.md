# Supply-chain provenance

Production releases publish signed in-toto SLSA build provenance for shipped artifacts using `actions/attest-build-provenance@v3`. These attestations provide SLSA Level 2+ supply-chain integrity signals by binding each artifact digest to the GitHub Actions workflow, commit, and repository that produced it.

Downstream consumers can verify a downloaded artifact with GitHub CLI:

```sh
gh attestation verify <artifact> --repo jrmoulckers/finance
```

Attestations are visible at <https://github.com/jrmoulckers/finance/attestations>.

## Attested artifacts

- Web: production web bundles and design-token build output from `release-platform.yml`; packaged web `.tar.gz`, `.zip`, and checksum files from `release-platform.yml`; canary and promoted web deployment build output from `deploy-progressive.yml`.
- Android: release APK and AAB artifacts, plus packaged APK/AAB/checksum files from `release-platform.yml`.
- iOS: exported IPA, plus packaged IPA or xcarchive zip/checksum files from `release-platform.yml`.
- Windows: signed MSI installer and standalone distributable output, plus packaged MSI/EXE/checksum files from `release-platform.yml`.
- Release manifests: combined `CHECKSUMS.sha256` and all final GitHub Release assets assembled by `release-platform.yml`.

## Registry routing

`.npmrc` routes **by scope only**:

```ini
@jrmoulckers:registry=https://npm.pkg.github.com
```

Two rules follow from that line, and both are load-bearing:

- **Never replace the default registry.** A bare `registry=https://npm.pkg.github.com/` breaks `npm audit` with `ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS`, because GitHub Packages implements no advisory endpoint and `@npmcli/arborist` resolves it as `auditRegistry || registry` — it never consults the scoped registry. No token fixes this; it is a routing fault, not an auth fault.
- **Never commit a credential.** `.npmrc` carries no `_authToken`. Tokens are set user-level, or supplied in CI by `actions/setup-node`. A committed project-level `.npmrc` also outranks the user-level file `setup-node` writes, so the routing line above must name the same host the CI token is bound to.

## Audit data egress

`npm audit` sends the resolved dependency set to `registry.npmjs.org` at `POST /-/npm/v1/security/advisories/bulk` (gzip-encoded). Measured against this repository:

| Package class                                      | Transmitted? | Evidence                                                       |
| -------------------------------------------------- | ------------ | -------------------------------------------------------------- |
| Public dependencies                                | Yes          | 745 name/version pairs in one request                          |
| This repo's own `private: true` workspace packages | **No**       | zero `@finance/*` entries in that same request                 |
| Dependencies resolved from `npm.pkg.github.com`    | **Yes**      | isolated probe sent `{"@jrmoulckers/eslint-config":["0.2.1"]}` |

The exposure is therefore narrower than "private package names leak", but it is real and it is the half that matters: scoping a dependency to a private registry does **not** keep its name and version out of the bulk advisory request. Once `@jrmoulckers/*` is a dependency here, those names and versions reach npmjs on every audit.

This is inherent `npm audit` behaviour, not something the shared toolchain introduces. No financial or user data is involved — the payload is dependency metadata only — so it is recorded rather than mitigated. Suppress it with `npm audit --offline` or omit the audit step where that egress is unacceptable.

## Vendored-config staleness check

`node scripts/vendor-configs.mjs --check` runs in `ci-lint.yml` and does two separable things:

| Step                                                           | Network                                                                            | Failure mode                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------- |
| Hash the vendored tree against `engineering-configs.lock.json` | none                                                                               | **fails the build on drift** |
| Report a newer upstream release                                | unauthenticated `GET api.github.com/repos/jrmoulckers/engineering/releases/latest` | notice only, exit 0          |

The second is the one with an egress footprint. It transmits nothing about this repository — no
dependency set, no package names, no request body — so unlike the audit egress above there is no
disclosure to weigh; it is a plain public read. It **fails open** by design: non-200, rate limit,
or an offline runner all yield "no answer", which is treated as fine rather than as a stale
signal.

Recorded because the call is invisible at the call site and sits inside a required gate. It is
also why the two halves must not be conflated: **a green `--check` means the tree matches the
lock, not that the pin is current.** Only the first half is authoritative offline.

## Policy

Any release marked `production` must have a green provenance attestation for every shipped artifact. Release CI must fail if provenance generation fails; dry-run or non-publishing runs may skip attestation because no production artifact is shipped.
