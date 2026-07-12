// SPDX-License-Identifier: BUSL-1.1

// MerchantRecognizer.swift
// Finance
//
// Pure merchant-recognition helper for Wallet-aware capture (#2171). Turns a
// noisy card descriptor ("TST* THE COFFEE CLUB 4471", "UBER *TRIP HELP.UBER")
// into a clean merchant name, a best-effort category suggestion, and a
// confidence level. Deterministic and I/O-free so it is fully unit-testable.

import Foundation
import FinanceShared

enum MerchantRecognizer {

    /// Lightweight keyword → category map used for a best-effort suggestion.
    /// Keys are matched against tokenized descriptor tokens.
    private static let categoryKeywords: [(keywords: Set<String>, category: String)] = [
        (["coffee", "cafe", "espresso", "starbucks", "restaurant", "grill", "kitchen", "pizza", "sushi", "burger", "diner", "bar", "eatery"], "Dining Out"),
        (["grocery", "market", "mart", "foods", "supermarket", "grocer", "deli"], "Groceries"),
        (["uber", "lyft", "grab", "taxi", "transit", "metro", "rail", "train", "bus", "bolt"], "Transport"),
        (["hotel", "hostel", "airbnb", "inn", "resort", "lodge", "booking", "expedia"], "Travel"),
        (["airline", "air", "airways", "flight", "ryanair", "easyjet", "delta"], "Travel"),
        (["netflix", "spotify", "hulu", "cinema", "movie", "theater", "steam", "playstation"], "Entertainment"),
        (["pharmacy", "clinic", "hospital", "dental", "chemist", "drug"], "Health"),
        (["fuel", "gas", "petrol", "shell", "chevron", "exxon"], "Transport"),
    ]

    /// Cleans a raw descriptor into a human-friendly merchant name.
    ///
    /// Reuses `MerchantTokenizer` to strip store numbers and payment-network
    /// noise, then title-cases the surviving tokens. Falls back to a trimmed
    /// version of the raw descriptor when tokenization yields nothing.
    static func clean(_ descriptor: String) -> String {
        let tokens = MerchantTokenizer.tokens(merchant: descriptor)
        guard !tokens.isEmpty else {
            return descriptor.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return tokens
            .prefix(4)
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }

    /// Best-effort category suggestion for a descriptor, or nil when unknown.
    static func suggestedCategory(for descriptor: String) -> String? {
        let tokens = Set(MerchantTokenizer.tokens(merchant: descriptor))
        guard !tokens.isEmpty else { return nil }
        for entry in categoryKeywords where !entry.keywords.isDisjoint(with: tokens) {
            return entry.category
        }
        return nil
    }

    /// Confidence in the recognition result.
    ///
    /// - `.high`: recognized a category and produced a clean merchant name.
    /// - `.medium`: produced a clean name but no category match.
    /// - `.low`: tokenization produced nothing meaningful.
    static func confidence(cleanMerchant: String, hasCategory: Bool) -> CaptureConfidence {
        if cleanMerchant.isEmpty { return .low }
        let tokens = MerchantTokenizer.tokens(merchant: cleanMerchant)
        if tokens.isEmpty { return .low }
        return hasCategory ? .high : .medium
    }

    /// Builds a fully recognized candidate from raw activity fields.
    static func recognize(
        id: String,
        rawDescriptor: String,
        amountMinorUnits: Int64,
        currencyCode: String,
        date: Date,
        cardLast4: String?
    ) -> WalletTransactionCandidate {
        let merchant = clean(rawDescriptor)
        let category = suggestedCategory(for: rawDescriptor)
        return WalletTransactionCandidate(
            id: id,
            rawDescriptor: rawDescriptor,
            merchant: merchant,
            amountMinorUnits: abs(amountMinorUnits),
            currencyCode: currencyCode,
            date: date,
            cardLast4: cardLast4,
            suggestedCategory: category,
            confidence: confidence(cleanMerchant: merchant, hasCategory: category != nil),
            duplicateOfId: nil
        )
    }
}
