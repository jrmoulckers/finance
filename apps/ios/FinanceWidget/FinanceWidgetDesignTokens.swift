// SPDX-License-Identifier: BUSL-1.1
// FinanceWidgetDesignTokens.swift — Refs #380

import SwiftUI

enum FinanceWidgetColors {
    static let amountPositive = Color(light: .init(red: 0.082, green: 0.502, blue: 0.239), dark: .init(red: 0.133, green: 0.773, blue: 0.369))
    static let amountNegative = Color(light: .init(red: 0.725, green: 0.110, blue: 0.110), dark: .init(red: 0.937, green: 0.267, blue: 0.267))
    static let statusPositive = Color(light: .init(red: 0.086, green: 0.639, blue: 0.290), dark: .init(red: 0.133, green: 0.773, blue: 0.369))
    static let statusNegative = Color(light: .init(red: 0.863, green: 0.149, blue: 0.149), dark: .init(red: 0.937, green: 0.267, blue: 0.267))
    static let statusWarning = Color(light: .init(red: 0.851, green: 0.467, blue: 0.024), dark: .init(red: 0.961, green: 0.620, blue: 0.043))
    static let interactive = Color(light: .init(red: 0.145, green: 0.388, blue: 0.922), dark: .init(red: 0.376, green: 0.647, blue: 0.980))
}

private extension Color {
    init(light: Color, dark: Color) {
        #if canImport(UIKit)
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light) })
        #elseif canImport(AppKit)
        self.init(nsColor: NSColor(name: nil) { $0.bestMatch(from: [.darkAqua, .vibrantDark]) != nil ? NSColor(dark) : NSColor(light) })
        #endif
    }
}

enum FinanceWidgetSpacing {
    static let xxs: CGFloat = 4
    static let xs: CGFloat = 8
    static let sm: CGFloat = 12
    static let md: CGFloat = 16
}