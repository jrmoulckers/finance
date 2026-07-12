// SPDX-License-Identifier: BUSL-1.1

// WalletDuplicateDetector.swift
// Finance
//
// Pure duplicate detection for Wallet-aware capture (#2171). Apple Pay users
// often have the same purchase arrive from both a manual entry and imported
// card activity; importing blindly would double-count. This detector flags a
// candidate as a likely duplicate of an existing transaction when the amount,
// currency, timing and merchant all line up. Deterministic and I/O-free.

import Foundation
import FinanceShared

enum WalletDuplicateDetector {

    /// Default matching window: purchases within three days are comparable.
    static let defaultWindow: TimeInterval = 3 * 24 * 60 * 60

    /// Finds an existing transaction that the candidate likely duplicates.
    static func findDuplicate(
        for candidate: WalletTransactionCandidate,
        in existing: [TransactionItem],
        within window: TimeInterval = defaultWindow
    ) -> TransactionItem? {
        let candidateTokens = Set(MerchantTokenizer.tokens(merchant: candidate.merchant))

        return existing.first { item in
            guard item.currencyCode == candidate.currencyCode else { return false }
            guard abs(item.amountMinorUnits) == candidate.amountMinorUnits else { return false }
            guard abs(item.date.timeIntervalSince(candidate.date)) <= window else { return false }
            return merchantsMatch(candidateTokens: candidateTokens, payee: item.payee)
        }
    }

    /// Annotates each candidate with the id of a likely-duplicate existing
    /// transaction (if any), leaving all other fields untouched.
    static func annotate(
        candidates: [WalletTransactionCandidate],
        existing: [TransactionItem],
        within window: TimeInterval = defaultWindow
    ) -> [WalletTransactionCandidate] {
        candidates.map { candidate in
            var annotated = candidate
            annotated.duplicateOfId = findDuplicate(for: candidate, in: existing, within: window)?.id
            return annotated
        }
    }

    /// Two merchants match when their token sets share at least one meaningful
    /// token, e.g. candidate "The Coffee Club" vs payee "Coffee Club Sydney".
    private static func merchantsMatch(candidateTokens: Set<String>, payee: String) -> Bool {
        guard !candidateTokens.isEmpty else { return false }
        let payeeTokens = Set(MerchantTokenizer.tokens(merchant: payee))
        guard !payeeTokens.isEmpty else { return false }
        return !candidateTokens.isDisjoint(with: payeeTokens)
    }
}
