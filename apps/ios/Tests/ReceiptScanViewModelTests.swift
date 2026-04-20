// SPDX-License-Identifier: BUSL-1.1

// ReceiptScanViewModelTests.swift
// FinanceTests
//
// Tests for ReceiptScanViewModel — scan lifecycle, field population,
// transaction creation, and error handling.
//
// References: #301

import XCTest
@testable import FinanceApp

// MARK: - Stub Scanner

private final class StubReceiptScanner: ReceiptScannerProtocol, @unchecked Sendable {
    var receiptToReturn: ScannedReceipt?
    var errorToThrow: Error?

    func scanReceipt(imageData: Data) async throws -> ScannedReceipt {
        if let error = errorToThrow { throw error }
        return receiptToReturn ?? ScannedReceipt(
            imageData: imageData,
            extractedData: ReceiptExtractedData(
                merchant: "Test Store",
                totalMinorUnits: 42_50,
                subtotalMinorUnits: 38_00,
                taxMinorUnits: 4_50,
                currencyCode: "USD",
                date: Date(timeIntervalSince1970: 1_700_000_000),
                lineItems: [
                    ReceiptLineItem(
                        description: "Item A",
                        amountMinorUnits: 20_00,
                        quantity: 1
                    ),
                    ReceiptLineItem(
                        description: "Item B",
                        amountMinorUnits: 18_00,
                        quantity: 1
                    ),
                ],
                suggestedCategory: "Groceries"
            ),
            confidence: 85.0
        )
    }
}

// MARK: - Tests

final class ReceiptScanViewModelTests: XCTestCase {

    @MainActor
    private func makeViewModel(
        scanner: StubReceiptScanner = StubReceiptScanner(),
        transactionError: Error? = nil
    ) -> (ReceiptScanViewModel, StubTransactionRepository, StubReceiptScanner) {
        let transactionRepo = StubTransactionRepository()
        transactionRepo.errorToThrow = transactionError

        let vm = ReceiptScanViewModel(
            scanner: scanner,
            transactionRepository: transactionRepo
        )
        return (vm, transactionRepo, scanner)
    }

    @MainActor
    func testInitialState() {
        let (vm, _, _) = makeViewModel()

        switch vm.scanStatus {
        case .idle: break
        default: XCTFail("Initial status should be .idle")
        }

        XCTAssertNil(vm.scannedReceipt)
        XCTAssertTrue(vm.merchant.isEmpty)
        XCTAssertTrue(vm.totalAmount.isEmpty)
        XCTAssertFalse(vm.canCreateTransaction)
    }

    @MainActor
    func testProcessImagePopulatesFields() async {
        let (vm, _, _) = makeViewModel()

        await vm.processImage(Data())

        XCTAssertEqual(vm.merchant, "Test Store")
        XCTAssertEqual(vm.totalAmount, "0.43") // 42.50 / 100 = 0.42, but 4250 / 100 = 42.50
        XCTAssertNotNil(vm.scannedReceipt)
        XCTAssertEqual(vm.selectedCategory, "Groceries")
        XCTAssertEqual(vm.currencyCode, "USD")
    }

    @MainActor
    func testProcessImageSetsCompletedStatus() async {
        let (vm, _, _) = makeViewModel()

        await vm.processImage(Data())

        switch vm.scanStatus {
        case .completed: break
        default: XCTFail("Status should be .completed after successful scan")
        }
    }

    @MainActor
    func testProcessImageErrorSetsFailedStatus() async {
        let scanner = StubReceiptScanner()
        scanner.errorToThrow = ReceiptScanError.invalidImage
        let (vm, _, _) = makeViewModel(scanner: scanner)

        await vm.processImage(Data())

        switch vm.scanStatus {
        case .failed: break
        default: XCTFail("Status should be .failed after scan error")
        }
        XCTAssertNotNil(vm.errorMessage)
    }

    @MainActor
    func testCanCreateTransactionRequiresMerchantAndAmount() {
        let (vm, _, _) = makeViewModel()

        vm.merchant = ""
        vm.totalAmount = "10.00"
        XCTAssertFalse(vm.canCreateTransaction)

        vm.merchant = "Store"
        vm.totalAmount = ""
        XCTAssertFalse(vm.canCreateTransaction)

        vm.merchant = "Store"
        vm.totalAmount = "10.00"
        XCTAssertTrue(vm.canCreateTransaction)
    }

