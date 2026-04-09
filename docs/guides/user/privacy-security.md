# Privacy & Security

Finance is built on a simple belief: **your financial data is yours and no one else's**. This guide explains how your data is protected, what's collected, what isn't, and what rights you have.

---

## Table of Contents

- [The short version](#the-short-version)
- [How your data is protected](#how-your-data-is-protected)
- [Biometric authentication](#biometric-authentication)
- [Passkey authentication](#passkey-authentication)
- [What data is collected](#what-data-is-collected)
- [What data is NOT collected](#what-data-is-not-collected)
- [Third-party services](#third-party-services)
- [Your rights](#your-rights)
- [How to exercise your rights](#how-to-exercise-your-rights)
- [Security features summary](#security-features-summary)
- [Reporting security issues](#reporting-security-issues)

---

## The short version

If you only read one section, read this:

- **Your data lives on your device**, encrypted with industry-standard encryption (SQLCipher with AES-256).
- **If you enable sync**, your data is **end-to-end encrypted** before it leaves your device. The server cannot read it.
- **Finance does not sell, share, or monetize your data.** There is no advertising, no profiling, no data broker relationships.
- **No bank connections.** Finance never asks for your bank login credentials.
- **Analytics are opt-in.** By default, Finance sends no usage data anywhere.
- **You can export or delete all your data** at any time.

---

## How your data is protected

Finance uses a **local-first architecture**. Your financial data lives on your device, not on a server.

### Encryption at rest

Your local database is encrypted using **SQLCipher**, the open-source standard for encrypted SQLite databases. Even if someone physically accessed your device's storage, they could not read your data without the encryption key.

The encryption key is stored in your device's secure hardware:

| Platform    | Key storage location                          |
| ----------- | --------------------------------------------- |
| **iOS**     | Apple Keychain (Secure Enclave hardware)      |
| **Android** | Android Keystore (StrongBox when available)   |
| **Windows** | DPAPI (per-user, not cloud-synced)            |
| **Web**     | In-memory only (for authentication tokens)    |

### Encryption in transit

If you enable cross-device sync, your data is **end-to-end encrypted** (E2EE) before it leaves your device:

- Each record gets its own encryption key — called a **DEK** (Data Encryption Key).
- Those keys are wrapped with a master key — called a **KEK** (Key Encryption Key).
- The encryption algorithm is **AES-256-GCM**, an industry-standard authenticated encryption scheme.
- The sync server only ever sees encrypted ciphertext. It cannot read your transactions, balances, account names, or any financial information.

This is similar to how messaging apps like Signal encrypt your messages — the server facilitates delivery but cannot read the content.

### Offline-first means your data is always available

Because your data is stored locally:

- ✅ The app works without internet
- ✅ Your data exists even if the server goes down
- ✅ No one can access your data remotely without your device
- ✅ You always have your complete financial history available

---

## Biometric authentication

Finance supports biometric unlock so only you can open the app.

| Platform    | Supported methods                        |
| ----------- | ---------------------------------------- |
| **iOS**     | Face ID, Touch ID                        |
| **Android** | Fingerprint, face recognition            |
| **Windows** | Windows Hello (fingerprint, face, PIN)   |
| **Web**     | WebAuthn-compatible biometrics           |

### How to enable

1. Go to **Settings → Security → Biometric Lock**.
2. Toggle it on.
3. Authenticate with your biometric to confirm.

### Configure when the lock activates

- **Every time** you open the app — maximum security
- **After inactivity** (e.g., after 5 minutes) — convenience with security

### Important details

- **Biometric data never leaves your device.** Finance asks your operating system to verify your identity. The app never sees, stores, or transmits your fingerprint, face scan, or other biometric data.
- **Strong biometrics only.** On Android, Finance requires Class 3 (BIOMETRIC_STRONG) biometrics — the highest security class.
- **Fallback available.** If biometrics fail (wet fingers, low light), you can use your device PIN/passcode/pattern.

---

## Passkey authentication

Finance supports **passkeys** — a modern, phishing-resistant replacement for passwords.

### What's a passkey?

A passkey is a cryptographic key pair stored on your device. To sign in, you use your biometrics (Face ID, fingerprint, Windows Hello) or a security key instead of typing a password. There's nothing to remember, nothing to type, and nothing that can be phished or leaked in a data breach.

### How to set up a passkey

1. Go to **Settings → Security → Passkeys**.
2. Tap **Set Up Passkey**.
3. Follow your device's prompt (usually a biometric scan).
4. Done — next time you sign in, just use your biometric.

### Passkey backup

Passkeys are backed up to your platform's credential manager:

| Platform    | Credential manager         |
| ----------- | -------------------------- |
| **iOS**     | iCloud Keychain            |
| **Android** | Google Password Manager    |
| **Windows** | Windows Hello              |
| **Web**     | Browser credential manager |

This means your passkey works across devices on the same platform (e.g., all your Apple devices via iCloud Keychain).

---

## What data is collected

Finance follows **data minimization** — only what's needed to make the app work.

### Data stored on your device (always)

| Data                              | Why it's needed                            |
| --------------------------------- | ------------------------------------------ |
| Account names, types, balances    | Display and track your financial accounts  |
| Transactions (amounts, dates, payees, notes, categories) | Record and categorize your financial activity |
| Budgets and allocations           | Track spending against your plan           |
| Goals and contributions           | Track savings goal progress                |
| Categories and rules              | Organize transactions                      |
| App preferences (currency, theme) | Personalize your experience                |

This data is stored in your **encrypted local database** and never leaves your device unless you enable sync.

### Data stored on the sync server (only if you enable sync)

| Data                                     | Why it's needed                                     |
| ---------------------------------------- | --------------------------------------------------- |
| Email address                            | Identify your account, send password reset emails   |
| Encrypted financial data                 | Sync between your devices (server cannot read this) |
| Household memberships                    | Manage shared finance access (future feature)       |
| Sync metadata (timestamps, device IDs)   | Coordinate sync between your devices                |

---

## What data is NOT collected

Finance deliberately avoids collecting data that other finance apps require:

- ❌ **Bank account numbers or routing numbers** — never asked for
- ❌ **Credit card numbers** — never asked for
- ❌ **Social Security numbers or government IDs** — never asked for
- ❌ **Location data** — Finance doesn't know where you made a purchase
- ❌ **Contacts or phone data** — no access to your address book
- ❌ **Browsing history** — not tracked
- ❌ **Usage analytics** (unless you explicitly opt in)
- ❌ **Advertising identifiers** — none exist in the app

### Analytics and error reporting

Analytics and crash reporting are:

- **Off by default** — only activated if you explicitly opt in via **Settings → Preferences → Error Reporting**
- **Free of personal data** — no financial data, account details, or transaction information
- **Free of device identifiers** — pseudonymous, non-reversible identifiers only
- **Revocable** — turn them off at any time in Settings

---

## Third-party services

Finance uses a minimal set of third-party services. Here's what they are and what they can see.

### Supabase (sync and authentication)

**What it does:** Provides the backend database and authentication for cross-device sync.

**What it can see:**
- Your email address (for authentication)
- Encrypted financial data (it stores this but **cannot decrypt it**)
- Sync metadata (timestamps, record counts)

**What it cannot see:**
- Transaction amounts, payees, or notes
- Account names or balances
- Budget or goal details
- Any meaningful information about your finances

### PowerSync (sync coordination)

**What it does:** Coordinates real-time data sync between your devices and the server.

**What it handles:** Encrypted data in transit. Like Supabase, it cannot decrypt your financial data.

### No advertising networks

Finance does not integrate with any advertising networks, data brokers, or analytics platforms that build user profiles.

---

## Your rights

### Under GDPR (European Union / EEA)

| Right                 | What it means                        | How Finance supports it                                    |
| --------------------- | ------------------------------------ | ---------------------------------------------------------- |
| **Access**            | See what personal data we have       | Export your data anytime (Settings → Data → Export)         |
| **Erasure**           | Have your data deleted               | Delete your account and all data (Settings → Danger Zone)  |
| **Portability**       | Get your data in a standard format   | Export as JSON or CSV                                      |
| **Rectification**     | Correct inaccurate data              | Edit any data directly in the app                          |
| **Objection**         | Object to certain processing         | Analytics are opt-in; disable anytime                      |

### Under CCPA/CPRA (California)

| Right                    | What it means                        | How Finance supports it                                   |
| ------------------------ | ------------------------------------ | --------------------------------------------------------- |
| **Know**                 | Know what data is collected          | This guide documents everything                           |
| **Delete**               | Request deletion of your data        | Delete your account (Settings → Danger Zone)              |
| **Opt-out of sale**      | Opt out of data selling              | Finance **does not sell** your personal data. Ever.        |
| **Non-discrimination**   | Equal service regardless of rights   | Exercising rights has no effect on your access to Finance |

---

## How to exercise your rights

### Export your data

1. Go to **Settings → Data → Export**.
2. Choose **JSON** (complete backup) or **CSV** (tabular format for spreadsheets).
3. Tap **Export**.
4. The file is generated on your device — no server request needed, works offline.

The export includes: accounts, transactions, categories, budgets, goals, and all associated metadata.

### Delete your account and all data

1. Go to **Settings → Danger Zone → Delete Account**.
2. Finance offers to **export your data first** (recommended).
3. Type the confirmation phrase: `DELETE MY DATA`.
4. Authenticate with biometrics (if enabled).
5. Confirm.

**What happens:**

- All local data on the current device is deleted immediately.
- If you used sync, all server-side data is deleted through **crypto-shredding** — the encryption keys are destroyed, making any remaining encrypted data permanently unreadable.
- A deletion confirmation email is sent.
- There is a **30-day grace period** — if you change your mind, contact support to cancel the deletion.
- After 30 days, deletion is permanent and irreversible.

### Contact us about your data

For privacy requests that can't be handled through the app, use **Settings → Help → Contact Us**.

---

## Security features summary

| Feature                         | Status      | Details                                               |
| ------------------------------- | ----------- | ----------------------------------------------------- |
| Local encrypted database        | ✅ Active   | SQLCipher (AES-256) on all native platforms           |
| Secure key storage              | ✅ Active   | Keychain, Keystore, DPAPI per platform                |
| End-to-end encrypted sync       | ✅ Active   | AES-256-GCM envelope encryption                       |
| Biometric app lock              | ✅ Active   | Face ID, fingerprint, Windows Hello, WebAuthn         |
| Passkey authentication          | ✅ Active   | Phishing-resistant, passwordless sign-in              |
| No bank credential storage      | ✅ By design| Finance never asks for bank logins                    |
| No advertising or tracking SDKs | ✅ By design| No ads, no profiling, no data brokers                 |
| Opt-in analytics only           | ✅ Active   | Off by default, pseudonymous when enabled             |
| Data export (GDPR Art. 20)      | ✅ Active   | JSON and CSV export from Settings                     |
| Account deletion (GDPR Art. 17) | ✅ Active   | Full deletion with crypto-shredding                   |
| Row-Level Security (RLS)        | ✅ Active   | Server-side access control via PostgreSQL RLS         |
| Soft deletes                    | ✅ Active   | Deleted data retained for sync, purged on schedule    |

---

## Reporting security issues

If you discover a security vulnerability in Finance, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities.
2. Use **Settings → Help → Report Security Issue**, or email the project maintainers directly.
3. Include a description of the vulnerability and steps to reproduce it.
4. We aim to acknowledge reports within 48 hours and provide a fix timeline within 7 days.

We appreciate responsible disclosure and will credit reporters (with permission) in our security advisories.

---

_Back to [Getting Started](getting-started.md) · [FAQ](faq.md)_
