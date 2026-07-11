// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.education

/**
 * Identifier for every financial concept that can display an info tooltip (#378).
 *
 * Each entry maps to a short title and a plain-language explanation stored
 * in [FinancialConceptContent]. The enum is intentionally exhaustive so
 * the compiler warns when a new concept is added without content.
 */
enum class FinancialConcept {
    NET_WORTH,
    BUDGET,
    BUDGET_UTILIZATION,
    BUDGET_HEALTH,
    SAVINGS_RATE,
    COMPOUND_INTEREST,
    EMERGENCY_FUND,
    DEBT_TO_INCOME,
    EXPENSE_RATIO,
    CASH_FLOW,
    ASSET_ALLOCATION,
    SINKING_FUND,
    AMORTIZATION,
    APR,
    APY,
    INFLATION,
    LIQUIDITY,
    DIVERSIFICATION,
    RECURRING_EXPENSE,
    TRANSACTION_CATEGORY,

    // ── US newcomer basics (#2178) ──────────────────────────────────
    W2,
    FORM_1099,
    TAX_WITHHOLDING,
    RETIREMENT_401K,
    ITIN,

    // ── Credit building basics (#2174) ──────────────────────────────
    FICO_SCORE,
    CREDIT_UTILIZATION,
    STATEMENT_VS_DUE_DATE,
    HARD_INQUIRY,
    CREDIT_REPORT,
    SECURED_CARD,
}

/**
 * Static content for each [FinancialConcept] tooltip (#378).
 *
 * All text is plain-language, jargon-free, and kept short enough for
 * a tooltip popup. No sensitive financial data is included.
 */
object FinancialConceptContent {

    /**
     * Returns a [ConceptInfo] for the given [concept].
     */
    fun infoFor(concept: FinancialConcept): ConceptInfo = concepts.getValue(concept)

    /**
     * Returns all available concepts and their content, useful for
     * building a glossary or search index.
     */
    fun all(): Map<FinancialConcept, ConceptInfo> = concepts

