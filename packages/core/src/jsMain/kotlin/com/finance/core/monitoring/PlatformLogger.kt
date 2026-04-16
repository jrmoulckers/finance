// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

/**
 * JS [PlatformLogger] implementation backed by `console.*`.
 *
 * Used in the Web app (TypeScript + React). Browser dev-tools
 * display these at the appropriate log level.
 */
actual object PlatformLogger {
    actual fun debug(tag: String, message: String) {
        console.log("[$tag] $message")
    }

    actual fun info(tag: String, message: String) {
        console.info("[$tag] $message")
    }

    actual fun warn(tag: String, message: String) {
        console.warn("[$tag] $message")
    }

    actual fun error(tag: String, message: String, throwable: Throwable?) {
        if (throwable != null) {
            console.error("[$tag] $message", throwable)
        } else {
            console.error("[$tag] $message")
        }
    }
}
