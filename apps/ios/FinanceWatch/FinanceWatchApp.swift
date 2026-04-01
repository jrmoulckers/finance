// SPDX-License-Identifier: BUSL-1.1
// FinanceWatchApp.swift - watchOS companion app. Refs #30, #649

import os
import SwiftUI
import WatchConnectivity
import WatchKit
import WidgetKit

@main
struct FinanceWatchApp: App {
    @WKExtensionDelegateAdaptor(ExtensionDelegate.self) private var delegate
    @State private var connectivityManager = WatchConnectivityManager()
    var body: some Scene {
        WindowGroup {
            NavigationStack {
                TabView {
                    BalanceView(manager: connectivityManager)
                    RecentTransactionsView(manager: connectivityManager)
                    BudgetStatusView(manager: connectivityManager)
                }.tabViewStyle(.verticalPage)
            }
        }
    }
}

final class ExtensionDelegate: NSObject, WKExtensionDelegate {
    private static let logger = Logger(subsystem: "com.finance.watch", category: "ExtensionDelegate")
    func applicationDidFinishLaunching() { scheduleNextRefresh() }
    func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
        for task in backgroundTasks {
            if let r = task as? WKApplicationRefreshBackgroundTask {
                WidgetCenter.shared.reloadAllTimelines(); scheduleNextRefresh()
                r.setTaskCompletedWithSnapshot(false)
            } else { task.setTaskCompletedWithSnapshot(false) }
        }
    }
    private func scheduleNextRefresh() {
        WKExtension.shared().scheduleBackgroundRefresh(
            withPreferredDate: Date(timeIntervalSinceNow: 1800), userInfo: nil
        ) { error in
            if let error { Self.logger.error("Schedule failed: \(error.localizedDescription, privacy: .public)") }
        }
    }
}

@Observable @MainActor
final class WatchConnectivityManager: NSObject, Sendable {
    enum DataKey {
        static let balance = "balance"
        static let currencyCode = "currencyCode"
        static let transactions = "transactions"
        static let budgets = "budgets"
        static let lastUpdated = "lastUpdated"
    }
    var balanceMinorUnits: Int64 = 0
    var currencyCode: String = "USD"
    var recentTransactions: [WatchTransaction] = []
    var budgetStatuses: [WatchBudgetStatus] = []
    var hasReceivedData: Bool = false
    var lastUpdated: Date?
    private static let logger = Logger(subsystem: "com.finance.watch", category: "WatchConnectivity")
    override init() { super.init(); activateSession() }
    private func activateSession() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default; s.delegate = self; s.activate()
    }
    nonisolated func applyContext(_ context: [String: Any]) {
        Task { @MainActor in
            if let b = Self.parseInt64(context[DataKey.balance]) { self.balanceMinorUnits = b }
            else if context[DataKey.balance] != nil { Self.logger.warning("Malformed balance") }
            if let c = context[DataKey.currencyCode] as? String { self.currencyCode = c }
            if let td = context[DataKey.transactions] as? [[String: Any]] {
                self.recentTransactions = td.compactMap { WatchTransaction(dictionary: $0) }
            }
            if let bd = context[DataKey.budgets] as? [[String: Any]] {
                self.budgetStatuses = bd.compactMap { WatchBudgetStatus(dictionary: $0) }
            }
            if let ts = context[DataKey.lastUpdated] as? TimeInterval {
                self.lastUpdated = Date(timeIntervalSince1970: ts)
            }
            self.hasReceivedData = true
            self.updateComplicationData()
        }
    }
    nonisolated func requestRefresh() {
        let s = WCSession.default
        guard s.activationState == .activated, s.isReachable else { return }
        s.sendMessage(["request": "refresh"], replyHandler: nil) { error in
            Self.logger.error("Refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }
    private func updateComplicationData() {
        guard let d = UserDefaults(suiteName: WatchConstants.appGroupIdentifier) else { return }
        d.set(balanceMinorUnits, forKey: ComplicationDataKey.balanceMinorUnits)
        d.set(currencyCode, forKey: ComplicationDataKey.currencyCode)
        WidgetCenter.shared.reloadAllTimelines()
    }
    nonisolated static func parseInt64(_ value: Any?) -> Int64? {
        if let v = value as? Int64 { return v }
        if let v = value as? Int { return Int64(v) }
        if let v = value as? Double { return Int64(exactly: v) }
        return nil
    }
}

extension WatchConnectivityManager: WCSessionDelegate {
    nonisolated func session(_ s: WCSession, activationDidCompleteWith st: WCSessionActivationState, error: Error?) {
        if st == .activated { let c = s.receivedApplicationContext; if !c.isEmpty { applyContext(c) } }
    }
    nonisolated func session(_ s: WCSession, didReceiveApplicationContext c: [String: Any]) { applyContext(c) }
    nonisolated func session(_ s: WCSession, didReceiveUserInfo i: [String: Any] = [:]) { applyContext(i) }
}

enum WatchConstants { static let appGroupIdentifier = "group.com.finance.app" }
enum ComplicationDataKey { static let balanceMinorUnits = "complication.balanceMinorUnits"; static let currencyCode = "complication.currencyCode" }

struct WatchTransaction: Identifiable, Sendable {
    let id: String; let payee: String; let amountMinorUnits: Int64
    let category: String; let date: Date; let isExpense: Bool
    init?(dictionary d: [String: Any]) {
        guard let id = d["id"] as? String, let payee = d["payee"] as? String,
              let amt = WatchConnectivityManager.parseInt64(d["amountMinorUnits"]),
              let cat = d["category"] as? String, let ts = d["date"] as? TimeInterval
        else { return nil }
        self.id = id; self.payee = payee; self.amountMinorUnits = amt; self.category = cat
        self.date = Date(timeIntervalSince1970: ts); self.isExpense = d["isExpense"] as? Bool ?? true
    }
}

struct WatchBudgetStatus: Identifiable, Sendable {
    let id: String; let name: String; let spentMinorUnits: Int64; let budgetedMinorUnits: Int64
    var fraction: Double {
        guard budgetedMinorUnits > 0 else { return 0 }
        return min(max(Double(spentMinorUnits) / Double(budgetedMinorUnits), 0), 1)
    }
    var isOverBudget: Bool { spentMinorUnits > budgetedMinorUnits }
    init?(dictionary d: [String: Any]) {
        guard let id = d["id"] as? String, let name = d["name"] as? String,
              let sp = WatchConnectivityManager.parseInt64(d["spentMinorUnits"]),
              let bu = WatchConnectivityManager.parseInt64(d["budgetedMinorUnits"])
        else { return nil }
        self.id = id; self.name = name; self.spentMinorUnits = sp; self.budgetedMinorUnits = bu
    }
}

