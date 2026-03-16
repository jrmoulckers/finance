// SPDX-License-Identifier: BUSL-1.1

// NetworkMonitor.swift
// Finance
//
// Monitors network reachability using NWPathMonitor and exposes
// observable connectivity state for SwiftUI views.
// Refs #471

import Network
import Observation
import os

// MARK: - NetworkMonitor

/// Monitors network reachability using `NWPathMonitor`.
///
/// Provides observable connectivity state for use in SwiftUI views.
/// The monitor publishes changes on the main actor so SwiftUI can
/// react to connectivity transitions without manual dispatching.
///
/// Usage:
/// ```swift
/// @State private var networkMonitor = NetworkMonitor()
///
/// ContentView()
///     .environment(networkMonitor)
///     .task { networkMonitor.start() }
/// ```
///
/// > Important: Call ``start()`` once at app launch and ``stop()``
/// > only when the monitor is no longer needed. The underlying
/// > `NWPathMonitor` cannot be restarted after cancellation.
@Observable
final class NetworkMonitor: @unchecked Sendable {

    // MARK: - Private Properties

    private let logger = Logger(
        subsystem: "com.finance.app",
        category: "NetworkMonitor"
    )
    private let monitor: NWPathMonitor
    private let queue = DispatchQueue(label: "com.finance.app.network-monitor")

    // MARK: - Observable State

    /// Whether the device currently has network connectivity.
    private(set) var isConnected = true

    /// The current connection type (wifi, cellular, wired, etc.).
    private(set) var connectionType: ConnectionType = .unknown

    /// Whether the network path is expensive (e.g. cellular data).
    private(set) var isExpensive = false

    /// Whether the network path is constrained (e.g. Low Data Mode).
    private(set) var isConstrained = false

    // MARK: - ConnectionType

    /// Describes the active network interface type.
    enum ConnectionType: String, Sendable {
        case wifi
        case cellular
        case wired
        case unknown
    }

    // MARK: - Initialization

    /// Creates a new network monitor.
    ///
    /// - Parameter monitor: An `NWPathMonitor` instance. Defaults to a
    ///   new monitor observing all interface types. Injectable for testing.
    init(monitor: NWPathMonitor = NWPathMonitor()) {
        self.monitor = monitor
    }

    // MARK: - Public API

    /// Starts monitoring network path changes.
    ///
    /// Path updates are delivered on a background queue and forwarded
    /// to the main actor for UI-safe state mutation.
    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.updatePath(path)
            }
        }
        monitor.start(queue: queue)
        logger.info("Network monitoring started")
    }

    /// Stops monitoring and cancels the underlying `NWPathMonitor`.
    ///
    /// > Note: Once cancelled, this monitor instance cannot be restarted.
    /// > Create a new ``NetworkMonitor`` if monitoring needs to resume.
    func stop() {
        monitor.cancel()
        logger.info("Network monitoring stopped")
    }

    // MARK: - Path Processing

    /// Updates observable state from the latest `NWPath`.
    ///
    /// Runs on the main actor to ensure SwiftUI views observe the
    /// changes synchronously on the UI thread.
    @MainActor
    private func updatePath(_ path: NWPath) {
        let wasConnected = isConnected

        isConnected = path.status == .satisfied
        isExpensive = path.isExpensive
        isConstrained = path.isConstrained

        if path.usesInterfaceType(.wifi) {
            connectionType = .wifi
        } else if path.usesInterfaceType(.cellular) {
            connectionType = .cellular
        } else if path.usesInterfaceType(.wiredEthernet) {
            connectionType = .wired
        } else {
            connectionType = .unknown
        }

        if wasConnected != isConnected {
            logger.info(
                "Network status changed: \(self.isConnected ? "connected" : "disconnected", privacy: .public) (\(self.connectionType.rawValue, privacy: .public))"
            )
        }
    }
}
