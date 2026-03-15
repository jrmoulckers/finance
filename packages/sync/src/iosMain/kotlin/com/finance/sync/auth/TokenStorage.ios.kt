// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.alloc
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.ptr
import kotlinx.cinterop.value
import platform.CoreFoundation.CFTypeRefVar
import platform.Foundation.CFBridgingRelease
import platform.Foundation.NSData
import platform.Foundation.NSString
import platform.Foundation.NSUTF8StringEncoding
import platform.Foundation.create
import platform.Foundation.dataUsingEncoding
import platform.Security.SecItemAdd
import platform.Security.SecItemCopyMatching
import platform.Security.SecItemDelete
import platform.Security.errSecSuccess
import platform.Security.kSecAttrAccessible
import platform.Security.kSecAttrAccessibleAfterFirstUnlock
import platform.Security.kSecAttrAccount
import platform.Security.kSecAttrService
import platform.Security.kSecClass
import platform.Security.kSecClassGenericPassword
import platform.Security.kSecMatchLimit
import platform.Security.kSecMatchLimitOne
import platform.Security.kSecReturnData
import platform.Security.kSecValueData
import platform.darwin.kCFBooleanTrue

/**
 * iOS actual for [TokenStorage] using Apple Keychain Services.
 *
 * Stores authentication tokens securely in the iOS Keychain with
 * [kSecAttrAccessibleAfterFirstUnlock] protection class. This allows
 * background sync operations to access tokens after the device has
 * been unlocked at least once since boot.
 *
 * Each token field (access_token, refresh_token, expires_at, user_id)
 * is stored as a separate Keychain item under the service name
 * [SERVICE_NAME], keyed by a unique account identifier.
 *
 * **Error handling:** Keychain failures are handled gracefully —
 * [save] silently fails (tokens become ephemeral), [load] returns `null`,
 * and [clear] is best-effort. This prevents crashes when Keychain is
 * unavailable (e.g., device in certain MDM configurations).
 */
actual open class TokenStorage actual constructor() {

    companion object {
        /** Keychain service identifier for grouping all sync-related items. */
        private const val SERVICE_NAME = "com.finance.sync.tokens"

        /** Keychain account keys for each stored field. */
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_EXPIRES_AT = "expires_at"
        private const val KEY_USER_ID = "user_id"
    }

    /**
     * Persist token data to the iOS Keychain.
     *
     * Saves each field as a separate Keychain item. If items already
     * exist they are deleted first, then re-added to ensure atomicity.
     */
    actual open fun save(
        accessToken: String,
        refreshToken: String,
        expiresAt: Long,
        userId: String,
    ) {
        saveToKeychain(KEY_ACCESS_TOKEN, accessToken)
        saveToKeychain(KEY_REFRESH_TOKEN, refreshToken)
        saveToKeychain(KEY_EXPIRES_AT, expiresAt.toString())
        saveToKeychain(KEY_USER_ID, userId)
    }

    /**
     * Load token data from the iOS Keychain.
     *
     * @return The stored [StoredTokenData], or `null` if any required
     *         field is missing or cannot be read.
     */
    actual open fun load(): StoredTokenData? {
        val accessToken = readFromKeychain(KEY_ACCESS_TOKEN) ?: return null
        val refreshToken = readFromKeychain(KEY_REFRESH_TOKEN) ?: return null
        val expiresAtStr = readFromKeychain(KEY_EXPIRES_AT) ?: return null
        val userId = readFromKeychain(KEY_USER_ID) ?: return null

        val expiresAtMillis = expiresAtStr.toLongOrNull() ?: return null

        return StoredTokenData(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAtMillis = expiresAtMillis,
            userId = userId,
        )
    }

    /**
     * Remove all token data from the iOS Keychain.
     *
     * Best-effort: individual deletions that fail (e.g., item not found)
     * are silently ignored.
     */
    actual open fun clear() {
        deleteFromKeychain(KEY_ACCESS_TOKEN)
        deleteFromKeychain(KEY_REFRESH_TOKEN)
        deleteFromKeychain(KEY_EXPIRES_AT)
        deleteFromKeychain(KEY_USER_ID)
    }

    /**
     * Save a single key-value pair to the Keychain.
     *
     * Deletes any existing item with the same service+account first,
     * then adds the new item with [kSecAttrAccessibleAfterFirstUnlock].
     */
    @OptIn(BetaInteropApi::class)
    private fun saveToKeychain(key: String, value: String) {
        // Delete existing entry first (ignore errors — may not exist)
        deleteFromKeychain(key)

        val valueData = (value as NSString).dataUsingEncoding(NSUTF8StringEncoding) ?: return

        val query = mapOf<Any?, Any?>(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to SERVICE_NAME,
            kSecAttrAccount to key,
            kSecValueData to valueData,
            kSecAttrAccessible to kSecAttrAccessibleAfterFirstUnlock,
        )

        @Suppress("UNCHECKED_CAST")
        SecItemAdd(query as kotlinx.cinterop.CFDictionaryRef?, null)
    }

    /**
     * Read a single value from the Keychain by key.
     *
     * @return The stored string value, or `null` if not found or on error.
     */
    @OptIn(BetaInteropApi::class, ExperimentalForeignApi::class)
    private fun readFromKeychain(key: String): String? = memScoped {
        val query = mapOf<Any?, Any?>(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to SERVICE_NAME,
            kSecAttrAccount to key,
            kSecReturnData to kCFBooleanTrue,
            kSecMatchLimit to kSecMatchLimitOne,
        )

        val result = alloc<CFTypeRefVar>()

        @Suppress("UNCHECKED_CAST")
        val status = SecItemCopyMatching(query as kotlinx.cinterop.CFDictionaryRef?, result.ptr)

        if (status != errSecSuccess) return@memScoped null

        val data = CFBridgingRelease(result.value) as? NSData ?: return@memScoped null
        NSString.create(data = data, encoding = NSUTF8StringEncoding) as? String
    }

    /**
     * Delete a single Keychain item by key.
     *
     * Silently ignores [errSecItemNotFound] — item may have already
     * been deleted or never existed.
     */
    @OptIn(BetaInteropApi::class)
    private fun deleteFromKeychain(key: String) {
        val query = mapOf<Any?, Any?>(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to SERVICE_NAME,
            kSecAttrAccount to key,
        )

        @Suppress("UNCHECKED_CAST")
        SecItemDelete(query as kotlinx.cinterop.CFDictionaryRef?)
    }
}
