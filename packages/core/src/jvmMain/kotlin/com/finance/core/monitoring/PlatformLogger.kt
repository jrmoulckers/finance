// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

import java.util.logging.Level
import java.util.logging.Logger

/**
 * JVM [PlatformLogger] implementation backed by [java.util.logging.Logger].
 *
 * Used on Android (via JVM target) and Windows (JVM desktop).
 * Android apps may redirect JUL to Logcat via a logging bridge.
 */
actual object PlatformLogger {
    private fun logger(tag: String): Logger = Logger.getLogger(tag)

    actual fun debug(tag: String, message: String) {
        logger(tag).log(Level.FINE, message)
    }

    actual fun info(tag: String, message: String) {
        logger(tag).log(Level.INFO, message)
    }

    actual fun warn(tag: String, message: String) {
        logger(tag).log(Level.WARNING, message)
    }

    actual fun error(tag: String, message: String, throwable: Throwable?) {
        if (throwable != null) {
            logger(tag).log(Level.SEVERE, message, throwable)
        } else {
            logger(tag).log(Level.SEVERE, message)
        }
    }
}
