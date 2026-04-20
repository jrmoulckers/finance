// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.security

/**
 * Web/JS actual — no app-level pinning; browsers enforce Certificate Transparency.
 */
actual object CertificatePinningConfig {
    actual val isEnabled: Boolean = false
    actual fun validateConfiguration(): Result<Unit> = Result.success(Unit)
}