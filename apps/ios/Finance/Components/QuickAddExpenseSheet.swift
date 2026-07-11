// SPDX-License-Identifier: BUSL-1.1

// QuickAddExpenseSheet.swift
// Finance
//
// One-thumb quick expense capture. A floating action button on the
// Transactions screen opens this compact sheet: tap a preset (coffee, lunch,
// transit, …), type an amount, and save — with the last-used account and
// category remembered so repeat capture is fast.
//
// Composition + remembered defaults live in the pure, unit-tested
// `QuickExpenseComposer`; this file owns only presentation.
//
// References: #2167

import SwiftUI

// MARK: - Floating Action Button

/// A large, thumb-reachable button that triggers quick expense capture.
struct QuickAddExpenseButton: View {
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "plus")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 60, height: 60)
                .background(Color.accentColor, in: Circle())
                .shadow(radius: 6, y: 3)
        }
        .accessibilityIdentifier("quick_add_fab")
        .accessibilityLabel(String(localized: "Quick add expense"))
        .accessibilityHint(String(localized: "Log an expense in a few taps"))
    }
}

// MARK: - Quick Add Sheet

/// A minimal expense-entry sheet optimised for speed and one-handed use.
struct QuickAddExpenseSheet: View {
    @Environment(\.dismiss) private var dismiss

    private let transactionRepository: TransactionRepository
    private let accountRepository: AccountRepository
    private let categoryRepository: CategoryRepository
    private let onSaved: () -> Void

    @State private var amountText = ""
    @State private var payee = ""
    @State private var accounts: [AccountItem] = []
    @State private var categories: [CategoryItem] = []
    @State private var selectedAccountId: String = ""
    @State private var selectedCategoryId: String = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @FocusState private var amountFocused: Bool

    init(
        transactionRepository: TransactionRepository = RepositoryProvider.shared.transactions,
        accountRepository: AccountRepository = RepositoryProvider.shared.accounts,
        categoryRepository: CategoryRepository = RepositoryProvider.shared.categories,
        onSaved: @escaping () -> Void = {}
    ) {
        self.transactionRepository = transactionRepository
        self.accountRepository = accountRepository
        self.categoryRepository = categoryRepository
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            Form {
                presetsSection
                amountSection
                detailsSection
            }
            .navigationTitle(String(localized: "Quick Expense"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Save")) {
                        Task { await save() }
                    }
                    .disabled(!canSave || isSaving)
                    .accessibilityIdentifier("quick_add_save")
                }
            }
            .task { await load() }
            .alert(
                String(localized: "Couldn't Save"),
                isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
            ) {
                Button(String(localized: "OK"), role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: - Sections

    private var presetsSection: some View {
        Section {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(QuickExpenseComposer.presets) { preset in
                        presetChip(preset)
                    }
                }
                .padding(.vertical, 4)
            }
        } header: {
            Text(String(localized: "Quick Picks"))
        }
    }

    private func presetChip(_ preset: QuickExpensePreset) -> some View {
        Button {
            apply(preset)
        } label: {
            VStack(spacing: 6) {
                Image(systemName: preset.systemImage)
                    .font(.title3)
                Text(preset.label)
                    .font(.caption)
            }
            .frame(width: 70, height: 60)
            .background(Color.accentColor.opacity(selectedCategoryId == preset.categoryId ? 0.2 : 0.08), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(preset.label)
        .accessibilityHint(String(localized: "Fills the category and payee, then enter an amount"))
    }

    private var amountSection: some View {
        Section {
            TextField(String(localized: "0.00"), text: $amountText)
                .keyboardType(.decimalPad)
                .font(.largeTitle.bold())
                .focused($amountFocused)
                .accessibilityLabel(String(localized: "Amount"))
                .accessibilityHint(String(localized: "Enter the expense amount"))
        } header: {
            Text(String(localized: "Amount"))
        }
    }

    private var detailsSection: some View {
        Section {
            TextField(String(localized: "Payee (optional)"), text: $payee)
                .accessibilityLabel(String(localized: "Payee"))

            Picker(String(localized: "Category"), selection: $selectedCategoryId) {
                ForEach(categories) { category in
                    Text(category.name).tag(category.id)
                }
            }
            .accessibilityLabel(String(localized: "Category"))

            Picker(String(localized: "Account"), selection: $selectedAccountId) {
                ForEach(accounts) { account in
                    Text(account.name).tag(account.id)
                }
            }
            .accessibilityLabel(String(localized: "Account"))
        }
    }

    // MARK: - Logic

    private var parsedMinorUnits: Int64? {
        let trimmed = amountText.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, let value = Decimal(string: trimmed) else { return nil }
        let cents = NSDecimalNumber(decimal: value * 100).int64Value
        return cents > 0 ? cents : nil
    }

    private var canSave: Bool {
        parsedMinorUnits != nil && !selectedAccountId.isEmpty && !selectedCategoryId.isEmpty
    }

    private func apply(_ preset: QuickExpensePreset) {
        payee = preset.defaultPayee
        if categories.contains(where: { $0.id == preset.categoryId }) {
            selectedCategoryId = preset.categoryId
        }
        amountFocused = true
    }

    private func load() async {
        do {
            async let loadedAccounts = accountRepository.getAccounts()
            async let loadedCategories = categoryRepository.getCategories()
            accounts = try await loadedAccounts
            categories = try await loadedCategories

            selectedAccountId = QuickExpenseComposer.lastAccountId().flatMap { id in
                accounts.contains(where: { $0.id == id }) ? id : nil
            } ?? accounts.first?.id ?? ""

            selectedCategoryId = QuickExpenseComposer.lastCategoryId().flatMap { id in
                categories.contains(where: { $0.id == id }) ? id : nil
            } ?? categories.first?.id ?? ""

            amountFocused = true
        } catch {
            errorMessage = String(localized: "Couldn't load your accounts and categories.")
        }
    }

    private func save() async {
        guard let minorUnits = parsedMinorUnits,
              let account = accounts.first(where: { $0.id == selectedAccountId }),
              let category = categories.first(where: { $0.id == selectedCategoryId }) else {
            return
        }
        isSaving = true
        defer { isSaving = false }

        let transaction = QuickExpenseComposer.makeTransaction(
            amountMinorUnits: minorUnits,
            payee: payee,
            categoryName: category.name,
            accountName: account.name,
            currencyCode: account.currencyCode
        )

        do {
            try await transactionRepository.createTransaction(transaction)
            QuickExpenseComposer.setLastAccountId(account.id)
            QuickExpenseComposer.setLastCategoryId(category.id)
            onSaved()
            dismiss()
        } catch {
            errorMessage = String(localized: "Couldn't save the expense. Please try again.")
        }
    }
}
