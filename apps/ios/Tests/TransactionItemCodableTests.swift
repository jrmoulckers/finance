// SPDX-License-Identifier: BUSL-1.1

import Foundation
import XCTest
@testable import FinanceApp

final class TransactionItemCodableTests: XCTestCase {
    func testRoundTripPreservesTagsAndMood() throws {
        let transaction = TransactionItem(
            id: "transaction",
            payee: "Merchant",
            category: "Dining",
            amountMinorUnits: 1_250,
            currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_700_000_000),
            tagNames: ["shared"],
            moodTag: "celebration",
            tags: [Tag(id: "tag", name: "travel:food")]
        )

        let encoded = try JSONEncoder().encode(transaction)
        let decoded = try JSONDecoder().decode(TransactionItem.self, from: encoded)

        XCTAssertEqual(decoded, transaction)
    }

    func testLegacyTransactionDefaultsTagFields() throws {
        let legacyTransaction = LegacyTransaction(
            id: "legacy",
            payee: "Merchant",
            category: "Dining",
            accountName: "",
            amountMinorUnits: 1_250,
            currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_700_000_000),
            type: .expense,
            status: .cleared,
            notes: "",
            isRecurring: false
        )

        let encoded = try JSONEncoder().encode(legacyTransaction)
        let decoded = try JSONDecoder().decode(TransactionItem.self, from: encoded)

        XCTAssertEqual(decoded.tagNames, [])
        XCTAssertNil(decoded.moodTag)
        XCTAssertEqual(decoded.tags, [])
    }
}

private struct LegacyTransaction: Encodable {
    let id: String
    let payee: String
    let category: String
    let accountName: String
    let amountMinorUnits: Int64
    let currencyCode: String
    let date: Date
    let type: TransactionTypeUI
    let status: TransactionStatusUI
    let notes: String
    let isRecurring: Bool
}
