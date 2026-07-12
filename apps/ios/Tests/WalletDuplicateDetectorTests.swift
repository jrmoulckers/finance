// SPDX-License-Identifier: BUSL-1.1

// WalletDuplicateDetectorTests.swift
// FinanceTests
//
// Tests that imported Apple Pay activity is flagged when it duplicates an
// existing transaction, so tapped purchases are not double-counted (#2171).

import XCTest
@testable import FinanceApp

final class WalletDuplicateDetectorTests: XCTestCase {

    private func existing(
        payee: String,
        amount: Int64,
        currency: String = "USD",
        date: Date
    ) -> TransactionItem {
        TransactionItem(
            id: "existing-\(payee)",
            payee: payee,
            category: "Food",
            amountMinorUnits: -amount,
            currencyCode: currency,
            date: date,
            type: .expense
        )
    }

    private func candidate(
        merchant: String,
        amount: Int64,
        currency: String = "USD",
        date: Date
    ) -> WalletTransactionCandidate {
        WalletTransactionCandidate(
            id: "cand",
            rawDescriptor: merchant,
            merchant: merchant,
            amountMinorUnits: amount,
            currencyCode: currency,
            date: date,
            cardLast4: "4242",
            suggestedCategory: nil,
            confidence: .high,
            duplicateOfId: nil
        )
    }

    func testFlagsDuplicateWithMatchingAmountMerchantAndDate() {
        let now = Date()
        let existingTx = existing(payee: "Blue Bottle Coffee", amount: 540, date: now)
        let cand = candidate(merchant: "Blue Bottle Coffee", amount: 540, date: now.addingTimeInterval(3600))

        let match = WalletDuplicateDetector.findDuplicate(for: cand, in: [existingTx])
        XCTAssertEqual(match?.id, existingTx.id)
    }

    func testDifferentAmountIsNotDuplicate() {
        let now = Date()
        let existingTx = existing(payee: "Blue Bottle Coffee", amount: 540, date: now)
        let cand = candidate(merchant: "Blue Bottle Coffee", amount: 999, date: now)
        XCTAssertNil(WalletDuplicateDetector.findDuplicate(for: cand, in: [existingTx]))
    }

    func testDifferentCurrencyIsNotDuplicate() {
        let now = Date()
        let existingTx = existing(payee: "Blue Bottle Coffee", amount: 540, currency: "USD", date: now)
        let cand = candidate(merchant: "Blue Bottle Coffee", amount: 540, currency: "EUR", date: now)
        XCTAssertNil(WalletDuplicateDetector.findDuplicate(for: cand, in: [existingTx]))
    }

    func testOutsideWindowIsNotDuplicate() {
        let now = Date()
        let existingTx = existing(payee: "Blue Bottle Coffee", amount: 540, date: now)
        let cand = candidate(merchant: "Blue Bottle Coffee", amount: 540, date: now.addingTimeInterval(10 * 24 * 3600))
        XCTAssertNil(WalletDuplicateDetector.findDuplicate(for: cand, in: [existingTx]))
    }

    func testDifferentMerchantIsNotDuplicate() {
        let now = Date()
        let existingTx = existing(payee: "Starbucks", amount: 540, date: now)
        let cand = candidate(merchant: "Blue Bottle Coffee", amount: 540, date: now)
        // "Coffee" is a shared-ish word but tokens here don't overlap enough:
        // Starbucks vs Blue Bottle Coffee share no meaningful token.
        XCTAssertNil(WalletDuplicateDetector.findDuplicate(for: cand, in: [existingTx]))
    }

    func testAnnotateSetsDuplicateId() {
        let now = Date()
        let existingTx = existing(payee: "Blue Bottle Coffee", amount: 540, date: now)
        let candidates = [
            candidate(merchant: "Blue Bottle Coffee", amount: 540, date: now),
            candidate(merchant: "Airbnb", amount: 21_500, date: now),
        ]
        let annotated = WalletDuplicateDetector.annotate(candidates: candidates, existing: [existingTx])
        XCTAssertTrue(annotated[0].isLikelyDuplicate)
        XCTAssertFalse(annotated[1].isLikelyDuplicate)
    }
}
