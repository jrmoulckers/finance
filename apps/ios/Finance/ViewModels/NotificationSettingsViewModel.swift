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
        goalRepository: GoalRepository
    ) {
        self.scheduler = scheduler
        self.budgetRepository = budgetRepository
        self.transactionRepository = transactionRepository
        self.goalRepository = goalRepository
        self.schedules = Self.defaultSchedules
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
