// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

// ─────────────────────────────────────────────────────────────────────────────
// Chain-aware cost basis + taxable-event tracking — Issue #2168
//
// Crypto-heavy users have hundreds of swaps, bridges and reward events across
// chains. This pure engine models taxable crypto events explicitly, preserves
// wallet/chain provenance so basis survives cross-chain and self-transfer
// activity, supports FIFO / HIFO / wallet-aware specific identification, and
// classifies airdrops and staking rewards as income while still tracking later
// capital gains on disposal.
//
// No Compose / Koin / coroutines / network — deterministic and unit-testable.
// Money is carried as Long cents; quantities as Double.
// ─────────────────────────────────────────────────────────────────────────────

/** The economic nature of a crypto event for tax purposes. */
enum class TaxEventType(val displayName: String) {
    BUY("Buy"),
    SELL("Sell"),
    SWAP("Swap"),
    BRIDGE("Bridge"),
    WRAP("Wrap"),
    UNWRAP("Unwrap"),
    GAS_FEE("Gas Fee"),
    STAKING_REWARD("Staking Reward"),
    AIRDROP("Airdrop"),
    INCOME_RECEIPT("Income Receipt"),
    ;

    /** Rewards/airdrops/income are taxed as ordinary income at fair value on receipt. */
    val isIncomeOnReceipt: Boolean
        get() = this == STAKING_REWARD || this == AIRDROP || this == INCOME_RECEIPT

    /** Disposals realize capital gains (proceeds minus basis). */
    val isDisposal: Boolean
        get() = this == SELL || this == SWAP

    /**
     * Non-taxable movements that MUST preserve cost basis across the change of
     * wallet/chain/wrapper rather than realizing a gain.
     */
    val preservesBasis: Boolean
        get() = this == BRIDGE || this == WRAP || this == UNWRAP
}

/** Lot-selection method for choosing which basis to relieve on disposal. */
enum class LotMethod(val displayName: String) {
    /** Oldest lots first. */
    FIFO("First-In, First-Out"),

    /** Highest cost-per-unit first (minimizes gains). */
    HIFO("Highest-In, First-Out"),

    /** Caller supplies explicit lot IDs (wallet-aware specific identification). */
    SPECIFIC_ID("Specific Identification"),
}

/**
 * A taxable (or basis-affecting) crypto event with full wallet/chain provenance.
 *
 * @param walletId Source wallet identifier (provenance for specific-id + bridges).
 * @param chain Chain the event occurred on (source chain for bridges).
 * @param assetSymbol The primary asset moved.
 * @param assetQuantity Units of [assetSymbol] moved.
 * @param valueCents Fair market value of the primary asset at the event, in cents.
 *   For BUY this is the purchase cost; for SELL the proceeds; for SWAP the value
 *   of the leg disposed of; for income the FMV received.
 * @param feeCents Fees paid (gas/bridge), in cents.
 * @param counterAssetSymbol For SWAP/WRAP/UNWRAP, the asset received.
 * @param counterAssetQuantity Units of [counterAssetSymbol] received.
 * @param destinationChain For BRIDGE, the chain funds move to.
 * @param destinationWalletId For BRIDGE/transfer, the receiving wallet.
 * @param specificLotIds For [LotMethod.SPECIFIC_ID] disposals, the lots to relieve.
 */
data class CryptoTaxEvent(
    val id: String,
    val type: TaxEventType,
    val timestampEpochMs: Long,
    val walletId: String,
    val chain: Chain,
    val assetSymbol: String,
    val assetQuantity: Double,
    val valueCents: Long,
    val feeCents: Long = 0L,
    val counterAssetSymbol: String? = null,
    val counterAssetQuantity: Double = 0.0,
    val destinationChain: Chain? = null,
    val destinationWalletId: String? = null,
    val specificLotIds: List<String> = emptyList(),
)

/** An open tax lot with remaining quantity and its acquisition basis. */
data class TaxLot(
    val id: String,
    val walletId: String,
    val chain: Chain,
    val symbol: String,
    val originalQuantity: Double,
    val remainingQuantity: Double,
    val costBasisCents: Long,
    val acquiredEpochMs: Long,
) {
    /** Cost basis per remaining unit, in cents. */
    val costPerUnitCents: Double
        get() = if (originalQuantity == 0.0) 0.0 else costBasisCents.toDouble() / originalQuantity
}

