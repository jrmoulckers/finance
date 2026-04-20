# Biometric-Protected Transaction Categories — Design & Implementation Spec

**Issue:** #295
**Sprint:** 6 (Security Implementation)
**Status:** Draft — Pending Review
**Date:** 2025-07-24
**Author:** Security & Privacy Reviewer

---

## 1. Problem Statement

Users want to protect sensitive transaction categories (e.g., medical, therapy, legal
fees, salary, gifts) with biometric authentication. Currently, all categories and
their transactions are visible to anyone who can unlock the app. In shared-household
scenarios, this is especially problematic — a household member can see all categorised
transactions without restriction.

### User Stories

1. **As a user**, I want to mark specific categories as "biometric-protected" so that
   transactions in those categories require a fingerprint/face scan to view.
2. **As a household owner**, I want biometric-protected categories to apply per-user —
   my protected categories should not affect other members' views.
3. **As a user**, I want a "reveal" session that lasts for a configurable duration
   (default 5 minutes) after a successful biometric check, so I don't need to
   authenticate for every scroll.

---

## 2. Security Requirements

### 2.1 Threat Model

| Threat                             | Mitigation                                                          |
| ---------------------------------- | ------------------------------------------------------------------- |
| Shoulder surfing                   | Protected category transactions hidden behind biometric gate        |
| Shared device / household member   | Per-user protection flag; biometric bound to device owner           |
| Stolen unlocked device             | Short reveal session timeout (configurable, max 10 min)             |
| Memory scraping / debug inspection | Protected data cleared from ViewModel state when session expires    |
| Sync exposure                      | Protected flag is per-user local state, NOT synced to server        |
| Screenshot / screen recording      | FLAG_SECURE on Android, UIScreen.captured on iOS during reveal      |
| Accessibility service data leakage | Redact content descriptions for protected transaction amounts/payee |

### 2.2 Non-Negotiable Security Constraints

1. **BIOMETRIC_STRONG (Class 3) only** — no fallback to device credentials for
   category protection. This is a higher bar than app-level auth (which allows
   credential fallback). Rationale: device PIN may be known to household members.
2. **No server-side storage of protection preferences** — which categories a user
   considers sensitive is itself sensitive metadata. Store locally in
   `EncryptedSharedPreferences` (Android), Keychain (iOS), DPAPI (Windows),
   or encrypted IndexedDB (Web).
3. **Protected transaction data must not appear in:**
   - Log output (Timber, console.log)
   - Crash reports (even with consent)
   - Analytics events
   - Notification content
   - Widget/tile previews
   - Recent apps screenshot (apply window flag)
4. **Reveal session duration** must be stored in volatile memory only, never persisted.
   A process restart resets the session.
5. **Biometric prompt must include context** — the prompt subtitle must state which
   category is being revealed (e.g., "View transactions in 'Medical'"), not a
   generic message.

---

## 3. Data Model Changes

### 3.1 New: `ProtectedCategory` (Local-Only)

This entity exists ONLY in local storage. It is NOT synced via PowerSync and has
NO corresponding Supabase table. This is by design — which categories a user
considers sensitive is PII.

```kotlin
// packages/models — local-only model, no @Serializable
data class ProtectedCategory(
    val categoryId: SyncId,
    val userId: String,            // auth.uid() of the protecting user
    val protectedAt: Instant,
    val revealDurationSeconds: Int = 300,  // default 5 minutes
)
```

### 3.2 Local SQLite Schema

```sql
-- New table in local SQLite database (NOT a Supabase migration)
CREATE TABLE protected_categories (
    category_id TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    protected_at TEXT NOT NULL,
    reveal_duration_seconds INTEGER NOT NULL DEFAULT 300,
    PRIMARY KEY (category_id, user_id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);
```

### 3.3 Category Model — No Changes

The `Category` model is intentionally NOT modified. The protection status is a
local-only overlay. This avoids:

- Syncing sensitive preference data to the server
- Requiring a Supabase migration
- Affecting other household members' views

---

## 4. Architecture

### 4.1 Component Overview

```
┌─────────────────────────────────────────────────────┐
│                    UI Layer                          │
│  CategoryListScreen ──► ProtectedCategoryBadge      │
│  TransactionListScreen ──► BiometricGate            │
│  CategorySettingsSheet ──► ToggleProtection          │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              ViewModel Layer                         │
│  CategoryViewModel  ─── uses ───► BiometricSession  │
│  TransactionListVM  ─── uses ───► BiometricSession  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Domain Layer (KMP shared)               │
│  ProtectedCategoryRepository (expect/actual)         │
│  BiometricSessionManager (shared logic)              │
│  TransactionFilterService (applies protection)       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Platform Layer                           │
│  Android: BiometricPrompt + EncryptedSharedPrefs     │
│  iOS: LAContext + Keychain                            │
│  Windows: WindowsHello + DPAPI                       │
│  Web: WebAuthn + encrypted IndexedDB                 │
└─────────────────────────────────────────────────────┘
```

### 4.2 BiometricSessionManager (KMP Shared)

