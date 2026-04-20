// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.security

import com.finance.core.security.IntegrityLevel
import com.finance.core.security.IntegrityResult
import com.finance.core.security.RuntimeIntegrityChecker

/**
 * Windows runtime integrity checker.
 *
 * On Windows/JVM, checks are limited compared to mobile platforms.
 * Detects debugger attachment and basic environment anomalies.
 *
 * MSIX packaging provides binary integrity via code signing.
 */
class WindowsIntegrityChecker : RuntimeIntegrityChecker {

    private var lastLevel: IntegrityLevel = IntegrityLevel.CLEAN

    override suspend fun checkIntegrity(): IntegrityResult {
        val signals = mutableListOf<String>()

        if (isDebuggerAttached()) signals.add("debugger_attached")
        if (isRunningInVM()) signals.add("virtual_machine")

        val level = when {
            signals.contains("debugger_attached") -> IntegrityLevel.COMPROMISED
            signals.isNotEmpty() -> IntegrityLevel.SUSPICIOUS
            else -> IntegrityLevel.CLEAN
        }
        lastLevel = level

        return IntegrityResult(
            level = level,
            signals = signals,
            timestamp = System.currentTimeMillis(),
        )
    }

    override val currentLevel: IntegrityLevel get() = lastLevel

    private fun isDebuggerAttached(): Boolean {
        // JVM-level check: debug agent presence
        val inputArgs = java.lang.management.ManagementFactory
            .getRuntimeMXBean().inputArguments
        return inputArgs.any { it.contains("-agentlib:jdwp") || it.contains("-Xdebug") }
    }

    private fun isRunningInVM(): Boolean {
        val model = System.getProperty("os.name", "").lowercase()
        val vendor = System.getProperty("java.vm.vendor", "").lowercase()
        // Basic heuristic — not authoritative
        return vendor.contains("virtual") || model.contains("virtual")
    }
}