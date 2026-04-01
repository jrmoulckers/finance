// SPDX-License-Identifier: BUSL-1.1

// BudgetCreateViewModel.swift
// Finance
//
// ViewModel for creating and editing budgets. Validates user input,
// supports edit mode via an optional BudgetItem, and saves via
// BudgetRepository.

import Observation
import Foundation
import os

@Observable
final class BudgetCreateViewModel {
    private let repository: BudgetRepository
    private let logger = Logger(subsystem: "com.finance.app", category: "BudgetCreateViewModel")

    /// The budget being edited, or `nil` for create mode.
    private let editingBudget: BudgetItem?

    /// Whether this form is editing an existing budget.
    var isEditing: Bool { editingBudget != nil }

    // MARK: - Form Fields

    var selectedCategoryId: String?
    var amountText = ""
    var selectedPeriod: BudgetPeriod = .monthly

    // MARK: - State

    var isSaving = false
    var showingValidationError = false
    var validationMessage = ""
    var didSave = false

    /// Available budget categories for the picker.
    let categories: [PickerOption] = [
        PickerOption(id: "c1", name: "Groceries", icon: "cart"),
        PickerOption(id: "c2", name: "Dining Out", icon: "fork.knife"),
        PickerOption(id: "c3", name: "Transport", icon: "car"),
        PickerOption(id: "c4", name: "Entertainment", icon: "film"),
        PickerOption(id: "c5", name: "Shopping", icon: "bag"),
        PickerOption(id: "c6", name: "Utilities", icon: "bolt"),
        PickerOption(id: "c7", name: "Health", icon: "heart"),
        PickerOption(id: "c8", name: "Housing", icon: "house"),
    ]

    /// The amount converted to minor units (cents).
    var amountMinorUnits: Int64 { Int64((Double(amountText) ?? 0) * 100) }

    /// Navigation title for the form.
    var navigationTitle: String {
        isEditing ? String(localized: "Edit Budget") : String(localized: "Create Budget")
    }

    /// Label for the primary action button.
    var saveButtonTitle: String {
        isEditing ? String(localized: "Update") : String(localized: "Save")
    }

    // MARK: - Init

    init(repository: BudgetRepository, budget: BudgetItem? = nil) {
        self.repository = repository
        self.editingBudget = budget

        if let budget {
            // Pre-fill fields from the existing budget
            selectedCategoryId = categories.first { $0.name == budget.categoryName }?.id
            amountText = Self.formatAmountForEditing(budget.limitMinorUnits)
            selectedPeriod = BudgetPeriod(rawValue: budget.period) ?? .monthly
        }
    }

    // MARK: - Actions

    func save() async -> Bool {
        guard validate() else { return false }
        isSaving = true
        defer { isSaving = false }

        let category = categories.first { $0.id == selectedCategoryId }
        let categoryName = category?.name ?? ""
        let categoryIcon = category?.icon ?? "questionmark.circle"

        let budget = BudgetItem(
            id: editingBudget?.id ?? UUID().uuidString,
            name: categoryName,
            categoryName: categoryName,
            spentMinorUnits: editingBudget?.spentMinorUnits ?? 0,
            limitMinorUnits: amountMinorUnits,
            currencyCode: "USD",
            period: selectedPeriod.rawValue,
            icon: categoryIcon
        )

        do {
            if isEditing {
                try await repository.updateBudget(budget)
                logger.info("Budget updated: \(budget.id, privacy: .private)")
            } else {
                try await repository.createBudget(budget)
                logger.info("Budget created: \(budget.id, privacy: .private)")
            }
            didSave = true
            return true
        } catch {
            logger.error("Failed to save budget: \(error.localizedDescription, privacy: .public)")
            validationMessage = error.localizedDescription
            showingValidationError = true
            return false
        }
    }

    // MARK: - Validation

    private func validate() -> Bool {
        if selectedCategoryId == nil {
            validationMessage = String(localized: "Please select a category.")
            showingValidationError = true
            return false
        }
        if amountText.isEmpty || (Double(amountText) ?? 0) <= 0 {
            validationMessage = String(localized: "Please enter a valid amount greater than zero.")
            showingValidationError = true
            return false
        }
        return true
    }

    // MARK: - Helpers

    /// Formats minor units to a decimal string for editing (e.g., 50000 → "500.00").
    private static func formatAmountForEditing(_ minorUnits: Int64) -> String {
        let value = Double(minorUnits) / 100.0
        return String(format: "%.2f", value)
    }
}

// MARK: - Budget Period

/// Supported budget recurrence periods.
enum BudgetPeriod: String, CaseIterable, Identifiable, Sendable {
    case weekly = "Weekly"
    case biweekly = "Biweekly"
    case monthly = "Monthly"
    case quarterly = "Quarterly"
    case yearly = "Yearly"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .weekly: String(localized: "Weekly")
        case .biweekly: String(localized: "Biweekly")
        case .monthly: String(localized: "Monthly")
        case .quarterly: String(localized: "Quarterly")
        case .yearly: String(localized: "Yearly")
        }
    }
}
