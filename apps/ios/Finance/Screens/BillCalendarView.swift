// SPDX-License-Identifier: BUSL-1.1

// BillCalendarView.swift
// Finance
//
// Payday-aligned bill calendar (#2196). For a single parent, timing is the whole
// game: this lines every bill and one-off kid expense up against real paycheck
// dates, leads with "what hits before your next paycheck", and flags pay periods
// where bills outrun the money coming in — all framed supportively.

import FinanceShared
import SwiftUI

struct BillCalendarView: View {
    @State private var paydayStore: PaydaySettingsStore
    @State private var showingSetup = false

    private let bills: [BillItem]
    private let extraEvents: [BillCalendarEvent]
    private let referenceDate: Date

    init(
        bills: [BillItem],
        extraEvents: [BillCalendarEvent] = [],
        paydayStore: PaydaySettingsStore = PaydaySettingsStore(),
        referenceDate: Date = Date()
    ) {
        self.bills = bills
        self.extraEvents = extraEvents
        _paydayStore = State(initialValue: paydayStore)
        self.referenceDate = referenceDate
    }

    private var currencyCode: String { bills.first?.currencyCode ?? "USD" }

    private var events: [BillCalendarEvent] {
        let billEvents = bills.map { bill in
            BillCalendarEvent(
                id: bill.id,
                name: bill.name,
                amountMinorUnits: bill.amountMinorUnits,
                dueDate: bill.nextDueDate,
                isOneOff: false
            )
        }
        return billEvents + extraEvents
    }

    private var paydays: [Date] { paydayStore.upcomingPaydays(count: 6, from: referenceDate) }

    private var days: [BillCalendarDay] {
        BillCalendarCalculator.days(events: events, paydays: paydays, referenceDate: referenceDate)
    }

    private var dueBeforePayday: [BillCalendarEvent] {
        BillCalendarCalculator.dueBeforeNextPayday(events: events, paydays: paydays, referenceDate: referenceDate)
    }

    private var totalDueBeforePayday: Int64 {
        BillCalendarCalculator.totalDueBeforeNextPayday(events: events, paydays: paydays, referenceDate: referenceDate)
    }

