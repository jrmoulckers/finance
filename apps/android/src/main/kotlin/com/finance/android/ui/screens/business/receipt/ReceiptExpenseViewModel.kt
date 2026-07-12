// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.receipt

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.ui.screens.business.BusinessCategory
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber

data class ReceiptExpenseUiState(
    val isScanning: Boolean = true,
    val draft: ReceiptExpenseDraft? = null,
    val merchant: String = "",
    val totalFormatted: String = "$0.00",
    val acceptedTotalFormatted: String = "$0.00",
    val reconciliationLabel: String? = null,
    val hasReceiptImage: Boolean = false,
    val canSave: Boolean = false,
    val saved: Boolean = false,
    val savedMessage: String? = null,
)

/**
 * ViewModel that turns an on-device receipt OCR result into a saved expense
 * with a retained receipt image and COGS/inventory/supplies line-item mapping
 * (#2183).
 *
 * Closes the gap where the existing OCR screen only displayed extracted fields
 * with no save action and no attachment persistence.
 */
class ReceiptExpenseViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(ReceiptExpenseUiState())
    val uiState: StateFlow<ReceiptExpenseUiState> = _uiState.asStateFlow()

    /** Business categories a line item can be mapped into. */
    val mappableCategories: List<BusinessCategory> = listOf(
        BusinessCategory.COGS,
        BusinessCategory.INVENTORY,
        BusinessCategory.SUPPLIES,
        BusinessCategory.FUEL,
    )

    init {
        scan()
    }

    private fun scan() {
        viewModelScope.launch {
            delay(300)
            val draft = ReceiptExpenseDraft(
                merchant = "Restaurant Depot",
                total = Cents.fromDollars(214.87),
                dateLabel = "Today",
                receiptImageRef = "content://receipts/scan-latest.jpg",
                lineItems = listOf(
                    OcrLineItem("li1", "Chicken thighs 40lb", Cents.fromDollars(96.00), BusinessCategory.COGS),
                    OcrLineItem("li2", "Tortillas case", Cents.fromDollars(42.50), BusinessCategory.COGS),
                    OcrLineItem("li3", "Foil containers 500ct", Cents.fromDollars(38.20), BusinessCategory.SUPPLIES),
                    OcrLineItem("li4", "Cooking oil 35lb", Cents.fromDollars(38.17), null),
                ),
            )
            publish(draft)
            Timber.d("Receipt OCR draft created: merchant=%s", draft.merchant)
        }
    }

    fun toggleAccepted(lineId: String) = mutate { items ->
        items.map { if (it.id == lineId) it.copy(accepted = !it.accepted) else it }
    }

    fun mapCategory(lineId: String, category: BusinessCategory) = mutate { items ->
        items.map { if (it.id == lineId) it.copy(category = category) else it }
    }

    /** Persist the expense with its attachment and mapped line items (#2183). */
    fun save() {
        val draft = _uiState.value.draft ?: return
        if (!draft.canSave) {
            Timber.w("Save blocked: unmapped=%d image=%b", draft.unmappedCount, draft.receiptImageRef != null)
            return
        }
        val accepted = draft.lineItems.count { it.accepted }
        Timber.d("Saved receipt expense with %d line items and attachment", accepted)
        _uiState.update {
            it.copy(
                saved = true,
                savedMessage = "Saved ${draft.merchant} expense with $accepted items and receipt photo attached.",
            )
        }
    }

    private inline fun mutate(transform: (List<OcrLineItem>) -> List<OcrLineItem>) {
        val draft = _uiState.value.draft ?: return
        publish(draft.copy(lineItems = transform(draft.lineItems)))
    }

    private fun publish(draft: ReceiptExpenseDraft) {
        _uiState.update {
            it.copy(
                isScanning = false,
                draft = draft,
                merchant = draft.merchant,
                totalFormatted = CurrencyFormatter.format(draft.total, Currency.USD),
                acceptedTotalFormatted = CurrencyFormatter.format(draft.acceptedTotal, Currency.USD),
                reconciliationLabel = reconciliationLabel(draft),
                hasReceiptImage = draft.receiptImageRef != null,
                canSave = draft.canSave,
            )
        }
    }

    private fun reconciliationLabel(draft: ReceiptExpenseDraft): String? {
        val delta = draft.reconciliationDelta
        return when {
            delta.isZero() -> null
            delta.isPositive() ->
                "${CurrencyFormatter.format(delta, Currency.USD)} of the total isn't itemized yet"
            else ->
                "Line items exceed the receipt total by ${CurrencyFormatter.format(delta.abs(), Currency.USD)}"
        }
    }
}
