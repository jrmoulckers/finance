// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * Serializes transactions into an OFX (Open Financial Exchange) 1.0.2 SGML document.
 *
 * OFX is the de-facto interchange format accepted by Quicken, GnuCash, and most banking tools for
 * importing transaction history. Unlike CSV it carries typed transaction records (amount, date,
 * FITID, type, memo) that downstream finance software imports directly, supporting the repo's data
 * portability / GDPR goals.
 *
 * The output is a well-formed `<OFX>` document with the standard `SIGNONMSGSRSV1` and
 * `BANKMSGSRSV1` / `STMTTRNRS` aggregates and one `<STMTTRN>` per transaction. Amounts derive from
 * integer [Cents] formatted to the currency's decimal places (no floating-point drift) with the
 * sign implied by [TransactionType] (expenses/transfers debit negative, income credits positive).
 * Dates use `kotlinx-datetime`. Output is deterministic: transactions are ordered by `(date, id)`.
 *
 * Pure logic — no platform dependencies.
 */
object OfxExportSerializer {

    /** OFX `NAME` element maximum length (spec: 32 characters). */
    private const val NAME_MAX_LENGTH = 32

    /** OFX `MEMO` element maximum length (spec: 255 characters). */
    private const val MEMO_MAX_LENGTH = 255

    private const val LF = "\r\n"

    /**
     * Serialize [transactions] into an OFX 1.0.2 SGML document.
     *
     * @param transactions The transactions to export (deleted records should be pre-filtered).
     * @param generatedAt Timestamp used for `DTSERVER` and, when [transactions] is empty, the
     *   statement date range.
     * @param currencyDefault Statement default currency (`CURDEF`). Defaults to the first
     *   transaction's currency, or USD when there are none.
     * @param accountId Bank account identifier emitted in `BANKACCTFROM/ACCTID`.
     * @param bankId Routing/bank identifier emitted in `BANKACCTFROM/BANKID`.
     * @param zone Time zone used to render [generatedAt] as an OFX datetime.
     * @return A complete OFX document string.
     */
    fun serialize(
        transactions: List<Transaction>,
        generatedAt: Instant,
        currencyDefault: Currency = transactions.firstOrNull()?.currency ?: Currency.USD,
        accountId: String = "000000000",
        bankId: String = "000000000",
        zone: TimeZone = TimeZone.UTC,
    ): String {
        val ordered = transactions.sortedWith(compareBy({ it.date }, { it.id.value }))
        val serverDateTime = formatDateTime(generatedAt, zone)
        val startDate = ordered.firstOrNull()?.date
        val endDate = ordered.lastOrNull()?.date
        val dtStart = startDate?.let(::formatDate) ?: serverDateTime
        val dtEnd = endDate?.let(::formatDate) ?: serverDateTime

        val sb = StringBuilder()
        appendHeader(sb)
        sb.append("<OFX>").append(LF)

        // ── Sign-on response ─────────────────────────────────────────
        sb.append("<SIGNONMSGSRSV1>").append(LF)
        sb.append("<SONRS>").append(LF)
        appendStatusOk(sb)
        appendLeaf(sb, "DTSERVER", serverDateTime)
        appendLeaf(sb, "LANGUAGE", "ENG")
        sb.append("</SONRS>").append(LF)
        sb.append("</SIGNONMSGSRSV1>").append(LF)

        // ── Bank statement response ──────────────────────────────────
        sb.append("<BANKMSGSRSV1>").append(LF)
        sb.append("<STMTTRNRS>").append(LF)
        appendLeaf(sb, "TRNUID", "1")
        appendStatusOk(sb)
        sb.append("<STMTRS>").append(LF)
        appendLeaf(sb, "CURDEF", currencyDefault.code)
        sb.append("<BANKACCTFROM>").append(LF)
        appendLeaf(sb, "BANKID", bankId)
        appendLeaf(sb, "ACCTID", accountId)
        appendLeaf(sb, "ACCTTYPE", "CHECKING")
        sb.append("</BANKACCTFROM>").append(LF)

        sb.append("<BANKTRANLIST>").append(LF)
        appendLeaf(sb, "DTSTART", dtStart)
        appendLeaf(sb, "DTEND", dtEnd)
        for (txn in ordered) {
            appendTransaction(sb, txn)
        }
        sb.append("</BANKTRANLIST>").append(LF)

        sb.append("</STMTRS>").append(LF)
        sb.append("</STMTTRNRS>").append(LF)
        sb.append("</BANKMSGSRSV1>").append(LF)
        sb.append("</OFX>").append(LF)

        return sb.toString()
    }

