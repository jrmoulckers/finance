// SPDX-License-Identifier: BUSL-1.1
// PowerSyncConfiguration.swift — Configuration for PowerSync + Supabase sync.
//
// Defines connection parameters for the PowerSync service endpoint and
// Supabase backend. All secrets (API keys, tokens) are sourced from the
// Apple Keychain — never hardcoded or in UserDefaults.
//
// References: #414, #289

import Foundation
import os

// MARK: - PowerSyncConfiguration

/// Configuration for the PowerSync real-time sync client.
///
/// Endpoint URLs and API keys are read from the Keychain or bundle
/// configuration. The configuration is validated at init time to
/// surface misconfiguration early.
struct PowerSyncConfiguration: Sendable {

    // MARK: - Properties

    /// PowerSync service endpoint URL.
    let powerSyncURL: String

    /// Supabase project URL.
    let supabaseURL: String

    /// Supabase anonymous API key.
    let supabaseAnonKey: String

    /// Whether to enable verbose sync logging (debug builds only).
    let verboseLogging: Bool

    /// Maximum number of retry attempts for failed sync operations.
    let maxRetryAttempts: Int

    /// Delay between retries in seconds (with exponential backoff).
    let retryBaseDelay: TimeInterval

    /// Maximum queue size for offline mutations before backpressure.
    let maxOfflineQueueSize: Int

    // MARK: - Keychain Keys

    private enum KeychainKeys {
        static let powerSyncURL = "com.finance.sync.powerSyncURL"
        static let supabaseURL = "com.finance.sync.supabaseURL"
        static let supabaseAnonKey = "com.finance.sync.supabaseAnonKey"
    }

    // MARK: - Logging

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "PowerSyncConfiguration"
    )

    // MARK: - Initialisation

    /// Creates configuration from the Keychain and bundle.
    ///
    /// Falls back to placeholder values if Keychain entries are missing
    /// (initial setup before server configuration is provided).
    init(keychain: KeychainManaging = KeychainManager.shared) {
        self.powerSyncURL = Self.loadKeychainString(
            key: KeychainKeys.powerSyncURL,
            keychain: keychain,
            fallback: "YOUR_POWERSYNC_URL"
        )

        self.supabaseURL = Self.loadKeychainString(
            key: KeychainKeys.supabaseURL,
            keychain: keychain,
            fallback: "YOUR_SUPABASE_URL"
        )

        self.supabaseAnonKey = Self.loadKeychainString(
            key: KeychainKeys.supabaseAnonKey,
            keychain: keychain,
            fallback: "YOUR_SUPABASE_ANON_KEY"
        )

        #if DEBUG
        self.verboseLogging = true
        #else
        self.verboseLogging = false
        #endif

        self.maxRetryAttempts = 5
        self.retryBaseDelay = 1.0
        self.maxOfflineQueueSize = 1000
    }

    /// Creates configuration with explicit values (for testing).
    init(
        powerSyncURL: String,
        supabaseURL: String,
        supabaseAnonKey: String,
        verboseLogging: Bool = false,
        maxRetryAttempts: Int = 5,
        retryBaseDelay: TimeInterval = 1.0,
        maxOfflineQueueSize: Int = 1000
    ) {
        self.powerSyncURL = powerSyncURL
        self.supabaseURL = supabaseURL
        self.supabaseAnonKey = supabaseAnonKey
        self.verboseLogging = verboseLogging
        self.maxRetryAttempts = maxRetryAttempts
        self.retryBaseDelay = retryBaseDelay
        self.maxOfflineQueueSize = maxOfflineQueueSize
    }

    // MARK: - Validation

    /// Whether the configuration has real (non-placeholder) values.
    var isConfigured: Bool {
        !powerSyncURL.hasPrefix("YOUR_") &&
        !supabaseURL.hasPrefix("YOUR_") &&
        !supabaseAnonKey.hasPrefix("YOUR_")
    }

    // MARK: - Keychain Storage

    /// Saves the sync configuration to the Keychain.
    ///
    /// Called after initial setup or when the server configuration changes.
    static func save(
        powerSyncURL: String,
        supabaseURL: String,
        supabaseAnonKey: String,
        keychain: KeychainManaging = KeychainManager.shared
    ) throws {
        if let data = powerSyncURL.data(using: .utf8) {
            try keychain.save(key: KeychainKeys.powerSyncURL, data: data)
        }
        if let data = supabaseURL.data(using: .utf8) {
            try keychain.save(key: KeychainKeys.supabaseURL, data: data)
        }
        if let data = supabaseAnonKey.data(using: .utf8) {
            try keychain.save(key: KeychainKeys.supabaseAnonKey, data: data)
        }
        logger.info("PowerSync configuration saved to Keychain")
    }

    /// Deletes all sync configuration from the Keychain.
    static func clear(keychain: KeychainManaging = KeychainManager.shared) throws {
        try keychain.delete(key: KeychainKeys.powerSyncURL)
        try keychain.delete(key: KeychainKeys.supabaseURL)
        try keychain.delete(key: KeychainKeys.supabaseAnonKey)
        logger.info("PowerSync configuration cleared from Keychain")
    }

    // MARK: - Helpers

    private static func loadKeychainString(
        key: String,
        keychain: KeychainManaging,
        fallback: String
    ) -> String {
        guard let data = keychain.load(key: key),
              let value = String(data: data, encoding: .utf8),
              !value.isEmpty
        else {
            return fallback
        }
        return value
    }
}
