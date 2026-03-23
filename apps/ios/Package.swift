// SPDX-License-Identifier: BUSL-1.1

// swift-tools-version: 5.10
// Package.swift
//
// Swift Package Manager manifest for the Finance iOS & watchOS targets.
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
// After building, the binaryTarget below resolves automatically via the
// relative path. No manual copying is required.

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
    ],
    targets: [
        // KMP shared framework — contains models, core, and sync modules.
        // Built via: ./gradlew :packages:sync:assembleFinanceSyncXCFramework
        .binaryTarget(
            name: "FinanceSync",
            path: "../../packages/sync/build/XCFrameworks/release/FinanceSync.xcframework"
        ),
        .target(
            name: "FinanceApp",
            dependencies: ["FinanceSync"],
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
        .testTarget(
            name: "FinanceTests",
            dependencies: ["FinanceApp"],
            path: "Tests"
        ),
    ]
)
