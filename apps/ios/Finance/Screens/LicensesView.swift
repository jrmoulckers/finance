// SPDX-License-Identifier: BUSL-1.1

// LicensesView.swift
// Finance
//
// Displays third-party open-source license attributions using
// collapsible DisclosureGroups. Each library shows its name,
// license type, and the full license text when expanded.

import os
import SwiftUI

// MARK: - License Model

/// Represents a third-party library and its license information.
private struct LicenseEntry: Identifiable {
    let id = UUID()
    let name: String
    let version: String
    let licenseType: String
    let url: String
    let copyright: String
    let licenseText: String
}

// MARK: - View

struct LicensesView: View {
    @ScaledMetric private var iconSize: CGFloat = 20

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "LicensesView"
    )

    private let licenses: [LicenseEntry] = [
        LicenseEntry(
            name: "SQLDelight",
            version: "2.0.2",
            licenseType: "Apache License 2.0",
            url: "https://github.com/cashapp/sqldelight",
            copyright: "Copyright (C) Cash App (Block, Inc.)",
            licenseText: LicenseTexts.apache2
        ),
        LicenseEntry(
            name: "Kotlin",
            version: "2.1.0",
            licenseType: "Apache License 2.0",
            url: "https://github.com/JetBrains/kotlin",
            copyright: "Copyright 2010-2024 JetBrains s.r.o. and Kotlin Programming Language contributors.",
            licenseText: LicenseTexts.apache2
        ),
        LicenseEntry(
            name: "kotlinx-coroutines",
            version: "1.9.0",
            licenseType: "Apache License 2.0",
            url: "https://github.com/Kotlin/kotlinx.coroutines",
            copyright: "Copyright 2010-2024 JetBrains s.r.o. and Kotlin Programming Language contributors.",
            licenseText: LicenseTexts.apache2
        ),
        LicenseEntry(
            name: "kotlinx-serialization",
            version: "1.7.3",
            licenseType: "Apache License 2.0",
            url: "https://github.com/Kotlin/kotlinx.serialization",
            copyright: "Copyright 2010-2024 JetBrains s.r.o. and Kotlin Programming Language contributors.",
            licenseText: LicenseTexts.apache2
        ),
        LicenseEntry(
            name: "kotlinx-datetime",
            version: "0.6.1",
            licenseType: "Apache License 2.0",
            url: "https://github.com/Kotlin/kotlinx-datetime",
            copyright: "Copyright 2010-2024 JetBrains s.r.o. and Kotlin Programming Language contributors.",
            licenseText: LicenseTexts.apache2
        ),
        LicenseEntry(
            name: "Ktor",
            version: "3.0.3",
            licenseType: "Apache License 2.0",
            url: "https://github.com/ktorio/ktor",
            copyright: "Copyright 2014-2024 JetBrains s.r.o. and contributors.",
            licenseText: LicenseTexts.apache2
        ),
        LicenseEntry(
            name: "Koin",
            version: "4.0.1",
            licenseType: "Apache License 2.0",
            url: "https://github.com/InsertKoinIO/koin",
            copyright: "Copyright 2017-2024 Koin contributors.",
            licenseText: LicenseTexts.apache2
        ),
        LicenseEntry(
            name: "SQLCipher",
            version: "4.6.1",
            licenseType: "BSD 3-Clause",
            url: "https://www.zetetic.net/sqlcipher/",
            copyright: "Copyright (c) 2008-2024 Zetetic LLC. All rights reserved.",
            licenseText: LicenseTexts.bsd3Clause
        ),
    ]

    var body: some View {
        List {
            headerSection

            ForEach(licenses) { license in
                licenseDisclosureGroup(for: license)
            }
        }
        .navigationTitle(String(localized: "Open Source Licenses"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            Self.logger.debug("Licenses screen viewed")
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        Section {
            Text(String(localized: "Finance uses the following open-source libraries. We are grateful to the developers and communities behind these projects."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .accessibilityLabel(
                    String(localized: "Finance uses the following open-source libraries. We are grateful to the developers and communities behind these projects.")
                )
        }
    }

    // MARK: - License Row

    private func licenseDisclosureGroup(for license: LicenseEntry) -> some View {
        Section {
            DisclosureGroup {
                VStack(alignment: .leading, spacing: 12) {
                    LabeledContent(String(localized: "Version")) {
                        Text(license.version)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    LabeledContent(String(localized: "License")) {
                        Text(license.licenseType)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    Divider()

                    Text(license.copyright)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Text(license.licenseText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    String(localized: "\(license.name) version \(license.version), \(license.licenseType). \(license.copyright)")
                )
            } label: {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(license.name)
                            .font(.body)
                        Text(license.licenseType)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "book.closed")
                        .frame(width: iconSize)
                        .foregroundStyle(Color.accentColor)
                }
            }
            .accessibilityLabel(String(localized: "\(license.name), \(license.licenseType)"))
            .accessibilityHint(String(localized: "Expands to show the full license text"))
        }
    }
}

// MARK: - License Texts

/// Contains the reusable full text of common open-source licenses.
private enum LicenseTexts {
    static let apache2 = """
    Licensed under the Apache License, Version 2.0 (the "License"); \
    you may not use this file except in compliance with the License. \
    You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software \
    distributed under the License is distributed on an "AS IS" BASIS, \
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. \
    See the License for the specific language governing permissions and \
    limitations under the License.
    """

    static let bsd3Clause = """
    Redistribution and use in source and binary forms, with or without \
    modification, are permitted provided that the following conditions are met:

    1. Redistributions of source code must retain the above copyright notice, \
    this list of conditions and the following disclaimer.

    2. Redistributions in binary form must reproduce the above copyright notice, \
    this list of conditions and the following disclaimer in the documentation \
    and/or other materials provided with the distribution.

    3. Neither the name of the copyright holder nor the names of its \
    contributors may be used to endorse or promote products derived from this \
    software without specific prior written permission.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER "AS IS" AND ANY EXPRESS \
    OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES \
    OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO \
    EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, \
    SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, \
    PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; \
    OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, \
    WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR \
    OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF \
    ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
    """
}

#Preview {
    NavigationStack {
        LicensesView()
    }
}
