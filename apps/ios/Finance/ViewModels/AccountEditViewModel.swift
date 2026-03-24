// SPDX-License-Identifier: BUSL-1.1
// AccountEditViewModel.swift — Finance
import Observation; import os; import Foundation

@Observable @MainActor
final class AccountEditViewModel {
    private let repository: AccountRepository
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "AccountEditViewModel")
    let original: AccountItem
    var name: String; var accountType: AccountTypeUI; var notes: String
    var isSaving = false; var isArchiving = false; var showingArchiveConfirmation = false; var showingValidationError = false; var validationMessage = ""; var errorMessage: String?
    var showError: Bool { errorMessage != nil }; func dismissError() { errorMessage = nil }; var isProcessing: Bool { isSaving || isArchiving }
    var hasChanges: Bool { name != original.name || accountType != original.type || notes != (original.notes ?? "") }
    init(repository: AccountRepository, account: AccountItem) { self.repository = repository; self.original = account; self.name = account.name; self.accountType = account.type; self.notes = account.notes ?? "" }
    func save() async -> Bool {
        guard validate() else { return false }; isSaving = true; defer { isSaving = false }
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines); let t = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let updated = AccountItem(id: original.id, name: n, balanceMinorUnits: original.balanceMinorUnits, currencyCode: original.currencyCode, type: accountType, icon: accountType.systemImage, isArchived: original.isArchived, notes: t.isEmpty ? nil : t)
        do { try await repository.updateAccount(updated); Self.logger.info("Account \(self.original.id, privacy: .private) updated"); return true }
        catch { errorMessage = String(localized: "Failed to update account. Please try again."); Self.logger.error("Account update failed: \(error.localizedDescription, privacy: .public)"); return false }
    }
    func archive() async -> Bool {
        isArchiving = true; defer { isArchiving = false }
        do { let ok = try await repository.archiveAccount(id: original.id); if ok { Self.logger.info("Account \(self.original.id, privacy: .private) archived") }; return ok }
        catch { errorMessage = String(localized: "Failed to archive account. Please try again."); Self.logger.error("Account archive failed: \(error.localizedDescription, privacy: .public)"); return false }
    }
    func unarchive() async -> Bool {
        isArchiving = true; defer { isArchiving = false }
        do { let ok = try await repository.unarchiveAccount(id: original.id); if ok { Self.logger.info("Account \(self.original.id, privacy: .private) unarchived") }; return ok }
        catch { errorMessage = String(localized: "Failed to unarchive account. Please try again."); Self.logger.error("Account unarchive failed: \(error.localizedDescription, privacy: .public)"); return false }
    }
    private func validate() -> Bool { if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { validationMessage = String(localized: "Please enter an account name."); showingValidationError = true; return false }; return true }
}
