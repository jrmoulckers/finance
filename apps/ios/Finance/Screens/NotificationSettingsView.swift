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
    @Environment(\.openURL) private var openURL

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
            summarySection
            permissionSection
            schedulesSection
            budgetThresholdSection
            quietHoursSection
            smartTimingSection
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

    // MARK: - Summary Section (#2163)

    @ViewBuilder
    private var summarySection: some View {
        Section {
            HStack {
                Image(systemName: "bell.badge")
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)
                Text(viewModel.stateSummary)
                    .font(.subheadline)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "Alert center status"))
            .accessibilityValue(viewModel.stateSummary)
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
                .foregroundStyle(Color.accentColor)
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

    // MARK: - Budget Threshold Section (#2163)

    @ViewBuilder
    private var budgetThresholdSection: some View {
        Section {
            Picker(
                selection: Binding(
                    get: { viewModel.budgetThresholdPercent },
                    set: { newValue in
                        Task { await viewModel.setBudgetThreshold(newValue) }
                    }
                )
            ) {
                ForEach(NotificationSettingsViewModel.budgetThresholdOptions, id: \.self) { percent in
                    Text(String(localized: "\(Int(percent))% of budget"))
                        .tag(percent)
                }
            } label: {
                Text(String(localized: "Alert me at"))
            }
            .accessibilityLabel(String(localized: "Budget alert threshold"))
            .accessibilityHint(String(localized: "How much of a budget you can spend before being alerted"))
        } header: {
            Text(String(localized: "Budget Threshold"))
                .accessibilityAddTraits(.isHeader)
        } footer: {
            Text(String(localized: "Trigger budget alerts when spending reaches this share of a category's limit."))
        }
    }

    // MARK: - Quiet Hours Section (#2163)

    @ViewBuilder
    private var quietHoursSection: some View {
        Section {
            Toggle(isOn: $viewModel.quietHoursEnabled) {
                Label(String(localized: "Quiet Hours"), systemImage: "moon")
            }
            .accessibilityLabel(String(localized: "Quiet hours"))
            .accessibilityHint(String(localized: "Silences alerts during the selected window"))

            if viewModel.quietHoursEnabled {
                Picker(
                    String(localized: "From"),
                    selection: $viewModel.quietHoursStartHour
                ) {
                    ForEach(0..<24, id: \.self) { hour in
                        Text(NotificationSettingsViewModel.formatHour(hour)).tag(hour)
                    }
                }
                .accessibilityLabel(String(localized: "Quiet hours start"))

                Picker(
                    String(localized: "To"),
                    selection: $viewModel.quietHoursEndHour
                ) {
                    ForEach(0..<24, id: \.self) { hour in
                        Text(NotificationSettingsViewModel.formatHour(hour)).tag(hour)
                    }
                }
                .accessibilityLabel(String(localized: "Quiet hours end"))
            }
        } header: {
            Text(String(localized: "Quiet Hours"))
                .accessibilityAddTraits(.isHeader)
        } footer: {
            Text(viewModel.quietHoursEnabled
                ? String(localized: "Alerts are silenced \(viewModel.quietHoursSummary).")
                : String(localized: "Silence non-urgent alerts overnight."))
        }
    }

    // MARK: - Smart Timing Section (#2391)

    @ViewBuilder
    private var smartTimingSection: some View {
        Section {
            Toggle(isOn: $viewModel.smartTimingEnabled) {
                Label(String(localized: "Smart Timing"), systemImage: "wand.and.stars")
            }
            .accessibilityLabel(String(localized: "Smart notification timing"))
            .accessibilityHint(String(localized: "Learns when you're most likely to act and delivers reminders then"))

            if viewModel.smartTimingEnabled {
                HStack {
                    Text(String(localized: "Best time"))
                    Spacer()
                    Text(viewModel.recommendedHourLabel)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(String(localized: "Recommended delivery time"))
                .accessibilityValue(viewModel.recommendedHourLabel)

                Button(role: .destructive) {
                    viewModel.resetSmartTiming()
                } label: {
                    Text(String(localized: "Reset learned timing"))
                }
                .disabled(viewModel.smartTimingHealth.totalDelivered == 0)
                .accessibilityHint(String(localized: "Clears learned data and returns to the fixed time"))
            } else {
                Picker(
                    String(localized: "Reminder time"),
                    selection: $viewModel.smartTimingFallbackHour
                ) {
                    ForEach(0..<24, id: \.self) { hour in
                        Text(NotificationSettingsViewModel.formatHour(hour)).tag(hour)
                    }
                }
                .accessibilityLabel(String(localized: "Fixed reminder time"))
            }
        } header: {
            Text(String(localized: "Smart Timing"))
                .accessibilityAddTraits(.isHeader)
        } footer: {
            Text(viewModel.smartTimingStatus)
        }
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

    @ViewBuilder
    private func smartAlertRow(_ alert: SmartAlert) -> some View {
        if let urlString = alert.actionURL, let url = URL(string: urlString) {
            Button {
                openURL(url)
            } label: {
                smartAlertRowContent(alert, actionable: true)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(alert.title)
            .accessibilityValue(
                String(localized: "\(alert.priority.displayName) priority. \(alert.body)")
            )
            .accessibilityHint(String(localized: "Double tap to open"))
            .accessibilityAddTraits(.isButton)
        } else {
            smartAlertRowContent(alert, actionable: false)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(alert.title)
                .accessibilityValue(
                    String(localized: "\(alert.priority.displayName) priority. \(alert.body)")
                )
        }
    }

    private func smartAlertRowContent(_ alert: SmartAlert, actionable: Bool) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(alert.priority.color)
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(alert.title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(.primary)

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

            if actionable {
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
        }
    }
}

#if DEBUG
#Preview("Notification Settings") {
    NavigationStack {
        NotificationSettingsView(
            budgetRepository: PreviewRepositories.budget,
            transactionRepository: PreviewRepositories.transaction,
            goalRepository: PreviewRepositories.goal
        )
    }
}
#endif
