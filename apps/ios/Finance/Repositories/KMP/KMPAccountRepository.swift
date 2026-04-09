// SPDX-License-Identifier: BUSL-1.1
// KMPAccountRepository.swift — KMP-backed account repository using LocalDataStore.

import Foundation
import os

/// Account repository backed by the actor-isolated ``LocalDataStore``.
///
/// When the FinanceSync XCFramework is available (`canImport(FinanceSync)`),
/// this will delegate to the KMP data layer. Until then, the local store
/// is seeded from mock data and supports full CRUD operations in-memory.
struct KMPAccountRepository: AccountRepository {
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "KMPAccountRepository"
    )
    private let store: LocalDataStore

    init(store: LocalDataStore = .shared) {
        self.store = store
    }

    func getAccounts() async throws -> [AccountItem] {
        await store.seedIfNeeded()
        return await store.getAccounts()
    }

    func getAllAccounts() async throws -> [AccountItem] {
        await store.seedIfNeeded()
        return await store.getAllAccounts()
    }

    func getAccount(id: String) async throws -> AccountItem? {
        await store.seedIfNeeded()
        return await store.getAccount(id: id)
    }

    func updateAccount(_ account: AccountItem) async throws {
        Self.logger.info("Updating account via KMP bridge")
        await store.upsertAccount(account)
    }

    func archiveAccount(id: String) async throws {
        Self.logger.info("Archiving account via KMP bridge")
        await store.archiveAccount(id: id)
    }

    func unarchiveAccount(id: String) async throws {
        Self.logger.info("Unarchiving account via KMP bridge")
        await store.unarchiveAccount(id: id)
    }

    func deleteAccount(id: String) async throws {
        Self.logger.info("Deleting account via KMP bridge")
        await store.deleteAccount(id: id)
    }

    func deleteAllAccounts() async throws {
        Self.logger.info("Deleting all accounts via KMP bridge")
        await store.deleteAllAccounts()
    }
}
