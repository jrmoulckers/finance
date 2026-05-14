// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.security

/**
 * Cross-platform certificate pinning configuration.
 *
 * Centralises SPKI pin hashes so every platform references the same
 * pin set. Each platform provides an [actual] that validates the
 * native pinning mechanism is active and correctly configured.
 *
 * Pin format: Base64-encoded SHA-256 of the Subject Public Key Info (SPKI).
 *
 * Rotation: Update pin values here and in platform-native configs
 * (network_security_config.xml, Info.plist, OkHttp builder) simultaneously.
 * Always retain at least two backup pins from different CAs.
 */
expect object CertificatePinningConfig {

    /** Whether certificate pinning is active on this platform. */
    val isEnabled: Boolean

    /**
     * Validate that the pin configuration is loaded and syntactically correct.
     *
     * @return [Result.success] if valid, [Result.failure] otherwise.
     */
    fun validateConfiguration(): Result<Unit>
}

/**
 * Pin constants shared across all platforms.
 *
 * Replace PLACEHOLDER values with real SPKI hashes extracted from the live
 * Supabase and PowerSync certificate chains before enabling in production.
 */
object CertificatePins {

    const val SUPABASE_PRIMARY_PIN: String = "PLACEHOLDER_PRIMARY_PIN="
    const val SUPABASE_BACKUP_PIN_1: String = "PLACEHOLDER_BACKUP_PIN_1="
    const val POWERSYNC_PRIMARY_PIN: String = "PLACEHOLDER_PRIMARY_PIN="
    const val POWERSYNC_BACKUP_PIN_2: String = "PLACEHOLDER_BACKUP_PIN_2="

    const val SUPABASE_DOMAIN: String = "*.supabase.co"
    const val POWERSYNC_DOMAIN: String = "*.powersync.journeyapps.com"

    /** Validate a pin looks like a Base64-encoded SHA-256 hash. */
    fun isPinValid(pin: String): Boolean {
        if (pin.isBlank() || pin.contains("PLACEHOLDER")) return false
        val base64Pattern = Regex("^[A-Za-z0-9+/]{43}=$")
        return base64Pattern.matches(pin)
    }
}
