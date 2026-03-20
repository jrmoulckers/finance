# Apple App Store — Privacy Nutrition Labels

> **⚠️ INTERNAL DRAFT — NOT LEGAL ADVICE**
> This document is a working draft for internal review. It has not been reviewed by legal counsel and should not be submitted in App Store Connect without verification against the shipping build and any integrated SDKs.

## Data Linked to You

- **Contact Info:** Email (account management, authentication, recovery)
- **Contact Info:** Name / display name (profile setup and personalization)
- **Financial Info:** Transaction history, account balances, budgets, goals, categories, and related financial records

## Data Not Linked to You

- **Diagnostics:** Crash data and performance data (opt-in, consent-based)
- **Usage Data:** App interactions and feature usage events (opt-in, consent-based)

## Data NOT Collected

- Location
- Contacts
- Browsing history
- Search history
- Identifiers for advertising
- Tracking data across other companies' apps or websites

## Notes

- Optional diagnostics and usage data should be disclosed only if telemetry is enabled in the shipping build.
- Finance does not sell data and is not intended to use data for third-party advertising or tracking.
- If a third-party telemetry SDK such as Sentry is added to the release build, verify the final labels in App Store Connect before submission.
