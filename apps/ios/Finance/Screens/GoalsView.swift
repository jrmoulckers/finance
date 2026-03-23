// SPDX-License-Identifier: BUSL-1.1

// GoalsView.swift
// Finance
//
// Goal cards with progress bars, target amounts, and status indicators.

import SwiftUI

// MARK: - View

struct GoalsView: View {
    @State private var viewModel: GoalsViewModel

    init(viewModel: GoalsViewModel = GoalsViewModel(repository: KMPGoalRepository())) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.goals.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel(String(localized: "Loading"))
                } else {
                    ScrollView {
                        if viewModel.goals.isEmpty && !viewModel.isLoading {
                            EmptyStateView(
                                systemImage: "target",
                                title: String(localized: "No Goals"),
                                message: String(localized: "Set a financial goal to start saving toward something meaningful."),
                                actionLabel: String(localized: "Create Goal"),
                                action: { viewModel.showingCreateGoal = true }
                            )
                        } else {
                            goalCards
                        }
                    }
                }
            }
            .navigationTitle(String(localized: "Goals"))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { viewModel.showingCreateGoal = true } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel(String(localized: "Create goal"))
                    .accessibilityHint(String(localized: "Opens a form to create a new financial goal"))
                }
            }
            .sheet(isPresented: $viewModel.showingCreateGoal, onDismiss: {
                Task { await viewModel.loadGoals() }
            }) {
                GoalCreateView(viewModel: GoalCreateViewModel(
                    repository: viewModel.repository
                ))
            }
            .sheet(item: $viewModel.editingGoal, onDismiss: {
                Task { await viewModel.loadGoals() }
            }) { goal in
                GoalCreateView(viewModel: GoalCreateViewModel(
                    repository: viewModel.repository,
                    goal: goal
                ))
            }
            .refreshable { await viewModel.loadGoals() }
            .task { await viewModel.loadGoals() }
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.showError },
                set: { if !$0 { viewModel.dismissError() } }
            )) {
                Button(String(localized: "Retry")) { Task { await viewModel.loadGoals() } }
                Button(String(localized: "Dismiss"), role: .cancel) { viewModel.dismissError() }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    // MARK: - Goal Cards

    private var goalCards: some View {
        LazyVStack(spacing: 16) {
            ForEach(viewModel.goals) { goal in goalCard(goal) }
        }
        .padding(.horizontal)
        .padding(.bottom, 20)
    }

    private func goalCard(_ goal: GoalItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack(spacing: 12) {
                Image(systemName: goal.icon)
                    .font(.title3).foregroundStyle(goal.color)
                    .frame(width: 40, height: 40)
                    .background(goal.color.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text(goal.name).font(.headline)
                    HStack(spacing: 4) {
                        Image(systemName: goal.status.systemImage).font(.caption2)
                        Text(goal.status.displayName).font(.caption)
                    }
                    .foregroundStyle(goal.status.color)
                }
                Spacer()
                if let targetDate = goal.targetDate {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(String(localized: "Target")).font(.caption2).foregroundStyle(.secondary)
                        Text(targetDate, style: .date).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }

            // Progress bar
            VStack(spacing: 6) {
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.gray.opacity(0.15)).frame(height: 10)
                        Capsule()
                            .fill(goal.isComplete ? Color.green : goal.color)
                            .frame(width: max(0, geometry.size.width * CGFloat(min(goal.progress, 1.0))), height: 10)
                    }
                }
                .frame(height: 10)

                HStack {
                    CurrencyLabel(amountInMinorUnits: goal.currentMinorUnits, currencyCode: goal.currencyCode, showSign: false, font: .caption.bold())
                    Spacer()
                    CurrencyLabel(amountInMinorUnits: goal.targetMinorUnits, currencyCode: goal.currencyCode, showSign: false, font: .caption)
                }
            }

            // Bottom info
            if !goal.isComplete {
                HStack {
                    Text(String(localized: "Remaining:")).font(.caption).foregroundStyle(.secondary)
                    CurrencyLabel(amountInMinorUnits: goal.remainingMinorUnits, currencyCode: goal.currencyCode, showSign: false, font: .caption.bold())
                    Spacer()
                    Text("\(Int(goal.progress * 100))%").font(.caption).fontWeight(.semibold).foregroundStyle(goal.color)
                }
            } else {
                HStack {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                    Text(String(localized: "Goal completed!")).font(.caption).fontWeight(.medium).foregroundStyle(.green)
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .contentShape(RoundedRectangle(cornerRadius: 16))
        .onTapGesture { viewModel.editingGoal = goal }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(goal.name)
        .accessibilityValue(String(localized: "\(Int(goal.progress * 100)) percent complete, \(goal.status.displayName)"))
        .accessibilityHint(goal.isComplete ? String(localized: "Goal has been completed. Double tap to edit.") : String(localized: "Goal is in progress. Double tap to edit."))
    }

    private var createGoalPlaceholder: some View {
        NavigationStack {
            Form {
                Section {
                    Text(String(localized: "Goal creation will be connected to KMP shared logic."))
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle(String(localized: "Create Goal"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { viewModel.showingCreateGoal = false }
                        .accessibilityLabel(String(localized: "Cancel"))
                        .accessibilityHint(String(localized: "Dismisses the goal creation form"))
                }
            }
        }
    }
}

#Preview { GoalsView(viewModel: GoalsViewModel(repository: MockGoalRepository())) }
