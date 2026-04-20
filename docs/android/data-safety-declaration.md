# Data Safety Declaration — Google Play

> Reference for completing the Data Safety form in Google Play Console.
> This file maps Finance app data practices to Play Store requirements.

## Overview

Finance is a personal finance tracking application. It collects and stores
financial data locally on-device with encryption, and optionally syncs to
a cloud backend for cross-device access.

---

## Data Types

### Collected and Stored

| Category       | Data Type               | Collected | Purpose                            | Required |
| -------------- | ----------------------- | --------- | ---------------------------------- | -------- |
| Personal info  | Email address           | Yes       | Account management, authentication | Yes      |
| Personal info  | Display name            | Yes       | User profile personalization       | No       |
| Financial info | Transaction records     | Yes       | Core app functionality             | Yes      |
| Financial info | Account balances        | Yes       | Core app functionality             | Yes      |
| Financial info | Budget configurations   | Yes       | Budget tracking feature            | Yes      |
| Financial info | Financial goals         | Yes       | Goal tracking feature              | Yes      |
| App activity   | App interactions        | Opt-in    | Usage analytics for improvements   | No       |
| App info       | Crash logs              | Opt-in    | Stability and bug fixing           | No       |
| App info       | Performance diagnostics | Opt-in    | Performance monitoring             | No       |

### NOT Collected

| Category      | Data Type              | Notes               |
| ------------- | ---------------------- | ------------------- |
| Location      | Precise/approximate    | Not used by the app |
| Contacts      | Contact list           | Not used by the app |
| Photos/Videos | Camera, media          | Not used by the app |
| Audio         | Microphone, recordings | Not used by the app |
| Files         | Documents, storage     | Not used by the app |
| Calendar      | Events                 | Not used by the app |
| Messages      | SMS, email             | Not used by the app |
| Health        | Health/fitness         | Not used by the app |
| Identifiers   | Advertising ID         | Not used by the app |
| Web browsing  | History, bookmarks     | Not used by the app |

---

## Data Sharing

**Finance does NOT share any collected data with third parties.**

| Sharing Destination  | Shared?                  | Notes                          |
| -------------------- | ------------------------ | ------------------------------ |
| Advertising networks | ❌ No                    | No ad SDKs integrated          |
| Analytics providers  | ❌ No                    | Analytics processed internally |
| Third-party services | ❌ No                    | —                              |
| Data brokers         | ❌ No                    | —                              |
| Government/legal     | Only if legally required | Standard legal compliance      |

---

## Data Security

| Security Measure      | Implementation                                        |
| --------------------- | ----------------------------------------------------- |
| Encryption in transit | TLS 1.3 for all network requests (Ktor OkHttp)        |
| Encryption at rest    | SQLCipher 4.6.1 (AES-256-CBC) for local database      |
| Credential storage    | Android Keystore (hardware-backed when available)     |
| Authentication        | BiometricPrompt with Android Keystore, OAuth 2.0+PKCE |
| Session management    | Tokens stored in EncryptedSharedPreferences           |
| Code obfuscation      | R8/ProGuard for release builds                        |

---

## User Controls

| Control                 | Location                  | Description                             |
| ----------------------- | ------------------------- | --------------------------------------- |
| Delete account          | Settings → Delete Account | Removes all local and synced data       |
| Export data             | Settings → Export         | Export transactions as CSV              |
| Biometric lock          | Settings → Security       | Enable/disable biometric authentication |
| Analytics consent       | Settings → Privacy        | Opt-in/out of anonymous analytics       |
| Crash reporting consent | Settings → Privacy        | Opt-in/out of crash log collection      |

---

## Play Console Form Mapping

When completing the Data Safety form in Play Console, use these answers:

### Section: Data collection and security

1. **Does your app collect or share any of the required user data types?**
   → Yes

2. **Is all of the user data collected by your app encrypted in transit?**
   → Yes

3. **Do you provide a way for users to request that their data is deleted?**
   → Yes (Settings → Delete Account)

### Section: Data types

Select the following in the form:

- ✅ Personal info → Email address
- ✅ Personal info → Name
- ✅ Financial info → User payment info (transactions/accounts)
- ✅ App activity → App interactions (if analytics enabled)
- ✅ App info and performance → Crash logs (if crash reporting enabled)
- ✅ App info and performance → Diagnostics (if performance monitoring enabled)

### Section: Data usage and handling

For each selected data type, indicate:

- **Is this data collected, shared, or both?** → Collected only
- **Is this data processed ephemerally?** → No (persisted)
- **Is this data required or optional?** → (varies, see table above)
- **Why is this data collected?** → App functionality / Analytics / Crash reporting

---

## Compliance Notes

- **GDPR (EU):** Users can request data export and deletion. Legal basis
  is legitimate interest for core functionality, consent for analytics.
- **CCPA (California):** Users can opt out of data collection for analytics.
  Financial data is collected for the core service and cannot be opted out of.
- **COPPA:** Finance is not directed at children under 13.
