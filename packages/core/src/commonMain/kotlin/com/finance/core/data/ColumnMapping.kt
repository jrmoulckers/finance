package com.finance.core.data

/**
 * Maps CSV column indices to [Transaction] fields for import.
 *
 * Column indices are zero-based positions in the CSV header row.
 * Required fields ([dateColumn], [amountColumn]) must always be present;
 * optional fields are nullable and will be skipped during import when absent.
 */
data class ColumnMapping(
    /** Column index for the transaction date (required). */
    val dateColumn: Int,
    /** Column index for the monetary amount (required). */
    val amountColumn: Int,
    /** Column index for the payee / merchant name (optional). */
    val payeeColumn: Int? = null,
    /** Column index for the category name (optional). */
    val categoryColumn: Int? = null,
    /** Column index for the note / memo / description (optional). */
    val noteColumn: Int? = null,
    /** Column index for the transaction type — "income", "expense", etc. (optional). */
    val typeColumn: Int? = null,
    /** Column index for the currency code (optional; defaults to account currency). */
    val currencyColumn: Int? = null,
) {
    init {
        require(dateColumn >= 0) { "dateColumn index must be non-negative" }
        require(amountColumn >= 0) { "amountColumn index must be non-negative" }
        require(dateColumn != amountColumn) { "dateColumn and amountColumn must differ" }
        payeeColumn?.let { require(it >= 0) { "payeeColumn index must be non-negative" } }
        categoryColumn?.let { require(it >= 0) { "categoryColumn index must be non-negative" } }
        noteColumn?.let { require(it >= 0) { "noteColumn index must be non-negative" } }
        typeColumn?.let { require(it >= 0) { "typeColumn index must be non-negative" } }
        currencyColumn?.let { require(it >= 0) { "currencyColumn index must be non-negative" } }
    }

    companion object {
        /**
         * Well-known header synonyms used by [CsvImporter.mapColumns] to
         * auto-detect column purposes from header names.
         */
        internal val DATE_SYNONYMS = setOf(
            "date", "transaction date", "trans date", "posting date",
            "value date", "trade date", "settlement date",
        )
        internal val AMOUNT_SYNONYMS = setOf(
            "amount", "sum", "total", "value", "debit/credit",
            "transaction amount", "trans amount",
        )
        internal val PAYEE_SYNONYMS = setOf(
            "payee", "merchant", "description", "vendor", "name",
            "recipient", "counterparty", "party",
        )
        internal val CATEGORY_SYNONYMS = setOf(
            "category", "group", "classification", "tag",
        )
        internal val NOTE_SYNONYMS = setOf(
            "note", "notes", "memo", "comment", "remarks", "reference",
        )
    }
}
