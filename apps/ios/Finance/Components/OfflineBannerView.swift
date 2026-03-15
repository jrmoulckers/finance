// SPDX-License-Identifier: BUSL-1.1

// OfflineBannerView.swift
// Finance
//
// A reusable banner that informs the user when the device is offline.
// Displayed at the top of key screens (e.g. Dashboard) and automatically
// hidden when connectivity is restored.
// Refs #471

import SwiftUI

// MARK: - OfflineBannerView

/// A non-intrusive banner indicating the device is offline.
///
/// Shows a `wifi.slash` icon with an explanatory message. The banner
/// uses `.ultraThinMaterial` for visual consistency with the system
/// appearance and combines its children into a single accessibility
/// element for a concise VoiceOver experience.
///
/// Usage:
/// ```swift
/// if !networkMonitor.isConnected {
///     OfflineBannerView()
///         .transition(.move(edge: .top).combined(with: .opacity))
/// }
/// ```
struct OfflineBannerView: View {

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Text(String(localized: "You're offline. Changes will sync when reconnected."))
                .font(.caption)
                .foregroundStyle(.primary)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "Offline mode. Changes will sync when reconnected.")
        )
        .accessibilityAddTraits(.isStatusElement)
    }
}

// MARK: - Preview

#Preview("Offline Banner") {
    VStack {
        OfflineBannerView()
        Spacer()
    }
}
