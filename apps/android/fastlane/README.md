# Fastlane — Android

This directory contains [Fastlane](https://fastlane.tools/) configuration for
building, signing, and deploying the Finance Android app.

## Setup

### Prerequisites

1. Ruby 3.x with Bundler (`gem install bundler`)
2. A filled-in `keystore.properties` file (copy from `keystore.properties.template`)
3. Google Play service account JSON at `fastlane/play-store-service-account.json`

### Install Fastlane

```bash
cd apps/android
bundle install
```

## Lanes

| Lane              | Description                                       |
| ----------------- | ------------------------------------------------- |
| `build_alpha`     | Build signed release APK + AAB                    |
| `upload_internal` | Upload AAB to Play Store internal testing (draft) |
| `upload_alpha`    | Upload AAB to Play Store alpha track (draft)      |

### Usage

```bash
cd apps/android
bundle exec fastlane build_alpha
bundle exec fastlane upload_internal
```

## CI Integration

In CI (GitHub Actions), signing credentials are injected via environment
variables and GitHub Secrets. The `release-android.yml` workflow handles
keystore decoding and Gradle property injection automatically.

### Required GitHub Secrets

| Secret                             | Description                             |
| ---------------------------------- | --------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`          | Base64-encoded release keystore file    |
| `ANDROID_KEYSTORE_PASSWORD`        | Keystore password                       |
| `ANDROID_KEY_ALIAS`                | Key alias (e.g., `finance`)             |
| `ANDROID_KEY_PASSWORD`             | Key password                            |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Service account JSON for Play Store API |

## Metadata Management

The `metadata/android/` directory (managed by `supply`) holds Play Store
listing metadata (title, description, changelogs, screenshots). To pull
existing metadata from the Play Store:

```bash
bundle exec fastlane supply init
```

See [Fastlane supply docs](https://docs.fastlane.tools/actions/supply/) for
more details on metadata management.
