// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.models.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

private val compactJson = Json { encodeDefaults = true }

internal fun serializeAccounts(accounts: List<Account>): String = jsonArray(accounts) { account ->
    obj {
        field("id", account.id.value)
        field("household_id", account.householdId.value)
        field("owner_id", account.ownerId.value)
        field("name", account.name)
        field("type", account.type.name)
        field("currency", account.currency.code)
        moneyField("current_balance", account.currentBalance.amount, account.currency.code)
        field("is_archived", account.isArchived)
        field("sort_order", account.sortOrder)
        field("icon", account.icon)
        field("color", account.color)
        field("created_at", account.createdAt.toString())
        field("updated_at", account.updatedAt.toString())
        field("deleted_at", account.deletedAt?.toString())
    }
}

internal fun serializeTransactions(transactions: List<Transaction>): String = jsonArray(transactions) { txn ->
    obj {
        field("id", txn.id.value)
        field("household_id", txn.householdId.value)
        field("owner_id", txn.ownerId.value)
        field("account_id", txn.accountId.value)
        field("category_id", txn.categoryId?.value)
        field("type", txn.type.name)
        field("status", txn.status.name)
        moneyField("amount", txn.amount.amount, txn.currency.code)
        field("payee", txn.payee)
        field("note", txn.note)
        field("date", txn.date.toString())
        field("transfer_account_id", txn.transferAccountId?.value)
        field("transfer_transaction_id", txn.transferTransactionId?.value)
        field("is_recurring", txn.isRecurring)
        field("recurring_rule_id", txn.recurringRuleId?.value)
        arrayField("tags", txn.tags)
        field("created_at", txn.createdAt.toString())
        field("updated_at", txn.updatedAt.toString())
        field("deleted_at", txn.deletedAt?.toString())
    }
}

internal fun serializeBudgets(budgets: List<Budget>): String = jsonArray(budgets) { budget ->
    obj {
        field("id", budget.id.value)
        field("household_id", budget.householdId.value)
        field("owner_id", budget.ownerId.value)
        field("category_id", budget.categoryId.value)
        field("name", budget.name)
        moneyField("amount", budget.amount.amount, budget.currency.code)
        field("period", budget.period.name)
        field("start_date", budget.startDate.toString())
        field("end_date", budget.endDate?.toString())
        field("is_rollover", budget.isRollover)
        field("created_at", budget.createdAt.toString())
        field("updated_at", budget.updatedAt.toString())
        field("deleted_at", budget.deletedAt?.toString())
    }
}

internal fun serializeGoals(goals: List<Goal>): String = jsonArray(goals) { goal ->
    obj {
        field("id", goal.id.value)
        field("household_id", goal.householdId.value)
        field("owner_id", goal.ownerId.value)
        field("name", goal.name)
        moneyField("target_amount", goal.targetAmount.amount, goal.currency.code)
        moneyField("current_amount", goal.currentAmount.amount, goal.currency.code)
        field("target_date", goal.targetDate?.toString())
        field("status", goal.status.name)
        field("icon", goal.icon)
        field("color", goal.color)
        field("account_id", goal.accountId?.value)
        field("created_at", goal.createdAt.toString())
        field("updated_at", goal.updatedAt.toString())
        field("deleted_at", goal.deletedAt?.toString())
    }
}

internal fun serializeCategories(categories: List<Category>): String = jsonArray(categories) { category ->
    obj {
        field("id", category.id.value)
        field("household_id", category.householdId.value)
        field("owner_id", category.ownerId.value)
        field("name", category.name)
        field("icon", category.icon)
        field("color", category.color)
        field("parent_id", category.parentId?.value)
        field("is_income", category.isIncome)
        field("is_system", category.isSystem)
        field("sort_order", category.sortOrder)
        field("created_at", category.createdAt.toString())
        field("updated_at", category.updatedAt.toString())
        field("deleted_at", category.deletedAt?.toString())
    }
}

internal fun serializeTagsDomain(tags: List<String>): String = jsonArray(tags) { tag ->
    obj { field("name", tag) }
}

internal fun serializeAttachments(attachments: List<DataAccessAttachment>): String = jsonArray(attachments) { attachment ->
    obj {
        field("id", attachment.id)
        field("file_name", attachment.fileName)
        field("content_type", attachment.contentType)
        field("package_path", attachment.bytes?.let { "attachments/${sanitizeAttachmentSegment(attachment.id)}-${sanitizeAttachmentSegment(attachment.fileName)}" })
        field("signed_url", attachment.signedUrl)
        field("delivery", if (attachment.bytes != null) "embedded_binary" else "signed_url_reference")
    }
}

internal fun serializeJsonRecords(records: List<DataAccessJsonRecord>): String =
    jsonArray(records) { record -> compactJson.encodeToString(JsonObject.serializer(), record.fields) }

private fun <T> jsonArray(values: List<T>, render: (T) -> String): String = buildString {
    append("[\n")
    values.forEachIndexed { index, value ->
        append(render(value).prependIndent("  "))
        if (index != values.lastIndex) append(',')
        append('\n')
    }
    append(']')
}

private fun obj(build: JsonObjectStringBuilder.() -> Unit): String =
    JsonObjectStringBuilder().apply(build).toString()

private class JsonObjectStringBuilder {
    private val fields = mutableListOf<Pair<String, String>>()

    fun field(name: String, value: String?) {
        fields += name to (value?.let { quote(it) } ?: "null")
    }

    fun field(name: String, value: Boolean) {
        fields += name to value.toString()
    }

    fun field(name: String, value: Int) {
        fields += name to value.toString()
    }

    fun moneyField(name: String, amount: Long, currency: String) {
        fields += name to "{\"amount\":$amount,\"currency\":${quote(currency)}}"
    }

    fun arrayField(name: String, values: List<String>) {
        fields += name to values.joinToString(prefix = "[", postfix = "]") { quote(it) }
    }

    override fun toString(): String = buildString {
        append("{\n")
        fields.forEachIndexed { index, (name, value) ->
            append("  ").append(quote(name)).append(": ").append(value)
            if (index != fields.lastIndex) append(',')
            append('\n')
        }
        append('}')
    }
}

private fun quote(value: String): String = buildString(value.length + 2) {
    append('"')
    value.forEach { char ->
        when (char) {
            '\\' -> append("\\\\")
            '"' -> append("\\\"")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            else -> if (char.code < 0x20) {
                append("\\u")
                append(char.code.toString(16).padStart(4, '0'))
            } else {
                append(char)
            }
        }
    }
    append('"')
}

private fun sanitizeAttachmentSegment(value: String): String = buildString {
    value.forEach { char ->
        append(if (char.isLetterOrDigit() || char in setOf('.', '-', '_')) char else '_')
    }
}.ifBlank { "attachment" }
