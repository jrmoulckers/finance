// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.wedding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import kotlin.math.roundToLong

/** A vendor row formatted for display. */
data class VendorRowUi(
    val id: String,
    val name: String,
    val category: String,
    val budgetedFormatted: String,
    val paidFormatted: String,
    val remainingFormatted: String,
    val dueDateText: String?,
    val perGuestBadge: String?,
    val paidFraction: Float,
)

/** A due-date reminder row. */
data class DueDateUi(
    val vendorName: String,
    val dueDateText: String,
    val remainingFormatted: String,
)

/** UI state for the wedding workspace (#2145). */
data class WeddingUiState(
    val isLoading: Boolean = true,
    val targetFormatted: String = "$0.00",
    val targetCents: Long = 0L,
    val guestCount: Int = 0,
    val totalBudgetedFormatted: String = "$0.00",
    val totalPaidFormatted: String = "$0.00",
    val remainingToPayFormatted: String = "$0.00",
    val overUnderText: String = "",
    val isOverBudget: Boolean = false,
    val budgetUsedFraction: Float = 0f,
    val perGuestFormatted: String = "$0.00",
    val vendors: List<VendorRowUi> = emptyList(),
    val upcomingDueDates: List<DueDateUi> = emptyList(),
)

/**
 * ViewModel for the shared wedding budget workspace (#2145).
 *
 * Tracks vendors, deposits paid, upcoming due dates, and guest-count-sensitive
 * estimates, and shows budgeted vs actual against the couple's target.
 */
class WeddingViewModel(
    private val repository: WeddingRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(WeddingUiState())
    val uiState: StateFlow<WeddingUiState> = _uiState.asStateFlow()

    private val currency: Currency = Currency.USD
    private var workspace: WeddingWorkspace = WeddingWorkspace.DEFAULT

    init {
        load()
    }

    fun setGuestCount(count: Int) {
        workspace = workspace.copy(guestCount = count.coerceIn(0, MAX_GUESTS))
        persistAndRender()
    }

    fun setTargetBudget(dollars: Double) {
        workspace = workspace.copy(targetBudget = Cents.fromDollars(dollars.coerceAtLeast(0.0)))
        persistAndRender()
    }

    fun addVendor(
        name: String,
        category: WeddingCategory,
        budgetDollars: Double,
        perGuest: Boolean,
        paidDollars: Double,
        dueDateEpochDay: Long?,
    ) {
        if (name.isBlank()) return
        val budget = Cents.fromDollars(budgetDollars.coerceAtLeast(0.0))
        val vendor = WeddingVendor(
            id = "vendor-${System.currentTimeMillis()}",
            name = name.trim(),
            category = category,
            flatBudget = if (perGuest) Cents.ZERO else budget,
            perGuestCost = if (perGuest) budget else Cents.ZERO,
            paid = Cents.fromDollars(paidDollars.coerceAtLeast(0.0)),
            dueDateEpochDay = dueDateEpochDay,
        )
        workspace = workspace.copy(vendors = workspace.vendors + vendor)
        persistAndRender()
    }

    fun recordPayment(vendorId: String, amountDollars: Double) {
        if (amountDollars <= 0) return
        workspace = workspace.copy(
            vendors = workspace.vendors.map { v ->
                if (v.id == vendorId) {
                    v.copy(paid = Cents(v.paid.amount + Cents.fromDollars(amountDollars).amount))
                } else {
                    v
                }
            },
        )
        persistAndRender()
    }

    fun deleteVendor(vendorId: String) {
        workspace = workspace.copy(vendors = workspace.vendors.filterNot { it.id == vendorId })
        persistAndRender()
    }

    private fun load() {
        viewModelScope.launch {
            workspace = repository.load()
            render()
        }
    }

    private fun persistAndRender() {
        repository.save(workspace)
        render()
    }

    private fun render() {
        val guests = workspace.guestCount
        val totalBudgeted = workspace.vendors.fold(0L) { s, v -> s + v.effectiveBudget(guests).amount }
        val totalPaid = workspace.vendors.fold(0L) { s, v -> s + v.paid.amount }
        val remainingToPay = workspace.vendors.fold(0L) { s, v -> s + v.remaining(guests).amount }
        val target = workspace.targetBudget.amount
        val overUnder = totalBudgeted - target
        val perGuest = if (guests > 0) (totalBudgeted.toDouble() / guests).roundToLong() else 0L

        val vendorRows = workspace.vendors.map { v ->
            val budget = v.effectiveBudget(guests)
            VendorRowUi(
                id = v.id,
                name = v.name,
                category = v.category.displayName,
                budgetedFormatted = CurrencyFormatter.format(budget, currency),
                paidFormatted = CurrencyFormatter.format(v.paid, currency),
                remainingFormatted = CurrencyFormatter.format(v.remaining(guests), currency),
                dueDateText = v.dueDateEpochDay?.let { formatEpochDay(it) },
                perGuestBadge = if (v.isPerGuest) {
                    "${CurrencyFormatter.format(v.perGuestCost, currency)}/guest"
                } else {
                    null
                },
                paidFraction = if (budget.amount > 0L) {
                    (v.paid.amount.toFloat() / budget.amount).coerceIn(0f, 1f)
                } else {
                    0f
                },
            )
        }

        val dueDates = workspace.vendors
            .filter { it.dueDateEpochDay != null && it.remaining(guests).amount > 0L }
            .sortedBy { it.dueDateEpochDay }
            .map { v ->
                DueDateUi(
                    vendorName = v.name,
                    dueDateText = formatEpochDay(v.dueDateEpochDay!!),
                    remainingFormatted = CurrencyFormatter.format(v.remaining(guests), currency),
                )
            }

        _uiState.update {
            it.copy(
                isLoading = false,
                targetFormatted = CurrencyFormatter.format(workspace.targetBudget, currency),
                targetCents = target,
                guestCount = guests,
                totalBudgetedFormatted = CurrencyFormatter.format(Cents(totalBudgeted), currency),
                totalPaidFormatted = CurrencyFormatter.format(Cents(totalPaid), currency),
                remainingToPayFormatted = CurrencyFormatter.format(Cents(remainingToPay), currency),
                overUnderText = overUnderText(overUnder),
                isOverBudget = overUnder > 0L,
                budgetUsedFraction = if (target > 0L) {
                    (totalBudgeted.toFloat() / target).coerceIn(0f, 1f)
                } else {
                    0f
                },
                perGuestFormatted = CurrencyFormatter.format(Cents(perGuest), currency),
                vendors = vendorRows,
                upcomingDueDates = dueDates,
            )
        }
    }

    private fun overUnderText(overUnder: Long): String = when {
        overUnder > 0L ->
            "${CurrencyFormatter.format(Cents(overUnder), currency)} over your target"
        overUnder < 0L ->
            "${CurrencyFormatter.format(Cents(-overUnder), currency)} under your target"
        else -> "Right on target"
    }

    private fun formatEpochDay(epochDay: Long): String {
        val date = LocalDate.fromEpochDays(epochDay.toInt())
        val month = date.month.name.lowercase().replaceFirstChar { it.uppercase() }.take(3)
        return "$month ${date.dayOfMonth}, ${date.year}"
    }

    private companion object {
        const val MAX_GUESTS = 2000
    }
}
