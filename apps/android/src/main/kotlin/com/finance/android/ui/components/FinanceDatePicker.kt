package com.finance.android.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.ZoneId

/**
 * Mode selector for [FinanceDatePicker].
 */
enum class DatePickerMode {
    /** Single-date selection. */
    SINGLE,

    /** Start + end date range selection. */
    RANGE,
}

/**
 * Material 3 date picker wrapper tailored for the Finance app.
 *
 * - Defaults to today.
 * - Maximum selectable date: 1 year in the future (consistent with
 *   [com.finance.core.validation.TransactionValidator]).
 * - Supports both single-date and date-range modes.
 *
 * @param mode Whether to show a single date or range picker.
 * @param onDateSelected Callback with epoch-millis of the selected date (single mode).
 * @param onDateRangeSelected Callback with start/end epoch-millis (range mode).
 * @param initialSelectedDateMillis Initial selection for single mode (defaults to today).
 * @param initialStartDateMillis Initial range start (range mode).
 * @param initialEndDateMillis Initial range end (range mode).
 * @param modifier Modifier applied to the container.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FinanceDatePicker(
    mode: DatePickerMode = DatePickerMode.SINGLE,
    onDateSelected: ((Long?) -> Unit)? = null,
    onDateRangeSelected: ((Long?, Long?) -> Unit)? = null,
    initialSelectedDateMillis: Long? = null,
    initialStartDateMillis: Long? = null,
    initialEndDateMillis: Long? = null,
    modifier: Modifier = Modifier,
) {
    val todayMillis = remember {
        LocalDate.now()
            .atStartOfDay(ZoneId.of("UTC"))
            .toInstant()
            .toEpochMilli()
    }

    val maxDateMillis = remember {
        LocalDate.now()
            .plusYears(1)
            .atStartOfDay(ZoneId.of("UTC"))
            .toInstant()
            .toEpochMilli()
    }

    val selectableDates = remember(maxDateMillis) {
        object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long): Boolean {
                return utcTimeMillis <= maxDateMillis
            }

            override fun isSelectableYear(year: Int): Boolean {
                val maxYear = LocalDate.now().plusYears(1).year
                return year <= maxYear
            }
        }
    }

    Column(
        modifier = modifier.semantics {
            contentDescription = when (mode) {
                DatePickerMode.SINGLE -> "Date picker, select a single date"
                DatePickerMode.RANGE -> "Date range picker, select start and end dates"
            }
        },
    ) {
        when (mode) {
            DatePickerMode.SINGLE -> {
                val datePickerState = rememberDatePickerState(
                    initialSelectedDateMillis = initialSelectedDateMillis ?: todayMillis,
                    selectableDates = selectableDates,
                )

                // Propagate selection changes
                onDateSelected?.invoke(datePickerState.selectedDateMillis)

                DatePicker(
                    state = datePickerState,
                    modifier = Modifier.semantics {
                        contentDescription = "Single date picker"
                    },
                    title = {
                        Text(
                            text = "Select Date",
                            modifier = Modifier
                                .padding(start = 24.dp, end = 12.dp, top = 16.dp)
                                .semantics { contentDescription = "Select date heading" },
                        )
                    },
                    showModeToggle = true,
                )
            }

            DatePickerMode.RANGE -> {
                val dateRangePickerState = rememberDateRangePickerState(
                    initialSelectedStartDateMillis = initialStartDateMillis ?: todayMillis,
                    initialSelectedEndDateMillis = initialEndDateMillis,
                    selectableDates = selectableDates,
                )

                onDateRangeSelected?.invoke(
                    dateRangePickerState.selectedStartDateMillis,
                    dateRangePickerState.selectedEndDateMillis,
                )

                DateRangePicker(
                    state = dateRangePickerState,
                    modifier = Modifier.semantics {
                        contentDescription = "Date range picker"
                    },
                    title = {
                        Text(
                            text = "Select Date Range",
                            modifier = Modifier
                                .padding(start = 24.dp, end = 12.dp, top = 16.dp)
                                .semantics { contentDescription = "Select date range heading" },
                        )
                    },
                    showModeToggle = true,
                )
            }
        }
    }
}

// -- Previews -----------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Preview(showBackground = true, name = "FinanceDatePicker - single date")
@Composable
private fun FinanceDatePickerSinglePreview() {
    MaterialTheme {
        FinanceDatePicker(
            mode = DatePickerMode.SINGLE,
            onDateSelected = {},
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Preview(showBackground = true, name = "FinanceDatePicker - date range")
@Composable
private fun FinanceDatePickerRangePreview() {
    MaterialTheme {
        FinanceDatePicker(
            mode = DatePickerMode.RANGE,
            onDateRangeSelected = { _, _ -> },
        )
    }
}
