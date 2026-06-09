// SPDX-License-Identifier: BUSL-1.1

import SwiftUI

struct IconView: View {
    @AppStorage(IconPackPreference.key) private var storedPackId = IconPackID.defaultIOS.rawValue

    private let token: IconToken
    private let size: CGFloat
    private let weight: Font.Weight
    private let packIdOverride: String?

    init(_ token: IconToken, size: CGFloat = 24, weight: Font.Weight = .regular) {
        self.token = token
        self.size = size
        self.weight = weight
        self.packIdOverride = nil
    }

    init(_ token: IconToken, size: CGFloat = 24, weight: Font.Weight = .regular, packId: String) {
        self.token = token
        self.size = size
        self.weight = weight
        self.packIdOverride = packId
    }

    var body: some View {
        Group {
            switch selectedPack {
            case .sfSymbols:
                Image(systemName: sfSymbolFor(token))
                    .font(.system(size: size, weight: weight))
            case .standardLucide:
                Image("lucide.\(lucideNameFor(token))", bundle: .module)
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var selectedPack: IconPackID {
        IconPackID.from(packIdOverride ?? storedPackId)
    }
}
