// SPDX-License-Identifier: BUSL-1.1

// TransactionFilterView.swift
// Finance
//
// A sheet that lets users configure advanced filters for the transactions list.
// Supports date range presets, transaction type toggles, category multi-select,
// and amount range inputs.

import os
import SwiftUI

/// Filter sheet presented from the transactions toolbar.
///
/// All user-facing strings use `String(localized:)`. Every interactive element
/// carries accessibility labels and hints. Text uses Dynamic Type system fonts.
struct TransactionFilterView: View {
    @Binding var filters: TransactionFilters
    let availableCategories: [String]
    @Environment(\.dismiss) private var dismiss

    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "TransactionFilterView"
    )

    var body: some View {
        NavigationStack {
            Form {
                dateRangeSection
                transactionTypeSection
                categorySection
                amountRangeSection
            }
            .navigationTitle(String(localized: "Filter Transactions"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Reset")) {
                        logger.debug("User reset all filters")
                        filters = .default
                    }
                    .accessibilityLabel(String(localized: "Reset filters"))
                    .accessibilityHint(String(localized: "Clears all active filters"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Apply")) {
                        logger.debug("User applied filters, active count: \(filters.activeCount)")
                        dismiss()
                    }
                    .accessibilityLabel(String(localized: "Apply filters"))
                    .accessibilityHint(String(localized: "Applies the selected filters and returns to the transaction list"))
                }
            }
        }
    }

    // MARK: - Date Range Section

    private var dateRangeSection: some View {
        Section {
            ForEach(TransactionFilters.DatePreset.allCases, id: \.self) { preset in
                Button {
                    filters.datePreset = preset
                } label: {
                    HStack {
                        Text(preset.displayName)
                            .font(.body)
                            .foregroundStyle(.primary)
                        Spacer()
                        if filters.datePreset == preset {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.tint)
                                .accessibilityHidden(true)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .frame(minHeight: 44)
                .accessibilityLabel(preset.displayName)
                .accessibilityHint(String(localized: "Sets the date range to \(preset.displayName)"))
                .accessibilityAddTraits(filters.datePreset == preset ? [.isSelected] : [])
            }

            if filters.datePreset == .custom {
                DatePicker(
                    String(localized: "From"),
                    selection: $filters.customStartDate,
                    displayedComponents: .date
                )
                .font(.body)
                .accessibilityLabel(String(localized: "Start date"))
                .accessibilityHint(String(localized: "Select the beginning of the custom date range"))

                DatePicker(
                    String(localized: "To"),
                    selection: $filters.customEndDate,
                    displayedComponents: .date
                )
                .font(.body)
                .accessibilityLabel(String(localized: "End date"))
                .accessibilityHint(String(localized: "Select the end of the custom date range"))
            }
        } header: {
            Text(String(localized: "Date Range"))
        }
    }

    // MARK: - Transaction Type Section

    private var transactionTypeSection: some View {
        Section {
            Toggle(isOn: $filters.includeExpenses) {
                Label(TransactionTypeUI.expense.displayName, systemImage: TransactionTypeUI.expense.systemImage)
                    .font(.body)
            }
            .frame(minHeight: 44)
            .accessibilityLabel(TransactionTypeUI.expense.displayName)
            .accessibilityHint(String(localized: "Toggle to include or exclude expense transactions"))

            Toggle(isOn: $filters.includeIncome) {
                Label(TransactionTypeUI.income.displayName, systemImage: TransactionTypeUI.income.systemImage)
                    .font(.body)
            }
            .frame(minHeight: 44)
            .accessibilityLabel(TransactionTypeUI.income.displayName)
            .accessibilityHint(String(localized: "Toggle to include or exclude income transactions"))

            Toggle(isOn: $filters.includeTransfers) {
                Label(TransactionTypeUI.transfer.displayName, systemImage: TransactionTypeUI.transfer.systemImage)
                    .font(.body)
            }
            .frame(minHeight: 44)
            .accessibilityLabel(TransactionTypeUI.transfer.displayName)
            .accessibilityHint(String(localized: "Toggle to include or exclude transfer transactions"))
        } header: {
            Text(String(localized: "Transaction Type"))
        }
    }

    // MARK: - Category Section

    private var categorySection: some View {
        Section {
            Button {
                filters.selectedCategories = []
            } label: {
                HStack {
                    Text(String(localized: "All Categories"))
                        .font(.body)
                        .foregroundStyle(.primary)
                    Spacer()
                    if filters.selectedCategories.isEmpty {
                        Image(systemName: "checkmark")
                            .foregroundStyle(.tint)
                            .accessibilityHidden(true)
                    }
                }
                .contentShape(Rectangle())
            }
            .frame(minHeight: 44)
            .accessibilityLabel(String(localized: "All Categories"))
            .accessibilityHint(String(localized: "Shows transactions from all categories"))
            .accessibilityAddTraits(filters.selectedCategories.isEmpty ? [.isSelected] : [])

            ForEach(availableCategories, id: \.self) { category in
                Button {
                    if filters.selectedCategories.contains(category) {
                        filters.selectedCategories.remove(category)
                    } else {
                        filters.selectedCategories.insert(category)
                    }
                } label: {
                    HStack {
                        Text(category)
                            .font(.body)
                            .foregroundStyle(.primary)
                        Spacer()
                        if filters.selectedCategories.contains(category) {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.tint)
                                .accessibilityHidden(true)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .frame(minHeight: 44)
                .accessibilityLabel(category)
                .accessibilityHint(String(localized: "Toggle to include or exclude transactions in this category"))
                .accessibilityAddTraits(filters.selectedCategories.contains(category) ? [.isSelected] : [])
            }
        } header: {
            Text(String(localized: "Category"))
        }
    }

    // MARK: - Amount Range Section

    private var amountRangeSection: some View {
        Section {
            HStack {
                Text(String(localized: "Min"))
                    .font(.body)
                TextField(String(localized: "No minimum"), text: $filters.minAmount)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .font(.body)
                    .accessibilityLabel(String(localized: "Minimum amount"))
                    .accessibilityHint(String(localized: "Enter the minimum transaction amount to include"))
            }
            .frame(minHeight: 44)

            HStack {
                Text(String(localized: "Max"))
                    .font(.body)
                TextField(String(localized: "No maximum"), text: $filters.maxAmount)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .font(.body)
                    .accessibilityLabel(String(localized: "Maximum amount"))
                    .accessibilityHint(String(localized: "Enter the maximum transaction amount to include"))
            }
            .frame(minHeight: 44)
        } header: {
            Text(String(localized: "Amount Range"))
        }
    }
}

#Preview {
    TransactionFilterView(
        filters: .constant(.default),
        availableCategories: ["Groceries", "Dining", "Entertainment", "Transport", "Income", "Transfer"]
    )
}
