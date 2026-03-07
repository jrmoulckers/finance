// KeychainManager.swift
// Finance
//
// Security wrapper around Apple Keychain Services.
// Refs #20

import Foundation
import Security

// MARK: - KeychainError

/// Errors returned by ``KeychainManager`` operations.
enum KeychainError: LocalizedError, Sendable {
    case saveFailed(status: OSStatus)
    case loadFailed(status: OSStatus)
    case deleteFailed(status: OSStatus)
    case unexpectedData
    case secureEnclaveNotAvailable

    var errorDescription: String? {
        switch self {
        case .saveFailed(let status):
            String(localized: "Keychain save failed (status \(status)).")
        case .loadFailed(let status):
            String(localized: "Keychain load failed (status \(status)).")
        case .deleteFailed(let status):
            String(localized: "Keychain delete failed (status \(status)).")
        case .unexpectedData:
            String(localized: "Keychain returned data in an unexpected format.")
        case .secureEnclaveNotAvailable:
            String(localized: "Secure Enclave is not available on this device.")
        }
    }
}

// MARK: - KeychainManaging Protocol

/// Abstraction over Keychain operations for testability.
protocol KeychainManaging: Sendable {
    func save(key: String, data: Data) throws
    func load(key: String) -> Data?
    func delete(key: String) throws
}

// MARK: - KeychainManager

/// Thread-safe wrapper around Apple Security framework Keychain Services.
///
/// All sensitive data — OAuth tokens, refresh tokens, encryption keys (DEK/KEK),
/// and passkey credentials — **must** be stored via this manager.
///
/// Uses `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` to prevent access when the
/// device is locked and to block iCloud Keychain sync of secrets.
///
/// Leverages the Secure Enclave (`kSecAttrTokenIDSecureEnclave`) for key generation
/// when hardware supports it.
actor KeychainManager: KeychainManaging {

    // MARK: - Constants

    /// The Keychain service identifier for all Finance app items.
    static let serviceName = "com.finance.app"

    /// Shared instance for app-wide use.
    static let shared = KeychainManager()

    /// Keychain access group for sharing credentials between the main app,
    /// watchOS extension, widgets, and App Clips.
    /// Configure the actual group identifier in the entitlements file.
    private let accessGroup: String?

    // MARK: - Initialization

    /// Creates a new ``KeychainManager``.
    /// - Parameter accessGroup: Optional Keychain access group for cross-target sharing.
    init(accessGroup: String? = nil) {
        self.accessGroup = accessGroup
    }

    // MARK: - Public API

    /// Stores data in the Keychain under the given key.
    ///
    /// If an item with the same key already exists it is updated in place.
    /// Items are stored with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
    /// to ensure they cannot be read when the device is locked and are
    /// excluded from iCloud Keychain sync.
    ///
    /// - Parameters:
    ///   - key: A unique identifier for the Keychain item.
    ///   - data: The secret data to store.
    /// - Throws: ``KeychainError/saveFailed(status:)`` on failure.
    nonisolated func save(key: String, data: Data) throws {
        // Attempt to delete any existing item first to avoid errSecDuplicateItem.
        let deleteQuery = baseQuery(for: key)
        SecItemDelete(deleteQuery as CFDictionary)

        var query = baseQuery(for: key)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly

        let status = SecItemAdd(query as CFDictionary, nil)

        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status: status)
        }
    }

    /// Loads data from the Keychain for the given key.
    ///
    /// - Parameter key: The identifier of the Keychain item to retrieve.
    /// - Returns: The stored `Data`, or `nil` if no item exists for the key.
    nonisolated func load(key: String) -> Data? {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = kCFBooleanTrue as Any
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess else {
            return nil
        }

        return result as? Data
    }

    /// Deletes the Keychain item for the given key.
    ///
    /// If no item exists for the key this method succeeds silently
    /// (`errSecItemNotFound` is treated as success).
    ///
    /// - Parameter key: The identifier of the Keychain item to remove.
    /// - Throws: ``KeychainError/deleteFailed(status:)`` on failure.
    nonisolated func delete(key: String) throws {
        let query = baseQuery(for: key)
        let status = SecItemDelete(query as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.deleteFailed(status: status)
        }
    }

    // MARK: - Secure Enclave

    /// Checks whether the current device supports the Secure Enclave.
    ///
    /// - Returns: `true` if Secure Enclave key generation is available.
    nonisolated var isSecureEnclaveAvailable: Bool {
        // Secure Enclave is available on devices with an A7 chip or later
        // and on Apple Silicon Macs.
        var error: Unmanaged<CFError>?
        let accessControl = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            .privateKeyUsage,
            &error
        )
        return accessControl != nil && error == nil
    }

    /// Saves data gated by the Secure Enclave so that retrieval requires
    /// biometric authentication.
    ///
    /// - Parameters:
    ///   - key: A unique identifier for the Keychain item.
    ///   - data: The secret data to store.
    /// - Throws: ``KeychainError/secureEnclaveNotAvailable`` if hardware
    ///   doesn't support it, or ``KeychainError/saveFailed(status:)`` on failure.
    nonisolated func saveWithSecureEnclave(key: String, data: Data) throws {
        guard isSecureEnclaveAvailable else {
            throw KeychainError.secureEnclaveNotAvailable
        }

        var error: Unmanaged<CFError>?
        guard let accessControl = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.privateKeyUsage, .biometryCurrentSet],
            &error
        ) else {
            throw KeychainError.saveFailed(status: errSecParam)
        }

        // Remove any existing item first.
        let deleteQuery = baseQuery(for: key)
        SecItemDelete(deleteQuery as CFDictionary)

        var query = baseQuery(for: key)
        query[kSecValueData as String] = data
        query[kSecAttrAccessControl as String] = accessControl
        query[kSecAttrTokenID as String] = kSecAttrTokenIDSecureEnclave

        let status = SecItemAdd(query as CFDictionary, nil)

        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status: status)
        }
    }

    // MARK: - Background Access

    /// Saves data with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
    /// so that `BGTaskScheduler` background tasks can access it while the
    /// device is locked (after the first unlock since boot).
    ///
    /// Use this for tokens required by background sync operations.
    ///
    /// - Parameters:
    ///   - key: A unique identifier for the Keychain item.
    ///   - data: The secret data to store.
    /// - Throws: ``KeychainError/saveFailed(status:)`` on failure.
    nonisolated func saveForBackgroundAccess(key: String, data: Data) throws {
        let deleteQuery = baseQuery(for: key)
        SecItemDelete(deleteQuery as CFDictionary)

        var query = baseQuery(for: key)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(query as CFDictionary, nil)

        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status: status)
        }
    }

    // MARK: - Helpers

    /// Builds the base Keychain query dictionary shared across operations.
    private nonisolated func baseQuery(for key: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.serviceName,
            kSecAttrAccount as String: key,
        ]

        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }

        return query
    }
}
