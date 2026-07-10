// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.validation

import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

/** Boundary tests for the shared cross-platform date validator (#3564). */
class DateInputValidatorTest {

    // ── parse(): shape vs calendar validity ──────────────────────────

    @Test
    fun parse_validDisplayDate() {
        val result = DateInputValidator.parse("06/15/2024")
        assertIs<DateParseResult.Success>(result)
        assertEquals(LocalDate(2024, 6, 15), result.date)
    }

    @Test
    fun parse_validIsoDate() {
        val result = DateInputValidator.parse("2024-06-15")
        assertIs<DateParseResult.Success>(result)
        assertEquals(LocalDate(2024, 6, 15), result.date)
    }

    @Test
    fun parse_empty_isEmptyError() {
        val result = DateInputValidator.parse("   ")
        assertIs<DateParseResult.Failure>(result)
        assertEquals(DateValidationErrorKind.EMPTY, result.errorKind)
    }

    @Test
    fun parse_partialOrWrongShape_isMalformed() {
        for (value in listOf("6/18/25", "2025.01.01", "hello", "2024-6-15", "1/2/2024")) {
            val result = DateInputValidator.parse(value)
            assertIs<DateParseResult.Failure>(result, "expected malformed for '$value'")
            assertEquals(DateValidationErrorKind.MALFORMED, result.errorKind, "for '$value'")
        }
    }

    @Test
    fun parse_wellFormedButInvalidCalendarDate() {
        for (value in listOf("12/33/2000", "02/30/2024", "13/01/2000", "00/00/0000", "02/29/2023")) {
            val result = DateInputValidator.parse(value)
            assertIs<DateParseResult.Failure>(result, "expected invalid-calendar for '$value'")
            assertEquals(
                DateValidationErrorKind.INVALID_CALENDAR_DATE,
                result.errorKind,
                "for '$value'",
            )
        }
    }

    @Test
    fun parse_leapDay_validInLeapYear_invalidOtherwise() {
        assertIs<DateParseResult.Success>(DateInputValidator.parse("02/29/2024"))
        val invalid = DateInputValidator.parse("02/29/2023")
        assertIs<DateParseResult.Failure>(invalid)
        assertEquals(DateValidationErrorKind.INVALID_CALENDAR_DATE, invalid.errorKind)
    }

    @Test
    fun parseIso_leapDay_invalidYear() {
        assertNull(DateInputValidator.parseIsoDate("2023-02-29"))
        assertEquals(LocalDate(2024, 2, 29), DateInputValidator.parseIsoDate("2024-02-29"))
    }

    // ── validate(): range + required ─────────────────────────────────

    @Test
    fun validate_emptyOptional_isValidWithNullDate() {
        val result = DateInputValidator.validate("")
        assertIs<DateValidationResult.Valid>(result)
        assertNull(result.date)
    }

    @Test
    fun validate_emptyRequired_isInvalid() {
        val result = DateInputValidator.validate("", required = true)
        assertIs<DateValidationResult.Invalid>(result)
        assertEquals(DateValidationErrorKind.EMPTY, result.errorKind)
    }

    @Test
    fun validate_beforeMin_isInvalid() {
        val result = DateInputValidator.validate(
            "01/01/2020",
            min = LocalDate(2024, 1, 1),
        )
        assertIs<DateValidationResult.Invalid>(result)
        assertEquals(DateValidationErrorKind.BEFORE_MIN, result.errorKind)
    }

    @Test
    fun validate_afterMax_isInvalid() {
        val result = DateInputValidator.validate(
            "01/01/2030",
            max = LocalDate(2024, 12, 31),
        )
        assertIs<DateValidationResult.Invalid>(result)
        assertEquals(DateValidationErrorKind.AFTER_MAX, result.errorKind)
    }

    @Test
    fun validate_boundsAreInclusive() {
        val min = LocalDate(2024, 1, 1)
        val max = LocalDate(2024, 12, 31)
        assertIs<DateValidationResult.Valid>(
            DateInputValidator.validate("01/01/2024", min = min, max = max),
        )
        assertIs<DateValidationResult.Valid>(
            DateInputValidator.validate("12/31/2024", min = min, max = max),
        )
    }

    @Test
    fun validate_normalizesBothInputFormats() {
        val fromDisplay = DateInputValidator.validate("06/15/2024")
        val fromIso = DateInputValidator.validate("2024-06-15")
        assertIs<DateValidationResult.Valid>(fromDisplay)
        assertIs<DateValidationResult.Valid>(fromIso)
        assertEquals(fromDisplay.date, fromIso.date)
    }

    @Test
    fun formatDisplayDate_padsMonthAndDay() {
        assertEquals("01/05/2024", DateInputValidator.formatDisplayDate(LocalDate(2024, 1, 5)))
    }
}
