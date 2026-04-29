// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.nlp

import com.finance.models.TransactionType
import com.finance.models.types.Cents
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlin.test.*

class NaturalLanguageParserTest {

    private val refDate = LocalDate(2024, 6, 15)

    @Test fun parse_coffeeAtStarbucks() { val r = NaturalLanguageParser.parse("Coffee at Starbucks $4.50 yesterday", refDate); assertIs<ParseResult.Success>(r); assertEquals(Cents(450), r.transaction.amount); assertEquals(LocalDate(2024, 6, 14), r.transaction.date); assertEquals("Starbucks", r.transaction.payee); assertEquals("Food & Drink", r.transaction.categoryHint); assertEquals(TransactionType.EXPENSE, r.transaction.type) }
    @Test fun parse_salaryDeposit() { val r = NaturalLanguageParser.parse("Salary deposit $3,500.00 today", refDate); assertIs<ParseResult.Success>(r); assertEquals(Cents(350000), r.transaction.amount); assertEquals(refDate, r.transaction.date); assertEquals(TransactionType.INCOME, r.transaction.type) }
    @Test fun parse_uberRide() { val r = NaturalLanguageParser.parse("Uber ride $12.50", refDate); assertIs<ParseResult.Success>(r); assertEquals(Cents(1250), r.transaction.amount); assertEquals("Transport", r.transaction.categoryHint) }
    @Test fun parse_empty() { assertIs<ParseResult.Failure>(NaturalLanguageParser.parse("", refDate)) }
    @Test fun parse_noAmount() { assertIs<ParseResult.Failure>(NaturalLanguageParser.parse("Coffee at Starbucks yesterday", refDate)) }

    @Test fun extractAmount_dollar() { assertEquals(Cents(2599), NaturalLanguageParser.extractAmount("spent $25.99 at store")) }
    @Test fun extractAmount_euro() { assertEquals(Cents(1500), NaturalLanguageParser.extractAmount("paid \u20AC15.00 for lunch")) }
    @Test fun extractAmount_commas() { assertEquals(Cents(123456), NaturalLanguageParser.extractAmount("received $1,234.56")) }
    @Test fun extractAmount_bare() { assertEquals(Cents(450), NaturalLanguageParser.extractAmount("coffee 4.50 at cafe")) }
    @Test fun extractAmount_word() { assertEquals(Cents(5000), NaturalLanguageParser.extractAmount("paid 50 dollars for dinner")) }
    @Test fun extractAmount_none() { assertNull(NaturalLanguageParser.extractAmount("went to the store")) }

    @Test fun extractDate_today() { assertEquals(refDate, NaturalLanguageParser.extractDate("bought coffee today", refDate)) }
    @Test fun extractDate_yesterday() { assertEquals(LocalDate(2024, 6, 14), NaturalLanguageParser.extractDate("paid bill yesterday", refDate)) }
    @Test fun extractDate_lastMonday() { val d = NaturalLanguageParser.extractDate("lunch last Monday", refDate); assertNotNull(d); assertEquals(DayOfWeek.MONDAY, d.dayOfWeek); assertTrue(d < refDate) }
    @Test fun extractDate_iso() { assertEquals(LocalDate(2024, 3, 15), NaturalLanguageParser.extractDate("transaction on 2024-03-15", refDate)) }
    @Test fun extractDate_monthDay() { assertEquals(LocalDate(2024, 6, 10), NaturalLanguageParser.extractDate("dinner June 10", refDate)) }
    @Test fun extractDate_abbrev() { assertEquals(LocalDate(2024, 1, 5), NaturalLanguageParser.extractDate("on Jan 5", refDate)) }
    @Test fun extractDate_none() { assertNull(NaturalLanguageParser.extractDate("bought coffee", refDate)) }

    @Test fun extractMerchant_at() { assertEquals("Starbucks", NaturalLanguageParser.extractMerchant("Coffee at Starbucks")) }
    @Test fun extractMerchant_from() { assertEquals("Amazon", NaturalLanguageParser.extractMerchant("Order from Amazon")) }
    @Test fun extractMerchant_none() { assertNull(NaturalLanguageParser.extractMerchant("spent $50")) }

    @Test fun inferCategory_food() { assertEquals("Food & Drink", NaturalLanguageParser.inferCategory("lunch")); assertEquals("Food & Drink", NaturalLanguageParser.inferCategory("coffee")) }
    @Test fun inferCategory_transport() { assertEquals("Transport", NaturalLanguageParser.inferCategory("uber ride")); assertEquals("Transport", NaturalLanguageParser.inferCategory("taxi fare")) }
    @Test fun inferCategory_unknown() { assertNull(NaturalLanguageParser.inferCategory("random stuff")) }

    @Test fun inferType_income() { assertEquals(TransactionType.INCOME, NaturalLanguageParser.inferType("salary deposit")); assertEquals(TransactionType.INCOME, NaturalLanguageParser.inferType("received refund")) }
    @Test fun inferType_expense() { assertEquals(TransactionType.EXPENSE, NaturalLanguageParser.inferType("spent on groceries")); assertEquals(TransactionType.EXPENSE, NaturalLanguageParser.inferType("paid for dinner")) }
    @Test fun inferType_default() { assertEquals(TransactionType.EXPENSE, NaturalLanguageParser.inferType("coffee")) }

    @Test fun confidence_high() { val r = NaturalLanguageParser.parse("Coffee at Starbucks $4.50 yesterday", refDate); assertIs<ParseResult.Success>(r); assertEquals(ParseConfidence.HIGH, r.transaction.confidence) }
    @Test fun confidence_veryLow() { val r = NaturalLanguageParser.parse("$50.00", refDate); assertIs<ParseResult.Success>(r); assertEquals(ParseConfidence.VERY_LOW, r.transaction.confidence) }
}
