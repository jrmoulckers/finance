// SPDX-License-Identifier: BUSL-1.1

// BillDetailView.swift
// Finance
//
// Bill detail view with payment history, due date, auto-pay status,
// and mark-as-paid action. Navigated to from the bills list.
//
// References: #1121

import SwiftUI

// MARK: - View

/// Displays detailed information about a single bill including
/// payment history and actions for managing the bill.
struct BillDetailView: View {
    let bill: BillItem
    let viewModel: BillsViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                headerSection
                statusSection
                detailsSection
                paymentHistorySection
                actionsSection
            }
            .padding(.horizontal)
            .padding(.bottom, 20)
        }
        .navigationTitle(bill.name)
        .navigationBarTitleDisplayMode(.large)
        .task {
            await viewModel.loadPaymentHistory(for: bill.id)
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 12) {
            Image(systemName: bill.icon)
                .font(.largeTitle)
                .foregroundStyle(bill.status.color)
                .frame(width: 64, height: 64)
                .background(bill.status.color.opacity(0.1), in: Circle())

            Text(bill.payee)
                .font(.title3)
                .foregroundStyle(.secondary)

            CurrencyLabel(
                amountInMinorUnits: bill.amountMinorUnits,
                currencyCode: bill.currencyCode,
                showSign: false,
                font: .largeTitle.bold()
            )

            Text(bill.frequency.displayName)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .cardBackground(cornerRadius: 16)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(bill.name), \(bill.payee)")
        .accessibilityValue(String(localized: "\(bill.frequency.displayName), \(bill.dueDateText)"))
    }

    // MARK: - Status

    private var statusSection: some View {
        HStack(spacing: 16) {
            statusBadge(
                title: String(localized: "Status"),
                value: bill.status.displayName,
                color: bill.status.color,
                icon: bill.status.systemImage
            )

            statusBadge(
                title: String(localized: "Due"),
                value: bill.dueDateText,
                color: bill.dueDateColor,
                icon: "calendar"
            )

            if bill.isAutoPay {
                statusBadge(
                    title: String(localized: "Auto-Pay"),
                    value: String(localized: "Enabled"),
                    color: .blue,
                    icon: "arrow.clockwise"
                )
            }
        }
    }

    private func statusBadge(title: String, value: String, color: Color, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(color)
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption)
                .fontWeight(.medium)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .cardBackground(cornerRadius: 12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
        .accessibilityValue(value)
    }

    // MARK: - Details

    private var detailsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Details"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            detailRow(label: String(localized: "Category"), value: bill.categoryName)
            detailRow(label: String(localized: "Frequency"), value: bill.frequency.displayName)
            detailRow(
                label: String(localized: "Next Due"),
                value: bill.nextDueDate.formatted(.dateTime.month(.wide).day().year())
            )
            detailRow(
                label: String(localized: "Reminder"),
                value: String(localized: "\(bill.reminderDaysBefore) days before")
            )
            if !bill.notes.isEmpty {
                detailRow(label: String(localized: "Notes"), value: bill.notes)
            }
        }
        .padding()
        .cardBackground(cornerRadius: 16)
    }

    private func detailRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
        .accessibilityValue(value)
    }

    // MARK: - Payment History

    private var paymentHistorySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Payment History"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if viewModel.paymentHistory.isEmpty {
                Text(String(localized: "No payment history available."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(viewModel.paymentHistory) { payment in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(payment.paidDate.formatted(.dateTime.month(.abbreviated).day().year()))
                                .font(.subheadline)
                            if payment.isLate {
                                Text(String(localized: "Paid late"))
                                    .font(.caption2)
                                    .foregroundStyle(.orange)
                            }
                        }
                        Spacer()
                        CurrencyLabel(
                            amountInMinorUnits: payment.amountMinorUnits,
                            currencyCode: payment.currencyCode,
                            showSign: false,
                            font: .callout
                        )
                        Image(systemName: payment.isLate ? "exclamationmark.circle" : "checkmark.circle.fill")
                            .foregroundStyle(payment.isLate ? .orange : .green)
                            .font(.caption)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(payment.paidDate.formatted(.dateTime.month(.wide).day().year()))
                    .accessibilityValue(payment.isLate ? String(localized: "Paid late") : String(localized: "Paid on time"))

                    if payment.id != viewModel.paymentHistory.last?.id {
                        Divider()
                    }
                }
            }
        }
        .padding()
        .cardBackground(cornerRadius: 16)
    }

    // MARK: - Actions

    private var actionsSection: some View {
        VStack(spacing: 12) {
            if bill.status != .paid {
                Button {
                    Task { await viewModel.markAsPaid(billId: bill.id) }
                } label: {
                    Label(String(localized: "Mark as Paid"), systemImage: "checkmark.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel(String(localized: "Mark as paid"))
                .accessibilityHint(String(localized: "Records this bill as paid for the current period"))
            }

            Button(role: .destructive) {
                Task { await viewModel.deleteBill(id: bill.id) }
            } label: {
                Label(String(localized: "Delete Bill"), systemImage: "trash")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .accessibilityLabel(String(localized: "Delete bill"))
            .accessibilityHint(String(localized: "Permanently removes this bill and its reminders"))
        }
        .padding()
    }
}

#Preview {
    NavigationStack {
        BillDetailView(
            bill: BillItem(
                id: "b1", name: "Rent", payee: "Property Management Co.",
                amountMinorUnits: 1_500_00, currencyCode: "USD",
                frequency: .monthly,
                dueDate: .now, nextDueDate: Calendar.current.date(byAdding: .day, value: 5, to: .now)!,
                categoryName: "Housing", icon: "house",
                isAutoPay: true, notes: "Monthly apartment rent",
                status: .upcoming, reminderDaysBefore: 3,
                createdAt: .now
            ),
            viewModel: BillsViewModel(repository: MockBillRepository())
        )
    }
}
