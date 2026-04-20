// SPDX-License-Identifier: BUSL-1.1

// NotificationSettingsView.swift
// Finance
//
// Notification settings screen with schedule management, permission
// handling, and smart alert display.
//
// References: #305

import SwiftUI

struct NotificationSettingsView: View {
    @State private var viewModel: NotificationSettingsViewModel

    init(
        budgetRepository: BudgetRepository,
        transactionRepository: TransactionRepository,
        goalRepository: GoalRepository
    ) {
        _viewModel = State(initialValue: NotificationSettingsViewModel(
            budgetRepository: budgetRepository,
            transactionRepository: transactionRepository,
            goalRepository: goalRepository
        ))
    }

    var body: some View {
        List {
            permissionSection
            schedulesSection
            smartAlertsSection
        }
        .navigationTitle(String(localized: "Notifications"))
        .task {
            await viewModel.checkPermission()
            await viewModel.loadSmartAlerts()
        }
        .refreshable {
            await viewModel.loadSmartAlerts()
        }
        .alert(
            String(localized: "Error"),
            isPresented: .init(
                get: { viewModel.showError },
                set: { if !$0 { viewModel.dismissError() } }
            )
        ) {
            Button(String(localized: "OK"), role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    // MARK: - Permission Section

    @ViewBuilder
    private var permissionSection: some View {
        Section {
            if viewModel.permissionGranted {
                Label {
                    Text(String(localized: "Notifications Enabled"))
                        .foregroundStyle(.primary)
                } icon: {
                    Image(systemName: "bell.badge.fill")
                        .foregroundStyle(.green)
                }
                .accessibilityLabel(String(localized: "Notifications are enabled"))
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Label {
                        Text(String(localized: "Enable Notifications"))
                    } icon: {
                        Image(systemName: "bell.slash")
                            .foregroundStyle(.secondary)
                    }

                    Text(String(localized: "Get timely alerts about your budgets, goals, and spending patterns."))
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Button {
                        Task { await viewModel.requestPermission() }
                    } label: {
                        Text(String(localized: "Enable"))
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityLabel(String(localized: "Enable notifications"))
                    .accessibilityHint(String(localized: "Requests permission to send notifications"))
                }
            }
        } header: {
            Text(String(localized: "Permission"))
                .accessibilityAddTraits(.isHeader)
        }
    }

    // MARK: - Schedules Section

    @ViewBuilder
    private var schedulesSection: some View {
        Section {
            ForEach(viewModel.schedules) { schedule in
                scheduleRow(schedule)
            }
        } header: {
            Text(String(localized: "Alert Types"))
                .accessibilityAddTraits(.isHeader)
        } footer: {
            Text(String(localized: "Toggle which notifications you'd like to receive."))
        }
    }

    private func scheduleRow(_ schedule: NotificationSchedule) -> some View {
        HStack(spacing: 12) {
            Image(systemName: schedule.type.systemImage)
                .font(.body)
                .foregroundStyle(.accent)
                .frame(width: 28, height: 28)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(schedule.type.displayName)
                    .font(.body)

                Text(schedule.type.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            Toggle(
                isOn: Binding(
                    get: { schedule.isEnabled },
                    set: { _ in
                        Task { await viewModel.toggleSchedule(schedule) }
                    }
                )
            ) {
                EmptyView()
            }
            .labelsHidden()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(schedule.type.displayName)
        .accessibilityValue(
            schedule.isEnabled
                ? String(localized: "Enabled")
                : String(localized: "Disabled")
        )
        .accessibilityHint(schedule.type.description)
    }

    // MARK: - Smart Alerts Section

    @ViewBuilder
    private var smartAlertsSection: some View {
        if !viewModel.smartAlerts.isEmpty {
            Section {
                ForEach(viewModel.smartAlerts) { alert in
                    smartAlertRow(alert)
                }
            } header: {
                HStack {
                    Text(String(localized: "Smart Alerts"))
                    Spacer()
                    Text(String(localized: "\(viewModel.smartAlerts.count) active"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    String(localized: "Smart alerts section, \(viewModel.smartAlerts.count) active")
                )
            }
        }
    }

    private func smartAlertRow(_ alert: SmartAlert) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(alert.priority.color)
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(alert.title)
                    .font(.subheadline)
                    .fontWeight(.medium)

                Text(alert.body)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            Text(alert.priority.displayName)
                .font(.caption2)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(alert.priority.color.opacity(0.15))
                .clipShape(Capsule())
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(alert.title)
        .accessibilityValue(
            String(localized: "\(alert.priority.displayName) priority. \(alert.body)")
        )
    }
}

#Preview("Notification Settings") {
    NavigationStack {
        NotificationSettingsView(
            budgetRepository: StubBudgetRepository(),
            transactionRepository: StubTransactionRepository(),
            goalRepository: StubGoalRepository()
        )
    }
}
