# Google Play — Data Safety Section Answers

> **⚠️ INTERNAL DRAFT — NOT LEGAL ADVICE**
> This document is a working draft for internal review. It has not been reviewed by legal counsel and should not be submitted in Google Play Console without verification against the shipping build and configured third-party services.

## Does your app collect or share any of the required user data types?

Yes

## Data collected:

| Data Type                                               | Collected    | Shared                   | Purpose            | Optional                                 |
| ------------------------------------------------------- | ------------ | ------------------------ | ------------------ | ---------------------------------------- |
| Email address                                           | Yes          | No                       | Account management | Required for account-based sync features |
| Name (display name)                                     | Yes          | No                       | App functionality  | Optional                                 |
| Financial info (transactions, balances, budgets, goals) | Yes          | No                       | App functionality  | Required                                 |
| App interactions                                        | Yes (opt-in) | No                       | Analytics          | Optional                                 |
| Crash logs                                              | Yes (opt-in) | Yes (Sentry, if enabled) | App stability      | Optional                                 |
| Device/OS info                                          | Yes (opt-in) | Yes (Sentry, if enabled) | App stability      | Optional                                 |

> **Assumption note:** Crash logs and device/OS information should be marked as shared only if a third-party crash-reporting provider such as Sentry is enabled in the shipped build. If crash reporting remains disabled or entirely local, update those answers before submission.

## Security practices:

- Data is encrypted in transit ✅ (TLS 1.3)
- Data is encrypted at rest ✅ (SQLCipher for local databases on supported native platforms, plus AES-256-GCM-based key and field protections where implemented)
- Users can request data deletion ✅
- Data deletion includes account and associated financial data ✅, subject to shared-data edge cases, legal retention obligations, and final implementation verification
- Users can export core financial data ✅ (JSON/CSV export)

## Review notes before submission

- Verify the final telemetry provider and update the "Shared" column if crash reporting is disabled or routed differently.
- Confirm that Play Console disclosures match the shipping Android build, bundled SDKs, and actual deletion flow at release time.
