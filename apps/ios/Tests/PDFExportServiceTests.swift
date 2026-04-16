// SPDX-License-Identifier: BUSL-1.1
// PDFExportServiceTests.swift — Unit tests for PDF generation and GDPR metadata.
//
// References: #879

import Foundation
import Testing
@testable import FinanceApp

// MARK: - GDPR Metadata Tests

@Suite("GDPRExportMetadata")
struct GDPRExportMetadataTests {

    @Test("standard creates valid metadata")
    func standardMetadataIsValid() {
        let metadata = GDPRExportMetadata.standard()

        #expect(!metadata.exportId.isEmpty, "Export ID should be non-empty")
        #expect(!metadata.dataCategories.isEmpty, "Data categories should be populated")
        #expect(!metadata.processingBasis.isEmpty, "Processing basis should be set")
        #expect(!metadata.dataController.isEmpty, "Data controller should be set")
        #expect(!metadata.retentionPeriod.isEmpty, "Retention period should be set")
        #expect(!metadata.dataProtectionContact.isEmpty, "DPO contact should be set")
        #expect(metadata.isCompleteExport == true, "Default should be complete export")
        #expect(metadata.filterDescription == nil, "Default should have no filter description")
    }

    @Test("standard with filters sets filterDescription")
    func standardWithFiltersHasDescription() {
        let metadata = GDPRExportMetadata.standard(
            isComplete: false,
            filterDescription: "Jan 2025 – Mar 2025, Checking only"
        )

        #expect(!metadata.isCompleteExport, "Should not be complete export")
        #expect(metadata.filterDescription != nil, "Filter description should be set")
        #expect(metadata.filterDescription?.contains("Checking") == true)
    }

    @Test("exportId is unique per instance")
    func exportIdIsUnique() {
        let meta1 = GDPRExportMetadata.standard()
        let meta2 = GDPRExportMetadata.standard()
        #expect(meta1.exportId != meta2.exportId, "Each export should have a unique ID")
    }

    @Test("metadata is Codable")
    func metadataIsCodable() throws {
        let original = GDPRExportMetadata.standard()
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(original)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(GDPRExportMetadata.self, from: data)

        #expect(decoded.exportId == original.exportId)
        #expect(decoded.dataCategories == original.dataCategories)
        #expect(decoded.processingBasis == original.processingBasis)
    }

    @Test("GDPR metadata has all required GDPR fields")
    func gdprFieldsPresent() {
        let metadata = GDPRExportMetadata.standard()

        // GDPR Article 15(1) requirements:
        #expect(metadata.dataCategories.count >= 3, "Must list data categories (Art 15(1)(b))")
        #expect(!metadata.processingBasis.isEmpty, "Must state processing basis (Art 15(1)(a))")
        #expect(!metadata.retentionPeriod.isEmpty, "Must state retention period (Art 15(1)(d))")
        #expect(!metadata.dataProtectionContact.isEmpty, "Must provide DPO contact (Art 15(1)(a))")
    }
}

// MARK: - ExportFormat Tests

@Suite("ExportFormat with PDF")
struct ExportFormatPDFTests {

    @Test("PDF format has correct display name")
    func pdfDisplayName() {
        #expect(ExportFormat.pdf.displayName == "PDF")
    }

    @Test("PDF format has correct file extension")
    func pdfFileExtension() {
        #expect(ExportFormat.pdf.fileExtension == "pdf")
    }

    @Test("all formats have accessibility descriptions")
    func allFormatsHaveAccessibilityDescriptions() {
        for format in ExportFormat.allCases {
            #expect(!format.accessibilityDescription.isEmpty,
                    "Format \(format.rawValue) should have an accessibility description")
        }
    }

    @Test("all formats are enumerated")
    func allFormatsEnumerated() {
        #expect(ExportFormat.allCases.count == 3, "Should have CSV, JSON, and PDF")
    }
}

// MARK: - GDPRFinanceExportDTO Tests

@Suite("GDPRFinanceExportDTO")
struct GDPRFinanceExportDTOTests {

    @Test("DTO is Codable")
    func dtoIsCodable() throws {
        let dto = GDPRFinanceExportDTO(
            gdprMetadata: .standard(),
            exportDate: .now,
            version: "1.0.0",
            accounts: [],
            transactions: [],
            budgets: [],
            goals: []
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(dto)
        #expect(data.count > 0, "Encoded data should be non-empty")

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(GDPRFinanceExportDTO.self, from: data)
        #expect(decoded.gdprMetadata.exportId == dto.gdprMetadata.exportId)
    }
}

// MARK: - DataExportViewModel PDF Integration Tests

@Suite("DataExportViewModel PDF support")
struct DataExportViewModelPDFTests {

    @Test("selectedFormat defaults to CSV")
    @MainActor func defaultFormatIsCSV() {
        let vm = DataExportViewModel()
        #expect(vm.selectedFormat == .csv)
    }

    @Test("canExport is true for PDF format")
    @MainActor func canExportPDF() {
        let vm = DataExportViewModel()
        vm.selectedFormat = .pdf
        #expect(vm.canExport, "Should be able to export PDF")
    }

    @Test("filterSummary updates for PDF format")
    @MainActor func filterSummaryForPDF() {
        let vm = DataExportViewModel()
        vm.selectedFormat = .pdf
        let summary = vm.filterSummary
        #expect(!summary.isEmpty, "Filter summary should be non-empty for PDF")
    }
}

// MARK: - Export Progress Step Tests

@Suite("ExportProgressStep")
struct ExportProgressStepTests {

    @Test("all steps have display names")
    func allStepsHaveDisplayNames() {
        let allSteps: [ExportProgressStep] = [
            .idle, .fetchingAccounts, .fetchingTransactions,
            .fetchingBudgets, .fetchingGoals, .filtering,
            .encoding, .writingFile, .complete
        ]
        for step in allSteps {
            #expect(!step.displayName.isEmpty, "Step \(step.rawValue) should have a display name")
        }
    }

    @Test("progress fractions increase monotonically")
    func progressFractionsIncrease() {
        let orderedSteps: [ExportProgressStep] = [
            .idle, .fetchingAccounts, .fetchingTransactions,
            .fetchingBudgets, .fetchingGoals, .filtering,
            .encoding, .writingFile, .complete
        ]
        for i in 1..<orderedSteps.count {
            #expect(
                orderedSteps[i].progressFraction >= orderedSteps[i - 1].progressFraction,
                "Progress should increase: \(orderedSteps[i - 1].rawValue) → \(orderedSteps[i].rawValue)"
            )
        }
    }

    @Test("complete step is 100%")
    func completeIs100Percent() {
        #expect(ExportProgressStep.complete.progressFraction == 1.0)
    }
}
