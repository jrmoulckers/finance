// swift-tools-version: 5.10
// SPDX-License-Identifier: BUSL-1.1
// Package.swift
//
// Swift Package Manager manifest for the Finance iOS & watchOS targets.
// The iOS app uses Swift Charts for financial data visualisation (#28).
// The watchOS companion app displays balance, transactions, and budgets (#30).

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
        .testTarget(
            name: "FinanceTests",
            dependencies: ["FinanceApp"],
            path: "Tests"
        ),
    ]
)
