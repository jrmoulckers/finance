// SPDX-License-Identifier: BUSL-1.1

// NotificationSchedulerService.swift
// Finance
//
// Service for scheduling local notifications and generating smart alerts
// based on financial data analysis. Uses UNUserNotificationCenter for
// local notification delivery and smart heuristics for alert generation.
//
// References: #305

import Foundation
import os
import UserNotifications

// MARK: - Notification Scheduler Protocol

/// Contract for notification scheduling and smart alert generation.
protocol NotificationSchedulerProtocol: Sendable {
    /// Requests notification permission from the user.
    func requestPermission() async throws -> Bool

    /// Returns the current notification authorization status.
    func authorizationStatus() async -> UNAuthorizationStatus

    /// Schedules a notification based on the given schedule rule.
    func scheduleNotification(_ schedule: NotificationSchedule) async throws

    /// Cancels a scheduled notification.
    func cancelNotification(id: String) async

    /// Cancels all scheduled notifications.
    func cancelAllNotifications() async

    /// Generates smart alerts from current financial data.
    func generateSmartAlerts(
        budgets: [BudgetItem],
        transactions: [TransactionItem],
        goals: [GoalItem]
    ) -> [SmartAlert]
}

// MARK: - Notification Scheduler Service

/// Actor-isolated notification scheduling and smart alert service.
///
/// Handles UNUserNotificationCenter interactions and on-device
/// financial data analysis for intelligent alert generation.
actor NotificationSchedulerService: NotificationSchedulerProtocol {

    static let shared = NotificationSchedulerService()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "NotificationScheduler"
    )

    private let center = UNUserNotificationCenter.current()

    // MARK: - Permission

    func requestPermission() async throws -> Bool {
        let granted = try await center.requestAuthorization(
            options: [.alert, .badge, .sound]
        )
        Self.logger.info("Notification permission: \(granted ? "granted" : "denied", privacy: .public)")
        return granted
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        let settings = await center.notificationSettings()
        return settings.authorizationStatus
    }

    // MARK: - Scheduling

    func scheduleNotification(_ schedule: NotificationSchedule) async throws {
        let content = UNMutableNotificationContent()
        content.title = schedule.type.displayName
        content.body = schedule.type.description
        content.sound = .default
        content.categoryIdentifier = schedule.type.categoryIdentifier
        content.threadIdentifier = schedule.type.rawValue

        var dateComponents = DateComponents()
        dateComponents.hour = schedule.scheduledHour
        dateComponents.minute = schedule.scheduledMinute

        switch schedule.frequency {
        case .daily:
            break // hour/minute already set
        case .weekly:
            dateComponents.weekday = 2 // Monday
        case .monthly:
            dateComponents.day = 1 // First of month
        }

        let trigger = UNCalendarNotificationTrigger(
            dateMatching: dateComponents,
            repeats: true
        )

        let request = UNNotificationRequest(
            identifier: schedule.id,
            content: content,
            trigger: trigger
        )

        try await center.add(request)

        Self.logger.info(
            "Scheduled \(schedule.type.rawValue, privacy: .public) notification: "
            + "\(schedule.frequency.rawValue, privacy: .public) at \(schedule.scheduledHour, privacy: .public):\(schedule.scheduledMinute, privacy: .public)"
        )
    }

    func cancelNotification(id: String) async {
        center.removePendingNotificationRequests(withIdentifiers: [id])
        Self.logger.debug("Cancelled notification: \(id, privacy: .public)")
    }

    func cancelAllNotifications() async {
        center.removeAllPendingNotificationRequests()
        Self.logger.info("Cancelled all pending notifications")
    }

    // MARK: - Smart Alert Generation

    func generateSmartAlerts(
        budgets: [BudgetItem],
        transactions: [TransactionItem],
        goals: [GoalItem]
    ) -> [SmartAlert] {
        var alerts: [SmartAlert] = []

        alerts.append(contentsOf: generateBudgetAlerts(budgets))
        alerts.append(contentsOf: generateGoalAlerts(goals))
        alerts.append(contentsOf: generateSpendingAlerts(transactions))

        return alerts.sorted { $0.priority > $1.priority }
    }

    // MARK: - Budget Alerts

    private func generateBudgetAlerts(_ budgets: [BudgetItem]) -> [SmartAlert] {
        budgets.compactMap { budget -> SmartAlert? in
            let percent = budget.progress * 100

            if percent >= 100 {
                return SmartAlert(
                    type: .budgetAlert,
                    title: String(localized: "\(budget.name) Over Budget"),
                    body: String(localized: "You've exceeded your \(budget.name) budget by \(String(format: "%.0f", percent - 100))%."),
                    priority: .urgent
                )
            } else if percent >= 90 {
                return SmartAlert(
                    type: .budgetAlert,
                    title: String(localized: "\(budget.name) Almost Full"),
                    body: String(localized: "You've used \(String(format: "%.0f", percent))% of your \(budget.name) budget."),
                    priority: .high
                )
            } else if percent >= 75 {
                return SmartAlert(
                    type: .budgetAlert,
                    title: String(localized: "\(budget.name) Budget Update"),
                    body: String(localized: "\(String(format: "%.0f", percent))% of your \(budget.name) budget has been used."),
                    priority: .normal
                )
            }
            return nil
        }
    }

    // MARK: - Goal Alerts

    private func generateGoalAlerts(_ goals: [GoalItem]) -> [SmartAlert] {
        goals.compactMap { goal -> SmartAlert? in
            let percent = goal.progress * 100

            if goal.isComplete && goal.status == .active {
                return SmartAlert(
                    type: .goalMilestone,
                    title: String(localized: "🎉 Goal Reached!"),
                    body: String(localized: "Congratulations! You've reached your \(goal.name) goal."),
                    priority: .high
                )
            } else if percent >= 75 && percent < 100 {
                return SmartAlert(
                    type: .goalMilestone,
                    title: String(localized: "\(goal.name) Almost There"),
                    body: String(localized: "You're \(String(format: "%.0f", percent))% of the way to your \(goal.name) goal!"),
                    priority: .normal
                )
            } else if percent >= 50 && percent < 75 {
                return SmartAlert(
                    type: .goalMilestone,
                    title: String(localized: "\(goal.name) Halfway!"),
                    body: String(localized: "Great progress! You've saved \(String(format: "%.0f", percent))% toward \(goal.name)."),
                    priority: .low
                )
            }
            return nil
        }
    }

    // MARK: - Spending Alerts

    private func generateSpendingAlerts(_ transactions: [TransactionItem]) -> [SmartAlert] {
        let calendar = Calendar.current
        let now = Date.now
        let todayExpenses = transactions.filter {
            $0.type == .expense && calendar.isDateInToday($0.date)
        }

        let todayTotal = todayExpenses.reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }

        // Alert if daily spending exceeds a reasonable threshold
        // Using 200_00 ($200) as a high-spending day indicator
        if todayTotal > 200_00 {
            return [SmartAlert(
                type: .unusualSpending,
                title: String(localized: "High Spending Day"),
                body: String(localized: "You've spent more than usual today. Consider reviewing your transactions."),
                priority: .normal
            )]
        }

        // Check for large individual transactions
        let largeTransactions = todayExpenses.filter { abs($0.amountMinorUnits) > 500_00 }
        if let largest = largeTransactions.first {
            return [SmartAlert(
                type: .unusualSpending,
                title: String(localized: "Large Transaction"),
                body: String(localized: "A large expense of \(largest.payee) was recorded today."),
                priority: .normal
            )]
        }

        return []
    }
}
