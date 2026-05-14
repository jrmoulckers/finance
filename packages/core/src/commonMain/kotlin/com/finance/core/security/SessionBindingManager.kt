// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.security

/**
 * Manages device fingerprint generation and session binding headers.
 *
 * On each API request, the device fingerprint hash is included in the
 * `X-Device-Fingerprint` header. The server compares this with the
 * fingerprint stored in the session to detect token theft.
 *
 * PRIVACY: Only the hash is transmitted. The server never receives
 * the raw fingerprint attributes.
 */
class SessionBindingManager(
    private val fingerprintProvider: () -> DeviceFingerprint,
) {

    private var cachedHash: String? = null

    /**
     * Get the device fingerprint hash for inclusion in API request headers.
     *
     * The hash is cached after first computation since fingerprint
     * attributes do not change during a single app session.
     *
     * @return SHA-256 hex hash of the device fingerprint.
     */
    fun getDeviceFingerprintHash(): String {
        return cachedHash ?: fingerprintProvider().toHash().also { cachedHash = it }
    }

    /**
     * Get the HTTP headers to include with every API request.
     *
     * @return Map of header name to value.
     */
    fun getBindingHeaders(): Map<String, String> {
        return mapOf(HEADER_NAME to getDeviceFingerprintHash())
    }

    /** Clear the cached fingerprint (call on config changes). */
    fun clearCache() {
        cachedHash = null
    }

    companion object {
        /** HTTP header name for the device fingerprint. */
        const val HEADER_NAME: String = "X-Device-Fingerprint"
    }
}
