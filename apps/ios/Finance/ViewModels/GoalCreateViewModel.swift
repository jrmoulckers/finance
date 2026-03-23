// SPDX-License-Identifier: BUSL-1.1

// GoalCreateViewModel.swift
// Finance
//
// ViewModel for creating and editing financial goals. Validates user input,
// supports edit mode via an optional GoalItem, and saves via GoalRepository.

import Observation
import Foundation
import SwiftUI
import os

@Observable
@MainActor
final class GoalCreateViewModel {
    private let repository: GoalRepository
    private let logger = Logger(subsystem: "com.finance.app", category: "GoalCreateViewModel")

    /// The goal being edited, or `nil` for create mode.
    private let editingGoal: GoalItem?

    /// Whether this form is editing an existing goal.
    var isEditing: Bool { editingGoal != nil }

    // MARK: - Form Fields

    var name = ""
    var targetAmountText = ""
    var currentAmountText = ""
    var hasTargetDate = false
    var targetDate = Calendar.current.date(byAdding: .month, value: 6, to: .now) ?? .now
    var notes = ""

    // MARK: - State

    var isSaving = false
    var showingValidationError = false
    var validationMessage = ""
    var didSave = false

    /// The target amount converted to minor units (cents).
    var targetAmountMinorUnits: Int64 { Int64((Double(targetAmountText) ?? 0) * 100) }

    /// The current amount converted to minor units (cents).
    var currentAmountMinorUnits: Int64 { Int64((Double(currentAmountText) ?? 0) * 100) }

    /// Navigation title for the form.
    var navigationTitle: String {
        isEditing ? String(localized: "Edit Goal") : String(localized: "Create Goal")
    }

    /// Label for the primary action button.
    var saveButtonTitle: String {
        isEditing ? String(localized: "Update") : String(localized: "Save")
    }

    // MARK: - Init

    init(repository: GoalRepository, goal: GoalItem? = nil) {
        self.repository = repository
        self.editingGoal = goal

        if let goal {
            // Pre-fill fields from the existing goal
            name = goal.name
            targetAmountText = Self.formatAmountForEditing(goal.targetMinorUnits)
            currentAmountText = Self.formatAmountForEditing(goal.currentMinorUnits)
            notes = goal.notes
            if let date = goal.targetDate {
                hasTargetDate = true
                targetDate = date
            }
        }
    }

    // MARK: - Actions

    func save() async -> Bool {
        guard validate() else { return false }
        isSaving = true
        defer { isSaving = false }

        let goal = GoalItem(
            id: editingGoal?.id ?? UUID().uuidString,
            name: name,
            currentMinorUnits: currentAmountMinorUnits,
            targetMinorUnits: targetAmountMinorUnits,
            currencyCode: "USD",
            targetDate: hasTargetDate ? targetDate : nil,
            notes: notes,
            status: editingGoal?.status ?? .active,
            icon: editingGoal?.icon ?? "target",
            color: editingGoal?.color ?? .blue
        )

        do {
            if isEditing {
                try await repository.updateGoal(goal)
                logger.info("Goal updated: \(goal.id, privacy: .private)")
            } else {
                try await repository.createGoal(goal)
                logger.info("Goal created: \(goal.id, privacy: .private)")
            }
            didSave = true
            return true
        } catch {
            logger.error("Failed to save goal: \(error.localizedDescription, privacy: .public)")
            validationMessage = error.localizedDescription
            showingValidationError = true
            return false
        }
    }

    // MARK: - Validation

    private func validate() -> Bool {
        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            validationMessage = String(localized: "Please enter a goal name.")
            showingValidationError = true
            return false
        }
        if targetAmountText.isEmpty || (Double(targetAmountText) ?? 0) <= 0 {
            validationMessage = String(localized: "Please enter a valid target amount greater than zero.")
            showingValidationError = true
            return false
        }
        if (Double(currentAmountText) ?? 0) < 0 {
            validationMessage = String(localized: "Current amount cannot be negative.")
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
