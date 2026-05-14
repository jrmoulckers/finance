// SPDX-License-Identifier: BUSL-1.1

@file:Suppress("MatchingDeclarationName")

package com.finance.core.security

/**
 * JVM/Windows actual — pinning via OkHttp CertificatePinner.
 */
actual object CertificatePinningConfig {
    actual val isEnabled: Boolean = true
    actual fun validateConfiguration(): Result<Unit> {
        val pins = listOf(
            "SUPABASE_PRIMARY" to CertificatePins.SUPABASE_PRIMARY_PIN,
            "SUPABASE_BACKUP_1" to CertificatePins.SUPABASE_BACKUP_PIN_1,
            "POWERSYNC_PRIMARY" to CertificatePins.POWERSYNC_PRIMARY_PIN,
            "POWERSYNC_BACKUP_2" to CertificatePins.POWERSYNC_BACKUP_PIN_2,
        )
        val invalid = pins.filter { (_, pin) -> !CertificatePins.isPinValid(pin) }
        return if (invalid.isEmpty()) {
            Result.success(Unit)
        } else {
            val invalidNames = invalid.joinToString { it.first }
            Result.failure(
                IllegalStateException(
                    "Certificate pins not configured: $invalidNames. " +
                        "Replace PLACEHOLDER values before release.",
                ),
            )
        }
    }

    /** Domain-to-pin-list pairs for OkHttp CertificatePinner.Builder. */
    fun buildOkHttpPinnerConfig(): List<Pair<String, List<String>>> {
        return listOf(
            CertificatePins.SUPABASE_DOMAIN to listOf(
                "sha256/{CertificatePins.SUPABASE_PRIMARY_PIN}",
                "sha256/{CertificatePins.SUPABASE_BACKUP_PIN_1}",
            ),
            CertificatePins.POWERSYNC_DOMAIN to listOf(
                "sha256/{CertificatePins.POWERSYNC_PRIMARY_PIN}",
                "sha256/{CertificatePins.POWERSYNC_BACKUP_PIN_2}",
            ),
        )
    }
}