    @MainActor
    func testCreateTransactionSuccess() async {
        let (vm, repo, _) = makeViewModel()
        vm.merchant = "Whole Foods"
        vm.totalAmount = "42.50"
        vm.selectedCategory = "Groceries"

        let success = await vm.createTransaction()

        XCTAssertTrue(success)
        XCTAssertEqual(repo.createdTransactions.count, 1)

        let created = repo.createdTransactions.first
        XCTAssertEqual(created?.payee, "Whole Foods")
        XCTAssertEqual(created?.amountMinorUnits, -4250)
        XCTAssertEqual(created?.category, "Groceries")
        XCTAssertEqual(created?.type, .expense)
    }

    @MainActor
    func testCreateTransactionWithInvalidAmount() async {
        let (vm, repo, _) = makeViewModel()
        vm.merchant = "Store"
        vm.totalAmount = "invalid"

        let success = await vm.createTransaction()

        XCTAssertFalse(success)
        XCTAssertTrue(repo.createdTransactions.isEmpty)
        XCTAssertNotNil(vm.errorMessage)
    }

    @MainActor
    func testCreateTransactionRepositoryError() async {
        let (vm, _, _) = makeViewModel(transactionError: TestError.simulated)
        vm.merchant = "Store"
        vm.totalAmount = "10.00"

        let success = await vm.createTransaction()

        XCTAssertFalse(success)
        XCTAssertNotNil(vm.errorMessage)
    }

    @MainActor
    func testResetScan() async {
        let (vm, _, _) = makeViewModel()
        await vm.processImage(Data())

        vm.resetScan()

        switch vm.scanStatus {
        case .idle: break
        default: XCTFail("Status should be .idle after reset")
        }
        XCTAssertNil(vm.scannedReceipt)
        XCTAssertTrue(vm.merchant.isEmpty)
        XCTAssertTrue(vm.totalAmount.isEmpty)
    }

    @MainActor
    func testConfidenceText() async {
        let (vm, _, _) = makeViewModel()
        XCTAssertEqual(vm.confidenceText, "")

        await vm.processImage(Data())
        XCTAssertEqual(vm.confidenceText, "85%")
    }

    @MainActor
    func testDismissError() {
        let (vm, _, _) = makeViewModel()
        vm.errorMessage = "Test error"
        XCTAssertTrue(vm.showError)

        vm.dismissError()
        XCTAssertFalse(vm.showError)
    }
}

// MARK: - Receipt Model Tests

final class ReceiptModelTests: XCTestCase {

    func testExtractedDataIsUsable() {
        let usable = ReceiptExtractedData(
            merchant: "Store",
            totalMinorUnits: 100,
            subtotalMinorUnits: nil,
            taxMinorUnits: nil,
            currencyCode: nil,
            date: nil,
            lineItems: [],
            suggestedCategory: nil
        )
        XCTAssertTrue(usable.isUsable)

        let notUsable = ReceiptExtractedData(
            merchant: nil,
            totalMinorUnits: 100,
            subtotalMinorUnits: nil,
            taxMinorUnits: nil,
            currencyCode: nil,
            date: nil,
            lineItems: [],
            suggestedCategory: nil
        )
        XCTAssertFalse(notUsable.isUsable)
    }

    func testScanStatusIsProcessing() {
        XCTAssertFalse(ReceiptScanStatus.idle.isProcessing)
        XCTAssertTrue(ReceiptScanStatus.processing.isProcessing)
        XCTAssertFalse(ReceiptScanStatus.failed("error").isProcessing)
    }

    func testReceiptScanErrorDescriptions() {
        XCTAssertNotNil(ReceiptScanError.invalidImage.errorDescription)
        XCTAssertNotNil(ReceiptScanError.ocrFailed("test").errorDescription)
        XCTAssertNotNil(ReceiptScanError.cameraUnavailable.errorDescription)
        XCTAssertNotNil(ReceiptScanError.permissionDenied.errorDescription)
    }
}
