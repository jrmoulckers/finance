// SPDX-License-Identifier: BUSL-1.1

// TransactionCreateViewModel.swift
// Finance
//
// ViewModel for the multi-step transaction creation sheet. Loads accounts
// from AccountRepository for the picker and saves via TransactionRepository.
// Wired to KMP TransactionValidator for business-rule validation and
// KMP CategorizationEngine for automatic category suggestions.

import Observation
import SwiftUI

@Observable
final class TransactionCreateViewModel {
    private let transactionRepository: TransactionRepository
    private let accountRepository: AccountRepository
    private let transactionValidator: KMPTransactionValidatorProtocol
    private let categorizationEngine: KMPCategorizationEngineProtocol

    /// The transaction being edited, or `nil` for create mode.
    private let editingTransaction: TransactionItem?

    /// Whether this form is editing an existing transaction.
    var isEditing: Bool { editingTransaction != nil }

    var currentStep: Step = .type

    enum Step: Int, CaseIterable {
        case type = 0, details = 1, review = 2
        var title: String {
            switch self {
            case .type: String(localized: "Type")
            case .details: String(localized: "Details")
            case .review: String(localized: "Review")
            }
        }
    }

    var transactionType: TransactionTypeUI = .expense
    var amountText = ""
    var payee = ""
    var selectedAccountId: String?
    var selectedCategoryId: String?
    var date = Date()
    var note = ""
    var currencyCode = "USD"
    var isSaving = false
    var showingValidationError = false
    var validationMessage = ""
    var selectedStatus: TransactionStatusUI = .pending
    var tags: [String] = []
    var moodTag: String?
    var moodTagsEnabled = UserDefaults.standard.bool(forKey: "experimental.moodTags.enabled")
    let moodTagOptions = ["😊", "😐", "😟", "😡", "🤩", "😴"]
    var currentTagText = ""
    var isBnplLiability = false
    var bnplInstallmentCount = "4"

    /// Venmo-style amount: stores raw digit input (no decimals).
    /// e.g. user types "1", "2", "3" → amountCents = 123 → displays "$1.23"
    var amountCents: Int = 0

    /// Category auto-suggested by the KMP CategorizationEngine based on payee.
    var suggestedCategoryId: String?

    var accounts: [PickerOption] = []

    var categories: [PickerOption] = [
        PickerOption(id: "c1", name: "Groceries", icon: "cart"),
        PickerOption(id: "c2", name: "Dining Out", icon: "fork.knife"),
        PickerOption(id: "c3", name: "Transport", icon: "car"),
        PickerOption(id: "c4", name: "Entertainment", icon: "film"),
        PickerOption(id: "c5", name: "Shopping", icon: "bag"),
        PickerOption(id: "c6", name: "Income", icon: "dollarsign.circle"),
    ]

    var canAdvance: Bool {
        switch currentStep {
        case .type: true
        case .details: amountCents > 0 && selectedAccountId != nil && !payee.isEmpty
        case .review: true
        }
    }

    var amountMinorUnits: Int64 { Int64(amountCents) }

    /// Formatted display string for the Venmo-style amount input.
    var formattedAmount: String {
        let dollars = amountCents / 100
        let cents = amountCents % 100
        return String(format: "%d.%02d", dollars, cents)
    }

    /// Appends a digit to the amount (Venmo-style cents-first input).
    func appendAmountDigit(_ digit: Character) {
        guard digit.isNumber else { return }
        let newCents = amountCents * 10 + (Int(String(digit)) ?? 0)
        // Cap at $999,999.99
        guard newCents <= 99_999_999 else { return }
        amountCents = newCents
    }

    /// Removes the last digit from the amount (backspace).
    func removeLastAmountDigit() {
        amountCents = amountCents / 10
    }

    /// Adds the current tag text as a tag.
    func addTag() {
        let trimmed = currentTagText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !tags.contains(trimmed) else {
            currentTagText = ""
            return
        }
        tags.append(trimmed)
        currentTagText = ""
    }

    /// Removes a tag at the specified index.
    func selectMoodTag(_ tag: String) {
        moodTag = moodTag == tag ? nil : tag
    }

    func clearMoodTag() { moodTag = nil }

    func removeTag(at index: Int) {
        guard tags.indices.contains(index) else { return }
        tags.remove(at: index)
    }

    /// Navigation title for the form.
    var navigationTitle: String {
        isEditing ? String(localized: "Edit Transaction") : String(localized: "New Transaction")
    }

    /// Label for the save button on the review step.
    var saveButtonTitle: String {
        isEditing ? String(localized: "Update Transaction") : String(localized: "Save Transaction")
    }

    init(
        transactionRepository: TransactionRepository,
        accountRepository: AccountRepository,
        transaction: TransactionItem? = nil,
        quickEntryAction: String? = nil,
        transactionValidator: KMPTransactionValidatorProtocol = KMPBridge.shared.transactionValidator,
        categorizationEngine: KMPCategorizationEngineProtocol = KMPBridge.shared.categorizationEngine
    ) {
        self.transactionRepository = transactionRepository
        self.accountRepository = accountRepository
        self.editingTransaction = transaction
        self.transactionValidator = transactionValidator
        self.categorizationEngine = categorizationEngine

        if let transaction {
            // Pre-fill fields from the existing transaction
            transactionType = transaction.type
            amountCents = Int(abs(transaction.amountMinorUnits))
            payee = transaction.payee
            date = transaction.date
            currencyCode = transaction.currencyCode
            selectedStatus = transaction.status
            tags = transaction.tagNames
            isBnplLiability = transaction.tagNames.contains(Self.bnplTag)
            bnplInstallmentCount = transaction.tagNames.first(where: { $0.hasPrefix(Self.bnplInstallmentsPrefix) })?
                .replacingOccurrences(of: Self.bnplInstallmentsPrefix, with: "") ?? "4"
            moodTag = transaction.moodTag
            // Category and account IDs are resolved after loadData()
        } else if let quickEntryAction {
            applyQuickEntry(action: quickEntryAction)
        }
    }

