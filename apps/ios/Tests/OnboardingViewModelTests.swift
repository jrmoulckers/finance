// SPDX-License-Identifier: BUSL-1.1

// OnboardingViewModelTests.swift
// FinanceTests
//
// Tests for OnboardingViewModel — page navigation, completion flag,
// skip behavior, and biometric opt-in persistence.
// Refs #476

import XCTest
@testable import FinanceApp

final class OnboardingViewModelTests: XCTestCase {

    // MARK: - Setup / Teardown

    /// Clears onboarding-related UserDefaults before each test to
    /// ensure a clean slate.
    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: "hasCompletedOnboarding")
        UserDefaults.standard.removeObject(
            forKey: BiometricAuthManager.appLockEnabledKey
        )
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: "hasCompletedOnboarding")
        UserDefaults.standard.removeObject(
            forKey: BiometricAuthManager.appLockEnabledKey
        )
        super.tearDown()
    }

    // MARK: - Test: Initial state

    @MainActor
    func testInitialState() {
        let vm = OnboardingViewModel()

        XCTAssertEqual(vm.currentPage, 0,
                       "Should start on the first page (index 0)")
        XCTAssertEqual(vm.totalPages, 4,
                       "Should have exactly 4 onboarding pages")
        XCTAssertFalse(vm.biometricOptIn,
                       "Biometric opt-in should default to false")
        XCTAssertFalse(vm.hasCompletedOnboarding,
                       "Onboarding should not be completed initially")
    }

    // MARK: - Test: nextPage increments

    @MainActor
    func testNextPageIncrements() {
        let vm = OnboardingViewModel()

        vm.nextPage()
        XCTAssertEqual(vm.currentPage, 1,
                       "nextPage should advance from 0 to 1")

        vm.nextPage()
        XCTAssertEqual(vm.currentPage, 2,
                       "nextPage should advance from 1 to 2")

        vm.nextPage()
        XCTAssertEqual(vm.currentPage, 3,
                       "nextPage should advance from 2 to 3")
    }

    // MARK: - Test: nextPage does not exceed total

    @MainActor
    func testNextPageDoesNotExceedTotal() {
        let vm = OnboardingViewModel()

        // Advance to the last page
        for _ in 0..<vm.totalPages - 1 {
            vm.nextPage()
        }
        XCTAssertEqual(vm.currentPage, vm.totalPages - 1,
                       "Should be on the last page")

        // Try to go beyond the last page
        vm.nextPage()
        XCTAssertEqual(vm.currentPage, vm.totalPages - 1,
                       "nextPage should not go beyond the last page")

        // Try again
        vm.nextPage()
        XCTAssertEqual(vm.currentPage, vm.totalPages - 1,
                       "nextPage should still not exceed the last page")
    }

    // MARK: - Test: completeOnboarding sets flag

    @MainActor
    func testCompleteOnboardingSetsFlag() {
        let vm = OnboardingViewModel()

        XCTAssertFalse(vm.hasCompletedOnboarding,
                       "Should not be completed before calling completeOnboarding")

        vm.completeOnboarding()

        XCTAssertTrue(vm.hasCompletedOnboarding,
                      "hasCompletedOnboarding should be true after completion")
        XCTAssertTrue(
            UserDefaults.standard.bool(forKey: "hasCompletedOnboarding"),
            "UserDefaults flag should be persisted"
        )
    }

    // MARK: - Test: skip sets flag

    @MainActor
    func testSkipSetsFlag() {
        let vm = OnboardingViewModel()

        XCTAssertFalse(vm.hasCompletedOnboarding,
                       "Should not be completed before calling skip")

        vm.skip()

        XCTAssertTrue(vm.hasCompletedOnboarding,
                      "hasCompletedOnboarding should be true after skip")
        XCTAssertTrue(
            UserDefaults.standard.bool(forKey: "hasCompletedOnboarding"),
            "UserDefaults flag should be persisted after skip"
        )
    }

    // MARK: - Test: biometric opt-in saves preference on complete

    @MainActor
    func testBiometricOptInSavesPreference() {
        let vm = OnboardingViewModel()
        vm.biometricOptIn = true

        vm.completeOnboarding()

        XCTAssertTrue(
            UserDefaults.standard.bool(
                forKey: BiometricAuthManager.appLockEnabledKey
            ),
            "Biometric app lock key should be true when user opted in"
        )
    }

    // MARK: - Test: biometric opt-out does not save preference

    @MainActor
    func testBiometricOptOutDoesNotSavePreference() {
        let vm = OnboardingViewModel()
        vm.biometricOptIn = false

        vm.completeOnboarding()

        XCTAssertFalse(
            UserDefaults.standard.bool(
                forKey: BiometricAuthManager.appLockEnabledKey
            ),
            "Biometric app lock key should remain false when user did not opt in"
        )
    }

    // MARK: - Test: skip does not save biometric preference

    @MainActor
    func testSkipDoesNotSaveBiometricPreference() {
        let vm = OnboardingViewModel()
        vm.biometricOptIn = true

        vm.skip()

        XCTAssertFalse(
            UserDefaults.standard.bool(
                forKey: BiometricAuthManager.appLockEnabledKey
            ),
            "Biometric preference should not be saved when skipping onboarding"
        )
    }

    // MARK: - Test: nextPage from page 0 does not complete

    @MainActor
    func testNextPageDoesNotComplete() {
        let vm = OnboardingViewModel()

        vm.nextPage()

        XCTAssertFalse(vm.hasCompletedOnboarding,
                       "nextPage should not mark onboarding as completed")
    }

    // MARK: - Test: multiple completeOnboarding calls are idempotent

    @MainActor
    func testCompleteOnboardingIdempotent() {
        let vm = OnboardingViewModel()

        vm.completeOnboarding()
        vm.completeOnboarding()

        XCTAssertTrue(vm.hasCompletedOnboarding,
                      "Should remain completed after multiple calls")
        XCTAssertTrue(
            UserDefaults.standard.bool(forKey: "hasCompletedOnboarding"),
            "UserDefaults flag should still be true"
        )
    }
}
