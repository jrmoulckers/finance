// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

import android.util.Log

/**
 * Android [PlatformLogger] implementation backed by [android.util.Log].
 *
 * Maps log levels to Android's Logcat:
 * - debug → Log.d
 * - info  → Log.i
 * - warn  → Log.w
 * - error → Log.e
 */
actual object PlatformLogger {
    actual fun debug(tag: String, message: String) {
        Log.d(tag, message)
    }

    actual fun info(tag: String, message: String) {
        Log.i(tag, message)
    }

    actual fun warn(tag: String, message: String) {
        Log.w(tag, message)
    }

    actual fun error(tag: String, message: String, throwable: Throwable?) {
        if (throwable != null) {
            Log.e(tag, message, throwable)
        } else {
            Log.e(tag, message)
        }
    }
}
