// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.desktop.security.AutoLockManager
import com.finance.desktop.security.CertificatePinningManager
import com.finance.desktop.security.CredentialManager
import com.finance.desktop.security.DpapiManager
import com.finance.desktop.security.SecureTokenStorage
import com.finance.desktop.security.SessionManager
import com.finance.desktop.security.WindowsHelloManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.koin.dsl.module

/**
 * Koin module for Windows security services.
 *
 * Provides DI-managed instances of:
 * - [WindowsHelloManager] — biometric/PIN authentication via Windows Hello
 * - [DpapiManager] — DPAPI encryption for credential storage
 * - [SecureTokenStorage] — encrypted token persistence using DPAPI
 * - [CredentialManager] — high-level credential management (Hello + DPAPI)
 * - [AutoLockManager] — inactivity-based session locking
 * - [SessionManager] — complete session lifecycle (auth + lock + unlock)
 *
 * All security services are singletons to ensure consistent state across
 * the application lifecycle.
 */
val securityModule = module {
    single { WindowsHelloManager.create() }
    single { DpapiManager.create() }
    single { SecureTokenStorage.create(get(), SecureTokenStorage.defaultStorageDir()) }
    single { CredentialManager(get(), get()) }
    single {
        AutoLockManager(
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
            timeoutMinutes = 5,
            onLockTriggered = { /* Wired at app level via AuthViewModel */ },
        )
    }
    single { SessionManager(get(), get(), get()) }
    single { CertificatePinningManager.createDefault() }
}
