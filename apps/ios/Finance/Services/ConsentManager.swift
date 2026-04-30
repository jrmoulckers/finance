// SPDX-License-Identifier: BUSL-1.1
// ConsentManager.swift — GDPR consent capture and App Tracking Transparency.
//
// Manages user privacy consent state including:
// - App Tracking Transparency (ATT) dialog
// - First-run privacy consent
// - Per-purpose consent tracking (analytics, sync, crash reporting)
// - Consent withdrawal and re-prompt
//
// Consent state is persisted in UserDefaults (non-sensitive boolean flags).
// This is appropriate because consent flags themselves are not PII — they
// are a user preference that controls data processing.
//
// References: #879, #474, #649

import AppTrackingTransparency
import Foundation
import Observation
import os

// MARK: - Consent Purpose

/// Individual data processing purposes requiring user consent.
///
/// Each purpose is independently toggleable and maps to a specific
/// data processing activity. This granularity satisfies GDPR Article 7
/// requirements for specific, informed consent per processing purpose.
enum ConsentPurpose: String, CaseIterable, Sendable, Identifiable {
    /// Device analytics (anonymised usage metrics).
    case analytics

    /// Cloud sync with Supabase/PowerSync.
    case cloudSync

    /// Crash reporting and error telemetry.
    case crashReporting

    /// App Tracking Transparency (IDFA access).
    case tracking

    /// Push notifications for budget alerts and goal milestones.
    case notifications

    var id: String { rawValue }

    /// Human-readable title for the consent toggle.
    var title: String {
        switch self {
        case .analytics: String(localized: "Usage Analytics")
        case .cloudSync: String(localized: "Cloud Sync")
        case .crashReporting: String(localized: "Crash Reporting")
        case .tracking: String(localized: "App Tracking")
        case .notifications: String(localized: "Notifications")
        }
    }

    /// Detailed description explaining what data is processed and why.
    var description: String {
        switch self {
        case .analytics:
            String(localized: "Anonymised usage data helps us improve the app experience. No financial data is included.")
        case .cloudSync:
            String(localized: "Sync your data across devices via encrypted cloud storage. Data is end-to-end encrypted.")
        case .crashReporting:
            String(localized: "Automatic crash reports help us fix bugs faster. Reports never include financial data.")
        case .tracking:
            String(localized: "Allows personalised advertising measurement. You can change this in Settings > Privacy.")
        case .notifications:
            String(localized: "Receive alerts when budgets are exceeded or goals reach milestones.")
        }
    }

    /// SF Symbol icon name for the consent toggle.
    var icon: String {
        switch self {
        case .analytics: "chart.bar"
        case .cloudSync: "arrow.triangle.2.circlepath"
        case .crashReporting: "ant"
        case .tracking: "megaphone"
        case .notifications: "bell"
        }
    }

    /// The UserDefaults key for this consent purpose.
    var defaultsKey: String { "com.finance.consent.\(rawValue)" }
}

// MARK: - ConsentManager

/// Manages GDPR-compliant user consent across the app.
///
/// Tracks per-purpose consent, handles ATT prompts, and provides
/// a single source of truth for whether specific data processing
/// is permitted.
///
/// ## Architecture
///
/// ```
/// ConsentView (first run)  →  ConsentManager  ←  PrivacySettingsView
///                                   ↓
///                            UserDefaults (flags)
///                            ATTrackingManager (IDFA)
/// ```
@Observable @MainActor
final class ConsentManager {

    // MARK: - Singleton

    static let shared = ConsentManager()

