# Platform Guides

Finance runs natively on iOS, Android, Web, and Windows. While the core features are the same everywhere, each platform has its own strengths. This guide covers platform-specific features and setup.

---

## Table of Contents

- [iOS](#ios)
- [Android](#android)
- [Web PWA](#web-pwa)
- [Windows](#windows)
- [Cross-platform sync](#cross-platform-sync)

---

## iOS

Finance on iOS is built with SwiftUI for a native Apple experience on iPhone, iPad, and Mac.

### Face ID & Touch ID

Lock Finance with your biometrics so only you can see your finances.

**To set up:**

1. Go to **Settings → Security → Biometric Lock**.
2. Toggle **Face ID** (or **Touch ID** on older devices) on.
3. Authenticate to confirm.

**Options:**

- Require biometric every time you open the app
- Require biometric after a period of inactivity

Your biometric data stays entirely on your device — Finance asks iOS to verify your identity, but the app never sees your actual Face ID or Touch ID data.

> 💡 Finance uses Apple's **Secure Enclave** for storing encryption keys. This is the same hardware security chip that protects Apple Pay.

### Apple Keychain integration

Your Finance authentication credentials are stored in the Apple Keychain with the highest security level:

- **Accessible only when your device is unlocked** — no background access to sensitive data
- **Not synced to iCloud** — your credentials stay on this device
- **Biometric-protected** — access requires Face ID or Touch ID confirmation

Background sync tokens use a slightly less restrictive level (`AfterFirstUnlock`) so sync can happen while the app is in the background.

### Widgets

Finance offers home screen and Lock Screen widgets so you can check your finances without opening the app:

- **Budget remaining** — see how much is left in your spending categories
- **Goal progress** — track how close you are to your savings goals
- **"Can I Afford This?"** — tap a category to see remaining budget

On iOS 17+, widgets are **interactive** — tap the **+** button on a widget to open quick-entry without launching the full app.

### Haptic feedback

Finance uses Apple's custom haptic engine for subtle, satisfying feedback:

- A confirmation tap when you save a transaction
- A gentle pulse when you approach a budget threshold
- A celebratory pattern when you hit a goal milestone

### watchOS companion app

> ⚠️ The Apple Watch companion app is **planned for a future release**. It will include quick transaction entry and budget glances from your wrist.

### iPad & Mac

Finance adapts to larger screens:

- **iPad**: Multi-column layout, Split View and Slide Over support
- **Mac** (via Catalyst/native): Full desktop experience with keyboard shortcuts

---

## Android

Finance on Android is built with Jetpack Compose and Material You for a modern, customizable experience.

### Biometric setup

Lock Finance with your fingerprint or face recognition.

**To set up:**

1. Go to **Settings → Security → Biometric Lock**.
2. Toggle **Biometric Lock** on.
3. Authenticate with your fingerprint or face to confirm.

Finance uses **BIOMETRIC_STRONG** (Class 3 biometrics) for maximum security, with a device PIN/pattern/password as fallback.

> 💡 On devices with **StrongBox** hardware (like Google Pixel), your encryption keys are stored in a dedicated security chip — the same level of protection as hardware security keys.

### Material You theming

Finance automatically adapts to your Android 12+ **dynamic color** palette:

- The app's color scheme follows your wallpaper colors
- Widgets match your home screen's theme
- All colors remain accessible (WCAG 2.2 AA contrast ratios are maintained)

No setup needed — dynamic theming is automatic. You can override it in **Settings → Appearance** if you prefer a specific theme.

### Home screen widgets

Add Finance widgets to your home screen for at-a-glance information:

- **Budget remaining** — see your spending categories with progress bars
- **Goal progress** — visual tracker for savings goals

Widgets use Material You dynamic colors to blend with your home screen.

### Quick access shortcuts

Long-press the Finance app icon for shortcuts:

- **Quick Transaction** — jump straight to transaction entry
- **Check Budget** — go directly to your budget screen

### Quick Settings tile

Add Finance to your Quick Settings panel for instant access:

1. Pull down your notification shade.
2. Tap the ✏️ **Edit** button on your Quick Settings tiles.
3. Find **Finance Quick Entry** and drag it to your active tiles.
4. Tap the tile anytime to open a quick transaction overlay — even from other apps.

### Notifications

Finance uses Android's notification system for:

- Daily spending snapshots (optional)
- Weekly summaries (optional)
- Budget threshold alerts (when you approach or reach a limit)
- Upcoming bill reminders

All notifications are opt-in. Customize them in **Settings → Notifications** or through Android's system notification settings for Finance.

### Predictive Back gesture

Finance supports Android 14+'s Predictive Back gesture — you'll see a preview of where you're going when you start a back swipe.

---

## Web PWA

Finance on the web is a **Progressive Web App (PWA)** — a full-featured app that runs in your browser and can be installed like a native app.

### Installing as an app

You don't have to use Finance in a browser tab. Install it for a native-like experience:

**Chrome or Edge:**

1. Visit Finance in your browser.
2. Click the **install icon** (⊕) in the address bar, or open the browser menu → **Install app**.
3. Finance opens in its own window with its own icon — just like a regular app.

**Safari (macOS):**

1. Visit Finance in Safari.
2. Go to **File → Add to Dock**.

**Mobile browsers:**

1. Visit Finance in your mobile browser.
2. Tap the browser menu → **Add to Home Screen**.

Once installed, Finance launches in its own window, has its own taskbar/dock icon, and works offline.

### Offline capabilities

The web version works offline thanks to a service worker that caches the app:

- ✅ Full app works without internet
- ✅ All your data is stored locally in the browser (using OPFS or IndexedDB)
- ✅ Transactions, budgets, and reports all work offline
- ✅ Changes sync when you're back online (if sync is enabled)

### Browser requirements

Finance works best in modern browsers:

| Browser           | Support                                     |
| ----------------- | ------------------------------------------- |
| **Chrome** (90+)  | ✅ Full support, installable                |
| **Edge** (90+)    | ✅ Full support, installable                |
| **Safari** (16+)  | ✅ Supported (limited PWA install on macOS) |
| **Firefox** (90+) | ✅ Supported (limited PWA install)          |

For the best experience, use Chrome or Edge — they have the most complete PWA support.

### Keyboard shortcuts

The web version is built with a **keyboard-first workflow** for efficient desktop use:

| Shortcut            | Action                                 |
| ------------------- | -------------------------------------- |
| `Ctrl+N` (or `⌘+N`) | New transaction                        |
| `/`                 | Open search                            |
| `Tab`               | Navigate through fields and categories |
| `Enter`             | Confirm / save                         |
| `Escape`            | Cancel / close dialog                  |

### Desktop layout

At desktop widths (1200px and wider), Finance uses a **multi-panel layout** — you can see your accounts, transactions, and budget side-by-side without navigating between screens.

### Printing reports

Monthly reports are print-optimized. Go to any report → use your browser's print function (`Ctrl+P`) to get a clean, formatted printout.

---

## Windows

Finance on Windows is built with Compose Desktop for a native Windows 11 experience.

### Windows Hello

Lock Finance with Windows Hello biometrics or PIN.

**To set up:**

1. Make sure **Windows Hello** is configured on your device (Settings → Accounts → Sign-in options).
2. Open Finance → go to **Settings → Security → Biometric Lock**.
3. Toggle **Windows Hello** on.
4. Authenticate to confirm.

Windows Hello supports:

- Fingerprint readers
- IR face recognition cameras
- Security keys
- PIN fallback

### Desktop features

Finance takes advantage of the Windows desktop environment:

**Snap Layouts:**

- Snap Finance to half your screen alongside a browser or spreadsheet
- Finance adapts its layout to the snap size

**System notifications:**

- Budget alerts appear as Windows toast notifications
- Click a notification to jump directly to the relevant screen
- Notifications integrate with Focus Assist (they won't interrupt when you're in Do Not Disturb mode)

### Keyboard shortcuts

Finance supports keyboard shortcuts for efficient use:

| Shortcut            | Action                      |
| ------------------- | --------------------------- |
| `Ctrl+N`            | New transaction             |
| `Ctrl+F` or `/`     | Search                      |
| `Ctrl+E`            | Export data                 |
| `Tab` / `Shift+Tab` | Navigate forward / backward |
| `Enter`             | Confirm / save              |
| `Escape`            | Cancel / close              |

### Accessibility on Windows

- **Narrator** screen reader is fully supported
- **High Contrast** themes are respected
- All controls are keyboard-accessible
- Focus indicators are clearly visible

See the [Accessibility Guide](./accessibility.md) for more.

### Data storage

Your encrypted database is stored in `%LOCALAPPDATA%\Finance\` — per-user, not cloud-synced. Authentication tokens are protected with Windows DPAPI (Data Protection API), which ties encryption to your Windows user account.

---

## Cross-platform sync

If you use Finance on multiple platforms, sync keeps everything consistent.

### What syncs

- ✅ Accounts and balances
- ✅ Transactions
- ✅ Categories (including custom ones)
- ✅ Budgets and allocations
- ✅ Goals and progress
- ✅ Preferences and settings

### How it works

1. Changes you make are saved locally first (instantly).
2. In the background, the sync engine sends encrypted changes to the server.
3. Other devices pull the changes and merge them.
4. Everything is end-to-end encrypted — the server never sees your actual data.

### Sync status

A small indicator shows the current state:

- 🟢 **Synced** — everything is up to date
- 🔄 **Syncing** — data transfer in progress
- 🟡 **Pending** — you have local changes waiting to sync
- ⚫ **Offline** — no internet connection (everything still works locally)

Tap the indicator to see the last sync time and how many changes are pending.

---

_For general help, see the [FAQ](./faq.md). For security details, see the [Privacy & Security Guide](./privacy-security.md)._
