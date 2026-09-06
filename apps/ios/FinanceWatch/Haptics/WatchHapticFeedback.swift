// SPDX-License-Identifier: BUSL-1.1

#if os(watchOS)
import Foundation
import WatchKit

/// watchOS haptic bridge for transaction-save feedback.
enum WatchHapticFeedback {
    static let preferenceKey = "finance_haptic_feedback_enabled"

    /// Plays a transaction-save success confirmation when enabled.
    static func transactionSaved(defaults: UserDefaults = .standard) {
        guard isEnabled(defaults: defaults) else { return }
        WKInterfaceDevice.current().play(.success)
    }

    /// Plays a soft validation warning when enabled.
    static func validationWarning(defaults: UserDefaults = .standard) {
        guard isEnabled(defaults: defaults) else { return }
        WKInterfaceDevice.current().play(.failure)
    }

    private static func isEnabled(defaults: UserDefaults) -> Bool {
        defaults.object(forKey: preferenceKey) == nil
            ? true
            : defaults.bool(forKey: preferenceKey)
    }
}
#endif