    // ── Section builders ─────────────────────────────────────────────

    private fun appendHeader(sb: StringBuilder) {
        sb.append("OFXHEADER:100").append(LF)
        sb.append("DATA:OFXSGML").append(LF)
        sb.append("VERSION:102").append(LF)
        sb.append("SECURITY:NONE").append(LF)
        sb.append("ENCODING:USASCII").append(LF)
        sb.append("CHARSET:1252").append(LF)
        sb.append("COMPRESSION:NONE").append(LF)
        sb.append("OLDFILEUID:NONE").append(LF)
        sb.append("NEWFILEUID:NONE").append(LF)
        sb.append(LF)
    }

    private fun appendStatusOk(sb: StringBuilder) {
        sb.append("<STATUS>").append(LF)
        appendLeaf(sb, "CODE", "0")
        appendLeaf(sb, "SEVERITY", "INFO")
        sb.append("</STATUS>").append(LF)
    }

    private fun appendTransaction(sb: StringBuilder, txn: Transaction) {
        sb.append("<STMTTRN>").append(LF)
        appendLeaf(sb, "TRNTYPE", trnType(txn.type))
        appendLeaf(sb, "DTPOSTED", formatDate(txn.date))
        appendLeaf(sb, "TRNAMT", formatSignedAmount(txn))
        appendLeaf(sb, "FITID", txn.id.value)
        val name = txn.payee?.takeIf { it.isNotBlank() }
        if (name != null) {
            appendLeaf(sb, "NAME", name.take(NAME_MAX_LENGTH))
        }
        val memo = txn.note?.takeIf { it.isNotBlank() }
        if (memo != null) {
            appendLeaf(sb, "MEMO", memo.take(MEMO_MAX_LENGTH))
        }
        sb.append("</STMTTRN>").append(LF)
    }

    private fun appendLeaf(sb: StringBuilder, tag: String, value: String) {
        sb.append('<').append(tag).append('>').append(escape(value)).append(LF)
    }

    // ── Value helpers ────────────────────────────────────────────────

    private fun trnType(type: TransactionType): String = when (type) {
        TransactionType.EXPENSE -> "DEBIT"
        TransactionType.INCOME -> "CREDIT"
        TransactionType.TRANSFER -> "XFER"
    }

    /**
     * Format the transaction amount for `TRNAMT` from integer [Cents], applying the OFX sign
     * convention: income is a positive credit; expenses and transfers are negative debits.
     */
    private fun formatSignedAmount(txn: Transaction): String {
        val magnitude = txn.amount.abs()
        val signed = when (txn.type) {
            TransactionType.INCOME -> magnitude
            TransactionType.EXPENSE, TransactionType.TRANSFER -> Cents(-magnitude.amount)
        }
        return formatCentsDisplay(signed, txn.currency)
    }

    /** Format a [LocalDate] as OFX `YYYYMMDD`. */
    private fun formatDate(date: LocalDate): String {
        val month = date.monthNumber.toString().padStart(2, '0')
        val day = date.dayOfMonth.toString().padStart(2, '0')
        return "${date.year}$month$day"
    }

    /** Format an [Instant] as OFX `YYYYMMDDHHMMSS` in [zone]. */
    private fun formatDateTime(instant: Instant, zone: TimeZone): String {
        val dt = instant.toLocalDateTime(zone)
        val month = dt.monthNumber.toString().padStart(2, '0')
        val day = dt.dayOfMonth.toString().padStart(2, '0')
        val hour = dt.hour.toString().padStart(2, '0')
        val minute = dt.minute.toString().padStart(2, '0')
        val second = dt.second.toString().padStart(2, '0')
        return "${dt.year}$month$day$hour$minute$second"
    }

    /** Escape SGML markup characters in element values. */
    private fun escape(value: String): String = value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
}
