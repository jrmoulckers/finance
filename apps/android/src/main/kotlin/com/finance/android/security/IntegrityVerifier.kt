// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.security

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import java.security.MessageDigest

/**
 * Verifies APK signing certificate integrity.
 *
 * Compares the runtime signing certificate fingerprint against the
 * expected release certificate hash. Detects repackaged or tampered APKs.
 *
 * The expected hash MUST be replaced with the real release signing
 * certificate SHA-256 fingerprint before production use.
 */
object IntegrityVerifier {

    /** SHA-256 fingerprint of the expected release signing certificate. */
    private const val EXPECTED_SIGNING_CERT_HASH = "PLACEHOLDER_RELEASE_CERT_HASH"

    @Suppress("DEPRECATION")
    fun verifyApkSignature(context: Context): Boolean {
        val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            context.packageManager.getPackageInfo(
                context.packageName,
                PackageManager.GET_SIGNING_CERTIFICATES,
            )
        } else {
            context.packageManager.getPackageInfo(
                context.packageName,
                PackageManager.GET_SIGNATURES,
            )
        }

        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.signingInfo?.apkContentsSigners
        } else {
            packageInfo.signatures
        }

        return signatures?.any { sig ->
            val hash = MessageDigest.getInstance("SHA-256")
                .digest(sig.toByteArray())
            Base64.encodeToString(hash, Base64.NO_WRAP) == EXPECTED_SIGNING_CERT_HASH
        } ?: false
    }
}
