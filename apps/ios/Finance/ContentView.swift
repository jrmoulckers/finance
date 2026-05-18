// SPDX-License-Identifier: BUSL-1.1
import os
import SwiftUI

/// Root view of the Finance application (authenticated shell).
///
/// Hosts the `MainTabView` and injects infrastructure services
/// (deep linking, network monitoring) into the SwiftUI environment
/// for consumption by child views.
///
/// This view is ONLY shown when the user is authenticated. The
/// ``AuthGateView`` ensures unauthenticated users never reach this view.
/// Deep links targeting auth screens are intercepted and redirected to
/// the dashboard. (#1489)
struct ContentView: View {
    @Bindable var deepLinkHandler: DeepLinkHandler
    @State var networkMonitor: NetworkMonitor

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "ContentView"
    )

    init(
        deepLinkHandler: DeepLinkHandler = DeepLinkHandler(),
        networkMonitor: NetworkMonitor = NetworkMonitor()
    ) {
        self.deepLinkHandler = deepLinkHandler
        self.networkMonitor = networkMonitor
    }

    var body: some View {
        MainTabView(
            selectedTab: $deepLinkHandler.selectedTab.withDefault(.dashboard)
        )
        .environment(networkMonitor)
        .environment(deepLinkHandler)
        .onChange(of: deepLinkHandler.currentDeepLink) { _, newLink in
            guard let newLink else { return }
            // Redirect auth deep links — user is already authenticated (#1489)
            if case .authCallback = newLink {
                Self.logger.info("Auth deep link received while authenticated — redirecting to dashboard")
                deepLinkHandler.completeAuthCallback()
                deepLinkHandler.selectedTab = .dashboard
            }
        }
    }
}

// MARK: - Optional Binding Helper

private extension Binding where Value == MainTabView.Tab? {
    /// Converts an optional `Tab?` binding to a non-optional `Tab` binding
    /// using a default value when the source is `nil`.
    func withDefault(_ defaultValue: MainTabView.Tab) -> Binding<MainTabView.Tab> {
        Binding<MainTabView.Tab>(
            get: { self.wrappedValue ?? defaultValue },
            set: { self.wrappedValue = $0 }
        )
    }
}

#Preview {
    ContentView()
        .environment(BiometricAuthManager())
}