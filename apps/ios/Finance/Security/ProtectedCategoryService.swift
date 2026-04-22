// SPDX-License-Identifier: BUSL-1.1

// ProtectedCategoryService.swift
// Finance
//
// Manages biometric protection for sensitive transaction categories.
// Protected category IDs are stored in Apple Keychain (not UserDefaults)
// since the association of which categories are "sensitive" is itself
// privacy-relevant metadata.
//
// When a category is protected, its transactions are hidden behind
// Face ID / Touch ID until the user authenticates.
//
// References: #295

import Foundation
import os

// MARK: - ProtectedCategoryProviding Protocol

/// Abstraction for biometric category protection.
protocol ProtectedCategoryProviding: Sendable {
    func isProtected(categoryId: String) -> Bool
    func protectedCategoryIds() -> Set<String>
    func protectCategory(id: String) throws
    func unprotectCategory(id: String) throws
    func clearAll() throws
}

// MARK: - ProtectedCategoryService

/// Manages the set of categories gated behind biometric authentication.
///
/// Protected category IDs are persisted in Apple Keychain using
/// `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` — they cannot be
/// read when the device is locked and are not synced to iCloud.
///
/// > Important: This service stores which categories are protected,
/// > **not** the transactions themselves. Transaction data flows through
/// > the normal KMP repository path.
actor ProtectedCategoryService: ProtectedCategoryProviding {

    // MARK: - Singleton

    static let shared = ProtectedCategoryService()

    // MARK: - Constants

    /// Keychain key for the set of protected category IDs.
    private static let keychainKey = "com.finance.protectedCategories"

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "ProtectedCategoryService"
    )

    private let keychain: KeychainManaging

    // MARK: - Init

    init(keychain: KeychainManaging = KeychainManager.shared) {
        self.keychain = keychain
    }

    // MARK: - Public API

    /// Returns whether the given category is biometric-protected.
    nonisolated func isProtected(categoryId: String) -> Bool {
        protectedCategoryIds().contains(categoryId)
    }

    /// Returns the set of all protected category IDs.
    nonisolated func protectedCategoryIds() -> Set<String> {
        guard let data = keychain.load(key: Self.keychainKey),
              let ids = try? JSONDecoder().decode(Set<String>.self, from: data)
        else {
            return []
        }
        return ids
    }

    /// Adds a category to the protected set.
    nonisolated func protectCategory(id: String) throws {
        var ids = protectedCategoryIds()
        ids.insert(id)
        try persist(ids)
        Self.logger.info("Protected category: \(id, privacy: .private(mask: .hash))")
    }

    /// Removes a category from the protected set.
    nonisolated func unprotectCategory(id: String) throws {
        var ids = protectedCategoryIds()
        ids.remove(id)
        try persist(ids)
        Self.logger.info("Unprotected category: \(id, privacy: .private(mask: .hash))")
    }

    /// Clears all category protections.
    nonisolated func clearAll() throws {
        try keychain.delete(key: Self.keychainKey)
        Self.logger.info("Cleared all category protections")
    }

    // MARK: - Persistence

    private nonisolated func persist(_ ids: Set<String>) throws {
        let data = try JSONEncoder().encode(ids)
        try keychain.save(key: Self.keychainKey, data: data)
    }
}
