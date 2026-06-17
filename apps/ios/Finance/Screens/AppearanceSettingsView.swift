// SPDX-License-Identifier: BUSL-1.1

import SwiftUI

struct AppearanceSettingsView: View {
    @AppStorage(IconPackPreference.key) private var selectedIconPackId = IconPackID.defaultIOS.rawValue

    private let previewTokens: [IconToken] = [.home, .transactions, .budget, .settings]

    var body: some View {
        Form {
            Section(String(localized: "Icon Style")) {
                Picker(String(localized: "Icon Style"), selection: $selectedIconPackId) {
                    ForEach(IconPackID.allCases) { pack in
                        IconStylePickerRow(pack: pack, previewTokens: previewTokens)
                            .tag(pack.id)
                    }
                }
                .pickerStyle(.inline)
                .accessibilityIdentifier("icon_style_picker")
            } footer: {
                Text(String(localized: "Choose between Finance's cross-platform Standard Lucide icons and Apple's native SF Symbols."))
            }
        }
        .navigationTitle(String(localized: "Appearance"))
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct IconStylePickerRow: View {
    let pack: IconPackID
    let previewTokens: [IconToken]

    var body: some View {
        HStack(spacing: 12) {
            Text(pack.displayName)
            Spacer()
            HStack(spacing: 6) {
                ForEach(previewTokens, id: \.self) { token in
                    IconView(token, size: 18, packId: pack.id)
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityHidden(true)
        }
    }
}

#Preview {
    NavigationStack {
        AppearanceSettingsView()
    }
}
