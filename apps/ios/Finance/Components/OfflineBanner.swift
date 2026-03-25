// SPDX-License-Identifier: BUSL-1.1

// OfflineBanner.swift
// Finance
//
// A compact banner displayed at the top of content views when the device
// has no network connectivity. Supports VoiceOver and Dynamic Type.
// Refs #471

import SwiftUI

// MARK: - View

/// Displays a non-intrusive offline status banner with an SF Symbol
/// and a localized message.
///
/// Usage:
/// ```swift
/// @State private var networkMonitor = NetworkMonitor()
///
/// VStack {
///     if !networkMonitor.isConnected {
///         OfflineBanner()
///     }
///     // ... content
/// }
/// ```
struct OfflineBanner: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
                .font(.subheadline)
                .foregroundStyle(.white)
                .accessibilityHidden(true)

            Text(String(localized: "You are offline. Some features may be limited."))
                .font(.subheadline)
                .foregroundStyle(.white)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(FinanceColors.statusWarning, in: RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal)
        .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("offline_banner")
        .accessibilityLabel(String(localized: "Offline. Some features may be limited."))
        .accessibilityAddTraits(.isStatusElement)
    }
}

#Preview("Offline Banner") {
    VStack {
        OfflineBanner()
        Spacer()
    }
}
