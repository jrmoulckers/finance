// SPDX-License-Identifier: BUSL-1.1

// NotificationSettingsViewModel.swift
// Finance
//
// ViewModel for notification settings — manages schedule configuration,
// permission status, smart alert generation, and notification preferences.
//
// References: #305

import Observation
import os
import SwiftUI
import UserNotifications

@Observable
final class NotificationSettingsViewModel {
    private let scheduler: NotificationSchedulerProtocol
    private let budgetRepository: BudgetRepository
    private let transactionRepository: TransactionRepository
    private let goalRepository: GoalRepository
    private let defaults: UserDefaults

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "NotificationSettingsViewModel"
    )

    // MARK: - State

    var schedules: [NotificationSchedule] = []
    var smartAlerts: [SmartAlert] = []
    var permissionGranted = false
    var permissionStatus: UNAuthorizationStatus = .notDetermined
    var isLoading = false
    var errorMessage: String?

    var showError: Bool { errorMessage != nil }
    func dismissError() { errorMessage = nil }

    // MARK: - Quiet Hours (#2163)

    private enum PrefKey {
        static let quietHoursEnabled = "notifications.quietHours.enabled"
        static let quietHoursStart = "notifications.quietHours.startHour"
        static let quietHoursEnd = "notifications.quietHours.endHour"
    }

    /// Whether quiet hours suppress alerts overnight.
    var quietHoursEnabled: Bool {
        didSet { defaults.set(quietHoursEnabled, forKey: PrefKey.quietHoursEnabled) }
    }

    /// Hour (0–23) quiet hours begin.
    var quietHoursStartHour: Int {
        didSet { defaults.set(quietHoursStartHour, forKey: PrefKey.quietHoursStart) }
    }

    /// Hour (0–23) quiet hours end.
    var quietHoursEndHour: Int {
        didSet { defaults.set(quietHoursEndHour, forKey: PrefKey.quietHoursEnd) }
    }

    /// Budget-alert threshold options offered in the UI.
    static let budgetThresholdOptions: [Double] = [75, 90, 100]

    /// Default schedules for initial setup.
    static let defaultSchedules: [NotificationSchedule] = NotificationType.allCases.map { type in
        NotificationSchedule(
            type: type,
            isEnabled: type == .budgetAlert || type == .weeklySummary,
            frequency: type == .weeklySummary ? .weekly : .daily,
            thresholdPercent: type == .budgetAlert ? 80 : nil
        )
    }

    // MARK: - Init

    init(
        scheduler: NotificationSchedulerProtocol = NotificationSchedulerService.shared,
        budgetRepository: BudgetRepository,
        transactionRepository: TransactionRepository,
        goalRepository: GoalRepository,
        defaults: UserDefaults = .standard
    ) {
        self.scheduler = scheduler
        self.budgetRepository = budgetRepository
        self.transactionRepository = transactionRepository
        self.goalRepository = goalRepository
        self.defaults = defaults
        self.schedules = Self.defaultSchedules
        self.quietHoursEnabled = defaults.bool(forKey: PrefKey.quietHoursEnabled)
        self.quietHoursStartHour = defaults.object(forKey: PrefKey.quietHoursStart) as? Int ?? 22
        self.quietHoursEndHour = defaults.object(forKey: PrefKey.quietHoursEnd) as? Int ?? 7
    }

    // MARK: - Alert Center Summary (#2163)

    /// Number of enabled alert schedules.
    var enabledScheduleCount: Int { schedules.filter(\.isEnabled).count }

    /// Current budget-alert threshold percentage.
    var budgetThresholdPercent: Double {
        schedules.first(where: { $0.type == .budgetAlert })?.thresholdPercent ?? 80
    }

    /// A one-line summary of the alert center state for the entry point.
    var stateSummary: String {
        let alertsPart = String(localized: "\(enabledScheduleCount) alerts on")
        let quietPart = quietHoursEnabled
            ? String(localized: "quiet hours \(quietHoursSummary)")
            : String(localized: "quiet hours off")
        return "\(alertsPart) · \(quietPart)"
    }

    /// Human-readable quiet-hours window, e.g. "10 PM – 7 AM".
    var quietHoursSummary: String {
        "\(Self.formatHour(quietHoursStartHour)) – \(Self.formatHour(quietHoursEndHour))"
    }

    /// Whether a given hour of day falls inside the quiet-hours window.
    /// Correctly handles windows that wrap past midnight.
    func isWithinQuietHours(hour: Int) -> Bool {
        guard quietHoursEnabled else { return false }
        let start = quietHoursStartHour
        let end = quietHoursEndHour
        if start == end { return false }
        if start < end { return hour >= start && hour < end }
        return hour >= start || hour < end
    }

    /// Formats a 24-hour value as a localized 12-hour label.
    static func formatHour(_ hour: Int) -> String {
        let clamped = ((hour % 24) + 24) % 24
        var components = DateComponents()
        components.hour = clamped
        let date = Calendar.current.date(from: components) ?? Date()
        return date.formatted(.dateTime.hour())
    }

    /// Updates the budget-alert threshold and reschedules if enabled.
    func setBudgetThreshold(_ percent: Double) async {
        guard let index = schedules.firstIndex(where: { $0.type == .budgetAlert }) else { return }
        let schedule = schedules[index]
        let updated = NotificationSchedule(
            id: schedule.id,
            type: schedule.type,
            isEnabled: schedule.isEnabled,
            frequency: schedule.frequency,
            scheduledHour: schedule.scheduledHour,
            scheduledMinute: schedule.scheduledMinute,
            thresholdPercent: percent,
            createdAt: schedule.createdAt
        )
        schedules[index] = updated

        if updated.isEnabled {
            do {
                try await scheduler.scheduleNotification(updated)
            } catch {
                errorMessage = String(localized: "Failed to update budget threshold.")
            }
        }
    }

    // MARK: - Permission

    func checkPermission() async {
        permissionStatus = await scheduler.authorizationStatus()
        permissionGranted = permissionStatus == .authorized
    }

    func requestPermission() async {
        do {
            permissionGranted = try await scheduler.requestPermission()
            permissionStatus = permissionGranted ? .authorized : .denied

            if permissionGranted {
                await applySchedules()
            }
        } catch {
            errorMessage = String(localized: "Failed to request notification permission.")
            Self.logger.error("Permission request failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Schedule Management

    func toggleSchedule(_ schedule: NotificationSchedule) async {
        guard let index = schedules.firstIndex(where: { $0.id == schedule.id }) else { return }

        let updated = NotificationSchedule(
            id: schedule.id,
            type: schedule.type,
            isEnabled: !schedule.isEnabled,
            frequency: schedule.frequency,
            scheduledHour: schedule.scheduledHour,
            scheduledMinute: schedule.scheduledMinute,
            thresholdPercent: schedule.thresholdPercent,
            createdAt: schedule.createdAt
        )

        schedules[index] = updated

        if updated.isEnabled {
            do {
                try await scheduler.scheduleNotification(updated)
            } catch {
                errorMessage = String(localized: "Failed to schedule notification.")
            }
        } else {
            await scheduler.cancelNotification(id: updated.id)
        }
    }

    func updateScheduleTime(
        _ schedule: NotificationSchedule,
        hour: Int,
        minute: Int
    ) async {
        guard let index = schedules.firstIndex(where: { $0.id == schedule.id }) else { return }

        let updated = NotificationSchedule(
            id: schedule.id,
            type: schedule.type,
            isEnabled: schedule.isEnabled,
            frequency: schedule.frequency,
            scheduledHour: hour,
            scheduledMinute: minute,
            thresholdPercent: schedule.thresholdPercent,
            createdAt: schedule.createdAt
        )

        schedules[index] = updated

        if updated.isEnabled {
            do {
                try await scheduler.scheduleNotification(updated)
            } catch {
                errorMessage = String(localized: "Failed to update notification schedule.")
            }
        }
    }

    private func applySchedules() async {
        for schedule in schedules where schedule.isEnabled {
            do {
                try await scheduler.scheduleNotification(schedule)
            } catch {
                Self.logger.error(
                    "Failed to schedule \(schedule.type.rawValue, privacy: .public): "
                    + "\(error.localizedDescription, privacy: .public)"
                )
            }
        }
    }

    // MARK: - Smart Alerts

    func loadSmartAlerts() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let budgets = budgetRepository.getBudgets()
            async let transactions = transactionRepository.getRecentTransactions(limit: 50)
            async let goals = goalRepository.getGoals()

            let (b, t, g) = try await (budgets, transactions, goals)

            smartAlerts = await scheduler.generateSmartAlerts(
                budgets: b,
                transactions: t,
                goals: g
            )

            Self.logger.debug(
                "Generated \(self.smartAlerts.count, privacy: .public) smart alerts"
            )
        } catch {
            errorMessage = String(localized: "Failed to generate smart alerts.")
            Self.logger.error("Smart alert generation failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
