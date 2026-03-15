# Privacy & Security Guide

Finance is built on a simple belief: **your financial data is yours and no one else's**. This guide explains exactly how your data is protected, what's collected, and what rights you have.

---

## Table of Contents

- [How your data is protected](#how-your-data-is-protected)
- [Biometric authentication](#biometric-authentication)
- [Passkey authentication](#passkey-authentication)
- [What data is collected and why](#what-data-is-collected-and-why)
- [Data minimization — what we don't collect](#data-minimization--what-we-dont-collect)
- [Third-party services](#third-party-services)
- [Your rights](#your-rights)
- [How to exercise your rights](#how-to-exercise-your-rights)
- [Security features in detail](#security-features-in-detail)
- [Reporting security issues](#reporting-security-issues)

---

## How your data is protected

Finance uses a **local-first architecture**. That means your financial data lives on your device, not on a server somewhere. Here's what that looks like in practice:

### Encrypted at rest

Your local database is encrypted using **SQLCipher** — the same encryption standard used by governments and enterprises. Even if someone physically accessed your device's storage, they couldn't read your data without the encryption key.

The encryption key itself is stored in your device's secure hardware:

| Platform | Where the key lives                         |
| -------- | ------------------------------------------- |
| iOS      | Apple Keychain (Secure Enclave)             |
| Android  | Android Keystore (StrongBox when available) |
| Windows  | DPAPI (per-user, not cloud-synced)          |
| Web      | In-memory only (for auth tokens)            |

### Encrypted in transit

If you choose to enable sync, your data is **end-to-end encrypted** before it leaves your device. Finance uses an **envelope encryption** system:

- Each record gets its own encryption key (called a DEK — Data Encryption Key)
- Those keys are wrapped with a master key (called a KEK — Key Encryption Key)
- The encryption uses **AES-256-GCM**, an industry-standard authenticated encryption algorithm
- The sync server only ever sees encrypted data — it cannot read your transactions, balances, or any financial information

### Local-first means offline-first

Because your data is stored locally:

- ✅ The app works without internet
- ✅ Your data exists even if the server goes down
- ✅ No one can access your data remotely without your device
- ✅ You always have your full financial history available

---

## Biometric authentication

Finance supports biometric unlock so only you can open the app.

| Platform    | Methods                                |
| ----------- | -------------------------------------- |
| **iOS**     | Face ID, Touch ID                      |
| **Android** | Fingerprint, face recognition          |
| **Windows** | Windows Hello (fingerprint, face, PIN) |
| **Web**     | WebAuthn-compatible biometrics         |

All platforms use **strong biometric authentication** (Class 3 on Android) with a device PIN/passcode fallback.

### How to enable biometric lock

1. Go to **Settings → Security → Biometric Lock**.
2. Toggle it on.
3. Authenticate with your biometric to confirm.

You can configure when the lock activates:

- **Every time** you open the app
- **After inactivity** (e.g., after 5 minutes)

> 💡 Biometric data never leaves your device. Finance asks your device's operating system to verify your identity — the app itself never sees or stores your fingerprint, face scan, or other biometric data.

---

## Passkey authentication

Finance supports **passkeys** — a modern, phishing-resistant alternative to passwords.

### What's a passkey?

A passkey replaces your password with a cryptographic key pair stored on your device. To sign in, you just use your biometrics (Face ID, fingerprint, Windows Hello) or a security key. There's nothing to type, nothing to remember, and nothing that can be phished or leaked in a data breach.

### How to set up a passkey

1. Go to **Settings → Account → Passkey**.
2. Tap **Set Up Passkey**.
3. Follow your device's prompt to create the passkey (usually a biometric scan).
4. Done — next time you sign in, just use your biometric.

Passkeys can be backed up to your platform's credential manager (iCloud Keychain, Google Password Manager, etc.), so they work across your devices.

---

## What data is collected and why

Finance follows a **data minimization** principle — we collect only what's needed to make the app work, and nothing more.

### Data stored on your device

| Data                                                           | Why it's needed                                  |
| -------------------------------------------------------------- | ------------------------------------------------ |
| Account names, types, and balances                             | To display and track your financial accounts     |
| Transactions (amounts, dates, payees, notes, categories, tags) | To record and categorize your financial activity |
| Budgets and spending plans                                     | To track spending against your budget            |
| Goals and progress                                             | To track savings goal progress                   |
| Categories and rules                                           | To organize transactions                         |
| App preferences (currency, theme, experience level)            | To personalize your experience                   |

This data is stored in your encrypted local database and never leaves your device unless you enable sync.

### Data stored on the sync server (only if you enable sync)

| Data                                   | Why it's needed                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| Email address                          | To identify your account and send critical notifications (e.g., password reset) |
| Encrypted financial data               | To sync between your devices (the server can't read this data)                  |
| Household memberships                  | To manage shared finance access                                                 |
| Sync metadata (timestamps, device IDs) | To coordinate sync between devices                                              |

### What is NOT collected

- ❌ Bank account numbers or routing numbers
- ❌ Credit card numbers
- ❌ Social Security numbers or government IDs
- ❌ Location data
- ❌ Contacts or phone data
- ❌ Browsing history
- ❌ Usage analytics (unless you opt in)

### Analytics and crash reporting

Analytics and crash reporting are:

- **Off by default** — they only activate if you explicitly opt in
- **Free of personal data** — no financial data, no account details, no transaction information
- **Free of device identifiers** — pseudonymous, non-reversible identifiers only

You can control these in **Settings → Privacy**.

---

## Data minimization — what we don't collect

Finance deliberately avoids collecting data that other finance apps require:

- **No bank connections** — we never ask for your bank login credentials
- **No payment card data** — we don't store card numbers
- **No location tracking** — we don't know where you made a purchase
- **No social graph** — we don't access your contacts
- **No behavioral profiling** — we don't build advertising profiles from your spending

---

## Third-party services

Finance uses a minimal set of third-party services for sync and authentication. Here's what they are and what they can see:

### Supabase (sync and authentication)

**What it does:** Provides the backend database and authentication system for cross-device sync.

**What it can see:**

- Your email address (for authentication)
- Encrypted financial data (it stores this but cannot decrypt it — the encryption keys never leave your device)
- Sync metadata (timestamps, record counts)

**What it cannot see:**

- Your transaction amounts, payees, or notes
- Your account names or balances
- Your budget or goal details
- Anything meaningful about your finances

### PowerSync (offline sync coordination)

**What it does:** Coordinates the sync of data between your devices and the server.

**What it handles:** Encrypted data in transit. Like Supabase, it cannot decrypt your financial data.

---

## Your rights

You have legal rights over your personal data. Here's what they are and how Finance supports them.

### Under GDPR (European Union)

If you're in the EU or EEA, you have the right to:

| Right             | What it means                      | How Finance supports it                                                   |
| ----------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| **Access**        | See what personal data we have     | Export your data anytime (Settings → Export)                              |
| **Erasure**       | Have your data deleted             | Delete your account and all data (Settings → Delete Account)              |
| **Portability**   | Get your data in a standard format | Export as JSON or CSV                                                     |
| **Rectification** | Correct inaccurate data            | Edit any account, transaction, or profile information directly in the app |
| **Objection**     | Object to certain processing       | Analytics/crash reporting are opt-in; you can turn them off anytime       |

### Under CCPA/CPRA (California)

If you're a California resident, you have the right to:

| Right                  | What it means                                | How Finance supports it                                        |
| ---------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| **Know**               | Know what personal data is collected         | This guide documents everything collected                      |
| **Delete**             | Request deletion of your data                | Delete your account (Settings → Delete Account)                |
| **Opt-out of sale**    | Opt out of data selling                      | Finance **does not sell** your personal data. Ever.            |
| **Non-discrimination** | Equal service regardless of rights exercised | Exercising your rights has no effect on your access to Finance |

---

## How to exercise your rights

### Export your data

1. Go to **Settings → Export**.
2. Choose JSON (complete) or CSV (transactions).
3. Tap **Export**.
4. The file is generated on your device and ready to download or share.

### Delete your account

1. Go to **Settings → Delete Account**.
2. Type the confirmation phrase: `DELETE MY DATA`.
3. Confirm.

What happens next:

- All local data on the current device is deleted.
- If you used sync, all server-side data is deleted through **crypto-shredding** — the encryption keys are destroyed, making any remaining encrypted data permanently unreadable.
- A deletion confirmation is sent to your email.
- The deletion is permanent after a 30-day grace period.

### Contact us about your data

For any privacy-related request that can't be handled through the app, reach out via **Settings → Help → Contact Us**.

---

## Security features in detail

### SQLCipher database encryption

Every Finance database on your device is encrypted with SQLCipher, which uses 256-bit AES encryption. The database is unreadable without the encryption key, which is stored in your platform's secure hardware (Keychain, Keystore, DPAPI).

### Envelope encryption (for sync)

When you sync data, Finance uses a two-layer encryption system:

1. **Data Encryption Key (DEK)** — a unique key generated for each record. Your transaction is encrypted with this key.
2. **Key Encryption Key (KEK)** — a master key that encrypts (wraps) the DEKs. Only you (and household members you've authorized) have the KEK.

This means: even if someone obtained the encrypted data and one DEK, they could only read one record — not your entire history. And without the KEK, they can't unwrap any DEKs at all.

### Key derivation

Your encryption keys are derived using **Argon2id** — a modern, memory-hard key derivation function designed to resist brute-force attacks. It's the winner of the Password Hashing Competition and is recommended by OWASP.

### Crypto-shredding

When you delete your account, Finance doesn't just delete the encrypted data — it destroys the encryption keys. This is called **crypto-shredding**. Even if encrypted data fragments remain on a server somewhere, they're permanently unreadable because the keys no longer exist. A verifiable deletion certificate is generated.

### Secure token storage

Authentication tokens (the credentials that prove you're signed in) are stored using each platform's most secure storage mechanism:

| Platform | Storage                                                        | Protection                                                        |
| -------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| iOS      | Keychain with Secure Enclave                                   | Accessible only when device is unlocked; biometric access control |
| Android  | EncryptedSharedPreferences with Android Keystore               | AES-256 encryption backed by hardware security                    |
| Windows  | DPAPI-encrypted files                                          | Per-user encryption, not cloud-synced                             |
| Web      | In-memory only (access token); HttpOnly cookie (refresh token) | Tokens never touch localStorage or IndexedDB                      |

### Row-Level Security (RLS)

On the server side, every database table has **Row-Level Security** enabled. This means the database itself enforces that you can only access your own data — even if there were a bug in the application code, the database would prevent unauthorized access.

### Input validation

All data entered into Finance is validated before being stored:

- Parameterized database queries prevent SQL injection
- Transaction amounts, dates, payee names, and notes are all validated for format and length
- Error handling uses a type-safe system that prevents data from being stored in an invalid state

---

## Reporting security issues

If you discover a security vulnerability in Finance, please report it responsibly:

1. **Do not** post the vulnerability publicly (on GitHub issues, social media, etc.).
2. Contact us through **Settings → Help → Security Report** or email the security contact listed in the repository.
3. Include:
   - A description of the vulnerability
   - Steps to reproduce it
   - The potential impact
4. We'll acknowledge your report and work on a fix.

We take security issues seriously and appreciate responsible disclosure.

---

_For general questions, see the [FAQ](./faq.md). For platform-specific security features, see the [Platform Guides](./platforms.md)._
