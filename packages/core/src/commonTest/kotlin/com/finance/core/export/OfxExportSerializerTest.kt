// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.core.TestFixtures
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Tests for the OFX 1.0.2 export serializer (#3746). */
class OfxExportSerializerTest {

    private val generatedAt = Instant.parse("2024-06-15T12:00:00Z")

    private fun expense() = TestFixtures.createTransaction(
        id = SyncId("txn-b"),
        type = TransactionType.EXPENSE,
        amount = Cents(2500),
        currency = Currency.USD,
        payee = "Coffee Shop",
        note = "Latte",
        date = LocalDate(2024, 6, 10),
    )

    private fun income() = TestFixtures.createTransaction(
        id = SyncId("txn-a"),
        type = TransactionType.INCOME,
        amount = Cents(500000),
        currency = Currency.USD,
        payee = "Employer",
        date = LocalDate(2024, 6, 12),
    )

    @Test
    fun producesWellFormedOfxHeaderAndEnvelope() {
        val ofx = OfxExportSerializer.serialize(listOf(expense()), generatedAt = generatedAt)
        assertTrue(ofx.startsWith("OFXHEADER:100"), "should start with OFX header")
        assertTrue(ofx.contains("VERSION:102"))
        assertTrue(ofx.contains("<OFX>") && ofx.contains("</OFX>"))
        assertTrue(ofx.contains("<BANKTRANLIST>") && ofx.contains("</BANKTRANLIST>"))
    }

    @Test
    fun emitsOneStmtTrnPerTransaction() {
        val ofx = OfxExportSerializer.serialize(listOf(expense(), income()), generatedAt = generatedAt)
        val count = Regex("<STMTTRN>").findAll(ofx).count()
        assertEquals(2, count)
    }

    @Test
    fun expenseIsNegativeDebit_incomeIsPositiveCredit() {
        val ofxExpense = OfxExportSerializer.serialize(listOf(expense()), generatedAt = generatedAt)
        assertTrue(ofxExpense.contains("<TRNTYPE>DEBIT"))
        assertTrue(ofxExpense.contains("<TRNAMT>-25.00"), "expense amount should be negative with 2 decimals")

        val ofxIncome = OfxExportSerializer.serialize(listOf(income()), generatedAt = generatedAt)
        assertTrue(ofxIncome.contains("<TRNTYPE>CREDIT"))
        assertTrue(ofxIncome.contains("<TRNAMT>5000.00"), "income amount should be positive with 2 decimals")
    }

    @Test
    fun includesFitidAndDatePostedAndName() {
        val ofx = OfxExportSerializer.serialize(listOf(expense()), generatedAt = generatedAt)
        assertTrue(ofx.contains("<FITID>txn-b"))
        assertTrue(ofx.contains("<DTPOSTED>20240610"))
        assertTrue(ofx.contains("<NAME>Coffee Shop"))
        assertTrue(ofx.contains("<MEMO>Latte"))
    }

    @Test
    fun orderingIsDeterministicByDateThenId() {
        // income (06/12) after expense (06/10) regardless of input order.
        val a = OfxExportSerializer.serialize(listOf(income(), expense()), generatedAt = generatedAt)
        val b = OfxExportSerializer.serialize(listOf(expense(), income()), generatedAt = generatedAt)
        assertEquals(a, b)
        assertTrue(a.indexOf("txn-b") < a.indexOf("txn-a"), "earlier date should serialize first")
    }

    @Test
    fun escapesMarkupCharactersInText() {
        val txn = TestFixtures.createTransaction(
            id = SyncId("txn-esc"),
            type = TransactionType.EXPENSE,
            amount = Cents(100),
            payee = "Tom & Jerry <LLC>",
            date = LocalDate(2024, 6, 10),
        )
        val ofx = OfxExportSerializer.serialize(listOf(txn), generatedAt = generatedAt)
        assertTrue(ofx.contains("Tom &amp; Jerry &lt;LLC&gt;"))
    }

    @Test
    fun emptyTransactions_stillProducesValidEnvelope() {
        val ofx = OfxExportSerializer.serialize(emptyList(), generatedAt = generatedAt)
        assertTrue(ofx.contains("<OFX>") && ofx.contains("</OFX>"))
        assertEquals(0, Regex("<STMTTRN>").findAll(ofx).count())
    }
}
