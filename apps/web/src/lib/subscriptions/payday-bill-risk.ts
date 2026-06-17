// SPDX-License-Identifier: BUSL-1.1

export type CalendarExpenseKind = 'recurring-bill' | 'one-off-family-expense';
export type PaydayRiskLevel = 'low' | 'medium' | 'high';

export interface PaydayCalendarItem {
  readonly id: string;
  readonly label: string;
  readonly dueDate: string;
  readonly amountCents: number;
  readonly kind: CalendarExpenseKind;
}

export interface PaydayIncomeEvent {
  readonly id: string;
  readonly label: string;
  readonly date: string;
  readonly amountCents: number;
  readonly confidence: 'cleared' | 'expected' | 'at-risk';
}

export interface PaydayWeekRisk {
  readonly weekStart: string;
  readonly dueAmountCents: number;
  readonly incomeAmountCents: number;
  readonly itemCount: number;
  readonly risk: PaydayRiskLevel;
  readonly accessibleLabel: string;
}

export interface PaydayBillTimeline {
  readonly nextPayDate: string | null;
  readonly dueBeforeNextPaycheck: readonly PaydayCalendarItem[];
  readonly weeks: readonly PaydayWeekRisk[];
}

function assertCents(value: number): void {
  if (!Number.isInteger(value) || value < 0) throw new Error('Amounts must be non-negative integer cents.');
}

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekStart(date: string): string {
  const parsed = parseDate(date);
  const day = parsed.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  parsed.setUTCDate(parsed.getUTCDate() + diff);
  return formatDate(parsed);
}

function classifyRisk(dueAmountCents: number, incomeAmountCents: number, itemCount: number): PaydayRiskLevel {
  if (dueAmountCents > incomeAmountCents || itemCount >= 4) return 'high';
  if (dueAmountCents > incomeAmountCents * 0.7 || itemCount >= 2) return 'medium';
  return 'low';
}

export function buildPaydayBillTimeline(params: {
  readonly items: readonly PaydayCalendarItem[];
  readonly incomeEvents: readonly PaydayIncomeEvent[];
  readonly asOfDate: string;
  readonly openingCashCents: number;
}): PaydayBillTimeline {
  assertCents(params.openingCashCents);
  for (const item of params.items) assertCents(item.amountCents);
  for (const income of params.incomeEvents) assertCents(income.amountCents);

  const nextPayDate =
    params.incomeEvents
      .filter((event) => event.date >= params.asOfDate && event.confidence !== 'at-risk')
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null;
  const dueBeforeNextPaycheck = nextPayDate
    ? params.items
        .filter((item) => item.dueDate >= params.asOfDate && item.dueDate < nextPayDate)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    : [];

  const weekKeys = new Set([
    ...params.items.map((item) => weekStart(item.dueDate)),
    ...params.incomeEvents.map((event) => weekStart(event.date)),
  ]);
  let runningCash = params.openingCashCents;
  const weeks = Array.from(weekKeys)
    .sort()
    .map((key): PaydayWeekRisk => {
      const dueItems = params.items.filter((item) => weekStart(item.dueDate) === key);
      const incomeEvents = params.incomeEvents.filter(
        (event) => weekStart(event.date) === key && event.confidence !== 'at-risk',
      );
      const incomeAmountCents = incomeEvents.reduce((sum, event) => sum + event.amountCents, 0);
      const dueAmountCents = dueItems.reduce((sum, item) => sum + item.amountCents, 0);
      const orderedEvents = [
        ...dueItems.map((item) => ({ date: item.dueDate, delta: -item.amountCents })),
        ...incomeEvents.map((event) => ({ date: event.date, delta: event.amountCents })),
      ].sort((a, b) => a.date.localeCompare(b.date) || a.delta - b.delta);
      let lowestCash = runningCash;
      for (const event of orderedEvents) {
        runningCash += event.delta;
        lowestCash = Math.min(lowestCash, runningCash);
      }
      const risk = lowestCash < 0 ? 'high' : classifyRisk(dueAmountCents, runningCash + dueAmountCents, dueItems.length);
      return {
        weekStart: key,
        dueAmountCents,
        incomeAmountCents,
        itemCount: dueItems.length,
        risk,
        accessibleLabel: `Week of ${key}: ${risk} risk, ${dueItems.length} due item(s), ${dueAmountCents} cents due.`,
      };
    });

  return { nextPayDate, dueBeforeNextPaycheck, weeks };
}
