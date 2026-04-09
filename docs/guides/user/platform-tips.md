# Platform Tips

Finance runs natively on iOS, Android, Web, and Windows. The core features and data are identical everywhere, but each platform offers unique capabilities that take advantage of its strengths. This guide covers platform-specific tips to help you get the most out of Finance on your device.

---

## Table of Contents

- [iOS](#ios)
- [Android](#android)
- [Web PWA](#web-pwa)
- [Windows](#windows)
- [Cross-platform differences](#cross-platform-differences)
- [Choosing a primary platform](#choosing-a-primary-platform)

---

## iOS

Finance on iOS is built with **SwiftUI**, Apple's native UI framework, for a first-class experience on iPhone, iPad, and Mac.

### Face ID & Touch ID

Lock Finance with biometrics for instant, secure access:

1. Go to **Settings → Security → Biometric Lock**.
2. Toggle **Face ID** (or **Touch ID** on supported devices) on.
3. Authenticate to confirm.

Choose when the lock activates:
- **Every time** you open the app
- **After inactivity** (e.g., after 5 minutes of not using the app)

> 💡 Your biometric data never leaves your device. Finance asks iOS to verify your identity — the app never sees your Face ID or fingerprint data. Encryption keys are stored in Apple's **Secure Enclave**, the same hardware that protects Apple Pay.

### Apple Keychain integration

Your authentication credentials are stored in the Apple Keychain with the highest security level:

- Accessible only when your device is unlocked
- Not synced to iCloud (credentials stay on this device)
- Biometric-protected access

### Widgets

Finance offers home screen and Lock Screen widgets:

| Widget                | What it shows                                |
| --------------------- | -------------------------------------------- |
| **Budget Remaining**  | Spending categories with remaining amounts   |
| **Goal Progress**     | Visual progress bars for savings goals       |
| **Can I Afford This?**| Tap a category to see remaining budget       |

**iOS 17+ interactive widgets:** Tap the **+** button directly on a widget to open quick-entry without launching the full app.

**To add a widget:**
1. Long-press your home screen.
2. Tap the **+** button in the top corner.
3. Search for "Finance."
4. Choose a widget size and style.
5. Tap **Add Widget**.

### Haptic feedback

Finance uses Apple's custom haptic engine for tactile feedback:

- Confirmation tap when saving a transaction
- Gentle pulse when approaching a budget threshold
- Celebratory pattern when hitting a goal milestone

To disable haptics, turn off **Settings → Sounds & Haptics → System Haptics** in your iOS settings.

### iPad features

Finance adapts to larger screens on iPad:

- **Multi-column layout** — see more information at once without navigating between screens.
- **Split View and Slide Over** — use Finance alongside your banking app or a spreadsheet.
- **Keyboard shortcuts** — attach a keyboard and use `⌘+N` for new transaction, `/` for search.

### Mac (native)

Finance runs natively on Mac (via the shared SwiftUI codebase):

- Full desktop experience with window resizing
- Menu bar integration for keyboard shortcuts
- Touch ID on supported MacBooks

### Accessibility on iOS

- **VoiceOver** — every screen is fully navigable with VoiceOver. Balances are announced with currency, progress is read as percentages.
- **Dynamic Type** — Finance supports all Dynamic Type sizes. Text resizes up to 200% without content loss.
- **Reduced Motion** — when enabled in iOS Settings, all animations are suppressed.

---

## Android

Finance on Android is built with **Jetpack Compose** and **Material 3** for a modern, customizable experience that feels right at home on any Android device.

### Biometric lock

Secure Finance with your fingerprint or face:

1. Go to **Settings → Security → Biometric Lock**.
2. Toggle it on.
3. Authenticate to confirm.

Finance uses **BIOMETRIC_STRONG** (Class 3 biometrics) for maximum security, with PIN/pattern/password as a fallback.

> 💡 On devices with **StrongBox** hardware (like Google Pixel), encryption keys are stored in a dedicated security chip — the same level of protection as hardware security keys.

### Material You dynamic theming

On Android 12+, Finance automatically adapts to your **wallpaper-based color palette**:

- The app's color scheme follows your device's Material You colors
- Widgets match your home screen theme
- All dynamic colors are verified against WCAG 2.2 AA contrast ratios

No setup needed — it's automatic. Override it in **Settings → Preferences → Theme** if you prefer a specific theme.

### Home screen widgets

| Widget               | What it shows                              |
| -------------------- | ------------------------------------------ |
| **Budget Remaining** | Spending categories with progress bars     |
| **Goal Progress**    | Visual tracker for savings goals           |

Widgets use Material You dynamic colors to blend seamlessly with your home screen.

**To add a widget:**
1. Long-press your home screen.
2. Tap **Widgets**.
3. Find "Finance" in the list.
4. Drag the widget you want to your home screen.

### Quick access shortcuts

Long-press the Finance app icon for instant access to key features:

- **Quick Transaction** — jump straight to transaction entry
- **Check Budget** — go directly to the budget screen

### Quick Settings tile

Add Finance to your notification shade for one-tap transaction entry:

1. Pull down the notification shade fully.
2. Tap the **✏️ Edit** button on your Quick Settings.
3. Find **Finance Quick Entry** and drag it to your active tiles.
4. Tap the tile anytime to open a quick transaction overlay.

This works from any app — you don't need to switch to Finance first.

### Notifications

Finance uses Android's notification channels for:

- **Daily spending snapshots** (optional)
- **Weekly summaries** (optional)
- **Budget threshold alerts** (when you approach or reach a limit)
- **Upcoming bill reminders** (when available)

All notifications are **opt-in**. Configure them in Finance's **Settings → Notifications** or through Android's system notification settings for the app.

### Predictive Back gesture

On Android 14+, Finance supports Predictive Back — you'll see a preview of where you're going when you start a back swipe.

### Accessibility on Android

- **TalkBack** — full TalkBack support with meaningful content descriptions for all interactive elements.
- **Font scaling** — Finance respects the system font size setting. Text scales without content loss.
- **Reduced motion** — respects the **Remove animations** system setting.
- **Switch Access** — all features are accessible via Switch Access navigation.

---

## Web PWA

Finance on the web is a **Progressive Web App (PWA)** — a full-featured application that runs in your browser and can be installed like a native desktop app.

### Installing as a desktop app

You don't have to use Finance in a browser tab:

**Chrome or Edge:**
1. Visit Finance in your browser.
2. Click the **install icon** (⊕) in the address bar, or open the browser menu → **Install app**.
3. Finance opens in its own window with its own taskbar icon.

**Safari (macOS):**
1. Visit Finance in Safari.
2. Go to **File → Add to Dock**.

**Mobile browsers:**
1. Visit Finance in your mobile browser.
2. Tap the browser menu → **Add to Home Screen**.

Once installed, Finance launches independently, has its own icon, and works offline.

### Offline capabilities

Finance's service worker caches the entire application:

- ✅ Full app functionality without internet
- ✅ Data stored locally using the Origin Private File System (OPFS) or IndexedDB
- ✅ All features — transactions, budgets, reports — work offline
- ✅ Changes sync automatically when connectivity returns

### Browser compatibility

| Browser           | Support level                               |
| ----------------- | ------------------------------------------- |
| **Chrome** (90+)  | ✅ Full support, installable PWA            |
| **Edge** (90+)    | ✅ Full support, installable PWA            |
| **Safari** (16+)  | ✅ Supported (limited PWA install on macOS) |
| **Firefox** (90+) | ✅ Supported (limited PWA install)          |

For the best experience, use Chrome or Edge — they have the most complete PWA and WebAuthn support.

### Keyboard shortcuts

The web version is designed for efficient keyboard-first use:

| Shortcut             | Action                     |
| -------------------- | -------------------------- |
| `Ctrl+N` / `⌘+N`    | New transaction            |
| `/`                  | Open search                |
| `Tab`                | Navigate between fields    |
| `Enter`              | Confirm / save             |
| `Escape`             | Cancel / close dialog      |

### Multi-panel desktop layout

At desktop widths (1200px and wider), Finance uses a **multi-panel layout** — accounts, transactions, and budget visible side by side without navigating between screens.

### Printing reports

Reports are print-optimized. Open any report → use your browser's print function (`Ctrl+P` / `⌘+P`) to get a clean, formatted printout for your records.

### Data export

The web version supports exporting your data as **JSON** or **CSV** from **Settings → Data → Export**. The export runs entirely in your browser — no server request is needed.

### Accessibility on the web

- **Screen readers** — tested with NVDA, JAWS, and VoiceOver for macOS.
- **Keyboard navigation** — every feature is accessible without a mouse.
- **WCAG 2.2 AA** — color contrast, focus indicators, and ARIA labels meet AA standards.
- **Reduced motion** — respects the `prefers-reduced-motion` media query.

---

## Windows

Finance on Windows is built with **Compose Desktop** for a native Windows 11 experience.

### Windows Hello

Secure Finance with Windows Hello biometrics or PIN:

1. Ensure Windows Hello is configured: **Windows Settings → Accounts → Sign-in options**.
2. Open Finance → **Settings → Security → Biometric Lock**.
3. Toggle **Windows Hello** on.
4. Authenticate to confirm.

Supported methods:
- Fingerprint reader
- IR face recognition camera
- Security key (USB or NFC)
- PIN fallback

### Desktop features

**Snap Layouts:**
- Snap Finance to half your screen alongside a browser or spreadsheet.
- Finance adapts its layout to the snap size.
- Supports Windows 11 Snap Groups — Finance remembers its position in your layout.

**System tray:**
- Finance runs in the system tray for quick access.
- Left-click the tray icon to open the app.
- Right-click for shortcuts: New Transaction, Check Budget, Open Settings.

**Keyboard shortcuts:**
Same as the web version: `Ctrl+N` for new transaction, `/` for search, `Tab` to navigate.

### Notifications

Finance uses Windows notification center for optional alerts:

- Budget threshold alerts
- Weekly spending summaries
- Sync status updates

Configure in Finance's **Settings → Notifications** or through Windows **Settings → System → Notifications → Finance**.

### Accessibility on Windows

- **Narrator** — full support for the Windows screen reader.
- **High contrast mode** — Finance respects the Windows high contrast theme.
- **Keyboard navigation** — all features accessible without a mouse.
- **Display scaling** — supports Windows display scaling without content loss.

---

## Cross-platform differences

Finance is designed to look and feel native on every platform. This means the same feature may look slightly different across devices:

| Aspect              | iOS                 | Android              | Web                 | Windows             |
| ------------------- | ------------------- | -------------------- | ------------------- | ------------------- |
| **Design language** | Human Interface     | Material 3           | Responsive web      | Fluent / Compose    |
| **Navigation**      | Tab bar (bottom)    | Tab bar (bottom)     | Sidebar or tabs     | Sidebar or tabs     |
| **Quick entry**     | FAB or widget       | FAB, tile, or shortcut| `Ctrl+N` or FAB    | `Ctrl+N` or tray    |
| **Biometric**       | Face ID / Touch ID  | Fingerprint / face   | WebAuthn            | Windows Hello       |
| **Theming**         | System light/dark   | Material You dynamic | Theme selector      | System light/dark   |
| **Offline storage** | SQLite (SQLCipher)  | SQLite (SQLCipher)   | OPFS / IndexedDB    | SQLite (SQLCipher)  |

**What's the same everywhere:**
- All your data (accounts, transactions, budgets, goals)
- All core features (quick entry, budgeting, goal tracking, reports)
- Privacy and security protections
- Sync behavior
- Accessibility support

---

## Choosing a primary platform

If you use Finance on multiple devices, any of them can be your primary:

- **Phone** (iOS or Android) — best for quick daily transaction entry on the go.
- **Web** — best for detailed budgeting, report review, and desktop use without installing anything.
- **Windows** — best for a dedicated desktop experience with system integration.
- **iPad / Tablet** — best for a larger-screen mobile experience with multi-column layouts.

All platforms are equal in features and data. Choose the one that fits your workflow, and let sync handle the rest.

---

_Back to [Getting Started](getting-started.md) · [FAQ](faq.md)_
