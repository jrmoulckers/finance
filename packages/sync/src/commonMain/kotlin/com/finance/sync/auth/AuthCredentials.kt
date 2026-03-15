// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

/**
 * Sealed hierarchy of credential types for authentication (#70, #71).
 *
 * Each variant captures the minimum data needed to initiate a sign-in
 * with Supabase Auth. The [AuthManager] implementation maps these to
 * the appropriate Supabase Auth API call.
 */
sealed class AuthCredentials {

    /**
     * Email + password sign-in.
     *
     * @property email    User's email address.
     * @property password User's password (plaintext — transmitted over TLS, never stored).
     */
    data class EmailPassword(
        val email: String,
        val password: String,
    ) : AuthCredentials() {
        override fun toString(): String =
            "EmailPassword(email=$email, password=*****)"
    }

    /**
     * OAuth 2.0 + PKCE sign-in (Apple, Google, etc.) (#71).
     *
     * The client completes the OAuth redirect flow and supplies the
     * authorization code plus the PKCE code verifier so the backend
     * can exchange them for tokens.
     *
     * @property provider     OAuth provider identifier (e.g. "apple", "google").
     * @property authCode     Authorization code returned by the provider.
     * @property codeVerifier PKCE code_verifier used when starting the flow.
     */
    data class OAuth(
        val provider: String,
        val authCode: String,
        val codeVerifier: String,
    ) : AuthCredentials() {
        override fun toString(): String =
            "OAuth(provider=$provider, authCode=*****, codeVerifier=*****)"
    }

    /**
     * Passkey / WebAuthn sign-in (#69).
     *
     * The client runs the WebAuthn authentication ceremony locally
     * and supplies the credential ID and signed assertion for the
     * server to verify.
     *
     * @property credentialId  The credential identifier from the authenticator.
     * @property assertion     The signed assertion response (JSON-serialized).
     */
    data class Passkey(
        val credentialId: String,
        val assertion: String,
    ) : AuthCredentials() {
        override fun toString(): String =
            "Passkey(credentialId=$credentialId, assertion=*****)"
    }
}
