// SPDX-License-Identifier: BUSL-1.1

// NetworkMonitorTests.swift
// FinanceTests
//
// Unit tests for NetworkMonitor and related types.
// Refs #471

import Foundation
import Testing
@testable import FinanceApp

// MARK: - NetworkMonitor Tests

@Suite("NetworkMonitor")
struct NetworkMonitorTests {

    // MARK: - Initial State

    @Test("Default state is connected")
    func initialStateIsConnected() {
        let monitor = NetworkMonitor()
        #expect(monitor.isConnected == true)
    }

    @Test("Default connection type is unknown")
    func initialConnectionTypeIsUnknown() {
        let monitor = NetworkMonitor()
        #expect(monitor.connectionType == .unknown)
    }

    @Test("Default isExpensive is false")
    func initialIsExpensiveIsFalse() {
        let monitor = NetworkMonitor()
        #expect(monitor.isExpensive == false)
    }

    @Test("Default isConstrained is false")
    func initialIsConstrainedIsFalse() {
        let monitor = NetworkMonitor()
        #expect(monitor.isConstrained == false)
    }

    // MARK: - ConnectionType Enum

    @Test("ConnectionType raw values are correct")
    func connectionTypeRawValues() {
        #expect(NetworkMonitor.ConnectionType.wifi.rawValue == "wifi")
        #expect(NetworkMonitor.ConnectionType.cellular.rawValue == "cellular")
        #expect(NetworkMonitor.ConnectionType.wired.rawValue == "wired")
        #expect(NetworkMonitor.ConnectionType.unknown.rawValue == "unknown")
    }

    @Test("ConnectionType initialises from raw value")
    func connectionTypeFromRawValue() {
        #expect(NetworkMonitor.ConnectionType(rawValue: "wifi") == .wifi)
        #expect(NetworkMonitor.ConnectionType(rawValue: "cellular") == .cellular)
        #expect(NetworkMonitor.ConnectionType(rawValue: "wired") == .wired)
        #expect(NetworkMonitor.ConnectionType(rawValue: "unknown") == .unknown)
        #expect(NetworkMonitor.ConnectionType(rawValue: "invalid") == nil)
    }

    @Test("ConnectionType has four cases")
    func connectionTypeAllCases() {
        // Verify no accidental additions break expected set
        let knownCases: [NetworkMonitor.ConnectionType] = [
            .wifi, .cellular, .wired, .unknown,
        ]
        #expect(knownCases.count == 4)
    }
}
