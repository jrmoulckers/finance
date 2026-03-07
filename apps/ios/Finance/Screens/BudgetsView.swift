// BudgetsView.swift
// Finance
//
// Budget cards with circular progress rings and a month selector.

import SwiftUI

// MARK: - View Model

@Observable
@MainActor
final class BudgetsViewModel {
    var budgets: [BudgetItem] = []
    var isLoading = false
    var selectedMonth = Date()
    var showingCreateBudget = false

    struct BudgetItem: Identifiable, Sendable {
        let id: String
        let name: String
        let categoryName: String
        let spentMinorUnits: Int64
        let limitMinorUnits: Int64
        let currencyCode: String
        let period: String
        let icon: String

        var progress: Double {
            guard limitMinorUnits > 0 else { return 0 }
            return Double(spentMinorUnits) / Double(limitMinorUnits)
        }

        var remainingMinorUnits: Int64 { limitMinorUnits - spentMinorUnits }

        var progressColor: Color {
            if progress >= 1.0 { return .red }
            if progress >= 0.75 { return .orange }
            return .green
        }

        var statusText: String {
            progress >= 1.0 ? String(localized: "Over budget") : String(localized: "On track")
        }
    }

    var totalBudgeted: Int64 { budgets.reduce(0) { $0 + $1.limitMinorUnits } }
    var totalSpent: Int64 { budgets.reduce(0) { $0 + $1.spentMinorUnits } }

    var monthDisplayText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: selectedMonth)
    }

    func previousMonth() {
        if let d = Calendar.current.date(byAdding: .month, value: -1, to: selectedMonth) {
            selectedMonth = d
            Task { await loadBudgets() }
        }
    }

    func nextMonth() {
        if let d = Calendar.current.date(byAdding: .month, value: 1, to: selectedMonth) {
            selectedMonth = d
            Task { await loadBudgets() }
        }
    }

    func loadBudgets() async {
        isLoading = true
        defer { isLoading = false }

        // TODO: Replace with KMP shared logic via Swift Export bridge
        budgets = [
            BudgetItem(id: "b1", name: String(localized: "Groceries"), categoryName: String(localized: "Groceries"), spentMinorUnits: 320_00, limitMinorUnits: 500_00, currencyCode: "USD", period: String(localized: "Monthly"), icon: "cart"),
            BudgetItem(id: "b2", name: String(localized: "Dining Out"), categoryName: String(localized: "Dining Out"), spentMinorUnits: 180_00, limitMinorUnits: 200_00, currencyCode: "USD", period: String(localized: "Monthly"), icon: "fork.knife"),
            BudgetItem(id: "b3", name: String(localized: "Transport"), categoryName: String(localized: "Transport"), spentMinorUnits: 95_00, limitMinorUnits: 150_00, currencyCode: "USD", period: String(localized: "Monthly"), icon: "car"),
            BudgetItem(id: "b4", name: String(localized: "Entertainment"), categoryName: String(localized: "Entertainment"), spentMinorUnits: 210_00, limitMinorUnits: 200_00, currencyCode: "USD", period: String(localized: "Monthly"), icon: "film"),
            BudgetItem(id: "b5", name: String(localized: "Shopping"), categoryName: String(localized: "Shopping"), spentMinorUnits: 75_00, limitMinorUnits: 300_00, currencyCode: "USD", period: String(localized: "Monthly"), icon: "bag"),
        ]
    }
}

// MARK: - View