```kotlin
// packages/core/src/commonMain/kotlin/.../security/BiometricSessionManager.kt

/**
 * Manages time-limited biometric reveal sessions.
 *
 * After successful biometric authentication, a reveal session is created
 * for a specific category. The session expires after the configured
 * duration. All state is volatile (in-memory only).
 */
class BiometricSessionManager {
    // categoryId → expiry timestamp (monotonic clock)
    private val activeSessions = mutableMapOf<SyncId, Long>()

    fun startSession(categoryId: SyncId, durationSeconds: Int) {
        val expiresAt = monotonicNow() + (durationSeconds * 1000L)
        activeSessions[categoryId] = expiresAt
    }

    fun isRevealed(categoryId: SyncId): Boolean {
        val expiresAt = activeSessions[categoryId] ?: return false
        if (monotonicNow() >= expiresAt) {
            activeSessions.remove(categoryId)
            return false
        }
        return true
    }

    fun revokeAll() {
        activeSessions.clear()
    }

    fun revokeSession(categoryId: SyncId) {
        activeSessions.remove(categoryId)
    }

    private fun monotonicNow(): Long = /* platform expect/actual */
}
```

### 4.3 TransactionFilterService

```kotlin
/**
 * Filters transactions based on biometric protection status.
 *
 * When a category is protected and not currently revealed,
 * transactions in that category are either:
 *   - Hidden entirely (default)
 *   - Shown with redacted amount/payee (configurable)
 *
 * The filter runs CLIENT-SIDE ONLY. The server always returns
 * all transactions the user has access to via RLS. This ensures
 * protection is purely a UI/UX layer and does not create sync
 * inconsistencies.
 */
class TransactionFilterService(
    private val protectedCategoryRepo: ProtectedCategoryRepository,
    private val sessionManager: BiometricSessionManager,
) {
    fun filterForDisplay(
        transactions: List<Transaction>,
        userId: String,
    ): List<DisplayTransaction> {
        val protectedIds = protectedCategoryRepo.getProtectedCategoryIds(userId)
        return transactions.map { tx ->
            when {
                tx.categoryId == null -> DisplayTransaction.Visible(tx)
                tx.categoryId !in protectedIds -> DisplayTransaction.Visible(tx)
                sessionManager.isRevealed(tx.categoryId) -> DisplayTransaction.Visible(tx)
                else -> DisplayTransaction.Protected(tx.id, tx.categoryId, tx.date)
            }
        }
    }
}

sealed class DisplayTransaction {
    /** Fully visible transaction. */
    data class Visible(val transaction: Transaction) : DisplayTransaction()

    /** Protected transaction — only non-sensitive fields exposed. */
    data class Protected(
        val id: SyncId,
        val categoryId: SyncId,
        val date: LocalDate,  // date is OK — not sensitive on its own
    ) : DisplayTransaction()
}
```

---

## 5. Platform Implementation Notes

### 5.1 Android

- **BiometricPrompt** with `BIOMETRIC_STRONG` only (no `DEVICE_CREDENTIAL` fallback)
- Store protected category IDs in `EncryptedSharedPreferences` (AES-256-GCM)
- Apply `FLAG_SECURE` to the window when protected transactions are revealed
- Clear ViewModel state (`DisplayTransaction.Protected`) when session expires
- Use `Lifecycle.Event.ON_STOP` to revoke all active sessions (app backgrounded)

### 5.2 iOS

- **LAContext** with `LAPolicyDeviceOwnerAuthenticationWithBiometrics` (no passcode fallback)
- Store in Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- Set `isSecureTextEntry`-equivalent for transaction fields during reveal
- Use `UIApplication.willResignActiveNotification` to revoke sessions

### 5.3 Windows

- **Windows Hello** with biometric preference
- Store in DPAPI-encrypted file (existing `SecureTokenStorage` pattern)
- No FLAG_SECURE equivalent; document as accepted risk

### 5.4 Web

- **WebAuthn** for biometric gate (platform authenticator only, no roaming)
- Store protected IDs in encrypted IndexedDB (derive key from session)
- Use `visibilitychange` event to revoke sessions when tab is hidden
- Apply CSS `filter: blur()` to protected transaction rows pre-reveal

---

## 6. UI/UX Design

### 6.1 Category Settings

- Long-press (mobile) or right-click (desktop) on a category → "Protect with biometric"
- Toggle in category edit sheet
- Visual indicator: 🔒 lock icon on protected categories
- Protected categories shown in a separate section at the bottom of the category list

### 6.2 Transaction List

- Protected transactions show: date, category icon + "Protected", lock icon
- Amount, payee, note, tags are ALL hidden
- Tap on protected transaction → biometric prompt → reveal session starts
- "Reveal all in [category]" option to start a session for the entire category
- Countdown timer showing remaining reveal session time

### 6.3 Aggregate Views (Budgets, Reports)

- Protected categories contribute to totals ONLY when revealed
- Budget bars for protected categories show "Authenticate to view"
- Pie charts show "Protected (N categories)" as a single slice when not revealed

---

## 7. Edge Cases & Security Considerations

### 7.1 Search

