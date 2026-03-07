import SwiftUI

/// Finance — a cross-platform financial tracking application.
///
/// This is the SwiftUI entry point for iOS, iPadOS, and macOS (Catalyst).
/// The app consumes shared business logic from the KMP `core` module and
/// renders a native Apple experience using SwiftUI exclusively.
@main
struct FinanceApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