    private var payPeriods: [PayPeriodSummary] {
        BillCalendarCalculator.payPeriods(events: events, deposits: paydayStore.deposits(count: 6, from: referenceDate))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: FinanceSpacing.lg) {
                beforePaydayCard
                if payPeriods.contains(where: \.isHighRisk) {
                    riskSection
                }
                timelineSection
            }
            .padding()
            .padding(.bottom, FinanceSpacing.lg)
        }
        .navigationTitle(String(localized: "Bill Calendar"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingSetup = true } label: {
                    Image(systemName: "calendar.badge.plus")
                }
                .accessibilityLabel(String(localized: "Set payday"))
                .accessibilityHint(String(localized: "Set your payday date and cadence"))
            }
        }
        .sheet(isPresented: $showingSetup) {
            PaydaySetupSheet(paydayStore: paydayStore)
        }
    }

    // MARK: - Before payday

    private var beforePaydayCard: some View {
        VStack(alignment: .leading, spacing: FinanceSpacing.sm) {
            Text(String(localized: "Before your next paycheck"))
                .font(.headline)

            if let next = BillCalendarCalculator.nextPayday(after: referenceDate, paydays: paydays) {
                Text(String(localized: "Next payday \(next.formatted(.dateTime.month().day()))"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            HStack {
                Text(String(localized: "Due before then"))
                    .font(.subheadline)
                Spacer()
                CurrencyLabel(
                    amountInMinorUnits: totalDueBeforePayday,
                    currencyCode: currencyCode,
                    showSign: false,
                    font: .title3.bold()
                )
            }

            if dueBeforePayday.isEmpty {
                Text(String(localized: "Nothing lands before your next paycheck. Nice breathing room."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(dueBeforePayday) { event in
                    HStack {
                        Text(event.name)
                            .font(.subheadline)
                            .lineLimit(1)
                        Spacer()
                        Text(event.dueDate.formatted(.dateTime.month().day()))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        CurrencyLabel(
                            amountInMinorUnits: event.amountMinorUnits,
                            currencyCode: currencyCode,
                            showSign: false,
                            font: .subheadline
                        )
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .cardBackground(cornerRadius: FinanceSpacing.Radius.xl)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Bills before your next paycheck"))
        .accessibilityValue(String(localized: "\(CurrencyLabel.formatted(minorUnits: totalDueBeforePayday, currencyCode: currencyCode)) across \(dueBeforePayday.count) bills"))
    }

    // MARK: - Risk

    private var riskSection: some View {
        VStack(alignment: .leading, spacing: FinanceSpacing.sm) {
            Label(String(localized: "Tight pay periods"), systemImage: "exclamationmark.triangle")
                .font(.headline)
                .foregroundStyle(FinanceColors.statusWarning)
                .accessibilityAddTraits(.isHeader)

            Text(String(localized: "In these windows, bills are more than the paycheck that opens them. Worth planning ahead — maybe shift a due date or set a little aside."))
                .font(.footnote)
                .foregroundStyle(.secondary)

            ForEach(payPeriods.filter(\.isHighRisk)) { period in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: FinanceSpacing.xxs) {
                        Text(periodRangeText(period))
                            .font(.subheadline.weight(.medium))
                        Text(String(localized: "Bills \(CurrencyLabel.formatted(minorUnits: period.billsDueMinorUnits, currencyCode: currencyCode)) · Pay \(CurrencyLabel.formatted(minorUnits: period.expectedIncomeMinorUnits, currencyCode: currencyCode))"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "arrow.down.right.circle")
                        .foregroundStyle(FinanceColors.statusWarning)
                        .accessibilityHidden(true)
                }
                .padding(.vertical, FinanceSpacing.xxs)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(periodRangeText(period))
                .accessibilityValue(String(localized: "Bills \(CurrencyLabel.formatted(minorUnits: period.billsDueMinorUnits, currencyCode: currencyCode)), paycheck \(CurrencyLabel.formatted(minorUnits: period.expectedIncomeMinorUnits, currencyCode: currencyCode))"))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(FinanceColors.statusWarning.opacity(0.1), in: RoundedRectangle(cornerRadius: FinanceSpacing.Radius.xl))
    }

    private func periodRangeText(_ period: PayPeriodSummary) -> String {
        let start = period.start.formatted(.dateTime.month().day())
        let end = period.end.formatted(.dateTime.month().day())
        return "\(start) – \(end)"
    }

    // MARK: - Timeline

    @ViewBuilder
    private var timelineSection: some View {
        VStack(alignment: .leading, spacing: FinanceSpacing.sm) {
            Text(String(localized: "Timeline"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if days.isEmpty {
                EmptyStateView(
                    systemImage: "calendar",
                    title: String(localized: "No upcoming bills"),
                    message: String(localized: "Bills and one-off costs will line up here against your paydays.")
                )
            } else {
                VStack(spacing: 0) {
                    ForEach(days) { day in
                        dayRow(day)
                        if day.id != days.last?.id {
                            Divider().padding(.leading, FinanceSpacing.minTapTarget)
                        }
                    }
                }
                .padding()
                .cardBackground(cornerRadius: FinanceSpacing.Radius.xl)
            }
        }
    }

    private func dayRow(_ day: BillCalendarDay) -> some View {
        HStack(alignment: .top, spacing: FinanceSpacing.sm) {
            VStack(spacing: 2) {
                Text(day.date.formatted(.dateTime.day()))
                    .font(.headline)
                    .monospacedDigit()
                Text(day.date.formatted(.dateTime.month(.abbreviated)))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(width: FinanceSpacing.minTapTarget)

            VStack(alignment: .leading, spacing: FinanceSpacing.xxs) {
                if day.isPayday {
                    Label(String(localized: "Payday"), systemImage: "dollarsign.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(FinanceColors.statusPositive)
                }
                ForEach(day.events) { event in
                    HStack {
                        if event.isOneOff {
                            Image(systemName: "star.fill")
                                .font(.caption2)
                                .foregroundStyle(FinanceColors.statusInfo)
                                .accessibilityHidden(true)
                        }
                        Text(event.name)
                            .font(.subheadline)
                            .lineLimit(1)
                        Spacer()
                        CurrencyLabel(
                            amountInMinorUnits: event.amountMinorUnits,
                            currencyCode: currencyCode,
                            showSign: false,
                            font: .subheadline
                        )
                    }
                }
            }
        }
        .padding(.vertical, FinanceSpacing.xs)
        .background(
            day.isBeforeNextPayday
                ? FinanceColors.statusInfo.opacity(0.06)
                : Color.clear
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(dayAccessibilityLabel(day))
    }

    private func dayAccessibilityLabel(_ day: BillCalendarDay) -> String {
        let date = day.date.formatted(.dateTime.month().day())
        let total = CurrencyLabel.formatted(minorUnits: day.totalMinorUnits, currencyCode: currencyCode)
        let names = day.events.map(\.name).joined(separator: ", ")
        let payday = day.isPayday ? String(localized: "Payday. ") : ""
        return String(localized: "\(payday)\(date). \(names). Total \(total).")
    }
}

// MARK: - Payday Setup Sheet

/// Sets the payday anchor, cadence, and typical paycheck for the calendar.
struct PaydaySetupSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var paydayStore: PaydaySettingsStore

    @State private var paycheckText: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker(
                        String(localized: "Next payday"),
                        selection: $paydayStore.anchorDate,
                        displayedComponents: .date
                    )
                    Picker(String(localized: "Pay frequency"), selection: $paydayStore.frequency) {
                        ForEach(PayFrequency.allCases, id: \.self) { freq in
                            Text(freq.displayName).tag(freq)
                        }
                    }
                } header: {
                    Text(String(localized: "When you get paid"))
                }

                Section {
                    HStack {
                        Text(String(localized: "Typical paycheck"))
                        Spacer()
                        TextField(String(localized: "0.00"), text: $paycheckText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 140)
                            .accessibilityLabel(String(localized: "Typical paycheck amount"))
                    }
                } footer: {
                    Text(String(localized: "Used to flag pay periods where bills outrun your paycheck."))
                }
            }
            .navigationTitle(String(localized: "Payday"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Save")) {
                        paydayStore.typicalPaycheckMinorUnits = GroceryModeView.minorUnits(
                            from: paycheckText,
                            currencyCode: "USD"
                        )
                        dismiss()
                    }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                }
            }
            .onAppear {
                if paydayStore.typicalPaycheckMinorUnits > 0 {
                    let value = NSDecimalNumber(value: paydayStore.typicalPaycheckMinorUnits)
                        .dividing(by: NSDecimalNumber(value: 100))
                    paycheckText = value.stringValue
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        BillCalendarView(bills: [])
    }
}
