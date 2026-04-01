// SPDX-License-Identifier: BUSL-1.1
// KMPSyncStatusAdapter.swift — Bridges KMP SyncStatus into SwiftUI-consumable types.
import Foundation
import Observation
import os

@Observable @MainActor
final class SyncStatusObserver {
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "SyncStatusObserver")
    var status: SyncStatusDisplay = .idle
    var statusText: String { status.displayText }
    var statusIcon: String { status.systemImage }
    var isSyncing: Bool { status.isSyncing }
    var pendingMutations: Int = 0
    var lastError: String?
    private var observationTask: Task<Void, Never>?

    func startObserving() {
        observationTask?.cancel()
        observationTask = Task { [weak self] in
            guard let sc = KMPBridge.shared.syncClient else { Self.logger.debug("No sync client"); return }
            for await s in sc.observeSyncStatus() {
                guard !Task.isCancelled else { break }
                self?.status = SyncStatusDisplay.fromKMP(s)
                if case .error(let e) = s { self?.lastError = e.localizedDescription }
            }
        }
    }
    func stopObserving() { observationTask?.cancel(); observationTask = nil }
    func syncNow() async {
        guard let sc = KMPBridge.shared.syncClient else { Self.logger.warning("No sync client"); return }
        let r = await sc.syncNow()
        switch r {
        case .success(let a, let p, _, _): Self.logger.info("Sync: \(a) applied, \(p) pushed"); lastError = nil
        case .failure(let e): Self.logger.error("Sync failed: \(e.localizedDescription)"); lastError = e.localizedDescription
        }
    }
}

enum SyncStatusDisplay: Sendable, Equatable {
    case idle, connecting, connected, disconnected
    case syncing(phase: String, progress: Double?)
    case error(message: String)

    var displayText: String {
        switch self {
        case .idle: String(localized: "Idle")
        case .connecting: String(localized: "Connecting...")
        case .syncing(let p, _): String(localized: "Syncing: \(p)")
        case .connected: String(localized: "Connected")
        case .error(let m): String(localized: "Error: \(m)")
        case .disconnected: String(localized: "Disconnected")
        }
    }
    var systemImage: String {
        switch self {
        case .idle: "checkmark.circle"; case .connecting: "antenna.radiowaves.left.and.right"
        case .syncing: "arrow.triangle.2.circlepath"; case .connected: "checkmark.circle.fill"
        case .error: "exclamationmark.triangle"; case .disconnected: "wifi.slash"
        }
    }
    var isSyncing: Bool { if case .syncing = self { return true }; return false }

    static func fromKMP(_ s: KMPSyncStatus) -> SyncStatusDisplay {
        switch s {
        case .idle: return .idle; case .connecting: return .connecting; case .connected: return .connected; case .disconnected: return .disconnected
        case .syncing(let ph, let pr, let t):
            let txt: String = switch ph { case .pulling: String(localized: "Pulling"); case .pushing: String(localized: "Pushing"); case .resolvingConflicts: String(localized: "Resolving") }
            return .syncing(phase: txt, progress: t.flatMap { $0 > 0 ? Double(pr) / Double($0) : nil })
        case .error(let e): return .error(message: e.localizedDescription)
        }
    }
}
