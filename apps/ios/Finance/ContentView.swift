// SPDX-License-Identifier: BUSL-1.1

import SwiftUI

/// Root view of the Finance application.
///
/// Displays the main tab navigation backed by KMP-bridged repositories.
/// Biometric lock gating is handled at the ``FinanceApp`` level — this
/// view is only visible once the user has been authenticated (or if
/// biometric lock is disabled).
struct ContentView: View {
    var body: some View {
        MainTabView()
    }
}

#Preview {
    ContentView()
        .environment(BiometricAuthManager())
}
