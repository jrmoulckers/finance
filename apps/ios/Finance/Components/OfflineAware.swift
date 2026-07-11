// SPDX-License-Identifier: BUSL-1.1

// OfflineAware.swift
// Finance
//
// A shared modifier that renders the OfflineBanner above any primary data
// screen whenever the device loses connectivity, and announces the change
// to VoiceOver as a status.
// Refs #3583

import SwiftUI

// MARK: - Modifier

/// Prepends the shared ``OfflineBanner`` above a screen's content whenever the
/// injected ``NetworkMonitor`` reports no connectivity, giving every primary
/// data screen (Transactions, Accounts, Budgets, Goals, …) a single, consistent
/// offline indicator instead of only the Dashboard. (#3583)
///
/// When connectivity drops, a VoiceOver announcement is posted so the change is
/// conveyed as a status even when the banner is off-screen.
struct OfflineAwareModifier: ViewModifier {
    @Environment(NetworkMonitor.self) private var networkMonitor: NetworkMonitor?

    private var isConnected: Bool { networkMonitor?.isConnected ?? true }

    func body(content: Content) -> some View {
        VStack(spacing: 0) {
            if let monitor = networkMonitor, !monitor.isConnected {
                OfflineBanner()
                    .padding(.top, FinanceSpacing.sm)
            }
            content
        }
        .animation(.default, value: isConnected)
        .onChange(of: isConnected) { _, connected in
            guard !connected else { return }
            AccessibilityNotification.Announcement(
                String(localized: "You are offline. Some features may be limited.")
            ).post()
        }
    }
}

// MARK: - View Extension

extension View {
    /// Renders the shared offline banner above this screen and announces
    /// connectivity loss to VoiceOver as a status. Apply to primary data
    /// screens for consistent offline feedback. (#3583)
    func offlineAware() -> some View {
        modifier(OfflineAwareModifier())
    }
}
