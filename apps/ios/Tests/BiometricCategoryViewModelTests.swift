// SPDX-License-Identifier: BUSL-1.1

// BiometricCategoryViewModelTests.swift
// FinanceTests
//
// Unit tests for BiometricCategoryViewModel and ProtectedCategoryService.
//
// References: #295

import Foundation
import SwiftUI
import Testing
@testable import FinanceApp

// MARK: - Stub Protected Category Service

final class StubProtectedCategoryService: ProtectedCategoryProviding, @unchecked Sendable {
    var protectedSet: Set<String> = []
    var errorToThrow: Error?

    func isProtected(categoryId: String) -> Bool {
        protectedSet.contains(categoryId)
    }

    func protectedCategoryIds() -> Set<String> {
        protectedSet
    }

    func protectCategory(id: String) throws {
        if let error = errorToThrow { throw error }
        protectedSet.insert(id)
    }

    func unprotectCategory(id: String) throws {
        if let error = errorToThrow { throw error }
        protectedSet.remove(id)
    }

    func clearAll() throws {
        if let error = errorToThrow { throw error }
        protectedSet.removeAll()
    }
}

// MARK: - BiometricCategoryViewModel Tests

@Suite("BiometricCategoryViewModel Tests")
struct BiometricCategoryViewModelTests {

    private func makeViewModel(
        protectedIds: Set<String> = [],
        biometricAvailable: Bool = true,
        biometricError: BiometricError? = nil
    ) -> (BiometricCategoryViewModel, StubProtectedCategoryService) {
        let protectedService = StubProtectedCategoryService()
        protectedService.protectedSet = protectedIds

        let biometricManager = StubBiometricAuthManager()
        biometricManager.canAuthenticateResult = biometricAvailable
        biometricManager.errorToThrow = biometricError

        let categoryRepo = StubCategoryRepository()
        categoryRepo.categoriesToReturn = SampleData.allCategories

        let vm = BiometricCategoryViewModel(
            protectedService: protectedService,
            biometricManager: biometricManager,
            categoryRepository: categoryRepo,
            transactionRepository: StubTransactionRepository()
        )
        return (vm, protectedService)
    }

    @Test("Loads categories and protected state")
    @MainActor
    func loadsCategories() async {
        let (vm, _) = makeViewModel(protectedIds: ["cat1"])

        await vm.loadCategories()

        #expect(vm.categories.count == 3)
        #expect(vm.protectedIds.contains("cat1"))
        #expect(vm.isBiometricAvailable)
    }

    @Test("Protects a category")
    @MainActor
    func protectsCategory() async {
        let (vm, service) = makeViewModel()

        await vm.loadCategories()
        await vm.toggleProtection(for: "cat1")

        #expect(vm.protectedIds.contains("cat1"))
        #expect(service.protectedSet.contains("cat1"))
    }

    @Test("Unprotects with authentication")
    @MainActor
    func unprotectsWithAuth() async {
        let (vm, service) = makeViewModel(protectedIds: ["cat1"])

        await vm.loadCategories()
        await vm.toggleProtection(for: "cat1")

        #expect(!vm.protectedIds.contains("cat1"))
        #expect(!service.protectedSet.contains("cat1"))
    }

    @Test("Unprotect fails on auth failure")
    @MainActor
    func unprotectFailsOnAuthFailure() async {
        let (vm, service) = makeViewModel(
            protectedIds: ["cat1"],
            biometricError: .authenticationFailed(underlying: NSError(domain: "", code: -1))
        )

        await vm.loadCategories()
        await vm.toggleProtection(for: "cat1")

        // Should remain protected
        #expect(vm.protectedIds.contains("cat1"))
        #expect(service.protectedSet.contains("cat1"))
        #expect(vm.errorMessage != nil)
    }

    @Test("Unlock grants session access")
    @MainActor
    func unlockGrantsAccess() async {
        let (vm, _) = makeViewModel(protectedIds: ["cat1"])

        await vm.loadCategories()

        #expect(!vm.isVisible(categoryId: "cat1"))

        let result = await vm.unlockCategory("cat1")

        #expect(result == true)
        #expect(vm.isVisible(categoryId: "cat1"))
        #expect(vm.unlockedIds.contains("cat1"))
    }

    @Test("Relock clears session unlocks")
    @MainActor
    func relockClearsSession() async {
        let (vm, _) = makeViewModel(protectedIds: ["cat1"])

        await vm.loadCategories()
        _ = await vm.unlockCategory("cat1")
        #expect(vm.isVisible(categoryId: "cat1"))

        vm.relockAll()

        #expect(!vm.isVisible(categoryId: "cat1"))
        #expect(vm.unlockedIds.isEmpty)
    }

    @Test("Biometric unavailable detected")
    @MainActor
    func biometricUnavailable() async {
        let (vm, _) = makeViewModel(biometricAvailable: false)

        await vm.loadCategories()

        #expect(!vm.isBiometricAvailable)
    }

    @Test("Non-protected categories always visible")
    @MainActor
    func nonProtectedAlwaysVisible() async {
        let (vm, _) = makeViewModel(protectedIds: ["cat1"])

        await vm.loadCategories()

        #expect(vm.isVisible(categoryId: "cat2"))
        #expect(vm.isVisible(categoryId: "cat3"))
    }
}

// MARK: - ProtectedCategoryService Integration Tests

@Suite("ProtectedCategoryService Tests")
struct ProtectedCategoryServiceTests {

    // Note: These use a stub keychain since real Keychain is unavailable in tests.
    @Test("Stub service round-trips correctly")
    func stubRoundTrips() throws {
        let service = StubProtectedCategoryService()

        #expect(service.protectedCategoryIds().isEmpty)

        try service.protectCategory(id: "cat1")
        #expect(service.isProtected(categoryId: "cat1"))

        try service.unprotectCategory(id: "cat1")
        #expect(!service.isProtected(categoryId: "cat1"))
    }

    @Test("Clear all removes everything")
    func clearAllRemovesEverything() throws {
        let service = StubProtectedCategoryService()
        try service.protectCategory(id: "cat1")
        try service.protectCategory(id: "cat2")

        try service.clearAll()
        #expect(service.protectedCategoryIds().isEmpty)
    }
}
