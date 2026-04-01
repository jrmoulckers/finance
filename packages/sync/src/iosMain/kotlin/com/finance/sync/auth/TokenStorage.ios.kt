// SPDX-License-Identifier: BUSL-1.1

@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class, kotlinx.cinterop.BetaInteropApi::class)

package com.finance.sync.auth

import kotlinx.cinterop.alloc
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.ptr
import kotlinx.cinterop.value
import platform.CoreFoundation.CFDictionaryRef
import platform.CoreFoundation.CFTypeRefVar
import platform.CoreFoundation.kCFBooleanTrue
import platform.Foundation.CFBridgingRelease
import platform.Foundation.NSData
import platform.Foundation.NSLock
import platform.Foundation.NSString
import platform.Foundation.NSUTF8StringEncoding
import platform.Foundation.create
import platform.Foundation.dataUsingEncoding
import platform.Security.SecItemAdd
import platform.Security.SecItemCopyMatching
import platform.Security.SecItemDelete
import platform.Security.SecItemUpdate
import platform.Security.errSecDuplicateItem
import platform.Security.errSecItemNotFound
import platform.Security.errSecSuccess
import platform.Security.kSecAttrAccessible
import platform.Security.kSecAttrAccessibleWhenUnlockedThisDeviceOnly
import platform.Security.kSecAttrAccount
import platform.Security.kSecAttrService
import platform.Security.kSecClass
import platform.Security.kSecClassGenericPassword
import platform.Security.kSecMatchLimit
import platform.Security.kSecMatchLimitOne
import platform.Security.kSecReturnData
import platform.Security.kSecValueData
import platform.darwin.OSStatus

actual open class TokenStorage actual constructor() {

    companion object {
        internal const val SERVICE_NAME = "com.finance.app.sync"
        internal const val KEY_ACCESS_TOKEN = "access_token"
        internal const val KEY_REFRESH_TOKEN = "refresh_token"
        internal const val KEY_EXPIRES_AT = "expires_at"
        internal const val KEY_USER_ID = "user_id"

        private val ALL_KEYS = listOf(KEY_ACCESS_TOKEN, KEY_REFRESH_TOKEN, KEY_EXPIRES_AT, KEY_USER_ID)

        private fun logKeychainError(operation: String, key: String, status: OSStatus) {
            println("KeychainTokenStorage: $operation failed for key=$key, OSStatus=$status")
        }
    }

    private val lock = NSLock()

    private inline fun <T> withLock(block: () -> T): T {
        lock.lock()
        try {
            return block()
        } finally {
            lock.unlock()
        }
    }

    actual open fun save(
        accessToken: String,
        refreshToken: String,
        expiresAt: Long,
        userId: String,
    ): Unit = withLock {
        upsertKeychainItem(KEY_ACCESS_TOKEN, accessToken)
        upsertKeychainItem(KEY_REFRESH_TOKEN, refreshToken)
        upsertKeychainItem(KEY_EXPIRES_AT, expiresAt.toString())
        upsertKeychainItem(KEY_USER_ID, userId)
    }

    actual open fun load(): StoredTokenData? = withLock {
        val accessToken = readFromKeychain(KEY_ACCESS_TOKEN) ?: return@withLock null
        val refreshToken = readFromKeychain(KEY_REFRESH_TOKEN) ?: return@withLock null
        val expiresAtStr = readFromKeychain(KEY_EXPIRES_AT) ?: return@withLock null
        val userId = readFromKeychain(KEY_USER_ID) ?: return@withLock null
        val expiresAtMillis = expiresAtStr.toLongOrNull() ?: return@withLock null
        StoredTokenData(accessToken, refreshToken, expiresAtMillis, userId)
    }

    actual open fun clear(): Unit = withLock {
        ALL_KEYS.forEach { key -> deleteFromKeychain(key) }
    }

    private fun baseQuery(key: String): Map<Any?, Any?> = mapOf(
        kSecClass to kSecClassGenericPassword,
        kSecAttrService to SERVICE_NAME,
        kSecAttrAccount to key,
    )

    private fun upsertKeychainItem(key: String, value: String) {
        val valueData = (value as NSString).dataUsingEncoding(NSUTF8StringEncoding) ?: return
        val addQuery = baseQuery(key) + mapOf<Any?, Any?>(
            kSecValueData to valueData,
            kSecAttrAccessible to kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        )
        @Suppress("UNCHECKED_CAST")
        val addStatus = SecItemAdd(addQuery as CFDictionaryRef?, null)
        when (addStatus) {
            errSecSuccess -> return
            errSecDuplicateItem -> {
                val updateAttributes = mapOf<Any?, Any?>(
                    kSecValueData to valueData,
                    kSecAttrAccessible to kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                )
                @Suppress("UNCHECKED_CAST")
                val updateStatus = SecItemUpdate(baseQuery(key) as CFDictionaryRef?, updateAttributes as CFDictionaryRef?)
                if (updateStatus != errSecSuccess) logKeychainError("update", key, updateStatus)
            }
            else -> logKeychainError("add", key, addStatus)
        }
    }

    private fun readFromKeychain(key: String): String? = memScoped {
        val query = baseQuery(key) + mapOf<Any?, Any?>(kSecReturnData to kCFBooleanTrue, kSecMatchLimit to kSecMatchLimitOne)
        val result = alloc<CFTypeRefVar>()
        @Suppress("UNCHECKED_CAST")
        val status = SecItemCopyMatching(query as CFDictionaryRef?, result.ptr)
        when (status) {
            errSecSuccess -> {
                val data = CFBridgingRelease(result.value) as? NSData ?: return@memScoped null
                NSString.create(data = data, encoding = NSUTF8StringEncoding) as? String
            }
            errSecItemNotFound -> null
            else -> { logKeychainError("read", key, status); null }
        }
    }

    private fun deleteFromKeychain(key: String) {
        @Suppress("UNCHECKED_CAST")
        val status = SecItemDelete(baseQuery(key) as CFDictionaryRef?)
        when (status) {
            errSecSuccess, errSecItemNotFound -> { /* Expected */ }
            else -> logKeychainError("delete", key, status)
        }
    }
}