package com.finance.sync.conflict

/**
 * Determines which [ConflictResolver] to use for a given table.
 *
 * Tables containing shared/complex entities (e.g. budgets, goals) use
 * [MERGE] to attempt field-level reconciliation, while simpler entities
 * default to [LAST_WRITE_WINS].
 */
enum class ConflictStrategy(val resolver: ConflictResolver) {

    /** Server timestamp comparison — latest write wins. */
    LAST_WRITE_WINS(LastWriteWinsResolver()),

    /** Field-level merge — non-conflicting fields are combined. */
    MERGE(MergeResolver());

    companion object {
        /**
         * Default strategy mapping per table name.
         *
         * Tables not listed here fall back to [LAST_WRITE_WINS].
         */
        private val TABLE_STRATEGIES: Map<String, ConflictStrategy> = mapOf(
            "budgets" to MERGE,
            "goals" to MERGE,
            "households" to MERGE,
        )

        /**
         * Returns the appropriate [ConflictResolver] for the given [tableName].
         */
        fun resolverFor(tableName: String): ConflictResolver =
            (TABLE_STRATEGIES[tableName] ?: LAST_WRITE_WINS).resolver
    }
}