/** A realized capital gain (or loss) from a disposal. */
data class RealizedGain(
    val eventId: String,
    val symbol: String,
    val quantity: Double,
    val proceedsCents: Long,
    val costBasisCents: Long,
    val gainCents: Long,
    val isLongTerm: Boolean,
)

/** Ordinary income recognized on receipt of a reward/airdrop. */
data class IncomeEvent(
    val eventId: String,
    val type: TaxEventType,
    val symbol: String,
    val fairMarketValueCents: Long,
    val timestampEpochMs: Long,
)

/** A non-fatal issue encountered while processing (e.g. selling with no basis). */
data class TaxWarning(val eventId: String, val message: String)

/** The full tax report produced by [CryptoTaxEngine.process]. */
data class TaxReport(
    val method: LotMethod,
    val realizedGains: List<RealizedGain>,
    val incomeEvents: List<IncomeEvent>,
    val openLots: List<TaxLot>,
    val warnings: List<TaxWarning>,
    val totalProceedsCents: Long,
    val totalCostBasisCents: Long,
    val totalRealizedGainCents: Long,
    val shortTermGainCents: Long,
    val longTermGainCents: Long,
    val totalIncomeCents: Long,
    val totalFeesCents: Long,
) {
    companion object {
        val EMPTY = TaxReport(
            method = LotMethod.FIFO,
            realizedGains = emptyList(),
            incomeEvents = emptyList(),
            openLots = emptyList(),
            warnings = emptyList(),
            totalProceedsCents = 0L,
            totalCostBasisCents = 0L,
            totalRealizedGainCents = 0L,
            shortTermGainCents = 0L,
            longTermGainCents = 0L,
            totalIncomeCents = 0L,
            totalFeesCents = 0L,
        )
    }
}

/**
 * Processes a chronological stream of [CryptoTaxEvent]s into a [TaxReport],
 * maintaining per-(wallet, chain, symbol) lot inventories.
 */
object CryptoTaxEngine {

    /** ~1 year holding period boundary between short- and long-term gains. */
    const val LONG_TERM_THRESHOLD_MS: Long = 365L * 24 * 60 * 60 * 1000

    private data class LotKey(val walletId: String, val chain: Chain, val symbol: String)

