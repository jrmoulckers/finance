# Privacy Policy — Finance Desktop Application

**Last updated**: June 2025

## Introduction

Finance ("the App") is a personal finance tracking application for Windows desktop. This privacy policy describes how the App collects, uses, and protects your information.

## Data We Collect

### Financial Data (Stored Locally)

- Account information (names, types, balances)
- Transaction records (amounts, payees, dates, categories)
- Budget configurations and spending data
- Savings goals and progress

### Authentication Data (Encrypted)

- OAuth tokens for cloud sync (if enabled)
- Authentication preferences

### No Personal Identifiers Collected

The App does **not** collect:

- Names, email addresses, or phone numbers
- IP addresses or device identifiers
- Location data
- Usage analytics or telemetry

## Where Data is Stored

### Local Storage

All financial data is stored locally on your Windows device in:

```
%LOCALAPPDATA%\Finance\
```

### Credential Encryption

Authentication tokens and security preferences are encrypted using Windows DPAPI (Data Protection API) with `CurrentUser` scope. This means:

- Only your Windows user account can decrypt the data
- Other users on the same device cannot access your data
- Data is bound to your Windows login credentials

### Cloud Sync (Optional)

If you enable cloud sync:

- Financial data is encrypted before transmission
- Data is synced to Finance cloud servers
- Sync can be disabled at any time from Settings
- Disabling sync does not delete local data

## How We Protect Your Data

1. **Windows DPAPI Encryption** — Credentials encrypted with OS-level protection
2. **Windows Hello** — Biometric/PIN authentication gates access to the app
3. **Auto-Lock** — App locks after inactivity (configurable)
4. **No Plaintext Storage** — Sensitive data is never stored in readable files
5. **Local-First** — App works offline; your data stays on your device

## Third-Party Sharing

We do **not** share, sell, or transmit your personal or financial data to any third parties.

## Data Deletion

You can delete all your data at any time:

1. **In-App**: Settings → Data & Sync → Delete All Data
2. **Manual**: Delete the `%LOCALAPPDATA%\Finance\` directory
3. **Uninstall**: Uninstalling the app removes all application data

## Children's Privacy

The App does not knowingly collect information from children under 13. The App is rated for all ages but is designed for adult financial management.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted on our website and noted in the App's changelog.

## Contact

For privacy-related questions or concerns:

- **Email**: privacy@finance.app
- **Website**: https://finance.app/privacy
- **Support**: https://finance.app/support

---

_This privacy policy applies to the Finance Windows desktop application distributed through the Microsoft Store._
