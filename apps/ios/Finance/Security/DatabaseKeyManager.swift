// SPDX-License-Identifier: BUSL-1.1
// DatabaseKeyManager.swift — Manages SQLCipher encryption keys in Apple Keychain.
//
// The database encryption key (DEK) is a 256-bit random key stored in
// the Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
// so background sync tasks can decrypt the database.
//
// On first launch the key is generated via `SecRandomCopyBytes` and
// persisted. Subsequent launches load the existing key. The key never
// leaves the Keychain — it is passed directly to SQLCipher's PRAGMA key.
//
// References: #20, #414

import Foundation
import Security
import os

// MARK: - DatabaseKeyManager

/// Manages the SQLCipher database encryption key (DEK) lifecycle.
///
/// The DEK is stored in the Apple Keychain with device-only protection.
/// It is created on first launch and loaded on subsequent launches.
///
/// Thread-safe: all operations are synchronous Keychain calls wrapped
/// in an actor to serialise access.
actor DatabaseKeyManager {

    // MARK: - Singleton

    static let shared = DatabaseKeyManager()

    // MARK: - Constants

    /// Keychain key for the database encryption key.
    private static let keychainKey = "com.finance.db.encryptionKey"

    /// Length of the encryption key in bytes (256-bit).
    private static let keyLength = 32

    // MARK: - Logging

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "DatabaseKeyManager"
    )

    // MARK: - Dependencies

    private let keychain: KeychainManaging

    // MARK: - Cached Key

    /// Cached key to avoid repeated Keychain reads.
    private var cachedKey: Data?

    // MARK: - Initialisation

    init(keychain: KeychainManaging = KeychainManager.shared) {
        self.keychain = keychain
    }

    // MARK: - Public API

    /// Returns the database encryption key, creating one if it doesn't exist.
    ///
    /// The key is cached in memory after first access to avoid repeated
    /// Keychain reads during the app session.
    ///
    /// - Returns: A 256-bit encryption key as `Data`.
    /// - Throws: ``KeychainError`` if Keychain operations fail.
    func getOrCreateKey() throws -> Data {
        // Return cached key if available
        if let cached = cachedKey {
            return cached
        }

        // Try to load existing key from Keychain
        if let existingKey = keychain.load(key: Self.keychainKey) {
            guard existingKey.count == Self.keyLength else {
                Self.logger.error("Database key has unexpected length: \(existingKey.count)")
                throw KeychainError.unexpectedData
            }
            cachedKey = existingKey
            Self.logger.info("Database encryption key loaded from Keychain")
            return existingKey
        }

        // Generate a new key
        let newKey = try generateKey()
        try storeKey(newKey)
        cachedKey = newKey
        Self.logger.info("New database encryption key generated and stored")
        return newKey
    }

    /// Deletes the database encryption key from the Keychain.
    ///
    /// **Warning**: This makes the database permanently unreadable.
    /// Only use for GDPR "Delete Everything" flows.
    func deleteKey() throws {
        try keychain.delete(key: Self.keychainKey)
        cachedKey = nil
        Self.logger.info("Database encryption key deleted from Keychain")
    }

    /// Returns the key as a hex string suitable for SQLCipher's PRAGMA key.
    ///
    /// Format: `x'<hex>'` as required by SQLCipher.
    func getKeyAsHexPragma() throws -> String {
        let key = try getOrCreateKey()
        let hex = key.map { String(format: "%02x", $0) }.joined()
        return "x'\(hex)'"
    }

    // MARK: - Private

    /// Generates a cryptographically secure random key.
    private func generateKey() throws -> Data {
        var bytes = [UInt8](repeating: 0, count: Self.keyLength)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)

        guard status == errSecSuccess else {
            Self.logger.error("SecRandomCopyBytes failed with status: \(status)")
            throw KeychainError.saveFailed(status: status)
        }

        return Data(bytes)
    }

    /// Stores the key in the Keychain with background-accessible protection.
    ///
    /// Uses `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` so background
    /// sync tasks (BGTaskScheduler) can access the database encryption key.
    private func storeKey(_ key: Data) throws {
        // Use the background-accessible save for sync support
        if let keychainManager = keychain as? KeychainManager {
            try keychainManager.saveForBackgroundAccess(
                key: Self.keychainKey,
                data: key
            )
        } else {
            // Fallback for test doubles
            try keychain.save(key: Self.keychainKey, data: key)
        }
    }
}
