# Troubleshooting

Having an issue with Finance? This guide covers the most common problems and how to resolve them. If your issue isn't listed here, check the [FAQ](faq.md) or reach out through **Settings → Help → Contact Us**.

---

## Table of Contents

- [Sync issues](#sync-issues)
- [Authentication problems](#authentication-problems)
- [Data concerns](#data-concerns)
- [Budget and transaction issues](#budget-and-transaction-issues)
- [Performance issues](#performance-issues)
- [Platform-specific issues](#platform-specific-issues)
- [Getting more help](#getting-more-help)

---

## Sync issues

### Sync isn't working

**Symptoms:** The sync indicator shows "Offline" or "Pending" even though you have internet, or changes aren't appearing on other devices.

**Steps to resolve:**

1. **Check your internet connection.** Open a browser and verify you can load a webpage.
2. **Check the sync status indicator.** Go to **Settings → Data → Sync Status**. It should show "Online — synced" with a green dot.
3. **Force a manual sync.** Pull down on the main screen (pull-to-refresh) to trigger a sync manually.
4. **Sign out and sign back in.** Go to **Settings → Security → Sign Out**, then sign in again. This refreshes your authentication tokens.
5. **Check for app updates.** Ensure you're running the latest version of Finance on all devices.

If none of these work, the sync server may be experiencing temporary issues. Wait 15–30 minutes and try again.

### Changes not appearing on another device

**Symptoms:** You recorded a transaction on one device, but it doesn't appear on another.

**Steps to resolve:**

1. **Wait a moment.** Sync runs in the background and may take up to 30 seconds.
2. **Open the app on the other device.** Sync triggers when the app is opened.
3. **Pull to refresh** on the other device to force an immediate sync.
4. **Verify both devices are signed into the same account.** Check **Settings → Security → Account** on both devices.

### Sync conflicts

**Symptoms:** You edited the same transaction on two devices while offline, and now you see a conflict prompt.

**What's happening:** Both devices changed the same record before syncing. Finance detected the conflict and needs your input.

**How to resolve:**

1. Finance shows both versions side by side (yours and the other device's).
2. Review the differences.
3. Choose the version you want to keep, or merge specific fields.
4. Confirm your choice.

For simple field changes (e.g., only the category was changed on one device), Finance resolves conflicts automatically using **last-write-wins** — the most recent edit is kept. You're only prompted when the conflict is ambiguous (e.g., both devices changed the amount).

> 📌 No data is ever silently discarded during conflict resolution. If Finance auto-resolves a conflict, the resolution is logged so you can review it.

### Sync indicator meanings

| Indicator              | What it means                                   |
| ---------------------- | ----------------------------------------------- |
| 🟢 **Green dot**       | Synced — all data is up to date                |
| 🔄 **Animated**        | Syncing now — data transfer in progress        |
| 🟡 **Yellow dot**      | Pending — changes waiting to sync              |
| ⚫ **Grey dot**         | Offline — no internet connection               |

Tap the sync indicator to see the last sync time and the number of pending changes.

---

## Authentication problems

### Can't sign in

**Steps to resolve:**

1. **Check your email and password.** Ensure you're using the correct email address (check for typos).
2. **Reset your password.** Tap **Forgot Password** on the sign-in screen. A reset link is sent to your email. Check your spam folder if it doesn't arrive within a few minutes.
3. **Try a passkey.** If you previously set up a passkey, use it instead of your password. Passkeys are available on the sign-in screen.
4. **Check your internet connection.** Authentication requires a network connection (unlike the rest of the app).
5. **Clear the app cache.** On web: clear site data for Finance. On mobile: force-close and reopen the app.

### Session expired

**Symptoms:** You're suddenly asked to sign in again, or sync stops working.

**What's happening:** Your authentication token has expired. This is a normal security measure.

**How to resolve:**

1. Sign in again with your email/password or passkey.
2. Finance automatically refreshes tokens in the background, so this should be rare. If it happens frequently, ensure your device's clock is accurate (incorrect time can cause token validation failures).

### Biometric lock not working

**Steps to resolve:**

1. **Verify biometrics are set up on your device.** Go to your device's system settings and confirm Face ID, fingerprint, or Windows Hello is configured.
2. **Re-enable in Finance.** Go to **Settings → Security → Biometric Lock**, toggle it off, then on again. Authenticate to confirm.
3. **Check for OS updates.** Some biometric issues are resolved by operating system updates.
4. **Use your device PIN as fallback.** All biometric methods include a PIN/passcode fallback for situations where biometrics aren't available (e.g., wet fingers, wearing a mask).

### Passkey issues

**Symptoms:** Passkey registration fails, or you can't sign in with a passkey.

**Steps to resolve:**

1. **Check browser/OS support.** Passkeys require relatively recent operating systems and browsers. Ensure your device is up to date.
2. **Try a different browser.** If registering a passkey on the web, try Chrome or Edge (they have the most complete WebAuthn support).
3. **Check your credential manager.** Passkeys are stored in your platform's credential manager (iCloud Keychain, Google Password Manager, etc.). Ensure it's enabled and syncing.
4. **Register a new passkey.** If your existing passkey isn't working, go to **Settings → Security → Passkeys** and register a new one.

---

## Data concerns

### My data seems to be missing

**Steps to resolve:**

1. **Check that you're signed into the correct account.** Different email addresses have separate data.
2. **Check the date range.** If you're looking at transactions, make sure you're viewing the correct month or date range.
3. **Check archived accounts.** If an account was archived, its transactions won't appear in the main view. Look in the Archived section.
4. **Check filters.** If you have active filters on the Transactions screen, they may be hiding entries. Clear all filters and check again.

### I accidentally deleted something

**For transactions:** If it was within the last 10 seconds, use the **Undo** button that appears at the bottom of the screen.

**For accounts, goals, or budgets:** These are soft-deleted. If sync is enabled, the deletion propagates to the server. Contact support through **Settings → Help → Contact Us** if you need to recover data within the 30-day retention window.

**For your entire account:** Account deletion has a 30-day grace period. If you deleted your account and need to undo it, contact support immediately.

### Exporting my data

If you want a backup or want to move to another app:

1. Go to **Settings → Data → Export**.
2. Choose your format:
   - **JSON** — complete backup of everything (accounts, transactions, categories, budgets, goals)
   - **CSV** — tabular format suitable for spreadsheets
3. Tap **Export**.
4. The file downloads to your device or appears in a share sheet.

Exports are generated entirely on your device from your local database — no server request is needed, and the export works offline.

### Data integrity concerns

**Symptoms:** Your account balance doesn't match the sum of your transactions, or numbers look wrong.

**Steps to resolve:**

1. **Use Adjust Balance.** On the account detail screen, tap **Adjust Balance** to correct the balance. Finance creates an adjustment transaction for the difference.
2. **Check for duplicate transactions.** Search for the payee or amount to find potential duplicates.
3. **Check for missing transactions.** Compare your Finance records with your bank statement to identify any gaps.

> 💡 Finance stores all monetary values as integers (e.g., $12.50 is stored as 1250 cents). This eliminates floating-point rounding errors that plague many financial applications.

---

## Budget and transaction issues

### My budget totals don't add up

**Possible causes:**

1. **Uncategorized transactions.** Transactions without a budgeted category don't appear on the budget screen. Check for uncategorized transactions and assign them to categories.
2. **Rollover amounts.** If rollover is enabled, last month's surplus or deficit carries forward. Check the rollover line on each category.
3. **Split transaction mismatch.** If a split transaction's splits don't sum to the total, the remainder is allocated to the last split. Check your split transactions for accuracy.

### A transaction is in the wrong category

1. Tap the transaction.
2. Tap **Edit**.
3. Change the category.
4. Tap **Save**.

Both the old and new budget categories update automatically.

### I can't find a transaction

Try these approaches:

1. **Search.** Tap the search icon and enter the payee name, amount, or any text from the notes.
2. **Change the date filter.** You may be looking at the wrong month.
3. **Check all accounts.** The transaction may be in a different account than expected.
4. **Check archived accounts.** If the account was archived, its transactions are still there but hidden from the main view.

---

## Performance issues

### The app is slow

**General steps:**

1. **Update the app.** Ensure you're on the latest version.
2. **Restart the app.** Close it completely and reopen.
3. **Check device storage.** Low storage can impact database performance. Free up space if needed.

**Web-specific:**

1. **Clear browser cache** for the Finance site (not all sites — just Finance).
2. **Try a different browser.** Chrome and Edge generally have the best performance for web apps.
3. **Check extensions.** Some browser extensions can interfere with web app performance. Try in an incognito/private window.

**Mobile-specific:**

1. **Free up RAM.** Close other apps running in the background.
2. **Check for OS updates.** Performance improvements often come with system updates.

### The app is using too much battery (mobile)

Finance is designed to be battery-friendly, but if you notice excessive usage:

1. **Check background sync frequency.** Finance uses platform-native background scheduling (WorkManager on Android, BGTaskScheduler on iOS) which is battery-optimized.
2. **Disable background app refresh** for Finance if you don't need real-time sync (your data will sync when you open the app instead).
3. **Check location services.** Finance does not use location services. If your device shows Finance accessing location, it's likely a system attribution error.

---

## Platform-specific issues

### iOS: Face ID prompt doesn't appear

1. Go to **iOS Settings → Face ID & Passcode** and ensure Face ID is set up.
2. Go to **iOS Settings → Finance** and verify Face ID permission is granted.
3. In Finance, toggle **Biometric Lock** off and on again.

### iOS: Widgets not updating

1. Long-press the widget → **Edit Widget** to verify it's configured correctly.
2. Widgets update periodically — they may not reflect the latest transaction instantly.
3. Remove the widget and add it again.

### Android: Notifications not appearing

1. Go to **Android Settings → Apps → Finance → Notifications** and ensure notifications are enabled.
2. Check that Finance is not in "Battery optimization" mode that restricts background activity.
3. In Finance, go to **Settings → Notifications** and verify your preferences.

### Android: Quick Settings tile missing

1. Pull down the notification shade.
2. Tap the pencil/edit icon.
3. Scroll through available tiles and look for "Finance Quick Entry."
4. Drag it into your active tiles area.

### Web: App doesn't work offline

1. Ensure you've loaded the app at least once while online (this installs the service worker).
2. Check that your browser supports service workers (all modern browsers do).
3. If you recently cleared browser data, revisit the app while online to reinstall the service worker.

### Web: Export button disabled

This occurs when the database is still initializing. Wait a few seconds and try again. If the issue persists, reload the page.

### Windows: Windows Hello prompt doesn't appear

1. Ensure Windows Hello is configured: **Windows Settings → Accounts → Sign-in options**.
2. Verify that Finance has permission to use Windows Hello.
3. Try signing out and back in to Finance.

---

## Getting more help

If this guide didn't solve your issue:

1. **Check the [FAQ](faq.md)** for answers to common questions.
2. **Contact support** through **Settings → Help → Contact Us**.
3. **Check for known issues** on the [project GitHub issues page](https://github.com/jrmoulckers/finance/issues).

When reporting an issue, include:

- Your **platform and version** (e.g., "iOS 17.4, Finance v0.1.0")
- A **description of what happened** vs. what you expected
- **Steps to reproduce** the issue
- The **sync status** (online/offline) when the issue occurred

---

_Back to [Getting Started](getting-started.md) · [FAQ](faq.md)_
