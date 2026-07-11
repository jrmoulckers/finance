// SPDX-License-Identifier: BUSL-1.1

// BillsListView.swift
// Finance
//
// Upcoming bills list with due dates, amounts, and status indicators.
// Groups bills by status (overdue, upcoming, paid) with swipe actions
// for mark-as-paid and delete.
//
// References: #1121

import SwiftUI

// MARK: - View

/// Displays the user's bills grouped by status with swipe actions
/// for marking as paid and deleting.
struct BillsListView: View {
    @State private var viewModel: BillsViewModel

    init(viewModel: BillsViewModel = BillsViewModel(
        repository: RepositoryProvider.shared.bills
    )) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.bills.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel(String(localized: "Loading"))
                } else if viewModel.bills.isEmpty && !viewModel.isLoading {
                    EmptyStateView(
                        systemImage: "calendar.badge.clock",
                        title: String(localized: "No Bills"),
                        message: String(localized: "Add your recurring bills to get reminders before they're due."),
                        actionLabel: String(localized: "Add Bill"),
                        action: { viewModel.showingCreateBill = true }
                    )
                } else {
                    billsList
                }
            }
            .navigationTitle(String(localized: "Bills"))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { viewModel.showingCreateBill = true } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityIdentifier("add_bill_button")
                    .accessibilityLabel(String(localized: "Add bill"))
                    .accessibilityHint(String(localized: "Opens a form to create a new bill reminder"))
                }
            }
            .sheet(isPresented: $viewModel.showingCreateBill, onDismiss: {
                Task { await viewModel.loadBills() }
            }) {
                CreateBillView(viewModel: viewModel)
            }
            .refreshable { await viewModel.loadBills() }
            .task { await viewModel.loadBills() }
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.showError },
                set: { if !$0 { viewModel.dismissError() } }
            )) {
                Button(String(localized: "Retry")) { Task { await viewModel.loadBills() } }
                Button(String(localized: "Dismiss"), role: .cancel) { viewModel.dismissError() }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    // MARK: - Bills List

    private var billsList: some View {
        ScrollView {
            VStack(spacing: 20) {
                summaryCard
                if !viewModel.overdueBills.isEmpty {
                    billSection(
                        title: String(localized: "Overdue"),
                        bills: viewModel.overdueBills,
                        headerColor: .red
                    )
                }
                if !viewModel.upcomingBills.isEmpty {
                    billSection(
                        title: String(localized: "Upcoming"),
                        bills: viewModel.upcomingBills,
                        headerColor: .blue
                    )
                }
                if !viewModel.paidBills.isEmpty {
                    billSection(
                        title: String(localized: "Paid"),
                        bills: viewModel.paidBills,
                        headerColor: .green
                    )
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 20)
        }
    }

    // MARK: - Summary Card

    private var summaryCard: some View {
        HStack(spacing: 24) {
            VStack(spacing: 4) {
                Text(String(localized: "Due"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                CurrencyLabel(
                    amountInMinorUnits: viewModel.totalDueMinorUnits,
                    currencyCode: "USD",
                    showSign: false,
                    font: .title3.bold()
                )
            }

            Divider().frame(height: 40)

            VStack(spacing: 4) {
                Text(String(localized: "Monthly Total"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                CurrencyLabel(
                    amountInMinorUnits: viewModel.totalMonthlyMinorUnits,
                    currencyCode: "USD",
                    showSign: false,
                    font: .title3.bold()
                )
            }

            Divider().frame(height: 40)

            VStack(spacing: 4) {
                Text(String(localized: "Bills"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("\(viewModel.bills.count)")
                    .font(.title3.bold())
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .cardBackground(cornerRadius: 16)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Bills summary"))
        .accessibilityValue(String(localized: "\(viewModel.bills.count) bills, \(viewModel.overdueBills.count) overdue"))
    }

    // MARK: - Bill Section

    private func billSection(title: String, bills: [BillItem], headerColor: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Circle()
                    .fill(headerColor)
                    .frame(width: 8, height: 8)
                Text(title)
                    .font(.headline)
                Text("(\(bills.count))")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .accessibilityAddTraits(.isHeader)

            ForEach(bills) { bill in
                NavigationLink(value: bill) {
                    billRow(bill)
                }
                .buttonStyle(.plain)
            }
        }
        .navigationDestination(for: BillItem.self) { bill in
            BillDetailView(bill: bill, viewModel: viewModel)
        }
    }

    private func billRow(_ bill: BillItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: bill.icon)
                .font(.title3)
                .foregroundStyle(bill.status.color)
                .frame(width: 36, height: 36)
                .background(bill.status.color.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                Text(bill.name)
                    .font(.body)
                    .fontWeight(.medium)
                HStack(spacing: 4) {
                    Text(bill.payee)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if bill.isAutoPay {
                        Label(String(localized: "Auto-pay"), systemImage: "arrow.clockwise")
                            .font(.caption2)
                            .foregroundStyle(.blue)
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                CurrencyLabel(
                    amountInMinorUnits: bill.amountMinorUnits,
                    currencyCode: bill.currencyCode,
                    showSign: false,
                    font: .callout.bold()
                )
                Text(bill.dueDateText)
                    .font(.caption)
                    .foregroundStyle(bill.dueDateColor)
            }
        }
        .padding()
        .cardBackground(cornerRadius: 12)
        .contextMenu {
            if bill.status != .paid {
                Button {
                    Task { await viewModel.markAsPaid(billId: bill.id) }
                } label: {
                    Label(String(localized: "Mark as Paid"), systemImage: "checkmark.circle")
                }
            }
            Button(role: .destructive) {
                Task { await viewModel.deleteBill(id: bill.id) }
            } label: {
                Label(String(localized: "Delete"), systemImage: "trash")
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(bill.name), \(bill.payee)")
        .accessibilityValue(bill.dueDateText)
        .accessibilityHint(String(localized: "Shows bill details and payment history"))
    }
}

#Preview {
    BillsListView(viewModel: BillsViewModel(repository: MockBillRepository()))
        .environment(BiometricAuthManager())
}
