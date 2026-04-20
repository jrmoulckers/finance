// SPDX-License-Identifier: BUSL-1.1

// ReceiptModels.swift
// Finance
//
// Data models for smart receipt scanning and OCR extraction.
// Supports scanned receipt data, extracted fields, and confidence scores.
//
// References: #301

import SwiftUI

// MARK: - Scanned Receipt

/// A receipt that has been scanned and processed by the OCR engine.
struct ScannedReceipt: Identifiable, Sendable {
    let id: String
    let imageData: Data
    let extractedData: ReceiptExtractedData
    let scannedAt: Date
    let confidence: Double

    init(
        id: String = UUID().uuidString,
        imageData: Data,
        extractedData: ReceiptExtractedData,
        scannedAt: Date = .now,
        confidence: Double
    ) {
        self.id = id
        self.imageData = imageData
        self.extractedData = extractedData
        self.scannedAt = scannedAt
        self.confidence = confidence
    }
}

// MARK: - Extracted Data

/// Financial data extracted from a receipt image via on-device OCR.
struct ReceiptExtractedData: Sendable {
    /// Merchant / store name.
    let merchant: String?
    /// Total amount in minor units (cents).
    let totalMinorUnits: Int64?
    /// Subtotal before tax.
    let subtotalMinorUnits: Int64?
    /// Tax amount.
    let taxMinorUnits: Int64?
    /// Currency code (e.g., "USD").
    let currencyCode: String?
    /// Transaction date from the receipt.
    let date: Date?
    /// Individual line items extracted from the receipt.
    let lineItems: [ReceiptLineItem]
    /// Suggested category based on merchant name.
    let suggestedCategory: String?

    /// Whether the extraction has enough data to create a transaction.
    var isUsable: Bool {
        merchant != nil && totalMinorUnits != nil
    }
}

// MARK: - Line Item

/// A single item on a receipt.
struct ReceiptLineItem: Identifiable, Sendable {
    let id = UUID()
    let description: String
    let amountMinorUnits: Int64
    let quantity: Int
}

// MARK: - Scan Status

/// State of the receipt scanning process.
enum ReceiptScanStatus: Sendable {
    case idle
    case capturing
    case processing
    case completed(ScannedReceipt)
    case failed(String)

    var isProcessing: Bool {
        switch self {
        case .processing: true
        default: false
        }
    }
}
