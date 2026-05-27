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
    let extractedText: ExtractedReceiptText
    let scannedAt: Date
    let confidence: Double

    init(
        id: String = UUID().uuidString,
        imageData: Data,
        extractedData: ReceiptExtractedData,
        extractedText: ExtractedReceiptText? = nil,
        scannedAt: Date = .now,
        confidence: Double
    ) {
        self.id = id
        self.imageData = imageData
        self.extractedData = extractedData
        self.extractedText = extractedText ?? ExtractedReceiptText(
            from: extractedData,
            rawText: extractedData.rawText,
            confidence: confidence
        )
        self.scannedAt = scannedAt
        self.confidence = confidence
    }
}

// MARK: - Extracted Data

/// Canonical receipt OCR contract mirrored from the shared import package.
struct ExtractedReceiptText: Sendable {
    let merchant: String?
    let date: Date?
    let total: Int64?
    let lineItems: [ReceiptLineItem]
    let rawText: String
    let confidence: Double

    init(
        merchant: String?,
        date: Date?,
        total: Int64?,
        lineItems: [ReceiptLineItem],
        rawText: String,
        confidence: Double
    ) {
        self.merchant = merchant
        self.date = date
        self.total = total
        self.lineItems = lineItems
        self.rawText = rawText
        self.confidence = confidence
    }

    init(from data: ReceiptExtractedData, rawText: String, confidence: Double) {
        self.init(
            merchant: data.merchant,
            date: data.date,
            total: data.totalMinorUnits,
            lineItems: data.lineItems,
            rawText: rawText,
            confidence: confidence
        )
    }
}

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
    /// Raw OCR text, retained locally for audit/debug review.
    var rawText: String = ""
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
    var suggestedCategory: String? = nil
    var categoryAccepted: Bool = false
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
