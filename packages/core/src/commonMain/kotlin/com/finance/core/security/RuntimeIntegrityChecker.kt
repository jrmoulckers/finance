// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.security

/**
 * Cross-platform runtime integrity checking interface.
 *
 * Each platform implements detection appropriate to its capabilities.
 * Results are reported to the server via [SyncHealthMonitor] for
 * security posture tracking.
 *
 * PRIVACY: Detection results MUST only contain generic signal names
 * (e.g., `root_detected`), never device identifiers, user PII, or
 * financial data.
 */
interface RuntimeIntegrityChecker {

    /** Check device integrity and return the result. */
    suspend fun checkIntegrity(): IntegrityResult

    /** The current integrity level based on the last check. */
    val currentLevel: IntegrityLevel
}

/** Severity levels for runtime integrity. */
enum class IntegrityLevel {
    /** No threats detected. */
    CLEAN,
    /** Minor signals (emulator, debug build). */
    SUSPICIOUS,
    /** Root/jailbreak or debugger detected. */
    COMPROMISED,
    /** Frida/instrumentation detected. */
    ACTIVE_ATTACK,
    /** Binary integrity violated. */
    TAMPERED,
}

/** Result of an integrity check. */
data class IntegrityResult(
    val level: IntegrityLevel,
    /** Generic signal names only — no device identifiers or PII. */
    val signals: List<String>,
    val timestamp: Long,
)

/** No-op implementation for platforms without RASP capability (Web). */
object NoOpIntegrityChecker : RuntimeIntegrityChecker {
    override suspend fun checkIntegrity(): IntegrityResult =
        IntegrityResult(IntegrityLevel.CLEAN, emptyList(), 0L)

    override val currentLevel: IntegrityLevel = IntegrityLevel.CLEAN
}
