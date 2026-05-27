// SPDX-License-Identifier: BUSL-1.1

// ReceiptScannerService.swift
// Finance
//
// On-device receipt scanning and OCR using Apple Vision framework.
// All processing happens locally — no receipt images leave the device.
//
// Uses VNRecognizeTextRequest for text recognition and regex-based
// extraction for amounts, dates, and merchant names.
//
// References: #301

import Foundation
import os
import Vision

// MARK: - Receipt Scanner Protocol

/// Contract for receipt scanning and OCR services.
protocol ReceiptScannerProtocol: Sendable {
    /// Processes a receipt image and extracts financial data.
    func scanReceipt(imageData: Data) async throws -> ScannedReceipt
}

// MARK: - Receipt Scanner Service

/// Actor-isolated service for on-device receipt OCR using Apple Vision.
///
/// Privacy-first: all image processing and text recognition happens
/// on-device using `VNRecognizeTextRequest`. No data is sent externally.
actor ReceiptScannerService: ReceiptScannerProtocol {

    static let shared = ReceiptScannerService()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "ReceiptScannerService"
    )

    // MARK: - Scan Receipt

    func scanReceipt(imageData: Data) async throws -> ScannedReceipt {
        let recognizedText = try await recognizeText(from: imageData)

        Self.logger.debug(
            "OCR recognized \(recognizedText.count, privacy: .public) text blocks"
        )

        var extractedData = extractFinancialData(from: recognizedText)
        extractedData.rawText = recognizedText.map(\.text).joined(separator: "\n")
        let confidence = calculateConfidence(extractedData)
        let extractedText = ExtractedReceiptText(
            from: extractedData,
            rawText: extractedData.rawText,
            confidence: confidence
        )

        return ScannedReceipt(
            imageData: imageData,
            extractedData: extractedData,
            extractedText: extractedText,
            confidence: confidence
        )
    }

    // MARK: - Vision OCR

    private func recognizeText(from imageData: Data) async throws -> [RecognizedTextBlock] {
        try await withCheckedThrowingContinuation { continuation in
            guard let cgImage = createCGImage(from: imageData) else {
                continuation.resume(throwing: ReceiptScanError.invalidImage)
                return
            }

            let request = VNRecognizeTextRequest { request, error in
                if let error {
                    continuation.resume(throwing: ReceiptScanError.ocrFailed(error.localizedDescription))
                    return
                }

                let results = (request.results as? [VNRecognizedTextObservation]) ?? []
                let blocks = results.compactMap { observation -> RecognizedTextBlock? in
                    guard let candidate = observation.topCandidates(1).first else { return nil }
                    return RecognizedTextBlock(
                        text: candidate.string,
                        confidence: Double(candidate.confidence),
                        boundingBox: observation.boundingBox
                    )
                }
                continuation.resume(returning: blocks)
            }

            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = ["en-US"]

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: ReceiptScanError.ocrFailed(error.localizedDescription))
            }
        }
    }

    private func createCGImage(from data: Data) -> CGImage? {
        guard let dataProvider = CGDataProvider(data: data as CFData),
              let source = CGImageSourceCreateWithDataProvider(dataProvider, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else { return nil }
        return image
    }

    // MARK: - Data Extraction

    private func extractFinancialData(from blocks: [RecognizedTextBlock]) -> ReceiptExtractedData {
        let allText = blocks.map(\.text)
        let fullText = allText.joined(separator: "\n")

        let merchant = extractMerchant(from: blocks)
        let total = extractTotal(from: allText)
        let subtotal = extractSubtotal(from: allText)
        let tax = extractTax(from: allText)
        let date = extractDate(from: fullText)
        let lineItems = extractLineItems(from: allText)
        let currency = extractCurrency(from: fullText)
        let category = suggestCategory(merchant: merchant)

        return ReceiptExtractedData(
            merchant: merchant,
            totalMinorUnits: total,
            subtotalMinorUnits: subtotal,
            taxMinorUnits: tax,
            currencyCode: currency,
            date: date,
            lineItems: lineItems,
            suggestedCategory: category
        )
    }

    /// Extracts the merchant name — typically the first or most prominent text block.
    private func extractMerchant(from blocks: [RecognizedTextBlock]) -> String? {
        // The merchant name is usually the first prominent text at the top
        guard let first = blocks.first else { return nil }
        let name = first.text.trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? nil : name
    }

    /// Extracts the total amount from text lines.
    private func extractTotal(from lines: [String]) -> Int64? {
        extractAmount(from: lines, patterns: [
            #"(?i)total\s*:?\s*\$?([\d,]+\.?\d{0,2})"#,
            #"(?i)amount\s*due\s*:?\s*\$?([\d,]+\.?\d{0,2})"#,
            #"(?i)balance\s*due\s*:?\s*\$?([\d,]+\.?\d{0,2})"#,
        ])
    }

    /// Extracts the subtotal amount.
    private func extractSubtotal(from lines: [String]) -> Int64? {
        extractAmount(from: lines, patterns: [
            #"(?i)sub\s*-?\s*total\s*:?\s*\$?([\d,]+\.?\d{0,2})"#,
        ])
    }

    /// Extracts the tax amount.
    private func extractTax(from lines: [String]) -> Int64? {
        extractAmount(from: lines, patterns: [
            #"(?i)tax\s*:?\s*\$?([\d,]+\.?\d{0,2})"#,
            #"(?i)sales\s*tax\s*:?\s*\$?([\d,]+\.?\d{0,2})"#,
        ])
    }

    private func extractAmount(from lines: [String], patterns: [String]) -> Int64? {
        for pattern in patterns {
            for line in lines {
                if let match = line.range(of: pattern, options: .regularExpression) {
                    let matchedText = String(line[match])
                    // Extract the numeric portion
                    let numPattern = #"[\d,]+\.?\d{0,2}"#
                    if let numMatch = matchedText.range(of: numPattern, options: .regularExpression) {
                        let numStr = String(matchedText[numMatch]).replacingOccurrences(of: ",", with: "")
                        if let value = Double(numStr) {
                            return Int64(value * 100)
                        }
                    }
                }
            }
        }
        return nil
    }

    /// Extracts a date from the receipt text.
    private func extractDate(from text: String) -> Date? {
        let datePatterns = [
            #"\d{1,2}/\d{1,2}/\d{2,4}"#,
            #"\d{1,2}-\d{1,2}-\d{2,4}"#,
            #"\d{4}-\d{2}-\d{2}"#,
        ]

        let formatters: [DateFormatter] = {
            let formats = ["MM/dd/yyyy", "MM/dd/yy", "MM-dd-yyyy", "yyyy-MM-dd", "M/d/yyyy"]
            return formats.map { format in
                let f = DateFormatter()
                f.dateFormat = format
                f.locale = Locale(identifier: "en_US_POSIX")
                return f
            }
        }()

        for pattern in datePatterns {
            if let match = text.range(of: pattern, options: .regularExpression) {
                let dateStr = String(text[match])
                for formatter in formatters {
                    if let date = formatter.date(from: dateStr) {
                        return date
                    }
                }
            }
        }
        return nil
    }

    /// Extracts individual line items from receipt text.
    private func extractLineItems(from lines: [String]) -> [ReceiptLineItem] {
        let pattern = #"(.+?)\s+\$?([\d,]+\.\d{2})\s*$"#
        var items: [ReceiptLineItem] = []

        for line in lines {
            if let match = line.range(of: pattern, options: .regularExpression) {
                let matchedLine = String(line[match])
                let components = matchedLine.components(separatedBy: .whitespaces)
                    .filter { !$0.isEmpty }

                guard components.count >= 2,
                      let lastComponent = components.last,
                      let amount = Double(lastComponent.replacingOccurrences(of: "$", with: "")
                          .replacingOccurrences(of: ",", with: ""))
                else { continue }

                let description = components.dropLast().joined(separator: " ")
                if !description.isEmpty {
                    items.append(ReceiptLineItem(
                        description: description,
                        amountMinorUnits: Int64(amount * 100),
                        quantity: 1
                    ))
                }
            }
        }

        return items
    }

    /// Extracts currency from common symbols in text.
    private func extractCurrency(from text: String) -> String? {
        if text.contains("$") { return "USD" }
        if text.contains("£") { return "GBP" }
        if text.contains("€") { return "EUR" }
        if text.contains("¥") { return "JPY" }
        return nil
    }

    /// Suggests a transaction category based on merchant name.
    private func suggestCategory(merchant: String?) -> String? {
        guard let merchant = merchant?.lowercased() else { return nil }

        let categoryMap: [(keywords: [String], category: String)] = [
            (["grocery", "market", "whole foods", "trader joe", "safeway", "kroger", "walmart"], "Groceries"),
            (["restaurant", "cafe", "coffee", "starbucks", "mcdonald", "chipotle", "pizza"], "Dining Out"),
            (["gas", "shell", "chevron", "exxon", "bp", "fuel"], "Transport"),
            (["amazon", "target", "best buy", "costco", "store"], "Shopping"),
            (["pharmacy", "cvs", "walgreens", "medical", "doctor"], "Healthcare"),
        ]

        for mapping in categoryMap {
            if mapping.keywords.contains(where: { merchant.contains($0) }) {
                return mapping.category
            }
        }

        return nil
    }

    // MARK: - Confidence

    private func calculateConfidence(_ data: ReceiptExtractedData) -> Double {
        var score = 0.0
        var factors = 0.0

        if data.merchant != nil { score += 1.0; factors += 1.0 }
        else { factors += 1.0 }

        if data.totalMinorUnits != nil { score += 1.0; factors += 1.0 }
        else { factors += 1.0 }

        if data.date != nil { score += 1.0; factors += 1.0 }
        else { factors += 1.0 }

        if data.currencyCode != nil { score += 0.5; factors += 0.5 }
        else { factors += 0.5 }

        if !data.lineItems.isEmpty { score += 0.5; factors += 0.5 }
        else { factors += 0.5 }

        return factors > 0 ? (score / factors) * 100.0 : 0
    }
}

// MARK: - Supporting Types

/// A block of text recognized by Vision OCR.
struct RecognizedTextBlock: Sendable {
    let text: String
    let confidence: Double
    let boundingBox: CGRect
}

/// Errors specific to receipt scanning.
enum ReceiptScanError: Error, LocalizedError, Sendable {
    case invalidImage
    case ocrFailed(String)
    case cameraUnavailable
    case permissionDenied

    var errorDescription: String? {
        switch self {
        case .invalidImage:
            String(localized: "The image could not be processed.")
        case .ocrFailed(let reason):
            String(localized: "Text recognition failed: \(reason)")
        case .cameraUnavailable:
            String(localized: "Camera is not available on this device.")
        case .permissionDenied:
            String(localized: "Camera permission is required to scan receipts.")
        }
    }
}
