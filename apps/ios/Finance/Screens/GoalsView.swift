// SPDX-License-Identifier: BUSL-1.1

// GoalsView.swift
// Finance
//
// Goal cards with progress bars, target amounts, and status indicators.

import SwiftUI

// MARK: - View Model

@Observable
@MainActor
final class GoalsViewModel {
    var goals: [GoalItem] = []
    var isLoading = false
    var showingCreateGoal = false

    struct GoalItem: Identifiable, Sendable {
        let id: String
        let name: String
        let currentMinorUnits: Int64
        let targetMinorUnits: Int64
        let currencyCode: String
        let targetDate: Date?
        let status: GoalStatusUI
        let icon: String
        let color: Color

        var progress: Double {
            guard targetMinorUnits > 0 else { return 0 }
            return Double(currentMinorUnits) / Double(targetMinorUnits)
        }

        var isComplete: Bool { currentMinorUnits >= targetMinorUnits }
        var remainingMinorUnits: Int64 { max(0, targetMinorUnits - currentMinorUnits) }
    }

    enum GoalStatusUI: String, Sendable {
        case active, paused, completed, cancelled
        var displayName: String {
            switch self {
            case .active: String(localized: "Active")
            case .paused: String(localized: "Paused")
            case .completed: String(localized: "Completed")
            case .cancelled: String(localized: "Cancelled")
            }
        }
        var color: Color {
            switch self {
            case .active: .blue
            case .paused: .orange
            case .completed: .green
            case .cancelled: .gray
            }
        }
        var systemImage: String {
            switch self {
            case .active: "flame"
            case .paused: "pause.circle"
            case .completed: "checkmark.circle.fill"
            case .cancelled: "xmark.circle"
            }
        }
    }

    func loadGoals() async {
        isLoading = true
        defer { isLoading = false }

        // TODO: Replace with KMP shared logic via Swift Export bridge
        goals = [
            GoalItem(id: "g1", name: String(localized: "Emergency Fund"), currentMinorUnits: 7_500_00, targetMinorUnits: 10_000_00, currencyCode: "USD", targetDate: Calendar.current.date(byAdding: .month, value: 6, to: .now), status: .active, icon: "shield", color: .blue),
            GoalItem(id: "g2", name: String(localized: "Vacation"), currentMinorUnits: 1_200_00, targetMinorUnits: 5_000_00, currencyCode: "USD", targetDate: Calendar.current.date(byAdding: .month, value: 12, to: .now), status: .active, icon: "airplane", color: .teal),
            GoalItem(id: "g3", name: String(localized: "New Laptop"), currentMinorUnits: 2_000_00, targetMinorUnits: 2_000_00, currencyCode: "USD", targetDate: nil, status: .completed, icon: "laptopcomputer", color: .green),
            GoalItem(id: "g4", name: String(localized: "Home Down Payment"), currentMinorUnits: 15_000_00, targetMinorUnits: 60_000_00, currencyCode: "USD", targetDate: Calendar.current.date(byAdding: .year, value: 3, to: .now), status: .active, icon: "house", color: .purple),
        ]
    }
}

// MARK: - View

struct GoalsView: View {
    @State private var viewModel = GoalsViewModel()

    var body: some View {
        NavigationStack {
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
            .sheet(isPresented: $viewModel.showingCreateGoal) { createGoalPlaceholder }
            .refreshable { await viewModel.loadGoals() }
            .task { await viewModel.loadGoals() }
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

    private func goalCard(_ goal: GoalsViewModel.GoalItem) -> some View {
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
        .accessibilityElement(children: .combine)
        .accessibilityLabel(goal.name)
        .accessibilityValue(String(localized: "\(Int(goal.progress * 100)) percent complete, \(goal.status.displayName)"))
        .accessibilityHint(goal.isComplete ? String(localized: "Goal has been completed") : String(localized: "Goal is in progress"))
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

#Preview { GoalsView() }
