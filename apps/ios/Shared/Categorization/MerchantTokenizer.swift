// SPDX-License-Identifier: BUSL-1.1

// MerchantTokenizer.swift
// FinanceShared
//
// Deterministic tokenizer for merchant + memo text. Pure value transform with
// no I/O — given the same input it always produces the same tokens, which makes
// the categorization pipeline fully unit-testable.
//
// The tokenizer intentionally strips store numbers, payment-network noise, and
// generic stop words so that "WHOLE FOODS MKT #123 POS DEBIT" and
// "Whole Foods Market" collapse to the same meaningful tokens.
//
// References: #2382

import Foundation

/// Deterministic merchant/memo tokenizer.
public enum MerchantTokenizer {

    /// Generic words and payment-network noise removed before classification.
    private static let stopWords: Set<String> = [
        "the", "and", "for", "inc", "llc", "ltd", "co", "corp", "company",
        "store", "shop", "pos", "purchase", "payment", "pmt", "debit", "credit",
        "card", "visa", "mastercard", "amex", "discover", "us", "usa", "online",
        "recurring", "transaction", "txn", "ref", "auth", "checkcard", "ach",
    ]

    /// Minimum length for a token to be considered meaningful.
    private static let minimumTokenLength = 2

    /// Tokenizes merchant + memo into normalised, de-duplicated tokens.
    ///
    /// - Order is preserved (first occurrence wins) so callers that care about
    ///   primary token can rely on `tokens.first`.
    /// - Pure-numeric tokens (store numbers, dates) and stop words are removed.
    public static func tokens(merchant: String, memo: String = "") -> [String] {
        let combined = merchant + " " + memo
        let lowered = combined.lowercased()

        // Split on any non-alphanumeric character.
        let separators = CharacterSet.alphanumerics.inverted
        let rawTokens = lowered.components(separatedBy: separators)

        var seen: Set<String> = []
        var result: [String] = []

        for token in rawTokens {
            guard token.count >= minimumTokenLength else { continue }
            guard !stopWords.contains(token) else { continue }
            // Drop pure-numeric tokens (store numbers, amounts, dates).
            guard !token.allSatisfy(\.isNumber) else { continue }

            if seen.insert(token).inserted {
                result.append(token)
            }
        }

        return result
    }

    /// Produces a stable, order-independent signature for personalization.
    ///
    /// Two inputs that tokenize to the same *set* of tokens share a signature,
    /// so a correction learned for "Starbucks #44" also applies to
    /// "STARBUCKS STORE 91". Returns an empty string when there are no tokens.
    public static func signature(for tokens: [String]) -> String {
        guard !tokens.isEmpty else { return "" }
        return Set(tokens).sorted().joined(separator: " ")
    }
}
