// SPDX-License-Identifier: BUSL-1.1
// SQLCipherConfiguration.swift — SQLCipher driver configuration for iOS.
//
// Configures SQLite with SQLCipher encryption using a Keychain-managed
// encryption key. The database file is stored in the app's Application
// Support directory (backed up, excluded from Files app browsing).
//
// When the KMP SQLDelight driver is fully integrated, this configuration
// will be passed to the KMP iOS driver factory. Until then, it is used
// by ``PersistentDataStore`` for native Swift SQLite operations.
//
// References: #20, #414

import Foundation
import os

// MARK: - SQLCipherConfiguration

/// Configuration for the SQLCipher-encrypted database.
///
/// Manages the database file location, encryption settings, and
/// migration versioning. The encryption key is sourced from
/// ``DatabaseKeyManager`` which stores it in the Apple Keychain.
struct SQLCipherConfiguration: Sendable {

    // MARK: - Constants

    /// The database filename.
    static let databaseName = "finance.db"

    /// Current schema version for migration tracking.
    static let schemaVersion: Int32 = 1

    /// SQLCipher page size (must match between creation and opening).
    static let pageSize: Int32 = 4096

    /// SQLCipher KDF iterations (PBKDF2). Higher = more secure, slower.
    /// 256000 is the SQLCipher 4 default.
    static let kdfIterations: Int32 = 256_000

    // MARK: - Logging

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "SQLCipherConfiguration"
    )

    // MARK: - Database URL

    /// Returns the URL for the database file in the Application Support directory.
    ///
    /// Creates the directory if it doesn't exist.
    static func databaseURL() throws -> URL {
        let fileManager = FileManager.default

        let appSupportURL = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )

        let databaseDirectory = appSupportURL.appendingPathComponent(
            "com.finance.database",
            isDirectory: true
        )

        if !fileManager.fileExists(atPath: databaseDirectory.path) {
            try fileManager.createDirectory(
                at: databaseDirectory,
                withIntermediateDirectories: true
            )
            logger.info("Created database directory")
        }

        return databaseDirectory.appendingPathComponent(databaseName)
    }

    /// Returns the database file path as a String.
    static func databasePath() throws -> String {
        try databaseURL().path
    }

    /// Whether the database file already exists on disk.
    static var databaseExists: Bool {
        guard let url = try? databaseURL() else { return false }
        return FileManager.default.fileExists(atPath: url.path)
    }

    /// Deletes the database file and its WAL/SHM companions.
    ///
    /// Used during GDPR "Delete Everything" flows.
    static func deleteDatabase() throws {
        let url = try databaseURL()
        let fileManager = FileManager.default

        for suffix in ["", "-wal", "-shm", "-journal"] {
            let fileURL = URL(fileURLWithPath: url.path + suffix)
            if fileManager.fileExists(atPath: fileURL.path) {
                try fileManager.removeItem(at: fileURL)
            }
        }

        logger.info("Database files deleted")
    }

    // MARK: - WAL Mode

    /// SQLCipher PRAGMA statements to apply after opening the database.
    ///
    /// - `key`: The encryption key (set by caller from DatabaseKeyManager).
    /// - `cipher_page_size`: Must match across all connections.
    /// - `kdf_iter`: PBKDF2 iterations for key derivation.
    /// - `journal_mode = WAL`: Write-Ahead Logging for concurrent reads.
    /// - `foreign_keys = ON`: Enforce referential integrity.
    /// - `auto_vacuum = INCREMENTAL`: Reclaim space periodically.
    static func pragmaStatements(encryptionKeyHex: String) -> [String] {
        [
            "PRAGMA key = \(encryptionKeyHex);",
            "PRAGMA cipher_page_size = \(pageSize);",
            "PRAGMA kdf_iter = \(kdfIterations);",
            "PRAGMA journal_mode = WAL;",
            "PRAGMA foreign_keys = ON;",
            "PRAGMA auto_vacuum = INCREMENTAL;",
            "PRAGMA busy_timeout = 5000;",
        ]
    }
}
