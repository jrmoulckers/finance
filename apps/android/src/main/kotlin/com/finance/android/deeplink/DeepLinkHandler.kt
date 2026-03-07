package com.finance.android.deeplink

import android.content.Intent
import android.net.Uri

/**
 * Parses incoming deep-link [Intent]s and routes them to the
 * appropriate screen.
 *
 * Supported deep-link paths:
 *
 * | Path                      | Description                          |
 * |---------------------------|--------------------------------------|
 * | `/auth/callback`          | OAuth redirect with code & state     |
 * | `/invite/{code}`          | Household invitation acceptance      |
 * | `/transaction/{id}`       | View a specific transaction          |
 *
 * Usage from `MainActivity.onCreate` / `onNewIntent`:
 * ```kotlin
 * val result = DeepLinkHandler.handle(intent)
 * when (result) {
 *     is DeepLinkResult.OAuthCallback -> // resume auth flow
 *     is DeepLinkResult.Invite        -> // show invite screen
 *     is DeepLinkResult.Transaction   -> // navigate to txn detail
 *     null                            -> // not a deep link
 * }
 * ```
 */
object DeepLinkHandler {

    private const val HOST = "finance.app"

    /**
     * Attempt to resolve a [DeepLinkResult] from the given [intent].
     *
     * @return A typed result if the intent carries a recognised
     *   deep-link URI, or `null` otherwise.
     */
    fun handle(intent: Intent?): DeepLinkResult? {
        val uri = intent?.data ?: return null
        if (uri.host != HOST) return null

        val segments = uri.pathSegments
        return when {
            // /auth/callback?code=…&state=…&code_verifier=…
            segments.size >= 2 && segments[0] == "auth" && segments[1] == "callback" ->
                parseOAuthCallback(uri)

            // /invite/{code}
            segments.size >= 2 && segments[0] == "invite" ->
                DeepLinkResult.Invite(code = segments[1])

            // /transaction/{id}
            segments.size >= 2 && segments[0] == "transaction" ->
                DeepLinkResult.Transaction(id = segments[1])

            else -> null
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private fun parseOAuthCallback(uri: Uri): DeepLinkResult.OAuthCallback? {
        val code = uri.getQueryParameter("code") ?: return null
        val state = uri.getQueryParameter("state") ?: return null
        val codeVerifier = uri.getQueryParameter("code_verifier")
        return DeepLinkResult.OAuthCallback(
            code = code,
            state = state,
            codeVerifier = codeVerifier,
        )
    }
}

/**
 * Typed result of a successfully parsed deep link.
 */
sealed interface DeepLinkResult {

    /**
     * OAuth 2.0 authorization-code redirect.
     *
     * @property code         The authorization code.
     * @property state        The state parameter for CSRF validation.
     * @property codeVerifier The PKCE code verifier (nullable for
     *   non-PKCE flows).
     */
    data class OAuthCallback(
        val code: String,
        val state: String,
        val codeVerifier: String?,
    ) : DeepLinkResult

    /**
     * Household invitation acceptance.
     *
     * @property code The invitation code.
     */
    data class Invite(val code: String) : DeepLinkResult

    /**
     * Navigate to a specific transaction.
     *
     * @property id The transaction identifier.
     */
    data class Transaction(val id: String) : DeepLinkResult
}
