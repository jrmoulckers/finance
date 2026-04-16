// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

import platform.Foundation.NSLog

/**
 * iOS [PlatformLogger] implementation backed by [NSLog].
 *
 * NSLog writes to the unified logging system (Console.app / Xcode console).
 * For production apps, consider migrating to os_log for better filtering.
 */
actual object PlatformLogger {
    actual fun debug(tag: String, message: String) {
        NSLog("D/[$tag] %@", message)
    }

    actual fun info(tag: String, message: String) {
        NSLog("I/[$tag] %@", message)
    }

    actual fun warn(tag: String, message: String) {
        NSLog("W/[$tag] %@", message)
    }

    actual fun error(tag: String, message: String, throwable: Throwable?) {
        if (throwable != null) {
            NSLog("E/[$tag] %@ — %@", message, throwable.message ?: "unknown")
        } else {
            NSLog("E/[$tag] %@", message)
        }
    }
}
