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
