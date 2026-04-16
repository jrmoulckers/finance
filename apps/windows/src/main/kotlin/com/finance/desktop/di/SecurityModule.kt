// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.desktop.security.DpapiManager
import com.finance.desktop.security.SecureTokenStorage
import com.finance.desktop.security.WindowsHelloManager
import org.koin.dsl.module

/**
 * Koin module for Windows security services.
 *
 * Provides DI-managed instances of:
 * - [WindowsHelloManager] — biometric/PIN authentication via Windows Hello
 * - [DpapiManager] — DPAPI encryption for credential storage
 * - [SecureTokenStorage] — encrypted token persistence using DPAPI
 *
 * All security services are singletons to ensure consistent state across
 * the application lifecycle. The [SecureTokenStorage] depends on
 * [DpapiManager], which Koin resolves automatically.
 *
 * ## Testing
 *
 * For unit tests, provide alternative implementations via
 * `WindowsHelloManager.create(testProvider)` and
 * `DpapiManager.create(testProvider)` — then override this module
 * in the test Koin configuration.
 */
val securityModule = module {
    single { WindowsHelloManager.create() }
    single { DpapiManager.create() }
    single { SecureTokenStorage.create(get(), SecureTokenStorage.defaultStorageDir()) }
}