    @Suppress("LongMethod", "CyclomaticComplexMethod") // Cohesive tax state machine.
    fun process(events: List<CryptoTaxEvent>, method: LotMethod = LotMethod.FIFO): TaxReport {
        if (events.isEmpty()) return TaxReport.EMPTY.copy(method = method)

        val inventory = HashMap<LotKey, MutableList<TaxLot>>()
        val realized = mutableListOf<RealizedGain>()
        val income = mutableListOf<IncomeEvent>()
        val warnings = mutableListOf<TaxWarning>()
        var totalFees = 0L
        var lotSeq = 0

        fun addLot(walletId: String, chain: Chain, symbol: String, qty: Double, basisCents: Long, at: Long) {
            if (qty <= 0.0) return
            val key = LotKey(walletId, chain, symbol.uppercase())
            inventory.getOrPut(key) { mutableListOf() }.add(
                TaxLot(
                    id = "lot-${lotSeq++}",
                    walletId = walletId,
                    chain = chain,
                    symbol = symbol.uppercase(),
                    originalQuantity = qty,
                    remainingQuantity = qty,
                    costBasisCents = basisCents,
                    acquiredEpochMs = at,
                ),
            )
        }

        // Relieves [qty] of basis from the inventory, returning basis consumed and
        // the acquisition time of the earliest lot touched (for holding period).
        fun relieveBasis(
            event: CryptoTaxEvent,
            symbol: String,
            qty: Double,
        ): Pair<Long, Long> {
            val key = LotKey(event.walletId, event.chain, symbol.uppercase())
            val lots = inventory[key]
            if (lots.isNullOrEmpty()) {
                warnings += TaxWarning(event.id, "No basis lots for $symbol on ${event.chain.displayName}; basis treated as 0.")
                return 0L to event.timestampEpochMs
            }
            val ordered = when (method) {
                LotMethod.FIFO -> lots.sortedBy { it.acquiredEpochMs }
                LotMethod.HIFO -> lots.sortedByDescending { it.costPerUnitCents }
                LotMethod.SPECIFIC_ID -> {
                    val chosen = lots.filter { it.id in event.specificLotIds }
                    if (chosen.isEmpty()) lots.sortedBy { it.acquiredEpochMs } else chosen
                }
            }
            var remaining = qty
            var basisConsumed = 0L
            var earliestAcquired = Long.MAX_VALUE
            for (lot in ordered) {
                if (remaining <= 1e-12) break
                val take = minOf(lot.remainingQuantity, remaining)
                if (take <= 0.0) continue
                val lotBasis = Math.round(lot.costPerUnitCents * take)
                basisConsumed += lotBasis
                earliestAcquired = minOf(earliestAcquired, lot.acquiredEpochMs)
                val idx = lots.indexOfFirst { it.id == lot.id }
                if (idx >= 0) {
                    lots[idx] = lots[idx].copy(remainingQuantity = lots[idx].remainingQuantity - take)
                }
                remaining -= take
            }
            lots.removeAll { it.remainingQuantity <= 1e-9 }
            if (remaining > 1e-9) {
                warnings += TaxWarning(event.id, "Disposed more $symbol than tracked basis; excess treated as zero-basis.")
            }
            if (earliestAcquired == Long.MAX_VALUE) earliestAcquired = event.timestampEpochMs
            return basisConsumed to earliestAcquired
        }

        fun recordDisposal(event: CryptoTaxEvent, symbol: String, qty: Double, proceedsCents: Long) {
            val (basis, acquiredAt) = relieveBasis(event, symbol, qty)
            val isLongTerm = (event.timestampEpochMs - acquiredAt) >= LONG_TERM_THRESHOLD_MS
            realized += RealizedGain(
                eventId = event.id,
                symbol = symbol.uppercase(),
                quantity = qty,
                proceedsCents = proceedsCents,
                costBasisCents = basis,
                gainCents = proceedsCents - basis,
                isLongTerm = isLongTerm,
            )
        }

        for (event in events.sortedBy { it.timestampEpochMs }) {
            totalFees += event.feeCents
            when (event.type) {
                TaxEventType.BUY ->
                    addLot(event.walletId, event.chain, event.assetSymbol, event.assetQuantity, event.valueCents + event.feeCents, event.timestampEpochMs)

                TaxEventType.STAKING_REWARD, TaxEventType.AIRDROP, TaxEventType.INCOME_RECEIPT -> {
                    income += IncomeEvent(event.id, event.type, event.assetSymbol.uppercase(), event.valueCents, event.timestampEpochMs)
                    // Income establishes basis equal to FMV so later disposal only
                    // taxes the subsequent capital move.
                    addLot(event.walletId, event.chain, event.assetSymbol, event.assetQuantity, event.valueCents, event.timestampEpochMs)
                }

                TaxEventType.SELL ->
                    recordDisposal(event, event.assetSymbol, event.assetQuantity, event.valueCents - event.feeCents)

                TaxEventType.SWAP -> {
                    // Dispose the outgoing leg, then acquire the incoming leg with
                    // basis equal to the disposed leg's fair market value.
                    recordDisposal(event, event.assetSymbol, event.assetQuantity, event.valueCents - event.feeCents)
                    val recvSymbol = event.counterAssetSymbol
                    if (recvSymbol != null && event.counterAssetQuantity > 0.0) {
                        addLot(event.walletId, event.chain, recvSymbol, event.counterAssetQuantity, event.valueCents, event.timestampEpochMs)
                    }
                }

                TaxEventType.BRIDGE ->
                    moveBasis(
                        inventory = inventory,
                        event = event,
                        fromKey = LotKey(event.walletId, event.chain, event.assetSymbol.uppercase()),
                        toKey = LotKey(
                            event.destinationWalletId ?: event.walletId,
                            event.destinationChain ?: event.chain,
                            event.assetSymbol.uppercase(),
                        ),
                        symbol = event.assetSymbol,
                        qty = event.assetQuantity,
                        warnings = warnings,
                    )

                TaxEventType.WRAP, TaxEventType.UNWRAP -> {
                    // Wrapping preserves basis; migrate lots to the wrapped symbol.
                    val target = event.counterAssetSymbol ?: event.assetSymbol
                    moveBasis(
                        inventory = inventory,
                        event = event,
                        fromKey = LotKey(event.walletId, event.chain, event.assetSymbol.uppercase()),
                        toKey = LotKey(event.walletId, event.chain, target.uppercase()),
                        symbol = event.assetSymbol,
                        qty = event.assetQuantity,
                        warnings = warnings,
                        retargetSymbol = target,
                        retargetQuantity = event.counterAssetQuantity.takeIf { it > 0.0 },
                    )
                }

                TaxEventType.GAS_FEE -> Unit // Captured via totalFees.
            }
        }

        val openLots = inventory.values.flatten().filter { it.remainingQuantity > 1e-9 }
            .sortedBy { it.acquiredEpochMs }
        val shortTerm = realized.filterNot { it.isLongTerm }.sumOf { it.gainCents }
        val longTerm = realized.filter { it.isLongTerm }.sumOf { it.gainCents }

        return TaxReport(
            method = method,
            realizedGains = realized,
            incomeEvents = income,
            openLots = openLots,
            warnings = warnings,
            totalProceedsCents = realized.sumOf { it.proceedsCents },
            totalCostBasisCents = realized.sumOf { it.costBasisCents },
            totalRealizedGainCents = realized.sumOf { it.gainCents },
            shortTermGainCents = shortTerm,
            longTermGainCents = longTerm,
            totalIncomeCents = income.sumOf { it.fairMarketValueCents },
            totalFeesCents = totalFees,
        )
    }