    // MARK: - Logging

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "ConsentManager"
    )

    // MARK: - State

    /// Whether the first-run consent dialog has been shown.
    var hasShownConsentDialog: Bool {
        didSet { defaults.set(hasShownConsentDialog, forKey: Keys.hasShownConsent) }
    }

    /// The date when consent was last updated.
    private(set) var consentDate: Date? {
        didSet {
            if let date = consentDate {
                defaults.set(date, forKey: Keys.consentDate)
            }
        }
    }

    /// Per-purpose consent states.
    private(set) var consents: [ConsentPurpose: Bool] = [:]

    /// ATT authorisation status.
    private(set) var trackingAuthorizationStatus: ATTrackingManager.AuthorizationStatus = .notDetermined

    // MARK: - Private

    private let defaults: UserDefaults

    private enum Keys {
        static let hasShownConsent = "com.finance.consent.hasShown"
        static let consentDate = "com.finance.consent.date"
    }

    // MARK: - Initialisation

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.hasShownConsentDialog = defaults.bool(forKey: Keys.hasShownConsent)
        self.consentDate = defaults.object(forKey: Keys.consentDate) as? Date

        // Load per-purpose consent states
        for purpose in ConsentPurpose.allCases {
            let key = purpose.defaultsKey
            if defaults.object(forKey: key) != nil {
                consents[purpose] = defaults.bool(forKey: key)
            } else {
                // Default: essential purposes enabled, non-essential disabled
                switch purpose {
                case .cloudSync, .crashReporting:
                    consents[purpose] = true
                case .analytics, .tracking, .notifications:
                    consents[purpose] = false
                }
            }
        }

        // Check current ATT status
        trackingAuthorizationStatus = ATTrackingManager.trackingAuthorizationStatus
    }

    // MARK: - Public API

    /// Whether the user has consented to a specific processing purpose.
    func hasConsent(for purpose: ConsentPurpose) -> Bool {
        consents[purpose] ?? false
    }

    /// Updates consent for a specific purpose.
    func setConsent(_ granted: Bool, for purpose: ConsentPurpose) {
        consents[purpose] = granted
        defaults.set(granted, forKey: purpose.defaultsKey)
        consentDate = .now

        Self.logger.info(
            "Consent \(granted ? "granted" : "withdrawn", privacy: .public) "
            + "for \(purpose.rawValue, privacy: .public)"
        )

        // If tracking consent is granted, request ATT
        if purpose == .tracking && granted {
            Task { await requestTrackingAuthorization() }
        }
    }

    /// Records that the user has completed the first-run consent flow.
    ///
    /// - Parameter consents: Dictionary of purpose → consent state.
    func recordInitialConsent(_ initialConsents: [ConsentPurpose: Bool]) {
        for (purpose, granted) in initialConsents {
            setConsent(granted, for: purpose)
        }
        hasShownConsentDialog = true
        consentDate = .now
        Self.logger.info("Initial consent recorded for \(initialConsents.count) purposes")
    }

    /// Withdraws all non-essential consents (GDPR right to withdraw).
    func withdrawAllConsent() {
        for purpose in ConsentPurpose.allCases {
            // Keep essential functionality
            switch purpose {
            case .cloudSync:
                // Cloud sync is essential for the service
                break
            default:
                setConsent(false, for: purpose)
            }
        }
        Self.logger.info("All non-essential consent withdrawn")
    }

    /// Requests App Tracking Transparency authorisation.
    ///
    /// Per Apple guidelines, this should be called after explaining
    /// why tracking is used — not immediately on launch.
    func requestTrackingAuthorization() async {
        let status = await ATTrackingManager.requestTrackingAuthorization()
        trackingAuthorizationStatus = status

        switch status {
        case .authorized:
            consents[.tracking] = true
            defaults.set(true, forKey: ConsentPurpose.tracking.defaultsKey)
            Self.logger.info("ATT authorized")
        case .denied, .restricted:
            consents[.tracking] = false
            defaults.set(false, forKey: ConsentPurpose.tracking.defaultsKey)
            Self.logger.info("ATT denied/restricted")
        case .notDetermined:
            Self.logger.debug("ATT not yet determined")
        @unknown default:
            Self.logger.warning("ATT unknown status")
        }
    }

    /// Returns a GDPR-compliant summary of current consent state.
    func consentSummary() -> [String: Any] {
        var summary: [String: Any] = [
            "consentDate": consentDate?.ISO8601Format() ?? "none",
            "hasShownDialog": hasShownConsentDialog,
            "attStatus": attStatusString,
        ]
        for purpose in ConsentPurpose.allCases {
            summary[purpose.rawValue] = consents[purpose] ?? false
        }
        return summary
    }

    /// Human-readable ATT status.
    var attStatusString: String {
        switch trackingAuthorizationStatus {
        case .authorized: String(localized: "Authorized")
        case .denied: String(localized: "Denied")
        case .restricted: String(localized: "Restricted")
        case .notDetermined: String(localized: "Not Determined")
        @unknown default: String(localized: "Unknown")
        }
    }
}