- Search results MUST NOT include transactions from protected categories unless
  revealed. This includes payee search, amount search, and full-text search.
- Search suggestions must not leak protected payee names.

### 7.2 Data Export (GDPR Art. 20)

- Data export endpoint returns ALL data (server-side, no client filtering).
  Biometric protection is a UI overlay only — it does NOT affect GDPR exports.
- Document this clearly in user-facing privacy policy.

### 7.3 Notifications

- Recurring transaction notifications for protected categories must use
  generic text: "Recurring transaction processed" (no amount, no payee).

### 7.4 Shared Households

- Protection is per-user. User A's protected categories are not protected for
  User B unless User B independently protects them.
- There is no "household-level" protection. Each member decides independently.

### 7.5 Category Deletion

- If a protected category is deleted, its protection entry is also deleted
  from local storage. No orphaned protection records.

### 7.6 Offline Behaviour

- Biometric authentication is fully local — works offline.
- Protected category preferences are local — work offline.
- No connectivity requirement for any protection feature.

---

## 8. Testing Plan

### 8.1 Unit Tests (KMP Shared)

| Test Case                                                | Module                      |
| -------------------------------------------------------- | --------------------------- |
| Session expires after configured duration                | BiometricSessionManager     |
| Session revoked on revokeAll()                           | BiometricSessionManager     |
| Protected transactions filtered when session inactive    | TransactionFilterService    |
| Protected transactions visible when session active       | TransactionFilterService    |
| Null categoryId transactions always visible              | TransactionFilterService    |
| Protected category IDs persisted and retrieved correctly | ProtectedCategoryRepository |

### 8.2 Platform Tests

| Test Case                                        | Platform |
| ------------------------------------------------ | -------- |
| BiometricPrompt shown with BIOMETRIC_STRONG only | Android  |
| FLAG_SECURE applied during reveal                | Android  |
| Session revoked on ON_STOP lifecycle event       | Android  |
| LAContext uses biometrics-only policy            | iOS      |
| Keychain entry uses correct accessibility        | iOS      |
| Session revoked on willResignActive              | iOS      |
| WebAuthn platform authenticator only             | Web      |
| CSS blur applied to protected rows               | Web      |

### 8.3 Security Tests

| Test Case                                                 | Type        |
| --------------------------------------------------------- | ----------- |
| Protected transaction data not in Timber/console logs     | Static scan |
| Protected category IDs not synced to Supabase             | Integration |
| EncryptedSharedPreferences used (not plain SharedPrefs)   | Code review |
| Reveal session cannot exceed MAX_REVEAL_DURATION (10 min) | Unit test   |
| Search does not return protected transaction payees       | Integration |
| Crash reports do not contain protected transaction data   | Manual      |

---

## 9. Implementation Phases

### Phase 1: Core (Sprint 6-7)

- [ ] `ProtectedCategory` model + local SQLite schema
- [ ] `ProtectedCategoryRepository` (expect/actual)
- [ ] `BiometricSessionManager`
- [ ] `TransactionFilterService`
- [ ] Android ViewModel integration + biometric gate

### Phase 2: Full Platform (Sprint 8-9)

- [ ] iOS LAContext integration
- [ ] Windows Hello integration
- [ ] Web WebAuthn integration
- [ ] Category settings UI (all platforms)

### Phase 3: Polish (Sprint 10)

- [ ] Aggregate view protection (budgets, reports, charts)
- [ ] Search filtering
- [ ] Notification redaction
- [ ] FLAG_SECURE / screenshot protection
- [ ] Accessibility audit for protected states

---

## 10. Open Questions

1. **Should protected categories affect CSV/data export?** Current decision: No —
   export is a GDPR right and must include all data. The protection is a UI overlay.
2. **Should there be a master "reveal all" option?** Risk: defeats the purpose.
   Recommendation: No — require per-category reveal.
3. **What happens if biometrics are removed from the device?** Recommendation: Show a
   warning banner and require the user to re-authenticate with full app auth before
   allowing unprotection of categories.
4. **Should the reveal countdown be visible in the UI?** Recommendation: Yes — shows
   a discreet countdown badge so the user knows when the session will expire.

---

## 11. Privacy Impact Assessment

| Aspect              | Assessment                                                |
| ------------------- | --------------------------------------------------------- |
| Data collected      | Category IDs + user ID (local only)                       |
| Data transmitted    | None — fully local feature                                |
| Data retention      | Until user removes protection or deletes category         |
| GDPR impact         | Positive — enables user-controlled data minimization      |
| CCPA impact         | Positive — additional user privacy control                |
| Third-party sharing | None                                                      |
| Crash report impact | Must audit that protected data does not appear in reports |

---

## Appendix A: Related Security Audit Findings

- **S-7** (security-audit-v1.md): Sensitive fields classification — this feature
  gives users control over what they consider sensitive.
- **A-4** (security-audit-v1.md): Biometric auth implementations are properly scoped
  — reuse the existing `BiometricAuthManager` pattern.
- **Pre-launch L-5**: Source maps disabled — ensures protection logic not exposed.
