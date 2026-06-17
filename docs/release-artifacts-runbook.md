# Release Artifact Generation — Runbook

> **Issue:** #772  
> **Workflow:** `.github/workflows/release-platform.yml`

## Overview

This document describes how release artifacts are generated, verified, and
published for every supported platform (Android, iOS, Web, Windows).

## Trigger Flow

```
Tag push (v*)
  → release-platform.yml creates GitHub Release
    → release-platform.yml builds all platforms in parallel
      → Artifacts uploaded to GitHub Release (after human approval)
```

## Artifacts Produced

| Platform | Artifact                              | Signed?                           | Notes                                             |
| -------- | ------------------------------------- | --------------------------------- | ------------------------------------------------- |
| Android  | `finance-android-{version}.apk`       | Yes (if keystore configured)      | Debug-signed if no release keystore               |
| Android  | `finance-android-{version}.aab`       | Yes (if keystore configured)      | Required for Google Play upload                   |
| iOS      | `finance-ios-{version}.xcarchive.zip` | No (CI)                           | Re-sign locally or via Fastlane for distribution  |
| iOS      | `finance-ios-{version}.ipa`           | Yes (if signing identity present) | Only produced when signing secrets are configured |
| Web      | `finance-web-{version}.tar.gz`        | N/A                               | Production Vite build                             |
| Web      | `finance-web-{version}.zip`           | N/A                               | Same bundle in ZIP format                         |
| Windows  | `finance-windows-{version}.msi`       | No (CI)                           | Sign with signtool post-build for distribution    |
| Windows  | `finance-windows-{version}.exe`       | No (CI)                           | Sign with signtool post-build for distribution    |
| All      | `CHECKSUMS.sha256`                    | N/A                               | SHA-256 hashes for all artifacts                  |

## Version Strategy

Versions are derived from the Git tag:

- Tag `v1.2.3` → version `1.2.3`, version code `10203`
- Tag `v1.2.3-rc.1` → pre-release, version `1.2.3-rc.1`
- Android `versionCode` = `major * 10000 + minor * 100 + patch`

## Required GitHub Secrets

### Android Signing (optional — produces unsigned APK/AAB if not set)

| Secret                      | Description                          |
| --------------------------- | ------------------------------------ |
| `ANDROID_KEYSTORE_BASE64`   | Base64-encoded release keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                    |
| `ANDROID_KEY_ALIAS`         | Key alias within the keystore        |
| `ANDROID_KEY_PASSWORD`      | Key password                         |

Generate the base64 keystore:

```bash
base64 -i release.keystore | pbcopy  # macOS
base64 -w0 release.keystore          # Linux
```

### iOS Signing (optional — produces unsigned xcarchive if not set)

iOS signing is handled via Fastlane Match. Configure these secrets for signed builds:

| Secret                      | Description                         |
| --------------------------- | ----------------------------------- |
| `MATCH_PASSWORD`            | Fastlane Match encryption password  |
| `MATCH_GIT_URL`             | Git URL for certificates repository |
| `APP_STORE_CONNECT_API_KEY` | App Store Connect API key (JSON)    |

### Web Environment

| Secret              | Description                       |
| ------------------- | --------------------------------- |
| `SUPABASE_URL`      | Production Supabase project URL   |
| `SUPABASE_ANON_KEY` | Production Supabase anonymous key |
| `POWERSYNC_URL`     | Production PowerSync endpoint     |

### Windows Signing (optional — sign post-build)

Windows artifacts are currently unsigned. For production distribution:

1. Download the MSI/EXE from the release
2. Sign with `signtool.exe` using your code signing certificate
3. Re-upload the signed artifact

## GitHub Environment Setup

The `upload-to-release` job requires a **`production` environment** with:

- **Required reviewers** — at least 1 human must approve
- **Deployment branches** — restrict to `main` and `v*` tags

Configure at: `Settings → Environments → production`

## Manual Trigger (Re-builds / Testing)

The workflow supports `workflow_dispatch` for manual runs:

1. Go to **Actions → Release Artifacts → Run workflow**
2. Enter the tag (e.g., `v1.0.0`)
3. Enable **Dry run** to build without uploading to the release

## Verifying Artifacts

Download `CHECKSUMS.sha256` from the release and verify:

```bash
# Linux / macOS
sha256sum -c CHECKSUMS.sha256

# Windows (PowerShell)
Get-Content CHECKSUMS.sha256 | ForEach-Object {
  $parts = $_ -split '\s+'
  $expected = $parts[0]
  $file = $parts[1]
  $actual = (Get-FileHash $file -Algorithm SHA256).Hash.ToLower()
  if ($actual -eq $expected) { Write-Host "✅ $file" }
  else { Write-Host "❌ $file (expected $expected, got $actual)" }
}
```

## Troubleshooting

| Problem                                  | Solution                                                    |
| ---------------------------------------- | ----------------------------------------------------------- |
| Android build fails with "SDK not found" | Ensure `android-actions/setup-android` step runs first      |
| iOS archive fails                        | Check Xcode version compatibility on `macos-15` runner      |
| Web build fails with missing env vars    | Set `VITE_*` secrets in repository settings                 |
| Windows MSI not found                    | Check Gradle `packageMsi` task output path                  |
| Upload to release fails                  | Ensure `production` environment is configured with approval |
| Checksums don't match                    | Re-download — CDN caching may serve stale files             |