    /// Loads accounts for the account picker and resolves edit mode references.
    func loadData() async {
        do {
            let accountItems = try await accountRepository.getAccounts()
            accounts = accountItems.map { PickerOption(id: $0.id, name: $0.name, icon: $0.icon) }
        } catch {
            // Fall back to empty accounts; user will see "Select Account" prompt
            accounts = []
        }

        // Resolve category and account IDs for edit mode
        if let transaction = editingTransaction {
            selectedCategoryId = categories.first { $0.name == transaction.category }?.id
            selectedAccountId = accounts.first { $0.name == transaction.accountName }?.id
        }
    }

    /// Asks the KMP CategorizationEngine for a category suggestion based on
    /// the current payee. Auto-selects the suggestion when no category has
    /// been manually chosen.
    func updateCategorySuggestion() {
        suggestedCategoryId = categorizationEngine.suggest(payee: payee)
        if selectedCategoryId == nil, let suggested = suggestedCategoryId {
            selectedCategoryId = suggested
        }
    }

    /// Configures the form for lock-screen quick entry so the amount keypad is
    /// visible immediately after biometric authentication.
    func applyQuickEntry(action: String?) {
        currentStep = .details
        transactionType = .expense

        switch action {
        case "lunch":
            payee = String(localized: "Lunch")
            selectedCategoryId = "c2"
        case "coffee":
            payee = String(localized: "Coffee")
            selectedCategoryId = "c2"
        case "groceries":
            payee = String(localized: "Groceries")
            selectedCategoryId = "c1"
        case "gas":
            payee = String(localized: "Gas")
            selectedCategoryId = "c3"
        default:
            payee = ""
        }
    }

    func advance() {
        guard let next = Step(rawValue: currentStep.rawValue + 1) else { return }
        currentStep = next
    }

    func goBack() {
        guard let prev = Step(rawValue: currentStep.rawValue - 1) else { return }
        currentStep = prev
    }

    func save() async -> Bool {
        guard validate() else { return false }
        isSaving = true
        defer { isSaving = false }

        let categoryName = categories.first { $0.id == selectedCategoryId }?.name ?? ""
        let accountName = accounts.first { $0.id == selectedAccountId }?.name ?? ""

        let bnplTags = isBnplLiability ? [Self.bnplTag, "\(Self.bnplInstallmentsPrefix)\(bnplInstallmentCount)"] : []
        let persistedTags = tags.filter { $0 != Self.bnplTag && !$0.hasPrefix(Self.bnplInstallmentsPrefix) } + bnplTags

        let transaction = TransactionItem(
            id: editingTransaction?.id ?? UUID().uuidString,
            payee: payee,
            category: categoryName,
            accountName: accountName,
            amountMinorUnits: transactionType == .income ? amountMinorUnits : -amountMinorUnits,
            currencyCode: currencyCode,
            date: date,
            type: transactionType,
            status: selectedStatus,
            tagNames: persistedTags,
            moodTag: moodTagsEnabled ? moodTag : nil
        )

        do {
            if isEditing {
                try await transactionRepository.updateTransaction(transaction)
            } else {
                try await transactionRepository.createTransaction(transaction)
            }

            // Teach the categorization engine this payee → category mapping
            if let categoryId = selectedCategoryId, !payee.isEmpty {
                categorizationEngine.learnFromHistory(payee: payee, categoryId: categoryId)
            }

            return true
        } catch {
            validationMessage = error.localizedDescription
            showingValidationError = true
            return false
        }
    }

    private func validate() -> Bool {
        // Basic client-side validation
        if amountCents <= 0 {
            validationMessage = String(localized: "Please enter a valid amount.")
            showingValidationError = true
            return false
        }
        if payee.isEmpty {
            validationMessage = String(localized: "Please enter a payee.")
            showingValidationError = true
            return false
        }
        if selectedAccountId == nil {
            validationMessage = String(localized: "Please select an account.")
            showingValidationError = true
            return false
        }

        // KMP TransactionValidator for business-rule validation
        let candidate = KMPTransaction(
            id: editingTransaction?.id ?? UUID().uuidString,
            householdId: "default",
            accountId: selectedAccountId ?? "",
            categoryId: selectedCategoryId,
            type: transactionType.toKMP(),
            status: .pending,
            amountMinorUnits: amountMinorUnits,
            currencyCode: currencyCode,
            payee: payee.isEmpty ? nil : payee,
            note: note.isEmpty ? nil : note,
            date: Calendar.current.dateComponents([.year, .month, .day], from: date),
            transferAccountId: nil,
            isRecurring: false,
            tags: tags,
            createdAt: .now,
            updatedAt: .now,
            deletedAt: nil,
            isSynced: false
        )
        let accountIds = Set(accounts.map(\.id))
        let categoryIds = Set(categories.map(\.id))
        let errors = transactionValidator.validate(
            transaction: candidate,
            existingAccountIds: accountIds,
            existingCategoryIds: categoryIds
        )
        if let firstError = errors.first {
            validationMessage = firstError
            showingValidationError = true
            return false
        }

        return true
    }

    // MARK: - Helpers

    private static let bnplTag = "bnpl"
    private static let bnplInstallmentsPrefix = "bnpl-installments:"
}
