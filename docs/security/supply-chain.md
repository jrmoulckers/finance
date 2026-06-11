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

## Policy

Any release marked `production` must have a green provenance attestation for every shipped artifact. Release CI must fail if provenance generation fails; dry-run or non-publishing runs may skip attestation because no production artifact is shipped.
