// SPDX-License-Identifier: BUSL-1.1

// GoalCreateView.swift
// Finance
//
// SwiftUI form for creating or editing a financial goal. Supports
// name, target amount, current amount, optional target date,
// and optional description/notes.

import SwiftUI

// MARK: - View

struct GoalCreateView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: GoalCreateViewModel

    init(viewModel: GoalCreateViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Form {
                nameSection
                targetAmountSection
                currentAmountSection
                targetDateSection
                notesSection
            }
            .navigationTitle(viewModel.navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                        .accessibilityLabel(String(localized: "Cancel"))
                        .accessibilityHint(String(localized: "Dismisses the goal form without saving"))
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
                    .accessibilityHint(String(localized: "Saves the goal and closes the form"))
                }
            }
            .alert(String(localized: "Validation Error"), isPresented: $viewModel.showingValidationError) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(viewModel.validationMessage)
            }
        }
    }

    // MARK: - Name Section

    private var nameSection: some View {
        Section {
            TextField(String(localized: "Goal name"), text: $viewModel.name)
                .accessibilityIdentifier("goal_name_field")
                .accessibilityLabel(String(localized: "Goal name"))
                .accessibilityHint(String(localized: "Enter a name for your financial goal"))
        } header: {
            Text(String(localized: "Name"))
        }
    }

    // MARK: - Target Amount Section

    private var targetAmountSection: some View {
        Section {
            HStack {
                Text(currencySymbol)
                    .font(.title2)
                    .foregroundStyle(.secondary)
                TextField(String(localized: "0.00"), text: $viewModel.targetAmountText)
                    .font(.title2)
                    .keyboardType(.decimalPad)
                    .accessibilityIdentifier("goal_target_amount_field")
                    .accessibilityLabel(String(localized: "Target amount"))
                    .accessibilityHint(String(localized: "Enter the target amount in dollars"))
            }
        } header: {
            Text(String(localized: "Target Amount"))
        }
    }

    // MARK: - Current Amount Section

    private var currentAmountSection: some View {
        Section {
            HStack {
                Text(currencySymbol)
                    .font(.title2)
                    .foregroundStyle(.secondary)
                TextField(String(localized: "0.00"), text: $viewModel.currentAmountText)
                    .font(.title2)
                    .keyboardType(.decimalPad)
                    .accessibilityLabel(String(localized: "Current amount"))
                    .accessibilityHint(String(localized: "Enter the amount already saved toward this goal"))
            }
        } header: {
            Text(String(localized: "Current Amount"))
        } footer: {
            Text(String(localized: "How much you have saved so far toward this goal."))
        }
    }

    // MARK: - Target Date Section

    private var targetDateSection: some View {
        Section {
            Toggle(String(localized: "Set target date"), isOn: $viewModel.hasTargetDate)
                .accessibilityLabel(String(localized: "Set target date"))
                .accessibilityHint(String(localized: "Toggle to set a deadline for this goal"))

            if viewModel.hasTargetDate {
                DatePicker(
                    String(localized: "Target Date"),
                    selection: $viewModel.targetDate,
                    in: Date.now...,
                    displayedComponents: .date
                )
                .accessibilityLabel(String(localized: "Target date"))
                .accessibilityHint(String(localized: "Select the date by which you want to reach this goal"))
            }
        } header: {
            Text(String(localized: "Target Date"))
        }
    }

    // MARK: - Notes Section

    private var notesSection: some View {
        Section {
            TextField(String(localized: "Add a description..."), text: $viewModel.notes, axis: .vertical)
                .lineLimit(3)
                .accessibilityLabel(String(localized: "Description"))
                .accessibilityHint(String(localized: "Optional description for this goal"))
        } header: {
            Text(String(localized: "Description (optional)"))
        }
    }

    // MARK: - Helpers

    private var currencySymbol: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.currencySymbol ?? "$"
    }
}

#Preview("Create") {
    GoalCreateView(viewModel: GoalCreateViewModel(
        repository: MockGoalRepository()
    ))
}

#Preview("Edit") {
    GoalCreateView(viewModel: GoalCreateViewModel(
        repository: MockGoalRepository(),
        goal: GoalItem(
            id: "g1", name: "Emergency Fund",
            currentMinorUnits: 7_500_00, targetMinorUnits: 10_000_00,
            currencyCode: "USD",
            targetDate: Calendar.current.date(byAdding: .month, value: 6, to: .now),
            notes: "6 months of expenses",
            status: .active, icon: "shield", color: .blue
        )
    ))
}
