# Trust & Manual-First Entry Guide

> **Status:** DRAFT — Pending human review
> **Last Updated:** 2025-07-27
> **Related Issues:** [#1687](https://github.com/jrmoulckers/finance/issues/1687)
> **Related Docs:** [Privacy & Security](./privacy-security.md), [Onboarding Strategy](./onboarding-strategy.md), [Encryption Explainer](../compliance/encryption-explainer.md)

---

## Table of Contents

- [Philosophy: manual-first by design](#philosophy-manual-first-by-design)
- [Why manual entry is a first-class workflow](#why-manual-entry-is-a-first-class-workflow)
- [What Finance never asks for](#what-finance-never-asks-for)
- [Onboarding trust messaging](#onboarding-trust-messaging)
- [Settings trust messaging](#settings-trust-messaging)
- [Future bank connections — credential boundaries](#future-bank-connections--credential-boundaries)
- [Trust comparison](#trust-comparison)
- [Implementation guidance for developers](#implementation-guidance-for-developers)

---

## Philosophy: manual-first by design

Finance is built on a core belief: **you should never have to hand over your bank credentials to track your finances.** Manual entry is not a fallback, a workaround, or a beginner mode — it is the primary, recommended way to use Finance.

This is a deliberate architectural and ethical choice:

1. **Zero credential exposure** — Finance never stores, transmits, or processes your bank login credentials. There is nothing to steal, leak, or misuse.
2. **Full control** — You decide exactly what data exists in the app. No automated imports means no surprise transactions, no miscategorised charges, and no data you didn't put there.
3. **Works everywhere** — Manual entry works offline, on every platform, with every bank in every country. No aggregator coverage gaps, no API outages, no broken connections.
4. **Privacy by architecture** — When the app never connects to your bank, there is no third-party aggregator with access to your transaction history.

---

## Why manual entry is a first-class workflow

### It is not a limitation — it is a feature

Many finance apps treat manual entry as a last resort for banks that don't support automated connections. Finance inverts this:

| Aspect                  | Automated import apps                                            | Finance (manual-first)                                   |
| ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| **Setup time**          | Minutes to connect, but requires bank credentials                | Seconds to create an account and start entering          |
| **Credential risk**     | Your bank login is shared with a third party (Plaid, MX, Yodlee) | No credentials shared with anyone                        |
| **Data accuracy**       | Automated but often miscategorised                               | You categorise as you enter — higher accuracy            |
| **Offline support**     | Breaks without internet                                          | Works completely offline                                 |
| **Bank coverage**       | Limited by aggregator partnerships                               | Works with every bank, credit union, and cash account    |
| **Financial awareness** | Passive — you may not review transactions                        | Active — entering transactions builds spending awareness |

### The awareness advantage

Research in behavioural economics shows that **actively recording** spending increases financial awareness and improves budgeting outcomes. Manual entry transforms passive consumption tracking into an active reflection practice.

---

## What Finance never asks for

Finance will **never** ask you to provide:

- ❌ Bank login credentials (username, password, PIN)
- ❌ Online banking security questions or answers
- ❌ Multi-factor authentication codes for your bank
- ❌ Credit card numbers or CVVs
- ❌ Social Security or government ID numbers
- ❌ Routing or account numbers

This is stated clearly during onboarding and in settings.

---

## Onboarding trust messaging

The following trust messages should appear during the onboarding flow (see [Onboarding Strategy](./onboarding-strategy.md) for the full flow design).

### Step 1: Welcome screen

The welcome screen should include a trust-establishing message. Recommended copy:

> **Your finances. Your device. Your control.**
>
> Finance keeps your data on your device — encrypted and private. No bank logins required. No data sold. Ever.

This message establishes three trust anchors in a single statement:

1. **Local storage** — data lives on the device
2. **No credentials required** — the app works without bank access
3. **No data monetisation** — the business model doesn't depend on user data

### Step 3: First Account screen

When the user creates their first account, reinforce that this is manual entry by design:

> **Just give it a name and a starting balance.** That's all Finance needs. No bank login. No connection to set up. You're in control of what goes in.

### Settings > About / Privacy

A persistent trust message should be accessible from settings:

> Finance is a **manual-first** personal finance app. You enter your own transactions, budgets, and goals. The app never connects to your bank or asks for your banking credentials. Your data is encrypted on your device and only leaves if you choose to enable cross-device sync — even then, the sync server can only see encrypted data it cannot read.

---

## Settings trust messaging

### Security & Privacy settings section

The settings screen should include a dedicated trust section with these items:

| Setting                        | Description                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------- |
| **How your data is protected** | Links to [Privacy & Security Guide](./privacy-security.md)                    |
| **Encryption details**         | Links to [Encryption Explainer](../compliance/encryption-explainer.md)        |
| **Security transparency**      | Links to [Transparency Report](../compliance/security-transparency-report.md) |
| **No bank credentials stored** | Static text confirming manual-first design                                    |
| **Export your data**           | One-tap data export (JSON/CSV)                                                |
| **Delete your data**           | Account and data deletion with crypto-shredding                               |

### Trust indicators

Consider displaying trust indicators in the settings UI:

- 🔒 **Encrypted** — Your database is encrypted with AES-256
- 🚫 **No bank access** — Finance has no connection to your bank
- 📱 **On-device** — Your data lives on this device
- 🔄 **Sync is optional** — Cross-device sync is off by default

---

## Future bank connections — credential boundaries

Bank connection support is planned as an optional, post-alpha feature (see services/api/supabase/functions/bank-connection/). If and when this feature ships, the following credential boundaries will apply:

### What the connection does

- Uses **read-only** access tokens from aggregators (Plaid, MX)
- The aggregator handles authentication with your bank — Finance never sees your bank password
- Access tokens are **encrypted with AES-256-GCM** before storage (see ncryptAccessToken in the bank-connection Edge Function)
- Access tokens are **never returned in any API response** and **never logged**
- Connections can be **revoked at any time** from settings

### What the connection does NOT do

- ❌ Store your bank username or password
- ❌ Gain write access to your bank account
- ❌ Transfer money or make payments
- ❌ Access accounts you haven't explicitly authorised
- ❌ Continue accessing data after you revoke the connection

### User-facing messaging for bank connections

When bank connections are offered, the UI must clearly communicate:

> **Optional: Connect your bank for automatic imports.**
>
> This uses read-only access through [Plaid/MX] — Finance never sees your bank password. You can disconnect at any time. Manual entry remains available and fully supported whether or not you connect a bank.

### Architecture safeguards

- Only household **owners and admins** can create bank connections (enforced server-side)
- Connections are scoped to specific institutions — no blanket access
- Rate-limited: connection creation is rate-limited to prevent abuse
- Soft-delete: disconnecting a bank connection soft-deletes the record and encrypted token
- The bank connection feature is gated behind a feature flag and will not be enabled by default

---

## Trust comparison

How Finance compares to typical finance apps on trust-relevant dimensions:

| Dimension                    | Typical finance app                  | Finance                                       |
| ---------------------------- | ------------------------------------ | --------------------------------------------- |
| **Data location**            | Cloud server (provider-controlled)   | Your device (you-controlled)                  |
| **Bank credential handling** | Shared with aggregator               | Never collected                               |
| **Encryption**               | Server-side (provider holds keys)    | Client-side (you hold keys)                   |
| **Offline access**           | Limited or none                      | Full functionality                            |
| **Data monetisation**        | Often sold or used for profiling     | Never sold, never profiled                    |
| **Third-party access**       | Multiple aggregators, analytics, ads | Minimal (Supabase for sync only, if opted in) |
| **Account deletion**         | Data may persist in backups          | Crypto-shredding destroys keys                |

---

## Implementation guidance for developers

### Onboarding integration

When implementing onboarding screens, reference the trust messaging above. The OnboardingStep.WELCOME and OnboardingStep.FIRST_ACCOUNT steps (defined in packages/core) are the primary integration points.

Key implementation rules:

1. **Never present manual entry as a fallback.** UI copy should never say "or enter manually" — manual entry is the default.
2. **Never prompt for bank credentials** during onboarding or first-run experience.
3. **Trust messaging must be visible without scrolling** on the welcome screen.
4. **Settings must always show** the "No bank credentials stored" indicator, regardless of whether bank connections are available.

### Copy guidelines

| ✅ Do say                      | ❌ Don't say                                |
| ------------------------------ | ------------------------------------------- |
| "Enter your transactions"      | "Manually enter your transactions"          |
| "Add a transaction"            | "Can't connect? Add it manually"            |
| "Track your spending"          | "Track your spending (manual mode)"         |
| "Connect your bank (optional)" | "Connect your bank for the full experience" |

### Accessibility

All trust messaging must meet WCAG 2.2 AA:

- Trust indicators must have text alternatives (not icon-only)
- Links to security documentation must have descriptive link text
- Trust messaging must be reachable via screen reader navigation

---

_For technical encryption details, see the [Encryption Explainer](../compliance/encryption-explainer.md). For the full privacy and security guide, see [Privacy & Security](./privacy-security.md)._
