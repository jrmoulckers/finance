package com.finance.db.migration

/**
 * Abstraction for executing raw SQL statements.
 * Platform implementations wrap the SQLDelight driver.
 */
interface SqlExecutor {
    fun execute(sql: String)
    fun queryInt(sql: String): Int
    fun executeInTransaction(block: SqlExecutor.() -> Unit)
}
