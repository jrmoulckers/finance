// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.receipt

import com.finance.android.ui.screens.business.BusinessCategory
import com.finance.models.types.Cents

/**
 * A single line extracted from an OCR'd receipt that the user can accept or
 * reject and map to a business category (#2183).
 */
data class OcrLineItem(
    val id: String,
    val description: String,
    val amount: Cents,
    /** Best-guess category the user can override; `null` until mapped. */
    val category: BusinessCategory? = null,
    /** Whether this line is included in the saved expense. */
    val accepted: Boolean = true,
)

/**
 * The editable draft produced when a scanned receipt is turned into a saved
 * expense (#2183).
 *
 * Carries the extracted header fields, the retained receipt image reference,
 * and the reviewable line items so itemized data survives for later margin
 * math.
 */
data class ReceiptExpenseDraft(
    val merchant: String,
    val total: Cents,
    val dateLabel: String,
    /** Local URI/path of the retained receipt photo attachment. */
    val receiptImageRef: String?,
    val lineItems: List<OcrLineItem>,
) {
    /** Sum of the accepted line items — should reconcile with [total]. */
    val acceptedTotal: Cents =
        lineItems.filter { it.accepted }.fold(Cents.ZERO) { acc, i -> acc + i.amount }

    /** Accepted line items still missing a category mapping. */
    val unmappedCount: Int = lineItems.count { it.accepted && it.category == null }

    /** Whether the draft is ready to save (has an image and every line mapped). */
    val canSave: Boolean = receiptImageRef != null && unmappedCount == 0

    /** Difference between the header total and the accepted line items. */
    val reconciliationDelta: Cents = total - acceptedTotal
}
