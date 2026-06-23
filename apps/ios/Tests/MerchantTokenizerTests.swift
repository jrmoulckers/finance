// SPDX-License-Identifier: BUSL-1.1

// MerchantTokenizerTests.swift
// FinanceTests
//
// Deterministic tests for the merchant/memo tokenizer.
//
// References: #2382

import FinanceShared
import XCTest

final class MerchantTokenizerTests: XCTestCase {

    func testStripsNoiseAndStoreNumbers() {
        let tokens = MerchantTokenizer.tokens(merchant: "WHOLE FOODS MKT #123 POS DEBIT")
        XCTAssertTrue(tokens.contains("whole"))
        XCTAssertTrue(tokens.contains("foods"))
        XCTAssertFalse(tokens.contains("pos"), "Payment-network noise should be removed")
        XCTAssertFalse(tokens.contains("debit"), "Payment-network noise should be removed")
        XCTAssertFalse(tokens.contains("123"), "Pure-numeric store numbers should be removed")
    }

    func testLowercasesAndDeduplicates() {
        let tokens = MerchantTokenizer.tokens(merchant: "Coffee COFFEE coffee")
        XCTAssertEqual(tokens, ["coffee"])
    }

    func testCombinesMerchantAndMemo() {
        let tokens = MerchantTokenizer.tokens(merchant: "Amazon", memo: "Marketplace order")
        XCTAssertTrue(tokens.contains("amazon"))
        XCTAssertTrue(tokens.contains("marketplace"))
        XCTAssertTrue(tokens.contains("order"))
    }

    func testRemovesShortTokens() {
        let tokens = MerchantTokenizer.tokens(merchant: "A B Target")
        XCTAssertEqual(tokens, ["target"])
    }

    func testEmptyInputProducesNoTokens() {
        XCTAssertTrue(MerchantTokenizer.tokens(merchant: "   #  42 ").isEmpty)
    }

    func testSignatureIsOrderIndependent() {
        let a = MerchantTokenizer.signature(for: ["whole", "foods"])
        let b = MerchantTokenizer.signature(for: ["foods", "whole"])
        XCTAssertEqual(a, b)
        XCTAssertEqual(a, "foods whole")
    }

    func testSignatureEmptyForNoTokens() {
        XCTAssertEqual(MerchantTokenizer.signature(for: []), "")
    }

    func testDeterministicAcrossCalls() {
        let first = MerchantTokenizer.tokens(merchant: "Shell Gas Station 4471")
        let second = MerchantTokenizer.tokens(merchant: "Shell Gas Station 4471")
        XCTAssertEqual(first, second)
    }
}
