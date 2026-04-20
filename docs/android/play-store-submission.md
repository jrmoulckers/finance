# Google Play Store Submission Guide

> Issue: #766 — task(android): Google Play Store submission preparation

This document covers everything needed to submit the Finance app to Google
Play Store, including signing, store listing, content rating, data safety,
and privacy policy requirements.

---

## Table of Contents

1. [Pre-Submission Checklist](#pre-submission-checklist)
2. [App Signing Configuration](#app-signing-configuration)
3. [Store Listing Metadata](#store-listing-metadata)
4. [Content Rating Questionnaire](#content-rating-questionnaire)
5. [Data Safety Form](#data-safety-form)
6. [Privacy Policy](#privacy-policy)
7. [Release Management](#release-management)
8. [CI/CD Integration](#cicd-integration)

---

## Pre-Submission Checklist

- [ ] **Google Play Developer account** registered and verified ($25 one-time fee)
- [ ] **App signing** configured (upload key + Play App Signing enrolled)
- [ ] **Store listing** complete for all supported languages (en-US, es-ES, fr-FR)
- [ ] **Screenshots** captured for phone (required) and tablet (recommended)
- [ ] **Feature graphic** (1024×500) designed and uploaded
- [ ] **High-res icon** (512×512) matches adaptive icon
- [ ] **Content rating** questionnaire completed (IARC)
- [ ] **Data safety form** submitted
- [ ] **Privacy policy URL** set and publicly accessible
- [ ] **Target API level** meets Google Play requirements (API 35)
- [ ] **App bundle** (.aab) builds and passes `bundletool` validation
- [ ] **ProGuard/R8** enabled for release builds (`isMinifyEnabled = true`)
- [ ] **Deobfuscation mapping** uploaded for crash reporting
- [ ] **Internal testing track** deployed and verified

---

## App Signing Configuration

### Generate an Upload Keystore

```bash
keytool -genkey -v \
  -keystore finance-upload.keystore \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -alias finance-upload \
  -dname "CN=Finance App, O=Finance, L=City, ST=State, C=US"
```

> ⚠️ **NEVER commit the keystore to source control.** Store it securely and
> back it up. Loss of the upload key requires contacting Google Play support.

### Configure Gradle Properties

Add to `~/.gradle/gradle.properties` (local development):

```properties
FINANCE_KEYSTORE_FILE=/secure/path/to/finance-upload.keystore
FINANCE_KEYSTORE_PASSWORD=<keystore-password>
FINANCE_KEY_ALIAS=finance-upload
FINANCE_KEY_PASSWORD=<key-password>
```

The `build.gradle.kts` signing config reads these properties:

```kotlin
signingConfigs {
    create("release") {
        storeFile = file(findProperty("FINANCE_KEYSTORE_FILE"))
        storePassword = findProperty("FINANCE_KEYSTORE_PASSWORD") as String?
        keyAlias = findProperty("FINANCE_KEY_ALIAS") as String?
        keyPassword = findProperty("FINANCE_KEY_PASSWORD") as String?
    }
}
```

### Enable Play App Signing

1. Go to **Google Play Console → Release → Setup → App signing**
2. Choose **"Let Google manage and protect your app signing key"**
3. Upload the **upload key certificate** (`.pem` exported from the keystore)
4. Google wraps your AAB with their managed signing key

This provides key rotation safety — if the upload key is compromised,
Google can issue a new one without affecting existing installations.

### CI Integration (GitHub Actions)

```yaml
- name: Decode upload keystore
  env:
    KEYSTORE_BASE64: ${{ secrets.FINANCE_KEYSTORE_BASE64 }}
  run: echo "$KEYSTORE_BASE64" | base64 -d > ${{ runner.temp }}/finance-upload.keystore

- name: Build release bundle
  run: |
    ./gradlew :apps:android:bundleRelease \
      -PFINANCE_KEYSTORE_FILE=${{ runner.temp }}/finance-upload.keystore \
      -PFINANCE_KEYSTORE_PASSWORD=${{ secrets.FINANCE_KEYSTORE_PASSWORD }} \
      -PFINANCE_KEY_ALIAS=${{ secrets.FINANCE_KEY_ALIAS }} \
      -PFINANCE_KEY_PASSWORD=${{ secrets.FINANCE_KEY_PASSWORD }}
```

Required GitHub Secrets:
| Secret | Description |
|--------|-------------|
| `FINANCE_KEYSTORE_BASE64` | Base64-encoded upload keystore |
| `FINANCE_KEYSTORE_PASSWORD` | Keystore password |
| `FINANCE_KEY_ALIAS` | Key alias (e.g., `finance-upload`) |
| `FINANCE_KEY_PASSWORD` | Key password |

---

## Store Listing Metadata

Store listing files are organized using the `play` directory convention at
`apps/android/src/main/play/`:

```
play/
├── contact-details/
│   └── contact-details.json
├── listings/
│   ├── en-US/
│   │   ├── title.txt            (max 30 chars)
│   │   ├── short-description.txt (max 80 chars)
│   │   ├── full-description.txt  (max 4000 chars)
│   │   └── graphics/
│   │       └── README.md         (asset specifications)
│   ├── es-ES/                    (Spanish)
│   └── fr-FR/                    (French)
└── release-notes/
    └── en-US/
        └── default.txt           (max 500 chars per release)
```

### Required Graphics

| Asset                  | Size         | Format              | Count |
| ---------------------- | ------------ | ------------------- | ----- |
| Feature Graphic        | 1024×500     | PNG/JPEG            | 1     |
| App Icon (Hi-res)      | 512×512      | PNG (32-bit, alpha) | 1     |
| Phone Screenshots      | 16:9 or 9:16 | PNG/JPEG            | 2–8   |
| 7" Tablet Screenshots  | Same ratios  | PNG/JPEG            | 0–8   |
| 10" Tablet Screenshots | Same ratios  | PNG/JPEG            | 0–8   |

Screenshots can be generated via Paparazzi snapshot tests:

```bash
./gradlew :apps:android:recordPaparazziDebug
```

---

## Content Rating Questionnaire

The IARC content rating questionnaire must be completed in Google Play Console.
Below are the recommended answers for the Finance app:

### Category: Finance

| Question                              | Answer | Rationale                                        |
| ------------------------------------- | ------ | ------------------------------------------------ |
| Does the app contain violence?        | **No** | Finance tracker, no violent content              |
| Does the app contain sexual content?  | **No** | N/A                                              |
| Does the app contain profanity?       | **No** | N/A                                              |
| Does the app contain drug references? | **No** | N/A                                              |
| Does the app contain gambling?        | **No** | Budget tracking only                             |
| Does the app allow users to interact? | **No** | Single-user app (household sharing is view-only) |
| Does the app share user location?     | **No** | No location tracking                             |
| Does the app allow purchases?         | **No** | No in-app purchases currently                    |
| Does the app contain ads?             | **No** | No advertisements                                |
| Is the app a news app?                | **No** | N/A                                              |

**Expected Rating:** IARC 3+ / ESRB Everyone / PEGI 3

---

## Data Safety Form

Google Play requires a Data Safety declaration. Below is the mapping for Finance:

### Data Collected

| Data Type                                            | Collected          | Shared | Purpose                     | Optional |
| ---------------------------------------------------- | ------------------ | ------ | --------------------------- | -------- |
| **Email address**                                    | Yes                | No     | Account authentication      | No       |
| **Name**                                             | Yes                | No     | User profile display        | Yes      |
| **Financial info** (transactions, accounts, budgets) | Yes                | No     | App functionality           | No       |
| **App interactions**                                 | Yes (with consent) | No     | Analytics & crash reporting | Yes      |
| **Crash logs**                                       | Yes (with consent) | No     | Stability improvement       | Yes      |
| **Device identifiers**                               | No                 | No     | —                           | —        |
| **Location**                                         | No                 | No     | —                           | —        |
| **Photos/videos**                                    | No                 | No     | —                           | —        |
| **Contacts**                                         | No                 | No     | —                           | —        |

### Data Security Practices

| Practice                        | Status                            |
| ------------------------------- | --------------------------------- |
| Data encrypted in transit       | ✅ HTTPS/TLS for all API calls    |
| Data encrypted at rest          | ✅ SQLCipher 4.6.1 with AES-256   |
| Users can request data deletion | ✅ Delete account in Settings     |
| Data retention policy           | Stored until user deletes account |
| Independent security review     | Planned                           |

### Data Handling Declaration

```
- All financial data is encrypted on-device using SQLCipher (AES-256-CBC)
- Authentication tokens stored in Android Keystore (hardware-backed)
- Network communication uses TLS 1.3
- No data is shared with third parties
- No advertising SDKs or trackers
- Crash reporting requires explicit user consent
- Users can delete all data from Settings → Delete Account
```

---

## Privacy Policy

A privacy policy is **required** before Play Store submission.

**Hosted at:** `https://finance.app/privacy` (must be publicly accessible)

The privacy policy must cover:

- What data is collected (see Data Safety table above)
- How data is used (app functionality, crash reporting with consent)
- How data is stored (SQLCipher encryption, Android Keystore)
- How data is shared (not shared with third parties)
- User rights (data export, account deletion)
- Cookie policy (N/A for mobile app)
- Contact information for privacy inquiries
- GDPR / CCPA compliance details
- Children's privacy (not directed at children under 13)

A draft privacy policy template is maintained at:
`docs/privacy-policy-template.md`

---

## Release Management

### Build Types

| Build Type | Signing         | Minify   | Target      |
| ---------- | --------------- | -------- | ----------- |
| `debug`    | Debug keystore  | No       | Development |
| `release`  | Upload keystore | Yes (R8) | Play Store  |

### Release Tracks

| Track                  | Purpose              | Rollout                       |
| ---------------------- | -------------------- | ----------------------------- |
| Internal testing       | Team validation      | Immediate                     |
| Closed testing (Alpha) | Beta testers         | Immediate                     |
| Open testing (Beta)    | Public beta          | Immediate                     |
| Production             | General availability | Staged (1% → 5% → 25% → 100%) |

### Version Strategy

```
versionCode: Sequential integer, incremented every release (1, 2, 3, …)
versionName: Semantic version (0.1.0, 0.2.0, 1.0.0, …)
```

Current: `versionCode = 1`, `versionName = "0.1.0"`

### Build Release AAB

```bash
# Local build
./gradlew :apps:android:bundleRelease

# Output at:
# apps/android/build/outputs/bundle/release/android-release.aab
```

### Validate AAB

```bash
# Install bundletool
# https://github.com/google/bundletool/releases

java -jar bundletool.jar validate --bundle=android-release.aab
```

### Upload Deobfuscation Mapping

For crash symbolication, upload the R8 mapping file:

```
apps/android/build/outputs/mapping/release/mapping.txt
```

Upload via Play Console → Release → Deobfuscation files, or automate with
the Google Play Developer API.

---

## CI/CD Integration

### Recommended Workflow

```
main branch
  └── PR merged
       └── GitHub Actions: Build release AAB
            └── Upload to internal testing track (automated)
                 └── QA verification
                      └── Promote to production (manual gate)
```

### GitHub Actions Workflow (Draft)

```yaml
name: Play Store Release

on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Decode keystore
        run: echo "${{ secrets.FINANCE_KEYSTORE_BASE64 }}" | base64 -d > keystore.jks

      - name: Build release AAB
        run: |
          ./gradlew :apps:android:bundleRelease \
            -PFINANCE_KEYSTORE_FILE=$PWD/keystore.jks \
            -PFINANCE_KEYSTORE_PASSWORD=${{ secrets.FINANCE_KEYSTORE_PASSWORD }} \
            -PFINANCE_KEY_ALIAS=${{ secrets.FINANCE_KEY_ALIAS }} \
            -PFINANCE_KEY_PASSWORD=${{ secrets.FINANCE_KEY_PASSWORD }}

      - name: Upload AAB artifact
        uses: actions/upload-artifact@v4
        with:
          name: release-aab
          path: apps/android/build/outputs/bundle/release/*.aab

      - name: Upload mapping
        uses: actions/upload-artifact@v4
        with:
          name: mapping
          path: apps/android/build/outputs/mapping/release/mapping.txt
```

> **Note:** Automated Play Store uploads via the Play Developer API
> (e.g., using `r0adkll/upload-google-play`) can be added once the
> service account is configured. This is a human-gated operation.
