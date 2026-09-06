// SPDX-License-Identifier: BUSL-1.1

// BackupManifest.swift
// Finance
//
// Data model for backup metadata and manifest information.
// Tracks backup version, timestamp, and content inventory for
// reliable restore operations.
// Refs #302

import Foundation

#if canImport(UIKit)
import UIKit
#endif

#if canImport(WatchKit)
import WatchKit
#endif

// MARK: - Backup Manifest

/// Metadata describing a local backup snapshot.
///
/// The manifest is stored alongside the backup data and used during
/// restore to verify integrity and compatibility. It is versioned so
/// that future schema changes can be handled gracefully.
struct BackupManifest: Codable, Sendable, Equatable {

    // MARK: - Properties

    /// Unique identifier for this backup.
    let id: String

    /// Backup format version. Increment when the backup structure changes.
    let version: Int

    /// ISO 8601 timestamp when the backup was created.
    let createdAt: Date

    /// Bundle version of the app that created this backup.
    let appVersion: String

    /// Number of accounts in the backup.
    let accountCount: Int

    /// Number of transactions in the backup.
    let transactionCount: Int

    /// Number of budgets in the backup.
    let budgetCount: Int

    /// Number of goals in the backup.
    let goalCount: Int

    /// Number of categories in the backup.
    let categoryCount: Int

    /// Human-readable device name for identification.
    let deviceName: String

    /// Total size of the backup payload in bytes.
    let payloadSizeBytes: Int64

    // MARK: - Constants

    /// Current backup format version.
    static let currentVersion = 1

    // MARK: - Computed

    /// Total number of items across all entity types.
    var totalItemCount: Int {
        accountCount + transactionCount + budgetCount + goalCount + categoryCount
    }

    /// Whether this manifest was created by a compatible app version.
    var isCompatible: Bool {
        version <= Self.currentVersion
    }

    // MARK: - Factory

    /// Creates a manifest for a new backup.
    static func create(
        accounts: Int,
        transactions: Int,
        budgets: Int,
        goals: Int,
        categories: Int,
        payloadSize: Int64
    ) -> BackupManifest {
        BackupManifest(
            id: UUID().uuidString,
            version: currentVersion,
            createdAt: .now,
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0",
            accountCount: accounts,
            transactionCount: transactions,
            budgetCount: budgets,
            goalCount: goals,
            categoryCount: categories,
            deviceName: Self.currentDeviceName,
            payloadSizeBytes: payloadSize
        )
    }

    /// Returns the current device name in a privacy-safe way.
    private static var currentDeviceName: String {
        #if os(iOS)
        return UIDevice.current.name
        #elseif os(watchOS)
        return WKInterfaceDevice.current().name
        #else
        return Host.current().localizedName ?? "Mac"
        #endif
    }
}

// MARK: - Backup Payload

/// The complete serialisable backup payload containing all user data.
///
/// Excludes sensitive credentials which remain in the Keychain.
/// All monetary values are in minor units for lossless serialization.
struct BackupPayload: Codable, Sendable {

    /// Manifest with backup metadata.
    let manifest: BackupManifest

    /// All user accounts.
    let accounts: [BackupAccount]

    /// All user transactions.
    let transactions: [BackupTransaction]

    /// All user budgets.
    let budgets: [BackupBudget]

    /// All user goals.
    let goals: [BackupGoal]

    /// All user categories.
    let categories: [BackupCategory]
}

// MARK: - Backup Entity Models

/// Serialisable account for backup/restore.
struct BackupAccount: Codable, Sendable, Equatable {
    let id: String
    let name: String
    let balanceMinorUnits: Int64
    let currencyCode: String
    let type: String
    let icon: String
    let isArchived: Bool
}

/// Serialisable transaction for backup/restore.
struct BackupTransaction: Codable, Sendable, Equatable {
    let id: String
    let payee: String
    let category: String
    let accountName: String
    let amountMinorUnits: Int64
    let currencyCode: String
    let date: Date
    let type: String
    let status: String
    let notes: String
    let isRecurring: Bool
}

/// Serialisable budget for backup/restore.
struct BackupBudget: Codable, Sendable, Equatable {
    let id: String
    let name: String
    let categoryName: String
    let spentMinorUnits: Int64
    let limitMinorUnits: Int64
    let currencyCode: String
    let period: String
    let icon: String
}

/// Serialisable goal for backup/restore.
struct BackupGoal: Codable, Sendable, Equatable {
    let id: String
    let name: String
    let currentMinorUnits: Int64
    let targetMinorUnits: Int64
    let currencyCode: String
    let targetDate: Date?
    let notes: String
    let status: String
    let icon: String
}

/// Serialisable category for backup/restore.
struct BackupCategory: Codable, Sendable, Equatable {
    let id: String
    let name: String
    let colorHex: String
    let icon: String
    let sortOrder: Int
}
