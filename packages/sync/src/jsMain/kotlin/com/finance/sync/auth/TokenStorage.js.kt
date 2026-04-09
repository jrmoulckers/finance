// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

/**
 * JS actual for [TokenStorage] using secure in-memory storage.
 *
 * **Security rationale — why in-memory is the correct choice:**
 *
 * For browser environments, in-memory storage is the most secure option
 * available from client-side JavaScript:
 *
 * - **`localStorage` / `sessionStorage`**: Accessible to any JS running
 *   in the same origin, making them vulnerable to XSS attacks. Tokens
 *   stored here can be exfiltrated by injected scripts. OWASP explicitly
 *   recommends against storing tokens in Web Storage.
 *
 * - **HttpOnly cookies**: The gold standard for browser token storage,
 *   but they are set by the *server* via `Set-Cookie` headers — not
 *   accessible from client-side JS. The server-side auth flow should use
 *   HttpOnly cookies; this KMP layer handles the client-side fallback.
 *
 * - **In-memory**: Tokens exist only in the JS heap. They cannot be
 *   accessed via `document.cookie`, Web Storage APIs, or IndexedDB.
 *   They are automatically cleared on page navigation/close. The only
 *   attack vector is XSS with direct memory access, which has a much
 *   smaller attack surface.
 *
 * **Trade-off:** Tokens do not survive page refreshes. The auth flow
 * must re-authenticate or rely on server-side HttpOnly refresh cookies.
 * This is an acceptable trade-off for financial application security.
 *
 * @see <a href="https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#local-storage">OWASP HTML5 Storage</a>
 */
actual open class TokenStorage actual constructor() {
    private var stored: StoredTokenData? = null

    actual open fun save(
        accessToken: String,
        refreshToken: String,
        expiresAt: Long,
        userId: String,
    ) {
        stored = StoredTokenData(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAtMillis = expiresAt,
            userId = userId,
        )
    }

    actual open fun load(): StoredTokenData? = stored

    actual open fun clear() {
        stored = null
    }
}
