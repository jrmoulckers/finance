// SPDX-License-Identifier: BUSL-1.1

// NetworkMonitor.swift
// Finance
//
// Monitors network reachability using NWPathMonitor wrapped in an @Observable
// class. Exposes `isConnected` for UI consumption and connection type details
// for logging.
// Refs #471

import Network
import os

// MARK: - ConnectionType

/// Describes the type of active network connection.
enum ConnectionType: String, Sendable {
    case wifi
    case cellular
    case wiredEthernet
    case other
    case none
}

// MARK: - NetworkMonitor

/// Observes network reachability using `NWPathMonitor` and exposes
/// reactive state for SwiftUI views.
///
/// Usage:
/// ```swift
/// @State private var networkMonitor = NetworkMonitor()
///
/// if !networkMonitor.isConnected {
///     OfflineBanner()
/// }
/// ```
///
/// The monitor starts observing on initialization and stops when
/// deallocated. It dispatches path updates to a dedicated serial
/// queue and publishes state changes on the main actor.
@Observable
@MainActor
final class NetworkMonitor {

    // MARK: - Observable State

    /// Whether the device currently has a viable network path.
    private(set) var isConnected: Bool = true

    /// The type of the current network connection.
    private(set) var connectionType: ConnectionType = .other

    /// Whether the current path is considered expensive (e.g. cellular data).
    private(set) var isExpensive: Bool = false

    /// Whether the current path is constrained (e.g. Low Data Mode).
    private(set) var isConstrained: Bool = false

    // MARK: - Private

    /// The underlying NW path monitor.
    private let monitor: NWPathMonitor

    /// Dedicated dispatch queue for receiving path updates.
    private let monitorQueue = DispatchQueue(
        label: "com.finance.NetworkMonitor",
        qos: .utility
    )

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "NetworkMonitor"
    )

    // MARK: - Init / Deinit

    init() {
        self.monitor = NWPathMonitor()
        startMonitoring()
    }

    deinit {
        monitor.cancel()
    }

    // MARK: - Monitoring

    /// Starts the NW path monitor and updates observable state on every
    /// path change.
    private func startMonitoring() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                self?.handlePathUpdate(path)
            }
        }
        monitor.start(queue: monitorQueue)
        Self.logger.info("Network monitoring started")
    }

    /// Processes a path update and publishes new state.
    private func handlePathUpdate(_ path: NWPath) {
        let wasConnected = isConnected
        isConnected = path.status == .satisfied
        isExpensive = path.isExpensive
        isConstrained = path.isConstrained
        connectionType = resolveConnectionType(path)

        if wasConnected != isConnected {
            Self.logger.info(
                "Network status changed: connected=\(self.isConnected, privacy: .public), type=\(self.connectionType.rawValue, privacy: .public)"
            )
        }
    }

    /// Determines the primary connection type from the path's available
    /// interfaces, preferring Wi-Fi over cellular.
    private func resolveConnectionType(_ path: NWPath) -> ConnectionType {
        guard path.status == .satisfied else {
            return .none
        }

        if path.usesInterfaceType(.wifi) {
            return .wifi
        } else if path.usesInterfaceType(.cellular) {
            return .cellular
        } else if path.usesInterfaceType(.wiredEthernet) {
            return .wiredEthernet
        } else {
            return .other
        }
    }
}
