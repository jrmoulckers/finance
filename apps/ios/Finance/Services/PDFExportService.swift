// SPDX-License-Identifier: BUSL-1.1
// PDFExportService.swift — PDF report generation for financial data.
//
// Generates a structured PDF financial report using Core Graphics.
// The report includes a header, summary statistics, and a table of
// transactions. Designed for sharing, printing, and GDPR data portability.
//
// Uses UIKit graphics context (UIGraphicsPDFRenderer) because SwiftUI
// does not provide PDF generation APIs. This is the only justified UIKit
// usage in the export module.
//
// References: #879

import Foundation
import UIKit
import os

// MARK: - PDF Export Service

/// Actor-isolated service for generating PDF financial reports.
///
/// Thread-safe: all state is actor-isolated. The service creates
/// paginated PDF documents with proper page breaks and consistent
/// typography using Dynamic Type–compatible system fonts.
actor PDFExportService {

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "PDFExportService"
    )

    // MARK: - Page Layout

    private let pageWidth: CGFloat = 612    // US Letter
    private let pageHeight: CGFloat = 792
    private let margin: CGFloat = 50
    private let headerHeight: CGFloat = 80
    private let rowHeight: CGFloat = 24
    private let tableHeaderHeight: CGFloat = 30

    private var contentWidth: CGFloat { pageWidth - margin * 2 }
    private var maxY: CGFloat { pageHeight - margin }

    // MARK: - Fonts

    private let titleFont = UIFont.systemFont(ofSize: 22, weight: .bold)
    private let subtitleFont = UIFont.systemFont(ofSize: 14, weight: .medium)
    private let headerFont = UIFont.systemFont(ofSize: 11, weight: .semibold)
    private let bodyFont = UIFont.systemFont(ofSize: 10, weight: .regular)
    private let captionFont = UIFont.systemFont(ofSize: 8, weight: .regular)
    private let summaryValueFont = UIFont.systemFont(ofSize: 16, weight: .bold)
    private let summaryLabelFont = UIFont.systemFont(ofSize: 10, weight: .medium)

    // MARK: - Colors

    private let primaryColor = UIColor.label
    private let secondaryColor = UIColor.secondaryLabel
    private let headerBgColor = UIColor.systemGray5
    private let accentColor = UIColor.systemBlue
    private let incomeColor = UIColor.systemGreen
    private let expenseColor = UIColor.systemRed

    // MARK: - Generate PDF

    /// Generates a PDF financial report and writes it to a temporary file.
    ///
    /// - Parameters:
    ///   - accounts: Accounts to include in the summary.
    ///   - transactions: Transactions to list in the report body.
    ///   - budgets: Budgets to include in the summary.
    ///   - metadata: GDPR metadata envelope to embed in the report.
    /// - Returns: URL of the generated PDF file.
    /// - Throws: ``ExportError`` if rendering or file write fails.
    func generateReport(
        accounts: [AccountItem],
        transactions: [TransactionItem],
        budgets: [BudgetItem],
        metadata: GDPRExportMetadata
    ) throws -> URL {
        let pageRect = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
        let renderer = UIGraphicsPDFRenderer(bounds: pageRect)

        let data = renderer.pdfData { context in
            var currentY: CGFloat = margin

            // Page 1: Cover + Summary
            context.beginPage()
            currentY = drawHeader(context: context, metadata: metadata)
            currentY = drawSummary(
                context: context, y: currentY,
                accounts: accounts, transactions: transactions, budgets: budgets
            )
            currentY = drawGDPRFooter(context: context, y: currentY, metadata: metadata)

            // Page 2+: Transaction table
            if !transactions.isEmpty {
                context.beginPage()
                currentY = margin
                currentY = drawSectionTitle(
                    context: context, y: currentY,
                    title: String(localized: "Transactions")
                )
                currentY = drawTransactionTableHeader(context: context, y: currentY)

                let sortedTransactions = transactions.sorted { $0.date > $1.date }
                for transaction in sortedTransactions {
                    if currentY + rowHeight > maxY {
                        context.beginPage()
                        currentY = margin
                        currentY = drawTransactionTableHeader(context: context, y: currentY)
                    }
                    currentY = drawTransactionRow(
                        context: context, y: currentY, transaction: transaction
                    )
                }
            }

            // Final page footer
            drawPageFooter(context: context, metadata: metadata)
        }

        let fileURL = temporaryFileURL(name: "finance-report", extension: "pdf")
        do {
            try data.write(to: fileURL, options: .atomic)
        } catch {
            Self.logger.error("PDF write failed: \(error.localizedDescription, privacy: .public)")
            throw ExportError.fileWriteFailed(underlying: error)
        }

        Self.logger.info(
            "PDF report generated: \(fileURL.lastPathComponent, privacy: .public), "
            + "\(accounts.count, privacy: .public) accounts, "
            + "\(transactions.count, privacy: .public) transactions"
        )
        return fileURL
    }

    // MARK: - Drawing Helpers

    private func drawHeader(
        context: UIGraphicsPDFRendererContext,
        metadata: GDPRExportMetadata
    ) -> CGFloat {
        var y = margin

        // App title
        let titleString = NSAttributedString(
            string: String(localized: "Finance — Financial Report"),
            attributes: [.font: titleFont, .foregroundColor: primaryColor]
        )
        titleString.draw(at: CGPoint(x: margin, y: y))
        y += titleFont.lineHeight + 8

        // Export date
        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = .long
        dateFormatter.timeStyle = .short
        let dateString = NSAttributedString(
            string: String(localized: "Generated: \(dateFormatter.string(from: metadata.exportDate))"),
            attributes: [.font: subtitleFont, .foregroundColor: secondaryColor]
        )
        dateString.draw(at: CGPoint(x: margin, y: y))
        y += subtitleFont.lineHeight + 4

        // GDPR reference
        let gdprString = NSAttributedString(
            string: String(localized: "GDPR Article 20 — Data Portability Export"),
            attributes: [.font: captionFont, .foregroundColor: accentColor]
        )
        gdprString.draw(at: CGPoint(x: margin, y: y))
        y += captionFont.lineHeight + 4

        // Separator line
        let path = UIBezierPath()
        path.move(to: CGPoint(x: margin, y: y))
        path.addLine(to: CGPoint(x: pageWidth - margin, y: y))
        UIColor.separator.setStroke()
        path.stroke()
        y += 16

        return y
    }

    private func drawSummary(
        context: UIGraphicsPDFRendererContext,
        y startY: CGFloat,
        accounts: [AccountItem],
        transactions: [TransactionItem],
        budgets: [BudgetItem]
    ) -> CGFloat {
        var y = startY

        y = drawSectionTitle(context: context, y: y, title: String(localized: "Summary"))

        let totalBalance = accounts.reduce(Int64(0)) { $0 + $1.balanceMinorUnits }
        let totalIncome = transactions.filter { $0.type == .income }.reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }
        let totalExpenses = transactions.filter { $0.isExpense }.reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }
        let totalBudgeted = budgets.reduce(Int64(0)) { $0 + $1.limitMinorUnits }

        let summaryItems: [(String, String, UIColor)] = [
            (String(localized: "Net Worth"), formatMinorUnits(totalBalance), primaryColor),
            (String(localized: "Total Income"), formatMinorUnits(totalIncome), incomeColor),
            (String(localized: "Total Expenses"), formatMinorUnits(totalExpenses), expenseColor),
            (String(localized: "Total Budgeted"), formatMinorUnits(totalBudgeted), accentColor),
            (String(localized: "Accounts"), "\(accounts.count)", primaryColor),
            (String(localized: "Transactions"), "\(transactions.count)", primaryColor),
        ]

        let columnWidth = contentWidth / 3
        for (index, item) in summaryItems.enumerated() {
            let col = CGFloat(index % 3)
            let row = CGFloat(index / 3)
            let x = margin + col * columnWidth
            let itemY = y + row * 48

            let valueString = NSAttributedString(
                string: item.1,
                attributes: [.font: summaryValueFont, .foregroundColor: item.2]
            )
            valueString.draw(at: CGPoint(x: x, y: itemY))

            let labelString = NSAttributedString(
                string: item.0,
                attributes: [.font: summaryLabelFont, .foregroundColor: secondaryColor]
            )
            labelString.draw(at: CGPoint(x: x, y: itemY + summaryValueFont.lineHeight + 2))
        }

        let rows = CGFloat((summaryItems.count + 2) / 3)
        y += rows * 48 + 16

        return y
    }

    private func drawSectionTitle(
        context: UIGraphicsPDFRendererContext,
        y: CGFloat,
        title: String
    ) -> CGFloat {
        let titleString = NSAttributedString(
            string: title,
            attributes: [.font: UIFont.systemFont(ofSize: 16, weight: .bold), .foregroundColor: primaryColor]
        )
        titleString.draw(at: CGPoint(x: margin, y: y))
        return y + 24
    }

    private func drawTransactionTableHeader(
        context: UIGraphicsPDFRendererContext,
        y: CGFloat
    ) -> CGFloat {
        // Background
        let bgRect = CGRect(x: margin, y: y, width: contentWidth, height: tableHeaderHeight)
        headerBgColor.setFill()
        UIBezierPath(roundedRect: bgRect, cornerRadius: 4).fill()

        let columns: [(String, CGFloat)] = [
            (String(localized: "Date"), 0),
            (String(localized: "Description"), 80),
            (String(localized: "Category"), 240),
            (String(localized: "Amount"), 370),
            (String(localized: "Type"), 450),
        ]

        for (title, offset) in columns {
            let attrString = NSAttributedString(
                string: title,
                attributes: [.font: headerFont, .foregroundColor: primaryColor]
            )
            attrString.draw(at: CGPoint(x: margin + offset + 4, y: y + 8))
        }

        return y + tableHeaderHeight
    }

    private func drawTransactionRow(
        context: UIGraphicsPDFRendererContext,
        y: CGFloat,
        transaction: TransactionItem
    ) -> CGFloat {
        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = .short

        let columns: [(String, CGFloat, UIColor)] = [
            (dateFormatter.string(from: transaction.date), 0, primaryColor),
            (transaction.payee, 80, primaryColor),
            (transaction.category, 240, secondaryColor),
            (formatMinorUnits(transaction.amountMinorUnits), 370, transaction.isExpense ? expenseColor : incomeColor),
            (transaction.type.rawValue.capitalized, 450, secondaryColor),
        ]

        for (text, offset, color) in columns {
            let attrString = NSAttributedString(
                string: String(text.prefix(20)),
                attributes: [.font: bodyFont, .foregroundColor: color]
            )
            attrString.draw(at: CGPoint(x: margin + offset + 4, y: y + 4))
        }

        // Separator
        let sepPath = UIBezierPath()
        sepPath.move(to: CGPoint(x: margin, y: y + rowHeight))
        sepPath.addLine(to: CGPoint(x: pageWidth - margin, y: y + rowHeight))
        UIColor.separator.withAlphaComponent(0.3).setStroke()
        sepPath.lineWidth = 0.5
        sepPath.stroke()

        return y + rowHeight
    }

    private func drawGDPRFooter(
        context: UIGraphicsPDFRendererContext,
        y startY: CGFloat,
        metadata: GDPRExportMetadata
    ) -> CGFloat {
        var y = startY + 16

        y = drawSectionTitle(context: context, y: y, title: String(localized: "Data Portability Information"))

        let gdprLines: [String] = [
            String(localized: "Export Format: \(metadata.formatVersion)"),
            String(localized: "Data Categories: \(metadata.dataCategories.joined(separator: ", "))"),
            String(localized: "Processing Basis: \(metadata.processingBasis)"),
            String(localized: "Data Controller: \(metadata.dataController)"),
            String(localized: "Retention Period: \(metadata.retentionPeriod)"),
            String(localized: "Export ID: \(metadata.exportId)"),
        ]

        for line in gdprLines {
            let attrString = NSAttributedString(
                string: line,
                attributes: [.font: captionFont, .foregroundColor: secondaryColor]
            )
            attrString.draw(at: CGPoint(x: margin, y: y))
            y += captionFont.lineHeight + 4
        }

        return y
    }

    private func drawPageFooter(
        context: UIGraphicsPDFRendererContext,
        metadata: GDPRExportMetadata
    ) {
        let footerString = NSAttributedString(
            string: String(localized: "Finance App — Confidential Financial Data — Export ID: \(metadata.exportId)"),
            attributes: [.font: captionFont, .foregroundColor: secondaryColor]
        )
        let y = pageHeight - margin + 10
        footerString.draw(at: CGPoint(x: margin, y: y))
    }

    // MARK: - Helpers

    private func temporaryFileURL(name: String, extension ext: String) -> URL {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd-HHmmss"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        let timestamp = formatter.string(from: .now)
        return FileManager.default.temporaryDirectory
            .appendingPathComponent("\(name)-\(timestamp).\(ext)")
    }

    private func formatMinorUnits(_ minorUnits: Int64) -> String {
        let whole = minorUnits / 100
        let fraction = abs(minorUnits) % 100
        return String(format: "$%d.%02d", whole, fraction)
    }
}
