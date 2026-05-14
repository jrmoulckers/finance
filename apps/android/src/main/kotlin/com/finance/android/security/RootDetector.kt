// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.security

import android.content.Context
import java.io.File

/**
 * Multi-vector root detection for Android.
 *
 * Uses filesystem, property, and native checks. No single check is
 * authoritative — confidence is derived from the number of positive signals.
 *
 * PRIVACY: Signal names are generic (e.g., `su_binary`). No device
 * identifiers, file paths, or process names are included in results.
 */
object RootDetector {

    data class RootCheckResult(
        val isRooted: Boolean,
        val signals: List<String>,
        val confidence: Float,
    )

    fun check(context: Context): RootCheckResult {
        val signals = mutableListOf<String>()

        if (checkSuBinary()) signals.add("su_binary")
        if (checkRootManagementApps(context)) signals.add("root_app")
        if (checkDangerousProps()) signals.add("dangerous_props")
        if (checkRWSystem()) signals.add("rw_system")
        if (checkTestKeys()) signals.add("test_keys")
        if (checkMagiskArtifacts()) signals.add("magisk")

        val confidence = if (signals.isEmpty()) 0f else signals.size.toFloat() / 6f
        return RootCheckResult(
            isRooted = signals.isNotEmpty(),
            signals = signals,
            confidence = confidence,
        )
    }

    private fun checkSuBinary(): Boolean {
        val paths = listOf(
            "/system/bin/su", "/system/xbin/su", "/sbin/su",
            "/system/su", "/system/bin/.ext/.su",
        )
        return paths.any { File(it).exists() }
    }

    private fun checkRootManagementApps(context: Context): Boolean {
        val packages = listOf(
            "com.topjohnwu.magisk",
            "eu.chainfire.supersu",
            "com.koushikdutta.superuser",
        )
        val pm = context.packageManager
        return packages.any { pkg ->
            @Suppress("SwallowedException")
            try {
                pm.getPackageInfo(pkg, 0)
                true
            } catch (_: Exception) {
                false
            }
        }
    }

    @Suppress("SwallowedException")
    private fun checkDangerousProps(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("getprop", "ro.debuggable"))
            val value = process.inputStream.bufferedReader().readLine()?.trim()
            value == "1"
        } catch (_: Exception) {
            false
        }
    }

    private fun checkRWSystem(): Boolean {
        return try {
            val mountOutput = Runtime.getRuntime().exec("mount")
                .inputStream.bufferedReader().readText()
            mountOutput.contains("/system") && mountOutput.contains("rw,")
        } catch (_: Exception) {
            false
        }
    }

    private fun checkTestKeys(): Boolean {
        val buildTags = android.os.Build.TAGS ?: return false
        return buildTags.contains("test-keys")
    }

    private fun checkMagiskArtifacts(): Boolean {
        val paths = listOf("/sbin/.magisk", "/data/adb/magisk")
        return paths.any { File(it).exists() }
    }
}
