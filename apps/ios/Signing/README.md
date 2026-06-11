# iOS Code Signing & Deployment Guide

This guide walks through setting up iOS code signing, provisioning profiles, and Fastlane for the Finance app. All steps must be completed by a human with Apple Developer Program access.

## Prerequisites

- macOS with Xcode installed (latest stable)
- [Fastlane](https://docs.fastlane.tools/) installed (`gem install fastlane` or via Bundler)
- An Apple Developer Program membership ($99/year)

---

## Step 1: Enroll in the Apple Developer Program

1. Go to <https://developer.apple.com/programs/enroll/>
2. Sign in with your Apple ID (or create one)
3. Choose **Individual** or **Organization** enrollment
   - Individual: instant approval
   - Organization: requires D-U-N-S number, 24-48 hours for approval
4. Complete payment ($99 USD/year)
5. Once approved, note your **Team ID** (10-character alphanumeric string) from [Account → Membership](https://developer.apple.com/account#MembershipDetailsCard)

---

## Step 2: Register an App ID

1. Go to [Certificates, Identifiers & Profiles → Identifiers](https://developer.apple.com/account/resources/identifiers/list)
2. Click **+** to register a new identifier
3. Select **App IDs** → **App**
4. Fill in:
   - **Description**: `Finance`
   - **Bundle ID**: Explicit → `com.yourorg.finance` (replace with your actual bundle ID)
5. Enable these capabilities:
   - ✅ Sign in with Apple
   - ✅ Push Notifications
   - ✅ Associated Domains (for universal links / web credentials)
6. Click **Continue** → **Register**

---

## Step 3: Create Provisioning Profiles

You need three profiles:

### Development Profile (local testing on physical devices)

1. Go to [Profiles](https://developer.apple.com/account/resources/profiles/list)
2. Click **+** → **iOS App Development**
3. Select the App ID from Step 2
4. Select your development certificate(s)
5. Select test devices
6. Name it: `Finance Development`
7. Download and double-click to install

### Ad Hoc Profile (alpha distribution outside TestFlight)

1. Click **+** → **Ad Hoc**
2. Select the App ID, distribution certificate, and test devices
3. Name it: `Finance Ad Hoc`
4. Download and install

### App Store / TestFlight Profile

1. Click **+** → **App Store Connect**
2. Select the App ID and distribution certificate
3. Name it: `Finance App Store`
4. Download and install

---

## Step 4: Set Up Fastlane Match (Certificate Management)

[Match](https://docs.fastlane.tools/actions/match/) stores signing certificates and provisioning profiles in a private git repository so the whole team (and CI) can share them.

### 4a. Create a Private Certificate Repository

Create a **private** git repository (e.g., `github.com/yourorg/ios-certificates`). This repo will contain encrypted signing certificates — it must be private.

### 4b. Initialize Match

```bash
cd apps/ios
fastlane match init
```

When prompted:

- Storage mode: **git**
- URL of the git repo: `https://github.com/yourorg/ios-certificates.git`

This updates the `Matchfile` (already scaffolded — just replace placeholder values).

### 4c. Generate Certificates and Profiles

```bash
# Development certificates + profiles
fastlane match development

# App Store / TestFlight certificates + profiles
fastlane match appstore
```

Match will:

1. Create certificates in the Apple Developer Portal
2. Create provisioning profiles
3. Encrypt and store them in your private git repo
4. Install them on your local machine

**Save the encryption password** — you'll need it for the `MATCH_PASSWORD` secret.

### 4d. Verify Installation

```bash
fastlane match development --readonly
fastlane match appstore --readonly
```

---

## Step 5: Configure App Store Connect API Key

Using an API key avoids interactive Apple ID authentication in CI.

1. Go to [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api)
2. Click **+** to generate a new key
3. Name: `Finance CI`
4. Access: **App Manager** (minimum required for TestFlight uploads)
5. Download the `.p8` key file (**you can only download it once**)
6. Note the **Key ID** and **Issuer ID** from the page
7. Base64-encode the key:
   ```bash
   base64 -i AuthKey_XXXXXXXXXX.p8
   ```

---

## Step 6: Configure GitHub Actions Secrets

Go to your repo's **Settings → Secrets and variables → Actions** and add:

| Secret Name                       | Value                                        |
| --------------------------------- | -------------------------------------------- |
| `APPLE_TEAM_ID`                   | Your 10-character Team ID                    |
| `MATCH_GIT_URL`                   | URL to your private certificates repo        |
| `MATCH_PASSWORD`                  | Encryption password from Step 4c             |
| `APP_STORE_CONNECT_API_KEY_ID`    | Key ID from Step 5                           |
| `APP_STORE_CONNECT_API_ISSUER_ID` | Issuer ID from Step 5                        |
| `APP_STORE_CONNECT_API_KEY`       | Base64-encoded `.p8` key content from Step 5 |

### Optional secrets (if using Apple ID auth instead of API key):

| Secret Name                                    | Value                 |
| ---------------------------------------------- | --------------------- |
| `FASTLANE_USER`                                | Your Apple ID email   |
| `FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD` | App-specific password |

Generate an app-specific password at <https://appleid.apple.com/account/manage>.

---

## Step 7: Fill in Scaffolding Placeholders

Replace all placeholder values in the scaffolding code:

| File                    | Placeholder          | Replace With                    |
| ----------------------- | -------------------- | ------------------------------- |
| `fastlane/Appfile`      | `YOUR_APP_BUNDLE_ID` | Your registered bundle ID       |
| `fastlane/Appfile`      | `YOUR_APPLE_TEAM_ID` | Your 10-char Team ID            |
| `fastlane/Matchfile`    | `YOUR_MATCH_GIT_URL` | Private cert repo URL           |
| `fastlane/Matchfile`    | `YOUR_APP_BUNDLE_ID` | Your registered bundle ID       |
| `fastlane/Matchfile`    | `YOUR_APPLE_TEAM_ID` | Your 10-char Team ID            |
| `fastlane/.env.default` | All `YOUR_*` values  | Actual values (or leave as doc) |

---

## Step 8: Test Locally

```bash
cd apps/ios

# Verify match can pull certificates
bundle exec fastlane match development --readonly

# Build a signed alpha
bundle exec fastlane build_alpha

# Upload to TestFlight (requires API key)
bundle exec fastlane upload_testflight
```

---

## Step 9: Test in CI

Push the branch and trigger the release workflow:

```bash
# Tag an alpha release
git tag v0.1.0-alpha.1-ios
git push origin v0.1.0-alpha.1-ios
```

Or use workflow dispatch in GitHub Actions → Release — iOS → Run workflow.

---

## Export Options

Two export options plist templates are provided:

- **`ExportOptions-testflight.plist`** — For TestFlight / App Store distribution
- **`ExportOptions-adhoc.plist`** — For Ad Hoc distribution (direct device install)

Replace `YOUR_APPLE_TEAM_ID` and `YOUR_APP_BUNDLE_ID` before use.

---

## Troubleshooting

### "No signing certificate found"

Run `fastlane match appstore` to regenerate. Ensure `MATCH_PASSWORD` is correct.

### "Profile doesn't match bundle identifier"

Verify `APP_BUNDLE_ID` in `Appfile`, `Matchfile`, and `.env.default` all match the App ID registered in the Developer Portal.

### "App Store Connect API authentication failed"

- Verify the API key is base64-encoded correctly: `base64 -i AuthKey_XXX.p8 | tr -d '\n'`
- Ensure the Key ID, Issuer ID, and key content are all from the same API key
- Check that the key hasn't been revoked in App Store Connect

### CI keychain errors

The `setup_ci` helper in Fastfile creates a temporary keychain for CI environments. Ensure the workflow calls `before_all` (which is automatic when using Fastlane lanes).

---

## Architecture Notes

- **Match (git-based)** is chosen over manual certificate management for reproducibility and team sharing
- **App Store Connect API key** is preferred over Apple ID + app-specific password for CI (no 2FA prompts)
- **`readonly: true` in CI** prevents accidental certificate regeneration — certificates should only be created locally by an authorized team member
- The existing `release-platform.yml` workflow handles signing via manual keychain setup; after match is configured, consider migrating to match-based signing in CI for consistency
