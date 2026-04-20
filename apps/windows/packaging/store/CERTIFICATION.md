# Microsoft Store Certification Requirements — Finance

## Overview

This document tracks compliance with Microsoft Store certification policies
(https://learn.microsoft.com/windows/apps/publish/store-policies).

## Certification Checklist

### 10.1 — Distinct Function & Value ✅

- [x] App provides distinct financial tracking functionality
- [x] Not a duplicate of existing system functionality
- [x] Provides value beyond a website wrapper

### 10.2 — Security ✅

- [x] No malware or unwanted software
- [x] Does not compromise system security
- [x] DPAPI used for credential storage (never plaintext)
- [x] Windows Hello for biometric authentication
- [x] No hardcoded secrets in source code
- [x] PowerShell scripts sanitize user input

### 10.3 — Product is Testable ✅

- [x] App launches successfully on clean Windows 10/11 install
- [x] All features accessible without paid accounts
- [x] Sample data present for demo/testing
- [x] No server dependency required for basic functionality

### 10.4 — Usability ✅

- [x] App is functional and responsive
- [x] Supports mouse, keyboard, and touch input
- [x] Window resizable with proper layout adaptation
- [x] No unfinished screens (all screens have content or empty states)

### 10.5 — Personal Information ⚠️ (Needs Privacy Policy)

- [x] App stores financial data locally on device
- [x] DPAPI encryption for sensitive data
- [ ] **Privacy policy page deployed to https://finance.app/privacy**
- [ ] **Privacy policy URL added to Store listing**
- [x] No personal data transmitted without user consent
- [x] No advertising SDKs or analytics tracking

### 10.6 — Capabilities ✅

- [x] `internetClient` — Required for cloud sync
- [x] `runFullTrust` — Required for JVM runtime and DPAPI access
- [x] No unnecessary capabilities declared
- [x] No restricted capabilities beyond runFullTrust

### 10.7 — Financial Transactions ✅

- [x] App tracks finances but does not process payments
- [x] No in-app purchases currently
- [x] No real money transactions through the app

### 10.8 — Notifications ✅

- [x] Notifications are opt-in (Settings screen toggle)
- [x] Notifications provide value (budget alerts, bill reminders)
- [x] No advertising or spam notifications
- [x] Notification frequency is reasonable

### 10.9 — Accessibility ✅

- [x] Narrator screen reader support for all screens
- [x] Keyboard navigation for all interactive elements
- [x] High contrast theme support
- [x] Semantic content descriptions on all elements
- [x] System font scaling respected

### 10.13 — Gaming and Xbox ✅ (N/A)

- Not applicable — this is a finance application.

### 10.14 — Account Type ✅

- [x] App works without any account (offline-first)
- [x] No mandatory sign-in for basic functionality
- [x] Cloud sync is optional

## MSIX Signing Requirements

### Development Signing

- Use a self-signed certificate for local testing
- Command: `New-SelfSignedCertificate -Subject "CN=FinanceApp" -CertStoreLocation "Cert:\CurrentUser\My" -Type CodeSigningCert`

### Store Signing

- Microsoft signs the package automatically during Store submission
- No manual signing needed for Store distribution
- For sideloading: use an EV code signing certificate

### CI/CD Pipeline Requirements

1. Build MSI/EXE via `./gradlew :apps:windows:packageMsi`
2. Convert to MSIX using MSIX Packaging Tool or makemsix
3. Sign with certificate from Azure Key Vault (CI secret)
4. Upload to Microsoft Partner Center via API

## Privacy Policy Requirements

The privacy policy must cover:

1. **What data is collected**: Financial data (accounts, transactions, budgets, goals)
2. **Where data is stored**: Locally on device in `%LOCALAPPDATA%\Finance\`
3. **How data is protected**: DPAPI encryption for credentials, Windows Hello for access
4. **Cloud sync data**: When enabled, encrypted data synced to Finance backend
5. **Third-party sharing**: No data shared with third parties
6. **Data deletion**: Users can delete all data from Settings
7. **Contact information**: Support email and website

## Pre-Submission Testing

### Required Tests

- [ ] Install and launch on clean Windows 10 (build 17763)
- [ ] Install and launch on Windows 11 (latest)
- [ ] Windows App Cert Kit (WACK) passes
- [ ] Narrator navigation through all screens
- [ ] Keyboard-only usage of all features
- [ ] High contrast mode visual check
- [ ] Uninstall cleanly (no orphaned files)
- [ ] Upgrade from previous version (MSI → MSI)

### Windows App Certification Kit (WACK)

Run before every Store submission:

```powershell
# Install WACK from Windows SDK
# Then run:
appcert.exe test -appxpackagepath "Finance.msix" -reportoutputpath "wack-report.html"
```

## Human Actions Required

- [ ] Deploy privacy policy to https://finance.app/privacy
- [ ] Register as Microsoft Store developer ($19 one-time fee)
- [ ] Create app reservation in Microsoft Partner Center
- [ ] Set MSIX_PACKAGE_IDENTITY, MSIX_PUBLISHER_IDENTITY in CI secrets
- [ ] Design and upload store screenshots
- [ ] Run WACK certification tests
- [ ] Submit for Store review
