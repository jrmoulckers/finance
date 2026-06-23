// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

// ─────────────────────────────────────────────────────────────────────────────
// Crypto holdings source — Issue #2176
//
// Abstracts where the user's crypto positions come from so the live data path
// can be swapped in without touching the ViewModel or UI.
//
// NOTE: The real path reads holdings from the local SQLDelight tables and tags
// crypto accounts distinctly from traditional investments. That wiring depends
// on the live refresh pipeline (#2702) and is deferred — see the TODO(human)
// in CryptoDashboardViewModel. Until then [SampleCryptoHoldingsSource] supplies
// clearly-labelled illustrative positions with NO network access.
// ─────────────────────────────────────────────────────────────────────────────

/** Supplies the crypto positions to value against live prices. */
interface CryptoHoldingsSource {
    suspend fun holdings(): List<CryptoHolding>
}

/**
 * Deterministic, offline holdings used until real holdings are wired (#2702).
 * The cost-basis figures are illustrative, not financial advice.
 */
class SampleCryptoHoldingsSource : CryptoHoldingsSource {
    override suspend fun holdings(): List<CryptoHolding> = listOf(
        CryptoHolding("c-btc", "BTC", "Bitcoin", quantity = 0.4120, costBasisCents = 2_180_000L),
        CryptoHolding("c-eth", "ETH", "Ethereum", quantity = 6.250, costBasisCents = 1_640_000L),
        CryptoHolding("c-sol", "SOL", "Solana", quantity = 85.00, costBasisCents = 980_000L),
        CryptoHolding("c-ada", "ADA", "Cardano", quantity = 12_500.0, costBasisCents = 720_000L),
        CryptoHolding("c-dot", "DOT", "Polkadot", quantity = 940.0, costBasisCents = 810_000L),
    )
}
