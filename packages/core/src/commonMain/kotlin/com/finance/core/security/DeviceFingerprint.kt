// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.security

/**
 * Privacy-preserving device fingerprint for session binding.
 *
 * PRIVACY: This fingerprint deliberately avoids unique identifiers
 * (IMEI, serial number, MAC address, advertising ID). It uses only
 * categorical attributes that describe the device class, not the
 * specific device instance. Many devices share the same fingerprint.
 *
 * This is NOT a tracking mechanism — it is a session anomaly detector.
 * The fingerprint is hashed before transmission so the server never
 * sees the raw attributes.
 */
data class DeviceFingerprint(
    /** Platform identifier: android, ios, web, windows. */
    val platform: String,
    /** Major platform version: 14, 17, chromium-126, 11. */
    val platformVersion: String,
    /** App semantic version: 1.0.0. */
    val appVersion: String,
    /** BCP-47 locale: en-US. */
    val locale: String,
    /** UTC offset in minutes: -480 for PST. */
    val timezoneOffset: Int,
    /** Screen category: phone, tablet, desktop. */
    val screenCategory: String,
    /** Biometric capability: face, fingerprint, none. */
    val biometricCapability: String,
) {
    /**
     * Compute a deterministic hash of the fingerprint attributes.
     *
     * Uses Kotlin's hashCode() for a lightweight, consistent hash.
     * The server stores and compares this hash, never the raw attributes.
     *
     * For production use, replace with a proper SHA-256 implementation
     * via platform-specific injection.
     */
    fun toHash(): String {
        val raw = buildString {
            append(platform).append('|')
            append(platformVersion).append('|')
            append(appVersion).append('|')
            append(locale).append('|')
            append(timezoneOffset).append('|')
            append(screenCategory).append('|')
            append(biometricCapability)
        }
        // Use Kotlin hashCode for cross-platform consistency.
        // Production: inject a SHA-256 hasher via constructor.
        return raw.hashCode().toUInt().toString(16).padStart(8, '0')
    }

    /** Safe toString that only shows the hash prefix. */
    override fun toString(): String = "DeviceFingerprint(hash={toHash()})"
}