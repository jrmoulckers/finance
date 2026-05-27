// SPDX-License-Identifier: BUSL-1.1

// ReceiptScanViewModel.swift
// Finance
//
// ViewModel for the receipt scanning screen. Manages the scan lifecycle,
// OCR results, and transaction creation from extracted data.
//
// References: #301

import Observation
import os
import SwiftUI

@Observable
final class ReceiptScanViewModel {
    private let scanner: ReceiptScannerProtocol
    private let transactionRepository: TransactionRepository
    private let formatter: any SwiftExportFormatterModule

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "ReceiptScanViewModel"
    )

    // MARK: - State

    var scanStatus: ReceiptScanStatus = .idle
    var scannedReceipt: ScannedReceipt?
    var errorMessage: String?

    // Editable fields pre-filled from OCR
    var merchant: String = ""
    var totalAmount: String = ""
    var transactionDate: Date = .now
    var selectedCategory: String = ""
    var currencyCode: String = "USD"
    var notes: String = ""
    var acceptedLineItemIds: Set<UUID> = []

    var showError: Bool { errorMessage != nil }
    func dismissError() { errorMessage = nil }

    /// Whether extracted data is sufficient to create a transaction.
    var canCreateTransaction: Bool {
        !merchant.trimmingCharacters(in: .whitespaces).isEmpty
            && !totalAmount.isEmpty
    }

    /// Confidence as a formatted percentage string.
    var confidenceText: String {
        guard let receipt = scannedReceipt else { return "" }
        return String(format: "%.0f%%", receipt.confidence)
    }

    // MARK: - Init

    init(
        scanner: ReceiptScannerProtocol = ReceiptScannerService.shared,
        transactionRepository: TransactionRepository,
        formatter: any SwiftExportFormatterModule = SwiftExportBridgeProvider.shared.formatter
    ) {
        self.scanner = scanner
        self.transactionRepository = transactionRepository
        self.formatter = formatter
    }

    // MARK: - Scanning

    func processImage(_ imageData: Data) async {
        scanStatus = .processing

        do {
            let receipt = try await scanner.scanReceipt(imageData: imageData)
            scannedReceipt = receipt
            populateFields(from: receipt.extractedData)
            scanStatus = .completed(receipt)

            Self.logger.info(
                "Receipt scanned: confidence \(receipt.confidence, privacy: .public)%"
            )
        } catch {
            let message = (error as? ReceiptScanError)?.localizedDescription
                ?? String(localized: "Failed to scan receipt.")
            scanStatus = .failed(message)
            errorMessage = message
            Self.logger.error("Scan failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func populateFields(from data: ReceiptExtractedData) {
        merchant = data.merchant ?? ""

        if let total = data.totalMinorUnits {
            totalAmount = String(format: "%.2f", Double(total) / 100.0)
        }

        if let date = data.date {
            transactionDate = date
        }

        if let currency = data.currencyCode {
            currencyCode = currency
        }

        selectedCategory = data.suggestedCategory ?? ""
        acceptedLineItemIds = Set(data.lineItems.map(\.id))
    }

    func setLineItemAccepted(_ item: ReceiptLineItem, accepted: Bool) {
        if accepted {
            acceptedLineItemIds.insert(item.id)
        } else {
            acceptedLineItemIds.remove(item.id)
        }
    }

    // MARK: - Transaction Creation

    func createTransaction() async -> Bool {
        guard canCreateTransaction else { return false }

        let amountCents: Int64
        if let parsedAmount = Double(totalAmount) {
            amountCents = -Int64(parsedAmount * 100) // Negative for expense
        } else {
            errorMessage = String(localized: "Invalid amount entered.")
            return false
        }

        let acceptedLineItems = scannedReceipt?.extractedData.lineItems.filter {
            acceptedLineItemIds.contains($0.id)
        } ?? []
        let lineItemNote = acceptedLineItems.isEmpty ? "" : "\nItems: " + acceptedLineItems.map {
            "\($0.description) \(String(format: "$%.2f", Double($0.amountMinorUnits) / 100.0))"
        }.joined(separator: ", ")

        let transaction = TransactionItem(
            id: UUID().uuidString,
            payee: merchant,
            category: selectedCategory.isEmpty ? "Uncategorized" : selectedCategory,
            amountMinorUnits: amountCents,
            currencyCode: currencyCode,
            date: transactionDate,
            type: .expense,
            status: .cleared,
            notes: notes + lineItemNote,
            receiptData: scannedReceipt?.imageData
        )

        do {
            try await transactionRepository.createTransaction(transaction)
            Self.logger.info("Transaction created from receipt: \(self.merchant, privacy: .private)")
            return true
        } catch {
            errorMessage = String(localized: "Failed to save transaction.")
            Self.logger.error(
                "Transaction save failed: \(error.localizedDescription, privacy: .public)"
            )
            return false
        }
    }

    func resetScan() {
        scanStatus = .idle
        scannedReceipt = nil
        merchant = ""
        totalAmount = ""
        transactionDate = .now
        selectedCategory = ""
        notes = ""
        acceptedLineItemIds = []
    }
}
