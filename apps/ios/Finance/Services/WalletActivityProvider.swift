// SPDX-License-Identifier: BUSL-1.1

// WalletActivityProvider.swift
// Finance
//
// Source of recent Apple Pay / card activity for Wallet-aware capture (#2171).
//
// Apple does NOT expose Wallet or Apple Pay transaction history to third-party
// apps through any public API. PassKit only surfaces passes the app itself
// provisioned, and full purchase history requires the private, Apple-approved
// "Apple Pay transaction history" entitlement granted to issuing banks. This
// protocol therefore abstracts the activity source so a real PassKit/issuer
// integration can be dropped in later, while the shipping build uses a
// deterministic simulated provider that mirrors the shape of real card
// activity (noisy statement descriptors included). See the PR "Needs Human
// Action" section for the entitlement/provisioning steps.

import Foundation

/// Abstracts the source of recent card/Apple Pay activity to review-import.
protocol WalletActivityProviding: Sendable {
    /// Returns recent card activity as recognition-ready candidates.
    func recentActivity(displayCurrencyCode: String) async -> [WalletTransactionCandidate]
}

/// Deterministic stand-in for real Wallet/issuer activity. Produces a stable
/// set of candidates with realistic, noisy statement descriptors so the review
/// inbox, merchant recognition and duplicate detection can be exercised and
/// tested without the (unavailable) private entitlement.
struct SimulatedWalletActivityProvider: WalletActivityProviding {

    /// A raw activity row before recognition.
    private struct RawActivity {
        let descriptor: String
        let amountMinorUnits: Int64
        let daysAgo: Int
        let cardLast4: String?
    }

    private let now: Date

    init(now: Date = Date()) {
        self.now = now
    }

    func recentActivity(displayCurrencyCode: String) async -> [WalletTransactionCandidate] {
        let rows: [RawActivity] = [
            RawActivity(descriptor: "TST* THE COFFEE CLUB 4471", amountMinorUnits: 620, daysAgo: 0, cardLast4: "4242"),
            RawActivity(descriptor: "UBER *TRIP HELP.UBER.COM", amountMinorUnits: 1830, daysAgo: 0, cardLast4: "4242"),
            RawActivity(descriptor: "WHOLE FOODS MKT #123 POS DEBIT", amountMinorUnits: 4275, daysAgo: 1, cardLast4: "4242"),
            RawActivity(descriptor: "AIRBNB * HMXYZ12345", amountMinorUnits: 21500, daysAgo: 2, cardLast4: "1005"),
            RawActivity(descriptor: "SQ *BLUE BOTTLE COFFEE", amountMinorUnits: 540, daysAgo: 3, cardLast4: "4242"),
            RawActivity(descriptor: "PAYMENT REF 88213 AUTH", amountMinorUnits: 999, daysAgo: 4, cardLast4: nil),
        ]

        let calendar = Calendar.current
        return rows.enumerated().map { index, row in
            let date = calendar.date(byAdding: .day, value: -row.daysAgo, to: now) ?? now
            return MerchantRecognizer.recognize(
                id: "wallet-\(index)-\(row.descriptor.hashValue)",
                rawDescriptor: row.descriptor,
                amountMinorUnits: row.amountMinorUnits,
                currencyCode: displayCurrencyCode,
                date: date,
                cardLast4: row.cardLast4
            )
        }
    }
}
