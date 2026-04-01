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
        .library(name: "FinanceWatch", targets: ["FinanceWatch"]),
        .library(name: "FinanceWidget", targets: ["FinanceWidget"]),
    ],
    targets: [
        .target(
            name: "FinanceApp",
            dependencies: [],
            path: "Finance",
            exclude: [
                "Info.plist",
                "Resources",
                "FinanceApp.swift",
                "Data",
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
                "FinanceClipApp.swift",
            ]
        ),
        .target(
            name: "FinanceWidget",
            dependencies: [],
            path: "FinanceWidget"
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
