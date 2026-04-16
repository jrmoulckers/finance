// SPDX-License-Identifier: BUSL-1.1
// GDPRExportMetadata.swift — GDPR Article 20 data portability metadata.
//
// Provides a standardized metadata envelope for all data exports,
// ensuring compliance with GDPR data portability requirements.
// Included in JSON, CSV headers, and PDF reports.
//
// References: #879

import Foundation

// MARK: - GDPR Export Metadata

/// Metadata envelope conforming to GDPR Article 20 data portability requirements.
///
/// Every data export includes this metadata to document:
/// - What data was exported and when
/// - The data categories included
/// - The legal basis for processing
/// - Retention and deletion information
/// - A unique export identifier for audit trails
struct GDPRExportMetadata: Codable, Sendable {

    /// Unique identifier for this export instance (UUID v4).
    let exportId: String

    /// Timestamp when the export was generated.
    let exportDate: Date

    /// App version that generated the export.
    let appVersion: String

    /// Format version for forward compatibility.
    let formatVersion: String

    /// List of data categories included in the export.
    /// Per GDPR Article 15(1)(b), data subjects must know the categories.
    let dataCategories: [String]

    /// Legal basis for data processing (e.g., "Consent", "Contract").
    let processingBasis: String

    /// Name of the data controller.
    let dataController: String

    /// Data retention period description.
    let retentionPeriod: String

    /// Contact information for data protection inquiries.
    let dataProtectionContact: String

    /// Whether the export includes all user data (true) or a filtered subset.
    let isCompleteExport: Bool

    /// Description of any filters applied to the export.
    let filterDescription: String?

    /// Hash of the export content for integrity verification (SHA-256).
    var contentHash: String?

    // MARK: - Factory

    /// Creates a standard GDPR metadata envelope for the Finance app.
    ///
    /// - Parameters:
    ///   - isComplete: Whether this is a full data export or filtered.
    ///   - filterDescription: Human-readable description of applied filters.
    /// - Returns: A populated metadata instance.
    static func standard(
        isComplete: Bool = true,
        filterDescription: String? = nil
    ) -> GDPRExportMetadata {
        GDPRExportMetadata(
            exportId: UUID().uuidString,
            exportDate: .now,
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0",
            formatVersion: "1.0",
            dataCategories: [
                String(localized: "Financial Accounts"),
                String(localized: "Transactions"),
                String(localized: "Budget Categories"),
                String(localized: "Financial Goals"),
                String(localized: "Transaction Categories"),
            ],
            processingBasis: String(localized: "User consent and contract performance"),
            dataController: String(localized: "Finance App"),
            retentionPeriod: String(localized: "Data retained until user requests deletion"),
            dataProtectionContact: String(localized: "privacy@finance.app"),
            isCompleteExport: isComplete,
            filterDescription: filterDescription,
            contentHash: nil
        )
    }
}

// MARK: - Enhanced Export DTO with GDPR Metadata

/// Top-level container for GDPR-compliant JSON export.
///
/// Wraps the existing `FinanceExportDTO` with GDPR metadata envelope.
struct GDPRFinanceExportDTO: Codable, Sendable {
    let gdprMetadata: GDPRExportMetadata
    let exportDate: Date
    let version: String
    let accounts: [AccountExportDTO]
    let transactions: [TransactionExportDTO]
    let budgets: [BudgetExportDTO]
    let goals: [GoalExportDTO]
}
