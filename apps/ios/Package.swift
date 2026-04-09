// swift-tools-version: 5.10
// SPDX-License-Identifier: BUSL-1.1
// Package.swift
//
// Swift Package Manager manifest for the Finance iOS, watchOS, and App Clip targets.
// The App Clip provides quick transaction entry (#648).
// The iOS app uses Swift Charts for financial data visualisation (#28).
// The watchOS companion app displays balance, transactions, and budgets (#30).
//
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
        .library(name: "FinanceShared", targets: ["FinanceShared"]),
        .library(name: "FinanceClip", targets: ["FinanceClip"]),
        .library(name: "FinanceWatch", targets: ["FinanceWatch"]),
        .library(name: "FinanceWidget", targets: ["FinanceWidget"]),
    ],
    targets: [
        // MARK: - Shared module
        // Shared types consumed by the main app, App Clip, and widgets.
        .target(
            name: "FinanceShared",
            dependencies: [],
            path: "Shared"
        ),

        // MARK: - Main app
        .target(
            name: "FinanceApp",
            dependencies: ["FinanceShared"],
            path: "Finance",
            exclude: [
                "Info.plist",
                "Resources",
                "FinanceApp.swift",
                "Data",
            ]
        ),

        // MARK: - App Clip (#648)
        // Quick transaction entry via Universal Links and NFC App Clip codes.
        .target(
            name: "FinanceClip",
            dependencies: ["FinanceShared"],
            path: "FinanceClip",
            exclude: [
                "Info.plist",
                "FinanceClipApp.swift",
            ]
        ),

        // MARK: - Widget extension
        .target(
            name: "FinanceWidget",
            dependencies: ["FinanceShared"],
            path: "FinanceWidget"
        ),

        // MARK: - watchOS companion
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

        // MARK: - Tests
        .testTarget(
            name: "FinanceTests",
            dependencies: ["FinanceApp"],
            path: "Tests"
        ),
    ]
)
