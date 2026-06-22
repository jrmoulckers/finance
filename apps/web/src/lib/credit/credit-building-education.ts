// SPDX-License-Identifier: BUSL-1.1

/**
 * Beginner credit-building education module.
 *
 * A small, structured set of plain-language lessons for someone building
 * credit from zero. The content is deterministic, testable data - no I/O -
 * surfaced by the Building Credit page alongside the secured-card
 * utilization tracker.
 *
 * Lessons deliberately avoid jargon, point dollar amounts and scary numbers.
 * Each lesson is short enough to read on a phone in under a minute.
 *
 * References: issue #2174
 */

/** A single plain-language credit-building lesson. */
export interface CreditLesson {
  /** Stable identifier (used for keys and deep links). */
  readonly id: string;
  /** Short, scannable title. */
  readonly title: string;
  /** One-line summary shown under the title. */
  readonly summary: string;
  /** Plain-language explanation, one short paragraph. */
  readonly body: string;
  /** The single most useful action or reminder. */
  readonly takeaway: string;
}

/** A bite-size credit-building tip. */
export interface CreditTip {
  /** Stable identifier. */
  readonly id: string;
  /** One-sentence, actionable tip. */
  readonly text: string;
}

/**
 * The beginner credit-building lessons, in recommended reading order:
 * what a score is -> why utilization matters -> on-time payments ->
 * how secured cards build credit -> patience with credit history.
 */
export const CREDIT_BUILDING_LESSONS: readonly CreditLesson[] = [
  {
    id: 'what-is-a-credit-score',
    title: 'What a credit score is',
    summary: 'A number lenders use to gauge how reliably you repay.',
    body: 'A credit score is a three-digit number, usually between 300 and 850, that sums up your track record of borrowing and repaying. Lenders look at it to decide whether to approve a loan or card and what interest rate to offer. You are not born with one; it builds over time as you use credit responsibly.',
    takeaway:
      'A higher score can mean easier approvals and lower interest, so it is worth building early.',
  },
  {
    id: 'why-utilization-matters',
    title: 'Why utilization matters',
    summary: 'Using a small share of your limit signals you are in control.',
    body: 'Utilization is how much of your available credit you are using. If your limit is $500 and your balance is $150, your utilization is 30%. Lenders generally like to see this under 30%, and lower is better. High utilization can make you look stretched, even if you pay the balance off later.',
    takeaway:
      'Keep your balance well below your limit, and pay it down before the statement closes.',
  },
  {
    id: 'on-time-payments',
    title: 'On-time payments',
    summary: 'Payment history is the biggest piece of your score.',
    body: 'Paying at least the minimum by the due date, every time, is the single most important habit for building credit. One late payment can stay on your record for years. Setting up autopay for at least the minimum is a simple safety net, even if you plan to pay the full balance by hand.',
    takeaway: 'Never miss a due date; automate the minimum so a busy month cannot hurt your score.',
  },
  {
    id: 'how-secured-cards-build-credit',
    title: 'How secured cards build credit',
    summary: 'A refundable deposit unlocks a starter card that reports to bureaus.',
    body: 'A secured card asks for a refundable deposit, often equal to your credit limit, which lowers the risk for the lender so people with no history can get approved. You use it like a normal card, and the issuer reports your activity to the credit bureaus. Use a little each month, pay it off, and your history grows. Many issuers later refund the deposit and graduate you to a regular card.',
    takeaway:
      'Treat a secured card like a debit card: spend small, pay in full, and let the history build.',
  },
  {
    id: 'credit-history-takes-time',
    title: 'Credit history takes time',
    summary: 'Length of history helps, so start now and stay patient.',
    body: 'Part of your score reflects how long you have used credit, so there is no instant shortcut. The best move is to start with one account, keep it open and in good standing, and avoid opening lots of new accounts at once. Steady, boring habits over months and years are what move the number up.',
    takeaway: 'Start one account now, keep it open, and let consistency do the slow, steady work.',
  },
];

/** Quick, scannable credit-building reminders for the tips list. */
export const CREDIT_BUILDING_TIPS: readonly CreditTip[] = [
  {
    id: 'tip-utilization-under-30',
    text: 'Keep your balance under 30% of your limit - under 10% is even better.',
  },
  {
    id: 'tip-autopay-minimum',
    text: 'Turn on autopay for at least the minimum so you never miss a due date.',
  },
  {
    id: 'tip-pay-before-statement',
    text: 'Pay down the balance before the statement closes so a low number gets reported.',
  },
  {
    id: 'tip-one-account',
    text: 'Start with one account and avoid opening several new cards at once.',
  },
  {
    id: 'tip-check-reports',
    text: 'Check your free credit reports regularly for errors that could drag your score down.',
  },
];

const LESSON_BY_ID: ReadonlyMap<string, CreditLesson> = new Map(
  CREDIT_BUILDING_LESSONS.map((lesson) => [lesson.id, lesson]),
);

/**
 * Look up a single lesson by id.
 *
 * @param id - The lesson id.
 * @returns The lesson, or `undefined` when no lesson matches.
 */
export function getCreditLesson(id: string): CreditLesson | undefined {
  return LESSON_BY_ID.get(id);
}