    @Suppress("LongParameterList")
    private fun moveBasis(
        inventory: HashMap<LotKey, MutableList<TaxLot>>,
        event: CryptoTaxEvent,
        fromKey: LotKey,
        toKey: LotKey,
        symbol: String,
        qty: Double,
        warnings: MutableList<TaxWarning>,
        retargetSymbol: String? = null,
        retargetQuantity: Double? = null,
    ) {
        val source = inventory[fromKey]
        if (source.isNullOrEmpty()) {
            warnings += TaxWarning(event.id, "No basis to move for $symbol; movement recorded without basis.")
            return
        }
        val ordered = source.sortedBy { it.acquiredEpochMs }
        var remaining = qty
        var movedBasis = 0L
        var movedQty = 0.0
        var earliest = Long.MAX_VALUE
        for (lot in ordered) {
            if (remaining <= 1e-12) break
            val take = minOf(lot.remainingQuantity, remaining)
            if (take <= 0.0) continue
            movedBasis += Math.round(lot.costPerUnitCents * take)
            movedQty += take
            earliest = minOf(earliest, lot.acquiredEpochMs)
            val idx = source.indexOfFirst { it.id == lot.id }
            if (idx >= 0) source[idx] = source[idx].copy(remainingQuantity = source[idx].remainingQuantity - take)
            remaining -= take
        }
        source.removeAll { it.remainingQuantity <= 1e-9 }
        if (movedQty <= 0.0) return

        // Preserve the acquisition date so the holding period survives the move.
        val destSymbol = (retargetSymbol ?: toKey.symbol).uppercase()
        val destQty = retargetQuantity ?: movedQty
        val destList = inventory.getOrPut(toKey.copy(symbol = destSymbol)) { mutableListOf() }
        destList.add(
            TaxLot(
                id = "lot-move-${event.id}",
                walletId = toKey.walletId,
                chain = toKey.chain,
                symbol = destSymbol,
                originalQuantity = destQty,
                remainingQuantity = destQty,
                costBasisCents = movedBasis,
                acquiredEpochMs = if (earliest == Long.MAX_VALUE) event.timestampEpochMs else earliest,
            ),
        )
    }
}
