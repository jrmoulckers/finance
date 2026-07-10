// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.core.TestFixtures
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Tests for auto-categorization of generated recurring transactions (#3743). */
class RecurringCategorizerTest {

    private fun txn(category: String?) = TestFixtures.createExpense(
        amount = Cents(1000),
        categoryId = category?.let { SyncId(it) },
    )

    @Test
    fun dominantCategory_picksMostFrequent() {
        val occurrences = listOf(txn("streaming"), txn("streaming"), txn("misc"))
        assertEquals(SyncId("streaming"), RecurringCategorizer.dominantCategory(occurrences))
    }

    @Test
    fun dominantCategory_tie_breaksDeterministicallyByIdAscending() {
        // Even split between "aaa" and "zzz" — smallest id wins, regardless of order.
        val occurrences = listOf(txn("zzz"), txn("aaa"), txn("aaa"), txn("zzz"))
        assertEquals(SyncId("aaa"), RecurringCategorizer.dominantCategory(occurrences))

        val reordered = listOf(txn("aaa"), txn("zzz"), txn("zzz"), txn("aaa"))
        assertEquals(SyncId("aaa"), RecurringCategorizer.dominantCategory(reordered))
    }

    @Test
    fun dominantCategory_emptyOrUncategorized_returnsNull() {
        assertNull(RecurringCategorizer.dominantCategory(emptyList()))
        assertNull(RecurringCategorizer.dominantCategory(listOf(txn(null), txn(null))))
    }

    @Test
    fun categoryForGenerated_fallsBackToTemplateWhenHistoryUncategorized() {
        val occurrences = listOf(txn(null), txn(null))
        assertEquals(
            SyncId("template-cat"),
            RecurringCategorizer.categoryForGenerated(occurrences, SyncId("template-cat")),
        )
    }

    @Test
    fun categoryForGenerated_prefersDominantOverTemplate() {
        val occurrences = listOf(txn("groceries"), txn("groceries"), txn("misc"))
        assertEquals(
            SyncId("groceries"),
            RecurringCategorizer.categoryForGenerated(occurrences, SyncId("template-cat")),
        )
    }

    @Test
    fun applyDominantCategory_stampsCategoryAndKeepsAmount() {
        val template = TestFixtures.createExpense(amount = Cents(2500), categoryId = SyncId("template-cat"))
        val occurrences = listOf(txn("utilities"), txn("utilities"), txn("misc"))

        val result = RecurringCategorizer.applyDominantCategory(template, occurrences)

        assertEquals(SyncId("utilities"), result.categoryId)
        assertEquals(Cents(2500), result.amount) // fixed integer Cents unchanged
    }

    @Test
    fun applyDominantCategory_keepsTemplateCategoryWhenHistoryUncategorized() {
        val template = TestFixtures.createExpense(amount = Cents(2500), categoryId = SyncId("template-cat"))
        val result = RecurringCategorizer.applyDominantCategory(template, listOf(txn(null)))
        assertEquals(SyncId("template-cat"), result.categoryId)
    }
}
