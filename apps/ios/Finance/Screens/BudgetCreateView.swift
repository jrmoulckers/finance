// SPDX-License-Identifier: BUSL-1.1

// BudgetCreateView.swift
// Finance
//
// SwiftUI form for creating or editing a budget. Supports category
// selection, currency-formatted amount input, and period selection.

import SwiftUI

// MARK: - View

struct BudgetCreateView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: BudgetCreateViewModel

    init(viewModel: BudgetCreateViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Form {
                categorySection
                amountSection
                currencySection
                periodSection
            }
            .navigationTitle(viewModel.navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                        .accessibilityLabel(String(localized: "Cancel"))
                        .accessibilityHint(String(localized: "Dismisses the budget form without saving"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            if await viewModel.save() { dismiss() }
                        }
                    } label: {
                        if viewModel.isSaving {
                            ProgressView()
                        } else {
                            Text(viewModel.saveButtonTitle)
                        }
                    }
                    .disabled(viewModel.isSaving)
                    .accessibilityLabel(viewModel.saveButtonTitle)
                    .accessibilityHint(String(localized: "Saves the budget and closes the form"))
                }
            }
            .alert(String(localized: "Validation Error"), isPresented: $viewModel.showingValidationError) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(viewModel.validationMessage)
            }
        }
    }

    // MARK: - Category Section

    private var categorySection: some View {
        Section {
            Picker(String(localized: "Category"), selection: $viewModel.selectedCategoryId) {
                Text(String(localized: "Select Category")).tag(nil as String?)
                ForEach(viewModel.categories) { category in
                    Label(category.name, systemImage: category.icon)
                        .tag(category.id as String?)
                }
            }
            .accessibilityLabel(String(localized: "Category"))
            .accessibilityHint(String(localized: "Select a spending category for this budget"))
        } header: {
            Text(String(localized: "Category"))
        }
    }

    // MARK: - Amount Section

    private var amountSection: some View {
        Section {
            HStack {
                Text(viewModel.currencySymbol)
                    .font(.title2)
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                TextField(String(localized: "0.00"), text: $viewModel.amountText)
                    .font(.title2)
                    .keyboardType(.decimalPad)
                    .accessibilityIdentifier("budget_amount_field")
                    .accessibilityLabel(String(localized: "Budget amount"))
                    .accessibilityHint(
                        String(localized: "Enter the budget limit in \(viewModel.currencyCode)")
                    )
            }
        } header: {
            Text(String(localized: "Amount"))
        }
    }

    // MARK: - Currency Section

    private var currencySection: some View {
        Section {
            Picker(String(localized: "Currency"), selection: $viewModel.currencyCode) {
                ForEach(viewModel.availableCurrencyCodes, id: \.self) { code in
                    Text(CurrencyPreferences.pickerLabel(for: code)).tag(code)
                }
            }
            .pickerStyle(.menu)
            .accessibilityLabel(String(localized: "Budget currency"))
            .accessibilityHint(
                String(localized: "Choose the currency this budget limit is entered in")
            )
        } header: {
            Text(String(localized: "Currency"))
        } footer: {
            Text(
                String(localized: "Budgets in a currency other than your display currency are converted for dashboard roll-ups.")
            )
        }
    }

    // MARK: - Period Section

    private var periodSection: some View {
        Section {
            Picker(String(localized: "Period"), selection: $viewModel.selectedPeriod) {
                ForEach(BudgetPeriod.allCases) { period in
                    Text(period.displayName).tag(period)
                }
            }
            .pickerStyle(.menu)
            .accessibilityLabel(String(localized: "Budget period"))
            .accessibilityHint(String(localized: "Select how often this budget resets"))
        } header: {
            Text(String(localized: "Period"))
        }
    }
}

#Preview("Create") {
    BudgetCreateView(viewModel: BudgetCreateViewModel(
        repository: MockBudgetRepository()
    ))
}

#Preview("Edit") {
    BudgetCreateView(viewModel: BudgetCreateViewModel(
        repository: MockBudgetRepository(),
        budget: BudgetItem(
            id: "b1", name: "Groceries", categoryName: "Groceries",
            spentMinorUnits: 320_00, limitMinorUnits: 500_00,
            currencyCode: "USD", period: "Monthly", icon: "cart"
        )
    ))
}
