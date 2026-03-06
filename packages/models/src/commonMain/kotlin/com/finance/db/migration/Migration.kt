package com.finance.db.migration

/**
 * Represents a single database migration with up (apply) and down (rollback) operations.
 * Migrations are version-numbered and executed in order.
 */
data class Migration(
    /** Sequential version number (1, 2, 3, ...) */
    val version: Int,
    /** Human-readable description of what this migration does */
    val description: String,
    /** SQL statements to apply this migration */
    val up: List<String>,
    /** SQL statements to reverse this migration */
    val down: List<String>,
) {
    init {
        require(version > 0) { "Migration version must be positive" }
        require(up.isNotEmpty()) { "Migration must have at least one up statement" }
        require(description.isNotBlank()) { "Migration must have a description" }
    }
}
