// SPDX-License-Identifier: BUSL-1.1

// DebtPayoffViewModelTests.swift
// FinanceTests
//
// Tests for DebtPayoffViewModel (#2175) — loading, rollup, and error handling.

import XCTest
import FinanceShared
@testable import FinanceApp

/// Configurable stub provider for the debt payoff view model.
final class StubDebtPayoffProvider: DebtPayoffProviding, @unchecked Sendable {
    var debtsToReturn: [DebtPayoffProgress] = []
    var errorToThrow: Error?

    func loadDebts() async throws -> [DebtPayoffProgress] {
        if let errorToThrow { throw errorToThrow }
        return debtsToReturn
    }
}

final class DebtPayoffViewModelTests: XCTestCase {

    private func sampleDebts() -> [DebtPayoffProgress] {
        [
            DebtPayoffProgress(
                id: "1", name: "Grad PLUS",
                originalPrincipalMinorUnits: 40_000_00,
                currentBalanceMinorUnits: 20_000_00,
                monthlyPaymentMinorUnits: 1_000_00
            ),
            DebtPayoffProgress(
                id: "2", name: "Car",
                originalPrincipalMinorUnits: 10_000_00,
                currentBalanceMinorUnits: 0,
                monthlyPaymentMinorUnits: 500_00
            ),
        ]
    }

    @MainActor
    func testLoadDebtsPopulatesList() async {
        let provider = StubDebtPayoffProvider()
        provider.debtsToReturn = sampleDebts()
        let vm = DebtPayoffViewModel(provider: provider)

        await vm.loadDebts()

        XCTAssertEqual(vm.debts.count, 2)
        XCTAssertFalse(vm.isLoading)
        XCTAssertFalse(vm.showError)
    }

    @MainActor
    func testPortfolioRollupReflectsLoadedDebts() async {
        let provider = StubDebtPayoffProvider()
        provider.debtsToReturn = sampleDebts()
        let vm = DebtPayoffViewModel(provider: provider)

        await vm.loadDebts()

        // Paid 20_000 + 10_000 of 50_000 = 60%.
        XCTAssertEqual(vm.portfolio.percentComplete, 60)
        XCTAssertEqual(vm.portfolio.totalRemainingBalanceMinorUnits, 20_000_00)
    }

    @MainActor
    func testErrorHandlingClearsDebts() async {
        let provider = StubDebtPayoffProvider()
        provider.errorToThrow = TestError.simulated
        let vm = DebtPayoffViewModel(provider: provider)

        await vm.loadDebts()

        XCTAssertTrue(vm.debts.isEmpty)
        XCTAssertTrue(vm.showError)
        XCTAssertFalse(vm.isLoading)
    }

    @MainActor
    func testDismissErrorClearsMessage() async {
        let provider = StubDebtPayoffProvider()
        provider.errorToThrow = TestError.simulated
        let vm = DebtPayoffViewModel(provider: provider)

        await vm.loadDebts()
        XCTAssertTrue(vm.showError)

        vm.dismissError()
        XCTAssertFalse(vm.showError)
    }

    @MainActor
    func testSampleProviderReturnsDebts() async {
        let vm = DebtPayoffViewModel(provider: SampleDebtPayoffProvider())
        await vm.loadDebts()
        XCTAssertFalse(vm.debts.isEmpty,
                       "Sample provider should supply placeholder debts")
    }
}
