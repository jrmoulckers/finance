// SPDX-License-Identifier: BUSL-1.1

import SwiftUI

/// Root view of the Finance application.
///
/// Hosts the `MainTabView` and injects infrastructure services
/// (deep linking, network monitoring) into the SwiftUI environment
/// for consumption by child views.
struct ContentView: View {
    @Bindable var deepLinkHandler: DeepLinkHandler
    @State var networkMonitor: NetworkMonitor

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
}
