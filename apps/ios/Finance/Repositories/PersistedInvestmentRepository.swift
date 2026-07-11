// SPDX-License-Identifier: BUSL-1.1

// PersistedInvestmentRepository.swift
// Finance
//
// Persistence-backed investment repository. Replaces the always-hardcoded mock
// with real data that survives app restarts: portfolios, holdings, a recurring
// monthly contribution, and a contribution history are encoded to UserDefaults
// as JSON. On first launch it seeds a realistic, editable passive index-fund
// starter portfolio (VTI / VXUS / BND) so index-fund investors see trustworthy,
// contribution-aware numbers instead of throwaway sample tickers.
//
// Performance history is reconstructed deterministically from the current
// portfolio value and the recurring contribution — no random noise — so the
// same inputs always render the same trend.
//
// References: #2118

import Foundation
import os

/// UserDefaults-backed implementation of ``InvestmentRepository``.
final class PersistedInvestmentRepository: InvestmentRepository, @unchecked Sendable {

    // MARK: - Storage

    private let defaults: UserDefaults
    private let storageKey: String
    private let seededKey: String
    private let lock = NSLock()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "PersistedInvestmentRepository"
    )

    /// Deterministic monthly growth assumption used to reconstruct history.
    private static let monthlyGrowthRate = 0.005

    init(
        defaults: UserDefaults = .standard,
        storageKey: String = "investments.persisted.v1",
        seededKey: String = "investments.seeded.v1",
        seedIfEmpty: Bool = true
    ) {
        self.defaults = defaults
        self.storageKey = storageKey
        self.seededKey = seededKey
        if seedIfEmpty {
            seedIfNeeded()
        }
    }

    // MARK: - InvestmentRepository

    func getPortfolios() async throws -> [PortfolioItem] {
        load().portfolios.map { $0.toDomain() }
    }

    func getPortfolio(id: String) async throws -> PortfolioItem? {
        load().portfolios.first { $0.id == id }?.toDomain()
    }

    func getHoldings(portfolioId: String) async throws -> [HoldingItem] {
        load().portfolios.first { $0.id == portfolioId }?.toDomain().holdings ?? []
    }

    func getHolding(id: String) async throws -> HoldingItem? {
        for portfolio in load().portfolios {
            if let match = portfolio.holdings.first(where: { $0.id == id }) {
                return match.toDomain()
            }
        }
        return nil
    }

    func getPerformanceHistory(portfolioId: String, months: Int) async throws -> [PerformanceDataPoint] {
        guard let stored = load().portfolios.first(where: { $0.id == portfolioId }) else { return [] }
        let portfolio = stored.toDomain()
        let count = max(1, months)
        let calendar = Calendar.current
        let now = Date.now
        let contribution = Double(portfolio.monthlyContributionMinorUnits)

        // Walk backwards from the current value, removing one month's growth and
        // contribution at each step, then reverse to oldest-first.
        var value = Double(portfolio.totalValueMinorUnits)
        var reversed: [PerformanceDataPoint] = []
        for offset in 0..<count {
            let date = calendar.date(byAdding: .month, value: -offset, to: now) ?? now
            reversed.append(PerformanceDataPoint(date: date, valueMinorUnits: Int64(max(0, value).rounded())))
            value = (value - contribution) / (1.0 + Self.monthlyGrowthRate)
        }
        return reversed.reversed()
    }

    func getMonthlyContributionMinorUnits(portfolioId: String) async throws -> Int64 {
        load().portfolios.first { $0.id == portfolioId }?.monthlyContributionMinorUnits ?? 0
    }

    func setMonthlyContributionMinorUnits(_ amountMinorUnits: Int64, portfolioId: String) async throws {
        mutate { data in
            guard let index = data.portfolios.firstIndex(where: { $0.id == portfolioId }) else { return }
            data.portfolios[index].monthlyContributionMinorUnits = max(0, amountMinorUnits)
        }
    }

    func recordContribution(_ amountMinorUnits: Int64, portfolioId: String, date: Date) async throws {
        mutate { data in
            guard let index = data.portfolios.firstIndex(where: { $0.id == portfolioId }) else { return }
            let record = ContributionRecord(date: date, amountMinorUnits: amountMinorUnits)
            data.portfolios[index].contributions.append(record)
        }
    }

    func getContributions(portfolioId: String) async throws -> [ContributionRecord] {
        (load().portfolios.first { $0.id == portfolioId }?.contributions ?? [])
            .sorted { $0.date > $1.date }
    }

    func deleteAllInvestments() async throws {
        lock.lock()
        defer { lock.unlock() }
        defaults.removeObject(forKey: storageKey)
        defaults.removeObject(forKey: seededKey)
    }

    // MARK: - Persistence Helpers

    private func load() -> StoredData {
        lock.lock()
        defer { lock.unlock() }
        return decode()
    }

    private func mutate(_ transform: (inout StoredData) -> Void) {
        lock.lock()
        defer { lock.unlock() }
        var data = decode()
        transform(&data)
        encode(data)
    }

    private func decode() -> StoredData {
        guard let raw = defaults.data(forKey: storageKey) else { return StoredData(portfolios: []) }
        do {
            return try JSONDecoder().decode(StoredData.self, from: raw)
        } catch {
            Self.logger.error("Failed to decode investments: \(error.localizedDescription, privacy: .public)")
            return StoredData(portfolios: [])
        }
    }

    private func encode(_ data: StoredData) {
        do {
            let raw = try JSONEncoder().encode(data)
            defaults.set(raw, forKey: storageKey)
        } catch {
            Self.logger.error("Failed to encode investments: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func seedIfNeeded() {
        lock.lock()
        defer { lock.unlock() }
        guard defaults.data(forKey: storageKey) == nil, !defaults.bool(forKey: seededKey) else { return }
        encode(StoredData(portfolios: [Self.starterPortfolio()]))
        defaults.set(true, forKey: seededKey)
        Self.logger.info("Seeded starter index-fund portfolio")
    }

    // MARK: - Seed Data

    private static func starterPortfolio() -> StoredPortfolio {
        let created = Calendar.current.date(byAdding: .year, value: -3, to: .now) ?? .now
        let holdings: [StoredHolding] = [
            StoredHolding(
                id: "vti", portfolioId: "main", symbol: "VTI", name: "Vanguard Total Stock Market ETF",
                assetClass: AssetClassUI.stocks.rawValue, quantity: 120,
                costBasisMinorUnits: 2_400_000, currentValueMinorUnits: 3_180_000,
                previousCloseMinorUnits: 3_165_000, currencyCode: "USD", lastUpdated: .now
            ),
            StoredHolding(
                id: "vxus", portfolioId: "main", symbol: "VXUS", name: "Vanguard Total International Stock ETF",
                assetClass: AssetClassUI.stocks.rawValue, quantity: 200,
                costBasisMinorUnits: 1_100_000, currentValueMinorUnits: 1_260_000,
                previousCloseMinorUnits: 1_255_000, currencyCode: "USD", lastUpdated: .now
            ),
            StoredHolding(
                id: "bnd", portfolioId: "main", symbol: "BND", name: "Vanguard Total Bond Market ETF",
                assetClass: AssetClassUI.bonds.rawValue, quantity: 150,
                costBasisMinorUnits: 1_120_000, currentValueMinorUnits: 1_095_000,
                previousCloseMinorUnits: 1_098_000, currencyCode: "USD", lastUpdated: .now
            ),
        ]
        return StoredPortfolio(
            id: "main", name: String(localized: "Index Portfolio"),
            holdings: holdings, currencyCode: "USD", createdAt: created,
            monthlyContributionMinorUnits: 100_000, contributions: []
        )
    }
}

// MARK: - Codable Storage DTOs

private struct StoredData: Codable {
    var portfolios: [StoredPortfolio]
}

private struct StoredPortfolio: Codable {
    let id: String
    let name: String
    let holdings: [StoredHolding]
    let currencyCode: String
    let createdAt: Date
    var monthlyContributionMinorUnits: Int64
    var contributions: [ContributionRecord]

    func toDomain() -> PortfolioItem {
        PortfolioItem(
            id: id,
            name: name,
            holdings: holdings.map { $0.toDomain() },
            currencyCode: currencyCode,
            createdAt: createdAt,
            monthlyContributionMinorUnits: monthlyContributionMinorUnits
        )
    }
}

private struct StoredHolding: Codable {
    let id: String
    let portfolioId: String
    let symbol: String
    let name: String
    let assetClass: String
    let quantity: Int64
    let costBasisMinorUnits: Int64
    let currentValueMinorUnits: Int64
    let previousCloseMinorUnits: Int64?
    let currencyCode: String
    let lastUpdated: Date

    func toDomain() -> HoldingItem {
        HoldingItem(
            id: id,
            portfolioId: portfolioId,
            symbol: symbol,
            name: name,
            assetClass: AssetClassUI(rawValue: assetClass) ?? .other,
            quantity: quantity,
            costBasisMinorUnits: costBasisMinorUnits,
            currentValueMinorUnits: currentValueMinorUnits,
            previousCloseMinorUnits: previousCloseMinorUnits,
            currencyCode: currencyCode,
            lastUpdated: lastUpdated
        )
    }
}
