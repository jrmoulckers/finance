# Alpha Submission & Deployment Checklist

> **Issue:** #1248
> **Branch:** `feat/alpha-deploy-scaffolding-1248`

Complete checklist for submitting alpha builds to all four platforms and
deploying the web app.

---

## Table of Contents

- [Pre-Submission Checklist (All Platforms)](#pre-submission-checklist-all-platforms)
- [Required Assets](#required-assets)
- [iOS — TestFlight](#ios--testflight)
- [Android — Google Play Internal Testing](#android--google-play-internal-testing)
- [Web — Vercel Deployment](#web--vercel-deployment)
- [Windows — Sideloading](#windows--sideloading-for-alpha)
- [GitHub Secrets Summary](#github-secrets-summary)

---

## Pre-Submission Checklist (All Platforms)

Before submitting any alpha build, verify:

- [ ] All CI checks pass on `main` (`gh pr checks` or Actions tab)
- [ ] Version number is set correctly (no `0.0.0` or `1.0.0` placeholders)
- [ ] No hardcoded secrets, API keys, or debug credentials in the build
- [ ] Privacy policy URL is live and accessible
- [ ] Terms of service URL is live and accessible
- [ ] App icons are final (or clearly marked as alpha/beta)
- [ ] Crash reporting is configured (Crashlytics / MetricKit / Sentry)
- [ ] Supabase project is configured (auth providers, RLS policies, Edge Functions)
- [ ] PowerSync sync rules are deployed
- [ ] Feature flags are set for alpha (disable unfinished features)
- [ ] Accessibility: basic screen reader testing done on each platform
- [ ] Export compliance questionnaire answers prepared (encryption usage)

---

## Required Assets

### App Icons

| Platform | Sizes Required                                                     |
| -------- | ------------------------------------------------------------------ |
| iOS      | 1024×1024 (App Store), 180×180, 120×120, 87×87, 80×80, 60×60, etc. |
| Android  | 512×512 (Play Store), adaptive icon foreground + background layers |
| Web      | 512×512 (PWA manifest), 192×192, 180×180 (apple-touch), favicon    |
| Windows  | 310×310, 150×150, 71×71, 44×44, StoreLogo.png (50×50)              |

### Screenshots

| Platform | Requirement                                                    |
| -------- | -------------------------------------------------------------- |
| iOS      | 6.7" (iPhone 15 Pro Max), 6.1" (iPhone 15 Pro), iPad Pro 12.9" |
| Android  | Phone (16:9), Tablet (optional for alpha)                      |
| Web      | Desktop (1280×800), Mobile (375×812) — for marketing/docs only |
| Windows  | 1366×768 minimum — for Store listing                           |

### Store Listing Copy

Prepare for each platform:

- [ ] App name: `Finance` (or `Finance — Alpha` for testing tracks)
- [ ] Short description (80 chars): Personal finance tracker for budgets & goals
- [ ] Full description (4000 chars): Detailed feature list and value proposition
- [ ] Category: Finance
- [ ] Content rating questionnaire completed
- [ ] Privacy policy URL
- [ ] Support email address

---

## iOS — TestFlight

### Prerequisites

- [ ] Apple Developer Program membership ($99/year) — [Enroll](https://developer.apple.com/programs/)
- [ ] App registered in App Store Connect
- [ ] Signing certificates and provisioning profiles configured (Fastlane match)
- [ ] Push notification certificate (if applicable)

### Setup Steps

1. **Register App ID**
   - Go to [App Store Connect](https://appstoreconnect.apple.com/) → My Apps → **+**
   - Bundle ID: `com.finance.ios`
   - Name: `Finance`
   - Primary language: English (U.S.)

2. **Configure Fastlane Match** (if not already done)

   ```bash
   cd apps/ios
   fastlane match init  # set up certificate repo
   fastlane match appstore  # fetch/create App Store certificates
   ```

3. **Build and Upload**

   ```bash
   # Via CI (recommended):
   # Trigger release-ios.yml with workflow_dispatch

   # Via Fastlane locally:
   cd apps/ios
   fastlane beta  # builds, signs, uploads to TestFlight
   ```

4. **Configure TestFlight**
   - Go to App Store Connect → TestFlight
   - Create an **Internal Testing** group
   - Add team members (up to 100 internal testers)
   - Enable automatic distribution for new builds
   - Fill in **Test Information**: beta description, feedback email, privacy policy URL

5. **Submit for Beta Review**
   - First TestFlight build requires Apple's beta review (~24 hours)
   - Subsequent builds auto-distribute to internal testers

### GitHub Secrets for iOS CI

| Secret                          | Description                                |
| ------------------------------- | ------------------------------------------ |
| `APPLE_CONNECT_API_KEY_ID`      | App Store Connect API Key ID               |
| `APPLE_CONNECT_API_ISSUER_ID`   | App Store Connect API Issuer ID            |
| `APPLE_CONNECT_API_KEY_CONTENT` | App Store Connect API Key (.p8 content)    |
| `MATCH_PASSWORD`                | Password for Fastlane match encryption     |
| `MATCH_GIT_BASIC_AUTHORIZATION` | Git credentials for match certificate repo |

---

## Android — Google Play Internal Testing

### Prerequisites

- [ ] Google Play Console developer account ($25 one-time) — [Register](https://play.google.com/console/)
- [ ] App created in Google Play Console
- [ ] Upload key and app signing key configured

### Setup Steps

1. **Create App in Play Console**
   - Go to [Google Play Console](https://play.google.com/console/) → **Create app**
   - App name: `Finance`
   - Default language: English (United States)
   - App or game: App
   - Free or paid: Free (for alpha)

2. **Set Up App Signing**
   - Go to **Setup → App signing**
   - Choose **Google-managed signing key** (recommended)
   - Upload your **upload key** (generated locally or via CI)

   ```bash
   # Generate an upload keystore (if not already done):
   keytool -genkey -v -keystore upload-keystore.jks \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -alias upload -storepass YOUR_STORE_PASSWORD
   ```

3. **Configure Internal Testing Track**
   - Go to **Testing → Internal testing**
   - Click **Create new release**
   - Upload the signed AAB (Android App Bundle)
   - Add release notes
   - Add testers: create an email list or use a Google Group

4. **Build and Upload**

   ```bash
   # Via CI (recommended):
   # Trigger release-android.yml with workflow_dispatch

   # Locally:
   cd apps/android
   ./gradlew :apps:android:bundleRelease
   # Upload the AAB from apps/android/build/outputs/bundle/release/
   ```

5. **Complete Store Listing**
   - Fill in **Main store listing**: title, descriptions, screenshots
   - Complete **Content rating** questionnaire
   - Complete **Data safety** form (what data is collected/shared)
   - Set **Target audience**: ages 13+ (financial app)

### GitHub Secrets for Android CI

| Secret                        | Description                                   |
| ----------------------------- | --------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`     | Base64-encoded upload keystore (.jks)         |
| `ANDROID_KEYSTORE_PASSWORD`   | Keystore password                             |
| `ANDROID_KEY_ALIAS`           | Key alias in the keystore                     |
| `ANDROID_KEY_PASSWORD`        | Key password                                  |
| `GOOGLE_PLAY_SERVICE_ACCOUNT` | Service account JSON for Play Console uploads |

---

## Web — Vercel Deployment

### Prerequisites

- [ ] [Vercel](https://vercel.com/) account created
- [ ] Vercel project linked to the repository
- [ ] Custom domain configured (optional for alpha)

### Setup Steps

1. **Create Vercel Project**

   ```bash
   # Install Vercel CLI (if not already)
   npm i -g vercel

   # Link the project
   cd apps/web
   vercel link
   # Select your team/account, link to existing or create new project
   ```

2. **Configure Project Settings**
   - Framework Preset: **Vite**
   - Root Directory: `apps/web`
   - Build Command: `npm run build -w apps/web`
   - Output Directory: `apps/web/dist`
   - Install Command: `npm ci`

3. **Set Environment Variables** in Vercel Dashboard
   - `VITE_SUPABASE_URL` — Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — Your Supabase anon key
   - `VITE_POWERSYNC_URL` — Your PowerSync instance URL
   - `VITE_GOOGLE_CLIENT_ID` — Google OAuth client ID (if OAuth is set up)
   - `VITE_APPLE_CLIENT_ID` — Apple Services ID (if OAuth is set up)

4. **Deploy**

   ```bash
   # Preview deployment (from any branch):
   vercel

   # Production deployment:
   vercel --prod

   # Or via CI — trigger release-web.yml
   ```

5. **Verify Deployment**
   - [ ] App loads without errors
   - [ ] Service worker registers and caches assets
   - [ ] SQLite-WASM initializes (check console for OPFS/IndexedDB)
   - [ ] Auth flow works (if OAuth is configured)
   - [ ] PWA installable (check manifest)

### Existing Configuration

The `apps/web/vercel.json` is already configured:

```json
{
  "buildCommand": "npm run build -w apps/web",
  "outputDirectory": "apps/web/dist",
  "framework": "vite"
}
```

### GitHub Secrets for Web CI

| Secret              | Description                 |
| ------------------- | --------------------------- |
| `VERCEL_TOKEN`      | Vercel API token            |
| `VERCEL_ORG_ID`     | Vercel organization/team ID |
| `VERCEL_PROJECT_ID` | Vercel project ID           |

---

## Windows — Sideloading for Alpha

### Prerequisites

- [ ] MSIX package built (via CI or locally with `build-msix.ps1`)
- [ ] Code signing certificate (see `docs/windows/code-signing-setup.md`)

### Distribution Methods

#### Method A: Direct MSIX Sideloading

1. **Build the MSIX** via CI (trigger `release-windows.yml`) or locally:

   ```powershell
   .\gradlew :apps:windows:packageMsi
   ```

2. **Sign the package** (required for sideloading):

   ```powershell
   cd apps\windows\packaging
   .\sign-msix.ps1 -PackagePath "..\build\compose\binaries\main\msi\Finance-1.0.0.msi" `
     -CertThumbprint "YOUR_CERT_THUMBPRINT"
   ```

3. **Distribute to testers:**
   - Share the signed `.msi` / `.msix` file (via Teams, SharePoint, etc.)
   - Testers may need to enable **Developer Mode** or install the signing certificate
   - Install: double-click the `.msix` file → **Install**

#### Method B: App Installer File (Recommended for Updates)

Create an `.appinstaller` file for auto-update support:

```xml
<?xml version="1.0" encoding="utf-8"?>
<AppInstaller Uri="https://YOUR_HOSTING_URL/Finance.appinstaller"
              Version="1.0.0.0"
              xmlns="http://schemas.microsoft.com/appx/appinstaller/2018">
  <MainPackage Name="Finance"
               Version="1.0.0.0"
               Publisher="CN=YOUR_PUBLISHER"
               ProcessorArchitecture="x64"
               Uri="https://YOUR_HOSTING_URL/Finance.msix" />
  <UpdateSettings>
    <OnLaunch HoursBetweenUpdateChecks="12" />
  </UpdateSettings>
</AppInstaller>
```

Host both the `.appinstaller` and `.msix` files on any HTTPS endpoint.

#### Method C: Microsoft Store (Future)

Store submission requires:

- [ ] Microsoft Partner Center account
- [ ] App identity registered
- [ ] WACK certification tests pass
- [ ] Store listing complete (screenshots, descriptions)
- [ ] Age rating questionnaire completed

---

## GitHub Secrets Summary

All secrets needed across all platforms:

| Secret                           | Platform | Purpose                            |
| -------------------------------- | -------- | ---------------------------------- |
| `VERCEL_TOKEN`                   | Web      | Vercel deployment API token        |
| `VERCEL_ORG_ID`                  | Web      | Vercel organization ID             |
| `VERCEL_PROJECT_ID`              | Web      | Vercel project ID                  |
| `APPLE_CONNECT_API_KEY_ID`       | iOS      | App Store Connect API key ID       |
| `APPLE_CONNECT_API_ISSUER_ID`    | iOS      | App Store Connect API issuer ID    |
| `APPLE_CONNECT_API_KEY_CONTENT`  | iOS      | App Store Connect API key (.p8)    |
| `MATCH_PASSWORD`                 | iOS      | Fastlane match encryption password |
| `MATCH_GIT_BASIC_AUTHORIZATION`  | iOS      | Match certificate repo credentials |
| `ANDROID_KEYSTORE_BASE64`        | Android  | Base64 upload keystore             |
| `ANDROID_KEYSTORE_PASSWORD`      | Android  | Keystore password                  |
| `ANDROID_KEY_ALIAS`              | Android  | Key alias                          |
| `ANDROID_KEY_PASSWORD`           | Android  | Key password                       |
| `GOOGLE_PLAY_SERVICE_ACCOUNT`    | Android  | Play Console service account JSON  |
| `WINDOWS_SIGNING_CERT_BASE64`    | Windows  | Base64 code signing certificate    |
| `WINDOWS_CERT_PASSWORD`          | Windows  | Certificate password               |
| `SUPABASE_AUTH_GOOGLE_CLIENT_ID` | Auth     | Google OAuth client ID             |
| `SUPABASE_AUTH_GOOGLE_SECRET`    | Auth     | Google OAuth client secret         |
| `SUPABASE_AUTH_APPLE_CLIENT_ID`  | Auth     | Apple Services ID                  |
| `SUPABASE_AUTH_APPLE_SECRET`     | Auth     | Apple client secret (JWT)          |

---

## Post-Alpha Monitoring

After alpha builds are live:

- [ ] Monitor crash reports (Crashlytics / MetricKit / Sentry dashboard)
- [ ] Check sync health (PowerSync dashboard)
- [ ] Review tester feedback (TestFlight, Play Console, direct)
- [ ] Track key metrics: DAU, session length, sync success rate
- [ ] Plan bug-fix releases based on alpha feedback