struct BudgetsView: View {
    @State private var viewModel = BudgetsViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    monthSelector
                    overallSummary
                    if viewModel.budgets.isEmpty && !viewModel.isLoading {
                        EmptyStateView(
                            systemImage: "chart.pie",
                            title: String(localized: "No Budgets"),
                            message: String(localized: "Create a budget to start tracking your spending by category."),
                            actionLabel: String(localized: "Create Budget"),
                            action: { viewModel.showingCreateBudget = true }
                        )
                    } else {
                        budgetCards
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 20)
            }
            .navigationTitle(String(localized: "Budgets"))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { viewModel.showingCreateBudget = true } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel(String(localized: "Create budget"))
                    .accessibilityHint(String(localized: "Opens a form to create a new budget"))
                }
            }
            .sheet(isPresented: $viewModel.showingCreateBudget) { createBudgetPlaceholder }
            .refreshable { await viewModel.loadBudgets() }
            .task { await viewModel.loadBudgets() }
        }
    }

    // MARK: - Month Selector

    private var monthSelector: some View {
        HStack {
            Button { viewModel.previousMonth() } label: {
                Image(systemName: "chevron.left").font(.title3).frame(width: 44, height: 44)
            }
            .accessibilityLabel(String(localized: "Previous month"))
            .accessibilityHint(String(localized: "Shows budgets for the previous month"))

            Spacer()
            Text(viewModel.monthDisplayText).font(.headline)
            Spacer()

            Button { viewModel.nextMonth() } label: {
                Image(systemName: "chevron.right").font(.title3).frame(width: 44, height: 44)
            }
            .accessibilityLabel(String(localized: "Next month"))
            .accessibilityHint(String(localized: "Shows budgets for the next month"))
        }
        .padding(.horizontal, 8)
    }

    // MARK: - Overall Summary

    private var overallSummary: some View {
        VStack(spacing: 8) {
            HStack(spacing: 24) {
                VStack(spacing: 4) {
                    Text(String(localized: "Spent")).font(.caption).foregroundStyle(.secondary)
                    CurrencyLabel(amountInMinorUnits: viewModel.totalSpent, currencyCode: "USD", showSign: false, font: .callout.bold())
                }
                ProgressRing(
                    progress: viewModel.totalBudgeted > 0 ? Double(viewModel.totalSpent) / Double(viewModel.totalBudgeted) : 0,
                    lineWidth: 10, progressColor: .blue, size: 80
                )
                VStack(spacing: 4) {
                    Text(String(localized: "Budgeted")).font(.caption).foregroundStyle(.secondary)
                    CurrencyLabel(amountInMinorUnits: viewModel.totalBudgeted, currencyCode: "USD", showSign: false, font: .callout.bold())
                }
            }
        }
        .frame(maxWidth: .infinity).padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Overall budget summary"))
    }

    // MARK: - Budget Cards

    private var budgetCards: some View {
        LazyVStack(spacing: 12) {
            ForEach(viewModel.budgets) { budget in
                budgetCard(budget)
            }
        }
    }

    private func budgetCard(_ budget: BudgetsViewModel.BudgetItem) -> some View {
        HStack(spacing: 16) {
            ProgressRing(progress: budget.progress, lineWidth: 6, progressColor: budget.progressColor, size: 56)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Image(systemName: budget.icon).font(.caption).foregroundStyle(.secondary)
                    Text(budget.name).font(.body).fontWeight(.medium)
                }
                HStack(spacing: 4) {
                    CurrencyLabel(amountInMinorUnits: budget.spentMinorUnits, currencyCode: budget.currencyCode, showSign: false, font: .caption)
                    Text(String(localized: "of")).font(.caption).foregroundStyle(.secondary)
                    CurrencyLabel(amountInMinorUnits: budget.limitMinorUnits, currencyCode: budget.currencyCode, showSign: false, font: .caption)
                }
                Text(budget.statusText).font(.caption2).foregroundStyle(budget.progressColor).fontWeight(.medium)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(String(localized: "Remaining")).font(.caption2).foregroundStyle(.secondary)
                CurrencyLabel(amountInMinorUnits: budget.remainingMinorUnits, currencyCode: budget.currencyCode, font: .callout.bold())
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(budget.name)
        .accessibilityValue(String(localized: "\(Int(budget.progress * 100)) percent spent, \(budget.statusText)"))
    }

    private var createBudgetPlaceholder: some View {
        NavigationStack {
            Form {
                Section {
                    Text(String(localized: "Budget creation will be connected to KMP shared logic."))
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle(String(localized: "Create Budget"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { viewModel.showingCreateBudget = false }
                        .accessibilityLabel(String(localized: "Cancel"))
                        .accessibilityHint(String(localized: "Dismisses the budget creation form"))
                }
            }
        }
    }
}

#Preview { BudgetsView() }
