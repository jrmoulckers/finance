// swift-tools-version: 5.10
// SPDX-License-Identifier: BUSL-1.1
// Package.swift
//
// Swift Package Manager manifest for the Finance iOS, watchOS, and App Clip targets.
// The App Clip provides quick transaction entry (#648).
// The iOS app uses Swift Charts for financial data visualisation (#28).
// The watchOS companion app displays balance, transactions, and budgets (#30).
//
// KMP Integration (Issue #563)
// ----------------------------
// The FinanceSync XCFramework bundles all shared Kotlin Multiplatform code
// (models, core business logic, and sync engine) into a single static framework.
//
// Build the XCFramework on macOS:
//   ./gradlew :packages:sync:assembleFinanceSyncXCFramework
//
// The framework is generated at:
//   packages/sync/build/XCFrameworks/release/FinanceSync.xcframework
//
// After building, add the binaryTarget to the targets array:
//   .binaryTarget(
//       name: "FinanceSync",
//       path: "../../packages/sync/build/XCFrameworks/release/FinanceSync.xcframework"
//   )
// and add "FinanceSync" to FinanceApp's dependencies.
//
// Until the XCFramework build is configured in Gradle, KMPBridge.swift uses
// stubs via #if canImport(FinanceSync).

import PackageDescription

let package = Package(
    name: "Finance",
    platforms: [
        .iOS(.v17),
        .watchOS(.v10),
        .macOS(.v14),
    ],
    products: [
        .library(name: "FinanceApp", targets: ["FinanceApp"]),
        .library(name: "FinanceWatch", targets: ["FinanceWatch"]),
        .library(name: "FinanceShared", targets: ["FinanceShared"]),
        .library(name: "FinanceClip", targets: ["FinanceClip"]),
    ],
    targets: [
        // KMP shared framework — not yet available as an XCFramework.
        // See KMP Integration comment above for setup instructions.
        .target(
            name: "FinanceApp",
            dependencies: [],
            path: "Finance",
            exclude: [
                "Info.plist",
                "Resources",
                "FinanceApp.swift",
            ]
        ),
        .target(
            name: "FinanceWatch",
            dependencies: [],
            path: "FinanceWatch",
            sources: [
                "FinanceWatchApp.swift",
                "BalanceView.swift",
                "RecentTransactionsView.swift",
                "BudgetStatusView.swift",
                "ComplicationProvider.swift",
            ]
        ),
        .target(
            name: "FinanceShared",
            dependencies: [],
            path: "Shared"
        ),
        .target(
            name: "FinanceClip",
            dependencies: ["FinanceShared"],
            path: "FinanceClip",
            exclude: [
                "Info.plist",
            ]
        ),
        .testTarget(
            name: "FinanceTests",
            dependencies: ["FinanceApp"],
            path: "Tests"
        ),
    ]
)
