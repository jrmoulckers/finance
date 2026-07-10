// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.validation

import kotlinx.datetime.LocalDate

/**
 * Cross-platform date parsing and validation, mirroring the web app's
 * `apps/web/src/utils/dateValidation.ts` so every platform (Android, iOS, Windows, and eventually
 * web via the KMP-JS bridge) shares one implementation and one set of messages.
 *
 * It deliberately distinguishes the two failure modes that are easy to conflate:
 * - **Malformed** — the text is not shaped like a supported date at all (e.g. `6/18/25`,
 *   `2025.01.01`, `hello`). The user must fix the *format*.
 * - **Invalid calendar date** — the text is well-formed (`MM/DD/YYYY` or ISO `YYYY-MM-DD`) but is
 *   not a real day on the calendar (e.g. `12/33/2000`, `02/30/2024`, `02/29/2023`). The format is
 *   fine; the *value* is wrong.
 *
 * Inclusive `min`/`max` range checks are handled here too, so every field applies the same boundary
 * semantics and messaging. All functions are pure `commonMain`.
 */
object DateInputValidator {

    /** Matches a display date shaped `MM/DD/YYYY` (two/two/four digits). */
    val DISPLAY_DATE_PATTERN = Regex("""^(\d{2})/(\d{2})/(\d{4})$""")

    /** Matches an ISO date shaped `YYYY-MM-DD`. */
    val ISO_DATE_PATTERN = Regex("""^(\d{4})-(\d{2})-(\d{2})$""")

    /** User-facing message for an empty-but-required value. */
    const val MESSAGE_EMPTY = "Enter a date."

    /** User-facing message for a value that is not shaped like a supported date. */
    const val MESSAGE_MALFORMED = "Enter a date in MM/DD/YYYY format."

    /** User-facing message for a well-formed value that is not a real calendar date. */
    const val MESSAGE_INVALID_CALENDAR_DATE = "Not a valid calendar date — check the month and day."

    /**
     * Construct a [LocalDate], returning `null` when [year]/[month]/[day] is not a real calendar
     * date (e.g. month 13, day 33, Feb 30, or Feb 29 in a non-leap year).
     */
    fun createCalendarDate(year: Int, month: Int, day: Int): LocalDate? =
        try {
            LocalDate(year, month, day)
        } catch (_: IllegalArgumentException) {
            null
        }

    /** Parse an ISO `YYYY-MM-DD` string, or `null` if it is not a well-formed, real calendar date. */
    fun parseIsoDate(value: String): LocalDate? {
        val match = ISO_DATE_PATTERN.matchEntire(value.trim()) ?: return null
        val (year, month, day) = match.destructured
        return createCalendarDate(year.toInt(), month.toInt(), day.toInt())
    }

    /** Parse a display `MM/DD/YYYY` string, or `null` if it is not a well-formed, real calendar date. */
    fun parseDisplayDate(value: String): LocalDate? {
        val match = DISPLAY_DATE_PATTERN.matchEntire(value.trim()) ?: return null
        val (month, day, year) = match.destructured
        return createCalendarDate(year.toInt(), month.toInt(), day.toInt())
    }

    /** Format a [LocalDate] as a display `MM/DD/YYYY` string. */
    fun formatDisplayDate(date: LocalDate): String {
        val month = date.monthNumber.toString().padStart(2, '0')
        val day = date.dayOfMonth.toString().padStart(2, '0')
        return "$month/$day/${date.year}"
    }

    /**
     * Parse a user-entered date string, accepting either `MM/DD/YYYY` or ISO `YYYY-MM-DD`.
     * Distinguishes malformed input from well-formed-but-invalid calendar dates so callers can
     * surface an accurate message.
     */
    fun parse(rawValue: String): DateParseResult {
        val trimmed = rawValue.trim()
        if (trimmed.isEmpty()) {
            return DateParseResult.Failure(DateValidationErrorKind.EMPTY, MESSAGE_EMPTY)
        }

        val isIso = ISO_DATE_PATTERN.matches(trimmed)
        val isDisplay = DISPLAY_DATE_PATTERN.matches(trimmed)

        // Not shaped like a supported date format at all.
        if (!isIso && !isDisplay) {
            return DateParseResult.Failure(DateValidationErrorKind.MALFORMED, MESSAGE_MALFORMED)
        }

        // Well-formed shape — now check it is a real calendar date.
        val date = if (isIso) parseIsoDate(trimmed) else parseDisplayDate(trimmed)
        return if (date == null) {
            DateParseResult.Failure(
                DateValidationErrorKind.INVALID_CALENDAR_DATE,
                MESSAGE_INVALID_CALENDAR_DATE,
            )
        } else {
            DateParseResult.Success(date)
        }
    }

    /**
     * Fully validate a user-entered date string: shape, calendar validity, and inclusive range.
     *
     * An empty value is [DateValidationResult.Valid] (with a `null` date) unless [required] is set.
     * Both `MM/DD/YYYY` and ISO `YYYY-MM-DD` inputs are accepted.
     *
     * @param rawValue The raw user input.
     * @param min Optional inclusive lower bound.
     * @param max Optional inclusive upper bound.
     * @param required When `true`, an empty value is invalid. Defaults to `false`.
     */
    fun validate(
        rawValue: String,
        min: LocalDate? = null,
        max: LocalDate? = null,
        required: Boolean = false,
    ): DateValidationResult {
        val trimmed = rawValue.trim()
        if (trimmed.isEmpty()) {
            return if (required) {
                DateValidationResult.Invalid(DateValidationErrorKind.EMPTY, MESSAGE_EMPTY)
            } else {
                DateValidationResult.Valid(null)
            }
        }

        val parsed = parse(trimmed)
        val date = when (parsed) {
            is DateParseResult.Success -> parsed.date
            is DateParseResult.Failure ->
                return DateValidationResult.Invalid(parsed.errorKind, parsed.message)
        }

        if (min != null && date < min) {
            return DateValidationResult.Invalid(
                DateValidationErrorKind.BEFORE_MIN,
                "Date must be on or after ${formatDisplayDate(min)}.",
            )
        }
        if (max != null && date > max) {
            return DateValidationResult.Invalid(
                DateValidationErrorKind.AFTER_MAX,
                "Date must be on or before ${formatDisplayDate(max)}.",
            )
        }

        return DateValidationResult.Valid(date)
    }
}

/** The distinct reasons a date input can fail validation. */
enum class DateValidationErrorKind {
    EMPTY,
    MALFORMED,
    INVALID_CALENDAR_DATE,
    BEFORE_MIN,
    AFTER_MAX,
}

/** Result of [DateInputValidator.parse]. */
sealed interface DateParseResult {
    /** A well-formed, real calendar date. */
    data class Success(val date: LocalDate) : DateParseResult

    /** A parse failure with a distinct [errorKind] and user-facing [message]. */
    data class Failure(
        val errorKind: DateValidationErrorKind,
        val message: String,
    ) : DateParseResult
}

/** Result of [DateInputValidator.validate]. */
sealed interface DateValidationResult {
    /** A valid input. [date] is `null` for an accepted empty (non-required) value. */
    data class Valid(val date: LocalDate?) : DateValidationResult

    /** An invalid input with the specific [errorKind] and user-facing [message]. */
    data class Invalid(
        val errorKind: DateValidationErrorKind,
        val message: String,
    ) : DateValidationResult
}