    private val concepts: Map<FinancialConcept, ConceptInfo> = mapOf(
        FinancialConcept.NET_WORTH to ConceptInfo(
            title = "Net Worth",
            shortDescription = "The total value of everything you own minus everything you owe.",
            learnMoreText = "Net worth = Assets − Liabilities. Tracking it over time shows whether your financial health is improving.",
        ),
        FinancialConcept.BUDGET to ConceptInfo(
            title = "Budget",
            shortDescription = "A plan for how you'll spend your money each month.",
            learnMoreText = "Budgets help you prioritise spending so you can save for goals and avoid overspending.",
        ),
        FinancialConcept.BUDGET_UTILIZATION to ConceptInfo(
            title = "Budget Utilization",
            shortDescription = "How much of your budget you've used so far.",
            learnMoreText = "Shown as a percentage — 75% means you've spent three-quarters of your budget for this period.",
        ),
        FinancialConcept.BUDGET_HEALTH to ConceptInfo(
            title = "Budget Health",
            shortDescription = "A quick status check on your budget — healthy, warning, or over.",
            learnMoreText = "Green means on track, orange means getting close, red means you've gone over your limit.",
        ),
        FinancialConcept.SAVINGS_RATE to ConceptInfo(
            title = "Savings Rate",
            shortDescription = "The percentage of your income that you save each month.",
            learnMoreText = "A higher savings rate means you're building wealth faster. Many advisors suggest saving at least 20%.",
        ),
        FinancialConcept.COMPOUND_INTEREST to ConceptInfo(
            title = "Compound Interest",
            shortDescription = "Earning interest on your interest — your money grows faster over time.",
            learnMoreText = "When interest is added to your balance and future interest is calculated on the new total, growth accelerates.",
        ),
        FinancialConcept.EMERGENCY_FUND to ConceptInfo(
            title = "Emergency Fund",
            shortDescription = "Money set aside for unexpected expenses like car repairs or medical bills.",
            learnMoreText = "Most experts recommend saving 3-6 months of living expenses in an easily accessible account.",
        ),
        FinancialConcept.DEBT_TO_INCOME to ConceptInfo(
            title = "Debt-to-Income Ratio",
            shortDescription = "How much of your monthly income goes toward paying debts.",
            learnMoreText = "Calculated as total monthly debt payments ÷ gross monthly income. Lenders prefer a ratio below 36%.",
        ),
        FinancialConcept.EXPENSE_RATIO to ConceptInfo(
            title = "Expense Ratio",
            shortDescription = "The annual fee charged by an investment fund, expressed as a percentage.",
            learnMoreText = "Lower expense ratios mean more of your money stays invested. Index funds typically have ratios below 0.20%.",
        ),
        FinancialConcept.CASH_FLOW to ConceptInfo(
            title = "Cash Flow",
            shortDescription = "The difference between money coming in and money going out.",
            learnMoreText = "Positive cash flow means you have money left over after expenses. Negative means you're spending more than you earn.",
        ),
        FinancialConcept.ASSET_ALLOCATION to ConceptInfo(
            title = "Asset Allocation",
            shortDescription = "How your investments are divided among stocks, bonds, and cash.",
            learnMoreText = "A balanced allocation reduces risk. Your ideal mix depends on your age, goals, and risk tolerance.",
        ),
        FinancialConcept.SINKING_FUND to ConceptInfo(
            title = "Sinking Fund",
            shortDescription = "Saving a little each month for a planned future expense.",
            learnMoreText = "Unlike emergency funds (for surprises), sinking funds are for known costs like holiday gifts or insurance premiums.",
        ),
        FinancialConcept.AMORTIZATION to ConceptInfo(
            title = "Amortization",
            shortDescription = "Spreading loan payments over time so each payment covers interest and principal.",
            learnMoreText = "Early payments are mostly interest; later ones are mostly principal. An amortization schedule shows this breakdown.",
        ),
        FinancialConcept.APR to ConceptInfo(
            title = "APR (Annual Percentage Rate)",
            shortDescription = "The yearly cost of borrowing, including fees.",
            learnMoreText = "APR lets you compare loans on equal footing. A lower APR means less total cost over the life of a loan.",
        ),
        FinancialConcept.APY to ConceptInfo(
            title = "APY (Annual Percentage Yield)",
            shortDescription = "The real rate of return on savings, accounting for compounding.",
            learnMoreText = "APY shows what you actually earn in a year when interest compounds. Higher APY = more earnings on your deposits.",
        ),
        FinancialConcept.INFLATION to ConceptInfo(
            title = "Inflation",
            shortDescription = "The gradual increase in prices that reduces your money's buying power.",
            learnMoreText = "If inflation is 3%, something that costs \$100 today will cost about \$103 next year.",
        ),
        FinancialConcept.LIQUIDITY to ConceptInfo(
            title = "Liquidity",
            shortDescription = "How quickly you can turn an asset into cash without losing value.",
            learnMoreText = "Cash and savings accounts are highly liquid. Real estate and retirement accounts are less liquid.",
        ),
        FinancialConcept.DIVERSIFICATION to ConceptInfo(
            title = "Diversification",
            shortDescription = "Spreading your money across different investments to reduce risk.",
            learnMoreText = "If one investment loses value, others may gain — so your overall portfolio stays more stable.",
        ),
        FinancialConcept.RECURRING_EXPENSE to ConceptInfo(
            title = "Recurring Expense",
            shortDescription = "A regular payment that happens on a schedule, like rent or subscriptions.",
            learnMoreText = "Tracking recurring expenses helps you see fixed costs and find subscriptions you might want to cancel.",
        ),
        FinancialConcept.TRANSACTION_CATEGORY to ConceptInfo(
            title = "Transaction Category",
            shortDescription = "A label that groups similar expenses together, like 'Groceries' or 'Transport'.",
            learnMoreText = "Categorising transactions helps you see where your money goes and set more accurate budgets.",
        ),

        // ── US newcomer basics (#2178) ──────────────────────────────────
        FinancialConcept.W2 to ConceptInfo(
            title = "W-2 Employee",
            shortDescription = "A W-2 job means an employer pays you and takes taxes out of each paycheck for you.",
            learnMoreText = "At tax time your employer sends a W-2 form summarising what you earned and what tax was already withheld. Most salaried and hourly jobs are W-2. You usually do not need to set money aside yourself for these taxes.",
        ),
        FinancialConcept.FORM_1099 to ConceptInfo(
            title = "1099 / Contract Income",
            shortDescription = "1099 work (gig, freelance, contract) pays you the full amount with no taxes taken out.",
            learnMoreText = "Because nothing is withheld, you are responsible for setting aside money for taxes yourself — a common rule of thumb is to save 25-30% of 1099 pay. You may report it on a 1099 form at tax time. Many newcomers mix W-2 and 1099 income.",
        ),
        FinancialConcept.TAX_WITHHOLDING to ConceptInfo(
            title = "Withholding",
            shortDescription = "The part of your paycheck an employer sends to the government for taxes before you get paid.",
            learnMoreText = "Withholding is a prepayment of your income tax. If too much is withheld you get a refund; if too little, you may owe at tax time. Hourly and seasonal workers can see withholding change as their hours change.",
        ),
        FinancialConcept.RETIREMENT_401K to ConceptInfo(
            title = "401(k)",
            shortDescription = "A workplace savings account for retirement that can lower your taxes today.",
            learnMoreText = "You contribute part of each paycheck and it grows over time. Some employers add a matching contribution — money you should try not to leave on the table. You do not need to understand investing deeply to start; even a small percentage helps.",
        ),
        FinancialConcept.ITIN to ConceptInfo(
            title = "ITIN",
            shortDescription = "A tax ID number for people who need to file US taxes but cannot get a Social Security Number yet.",
            learnMoreText = "An Individual Taxpayer Identification Number (ITIN) lets you file taxes, and some banks and lenders accept it to open accounts or build credit. Having an ITIN instead of an SSN does not stop you from budgeting, saving, or learning US finance basics.",
        ),

        // ── Credit building basics (#2174) ──────────────────────────────
        FinancialConcept.FICO_SCORE to ConceptInfo(
            title = "FICO / Credit Score",
            shortDescription = "A number (about 300-850) that lenders use to judge how reliably you repay borrowed money.",
            learnMoreText = "It is built mostly from paying on time and keeping balances low. Newcomers usually start with no score at all — that is normal, and it grows with a few months of on-time payments. You do not need to pay to build it.",
        ),
        FinancialConcept.CREDIT_UTILIZATION to ConceptInfo(
            title = "Credit Utilization",
            shortDescription = "How much of your credit limit you are using right now, shown as a percentage.",
            learnMoreText = "If your limit is $200 and you owe $60, utilization is 30%. Keeping it under about 30% (lower is better) helps your credit score. Paying the balance down before the statement date keeps reported utilization low.",
        ),
        FinancialConcept.STATEMENT_VS_DUE_DATE to ConceptInfo(
            title = "Statement Date vs Due Date",
            shortDescription = "The statement date closes your billing cycle; the due date is when payment must arrive.",
            learnMoreText = "The balance reported to credit bureaus is usually the one on the statement date, so paying before then lowers reported utilization. Always pay at least the minimum by the due date to avoid late fees and score damage.",
        ),
        FinancialConcept.HARD_INQUIRY to ConceptInfo(
            title = "Hard Inquiry",
            shortDescription = "A check on your credit that happens when you apply for a card or loan.",
            learnMoreText = "Each hard inquiry can lower your score slightly for a short time, so avoid applying for many cards at once. Checking your own credit is a 'soft' inquiry and does not hurt your score.",
        ),
        FinancialConcept.CREDIT_REPORT to ConceptInfo(
            title = "Credit Report",
            shortDescription = "A detailed record of your accounts, balances, and payment history kept by credit bureaus.",
            learnMoreText = "You can review it free once a year from each major bureau. Checking it helps you catch errors or fraud early. It is separate from your score, which is calculated from the report.",
        ),
        FinancialConcept.SECURED_CARD to ConceptInfo(
            title = "Secured Credit Card",
            shortDescription = "A starter credit card backed by a refundable deposit you pay up front.",
            learnMoreText = "The deposit usually becomes your credit limit, which lowers the lender's risk so approval is easier with no credit history. Using a small amount and paying on time builds credit; many secured cards later 'graduate' to a regular card and return your deposit.",
        ),
    )
}

/**
 * Content payload for a single financial concept tooltip.
 *
 * @property title Human-readable title for the concept.
 * @property shortDescription One-sentence plain-language explanation.
 * @property learnMoreText Extended explanation shown when the user taps "Learn More".
 */
data class ConceptInfo(
    val title: String,
    val shortDescription: String,
    val learnMoreText: String,
)
