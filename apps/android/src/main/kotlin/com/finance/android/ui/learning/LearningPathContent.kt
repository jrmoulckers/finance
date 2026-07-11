// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.learning

/**
 * Difficulty tier for a [LearningPath] (#2209).
 *
 * Drives beginner-mode ordering and gating: beginner-friendly content surfaces
 * first, while [ADVANCED] topics (investing, deeper tax strategy) stay hidden
 * until a new learner explicitly opts in.
 */
enum class LearningLevel {
    /** Plain-language starting point suitable for first-time learners. */
    BEGINNER,

    /** Everyday money skills for the general audience. */
    CORE,

    /** Complex topics delayed for beginners until they opt in. */
    ADVANCED,
}

/**
 * Learning path data model for structured financial education modules (#382).
 *
 * A learning path is a sequence of modules that guide the user through
 * a financial topic from basics to mastery.
 *
 * @property id Unique identifier for the path.
 * @property title Human-readable path title.
 * @property description Brief description of what the user will learn.
 * @property icon Emoji or icon identifier for the path card.
 * @property modules Ordered list of learning modules in this path.
 * @property isPremium Whether this path requires a premium subscription.
 * @property estimatedMinutes Total estimated time to complete all modules.
 * @property level Difficulty tier used for beginner-mode ordering and gating.
 */
data class LearningPath(
    val id: String,
    val title: String,
    val description: String,
    val icon: String,
    val modules: List<LearningModule>,
    val isPremium: Boolean,
    val estimatedMinutes: Int,
    val level: LearningLevel = LearningLevel.CORE,
)

/**
 * A single learning module within a [LearningPath].
 *
 * @property id Unique identifier for the module.
 * @property title Module title.
 * @property content The educational content in plain text.
 * @property keyTakeaways Bullet-point summary of key learnings.
 * @property quiz Optional quiz question to test understanding.
 * @property estimatedMinutes Estimated reading time.
 */
data class LearningModule(
    val id: String,
    val title: String,
    val content: String,
    val keyTakeaways: List<String>,
    val quiz: QuizQuestion? = null,
    val estimatedMinutes: Int,
)

/**
 * A simple quiz question to reinforce learning.
 *
 * @property question The question text.
 * @property options Available answer options.
 * @property correctIndex Index of the correct answer in [options].
 * @property explanation Why the correct answer is right.
 */
data class QuizQuestion(
    val question: String,
    val options: List<String>,
    val correctIndex: Int,
    val explanation: String,
)

/**
 * Tracks a user's progress through a [LearningPath].
 *
 * @property pathId The learning path being tracked.
 * @property completedModuleIds Set of completed module IDs.
 * @property quizScores Map of module ID to quiz score (0.0 to 1.0).
 */
data class LearningProgress(
    val pathId: String,
    val completedModuleIds: Set<String> = emptySet(),
    val quizScores: Map<String, Float> = emptyMap(),
) {
    /**
     * Overall completion percentage (0.0 to 1.0).
     */
    fun completionPercent(totalModules: Int): Float =
        if (totalModules > 0) completedModuleIds.size.toFloat() / totalModules else 0f

    /**
     * Average quiz score across all attempted quizzes.
     */
    fun averageQuizScore(): Float =
        if (quizScores.isNotEmpty()) quizScores.values.average().toFloat() else 0f
}

/**
 * Static content provider for all financial learning paths (#382).
 *
 * All content is educational and does not contain sensitive financial data.
 */
object LearningPathContent {

    fun allPaths(): List<LearningPath> = paths

    fun pathById(id: String): LearningPath? = paths.find { it.id == id }

    /**
     * Returns paths tailored for the learner (#2209).
     *
     * In beginner mode, beginner-friendly paths are ordered first and
     * [LearningLevel.ADVANCED] topics (e.g. investing) stay hidden until the
     * learner opts in via [showAdvanced]. Outside beginner mode the full
     * catalog is returned in its natural order.
     */
    fun catalog(beginnerMode: Boolean, showAdvanced: Boolean): List<LearningPath> {
        if (!beginnerMode) return paths
        val visible = if (showAdvanced) paths else paths.filter { it.level != LearningLevel.ADVANCED }
        return visible.sortedBy { it.level.ordinal }
    }

    /** Whether the catalog contains any advanced content that could be gated. */
    fun hasAdvancedContent(): Boolean = paths.any { it.level == LearningLevel.ADVANCED }

    private val paths: List<LearningPath> by lazy {
        listOf(
            budgetingBasicsPath,
            emergencyFundPath,
            investing101Path,
            debtManagementPath,
            newcomerBasicsPath,
            buildingCreditPath,
            firstJobPath,
        )
    }

    private val budgetingBasicsPath = LearningPath(
            id = "budgeting-basics",
            title = "Budgeting Basics",
            description = "Learn to create and stick to a budget that works for your lifestyle.",
            icon = "📊",
            isPremium = false,
            estimatedMinutes = 15,
            modules = listOf(
                LearningModule(
                    id = "bb-1",
                    title = "Why Budget?",
                    content = "A budget is a plan for your money. Without one, it's easy to spend more than you earn without realising it. Budgeting gives you control — you decide where every dollar goes instead of wondering where it went.",
                    keyTakeaways = listOf(
                        "A budget is a spending plan, not a restriction",
                        "It helps you align spending with your values",
                        "Even high earners benefit from budgeting",
                    ),
                    quiz = QuizQuestion(
                        question = "What is the primary purpose of a budget?",
                        options = listOf(
                            "To restrict all spending",
                            "To plan where your money goes",
                            "To earn more money",
                            "To track your credit score",
                        ),
                        correctIndex = 1,
                        explanation = "A budget is a plan that helps you decide where your money goes, not a tool to restrict spending entirely.",
                    ),
                    estimatedMinutes = 5,
                ),
                LearningModule(
                    id = "bb-2",
                    title = "The 50/30/20 Rule",
                    content = "A simple budgeting framework: 50% of income goes to needs (rent, food, utilities), 30% to wants (entertainment, dining out), and 20% to savings and debt repayment. This is a starting point — adjust the ratios to fit your situation.",
                    keyTakeaways = listOf(
                        "50% for needs, 30% for wants, 20% for savings",
                        "It's a guideline, not a strict rule",
                        "Adjust ratios as your situation changes",
                    ),
                    quiz = QuizQuestion(
                        question = "In the 50/30/20 rule, what percentage goes to savings?",
                        options = listOf("50%", "30%", "20%", "10%"),
                        correctIndex = 2,
                        explanation = "The 50/30/20 rule allocates 20% of income to savings and debt repayment.",
                    ),
                    estimatedMinutes = 5,
                ),
                LearningModule(
                    id = "bb-3",
                    title = "Tracking Your Spending",
                    content = "You can't budget what you don't track. Start by recording every expense for a month. Most people are surprised by how much they spend on small purchases. This app helps you track automatically — just log each transaction.",
                    keyTakeaways = listOf(
                        "Track every expense for at least one month",
                        "Small purchases add up quickly",
                        "Use categories to see spending patterns",
                    ),
                    estimatedMinutes = 5,
                ),
            ),
        )

    private val emergencyFundPath = LearningPath(
            id = "emergency-fund",
            title = "Building an Emergency Fund",
            description = "Create a financial safety net for life's unexpected expenses.",
            icon = "🛡️",
            isPremium = false,
            estimatedMinutes = 12,
            modules = listOf(
                LearningModule(
                    id = "ef-1",
                    title = "Why You Need One",
                    content = "An emergency fund is money set aside for unexpected expenses — car repairs, medical bills, or job loss. Without one, a single surprise can lead to debt. Financial experts recommend saving 3-6 months of living expenses.",
                    keyTakeaways = listOf(
                        "Emergencies are when, not if",
                        "Aim for 3-6 months of living expenses",
                        "Start small — even a few hundred dollars helps",
                    ),
                    quiz = QuizQuestion(
                        question = "How many months of expenses should an emergency fund cover?",
                        options = listOf("1 month", "3-6 months", "12 months", "24 months"),
                        correctIndex = 1,
                        explanation = "Most financial experts recommend 3-6 months of living expenses as a target.",
                    ),
                    estimatedMinutes = 4,
                ),
                LearningModule(
                    id = "ef-2",
                    title = "Where to Keep It",
                    content = "Your emergency fund should be easily accessible but separate from everyday spending. A high-yield savings account is ideal — it earns some interest while staying liquid. Avoid investing emergency funds in stocks or locking them in CDs.",
                    keyTakeaways = listOf(
                        "Keep it separate from spending accounts",
                        "High-yield savings accounts are ideal",
                        "Don't invest it — you need quick access",
                    ),
                    estimatedMinutes = 4,
                ),
                LearningModule(
                    id = "ef-3",
                    title = "Building It Up",
                    content = "Start with a goal of saving one month's expenses. Set up automatic transfers — even small amounts add up. Cut one discretionary expense and redirect that money. Once you reach your target, maintain it and replenish after use.",
                    keyTakeaways = listOf(
                        "Automate your savings",
                        "Start with one month, then build to 3-6",
                        "Replenish after every use",
                    ),
                    estimatedMinutes = 4,
                ),
            ),
        )

    private val investing101Path = LearningPath(
            id = "investing-101",
            title = "Investing 101",
            description = "Understand the basics of growing your wealth through investing.",
            icon = "📈",
            isPremium = true,
            estimatedMinutes = 20,
            level = LearningLevel.ADVANCED,
            modules = listOf(
                LearningModule(
                    id = "inv-1",
                    title = "Why Invest?",
                    content = "Savings accounts protect your money, but investing grows it. Thanks to compound interest, even small investments can grow significantly over time. The key is starting early and being consistent.",
                    keyTakeaways = listOf(
                        "Investing grows wealth faster than saving alone",
                        "Compound interest accelerates growth over time",
                        "Starting early matters more than investing large amounts",
                    ),
                    quiz = QuizQuestion(
                        question = "What makes investing more powerful than saving alone?",
                        options = listOf(
                            "Higher insurance coverage",
                            "Compound interest and growth",
                            "Lower taxes",
                            "Better bank bonuses",
                        ),
                        correctIndex = 1,
                        explanation = "Compound interest means your returns generate their own returns, accelerating wealth growth over time.",
                    ),
                    estimatedMinutes = 5,
                ),
                LearningModule(
                    id = "inv-2",
                    title = "Risk and Return",
                    content = "Higher potential returns come with higher risk. Stocks can grow more than bonds, but they can also lose value. Your risk tolerance depends on your age, goals, and how comfortable you are with temporary losses.",
                    keyTakeaways = listOf(
                        "Risk and return are related — higher reward means higher risk",
                        "Younger investors can typically take more risk",
                        "Diversification reduces risk without eliminating returns",
                    ),
                    estimatedMinutes = 5,
                ),
                LearningModule(
                    id = "inv-3",
                    title = "Index Funds Explained",
                    content = "Index funds track a market index (like the S&P 500) and hold hundreds of stocks at once. They offer instant diversification, low fees, and historically strong long-term returns. Many financial experts recommend them as a starting point.",
                    keyTakeaways = listOf(
                        "Index funds provide instant diversification",
                        "They have lower fees than actively managed funds",
                        "Great starting point for new investors",
                    ),
                    estimatedMinutes = 5,
                ),
                LearningModule(
                    id = "inv-4",
                    title = "Getting Started",
                    content = "Open a brokerage account, decide on your asset allocation (how much in stocks vs bonds), and start with regular contributions. Many brokerages have no minimum investment. Set up automatic monthly investments.",
                    keyTakeaways = listOf(
                        "You don't need a lot of money to start",
                        "Decide your stock-to-bond ratio based on risk tolerance",
                        "Automate regular contributions",
                    ),
                    estimatedMinutes = 5,
                ),
            ),
        )

    private val debtManagementPath = LearningPath(
            id = "debt-management",
            title = "Managing Debt Wisely",
            description = "Strategies to pay down debt efficiently and avoid common traps.",
            icon = "💳",
            isPremium = true,
            estimatedMinutes = 18,
            modules = listOf(
                LearningModule(
                    id = "dm-1",
                    title = "Good Debt vs Bad Debt",
                    content = "Not all debt is created equal. A mortgage or student loan can build long-term value (good debt). High-interest credit card debt that funds lifestyle spending is usually bad debt. The key difference is whether the debt builds assets or just costs money.",
                    keyTakeaways = listOf(
                        "Good debt builds assets or future earning power",
                        "Bad debt funds consumption at high interest rates",
                        "Focus on eliminating bad debt first",
                    ),
                    quiz = QuizQuestion(
                        question = "Which is generally considered 'good debt'?",
                        options = listOf(
                            "Credit card debt from shopping",
                            "A mortgage on a home",
                            "Payday loans",
                            "Store credit cards",
                        ),
                        correctIndex = 1,
                        explanation = "A mortgage builds equity in an asset (your home) and typically has lower interest rates.",
                    ),
                    estimatedMinutes = 5,
                ),
                LearningModule(
                    id = "dm-2",
                    title = "Snowball vs Avalanche",
                    content = "Two popular debt payoff strategies: the Snowball method pays off smallest balances first for quick wins and motivation. The Avalanche method targets highest-interest debt first, saving more money overall. Both work — pick the one that keeps you motivated.",
                    keyTakeaways = listOf(
                        "Snowball: pay smallest balance first for motivation",
                        "Avalanche: pay highest interest first to save money",
                        "Consistency matters more than which method you choose",
                    ),
                    estimatedMinutes = 5,
                ),
                LearningModule(
                    id = "dm-3",
                    title = "Avoiding Debt Traps",
                    content = "Common traps include minimum-only payments, balance transfers without a payoff plan, and using new credit to pay old debt. Always pay more than the minimum, have a clear payoff timeline, and avoid new debt while paying off existing debt.",
                    keyTakeaways = listOf(
                        "Minimum payments mostly cover interest",
                        "Have a clear payoff date for every debt",
                        "Don't take on new debt to pay off old debt",
                    ),
                    estimatedMinutes = 4,
                ),
                LearningModule(
                    id = "dm-4",
                    title = "When to Seek Help",
                    content = "If debt payments consume more than 40% of your income, or if you're missing payments, consider professional help. Non-profit credit counselling agencies can negotiate lower rates and create manageable payment plans at no cost.",
                    keyTakeaways = listOf(
                        "Seek help if debt exceeds 40% of income",
                        "Non-profit credit counsellors are free",
                        "There's no shame in asking for help",
                    ),
                    estimatedMinutes = 4,
                ),
            ),
        )

    // ── Newcomer & beginner paths ───────────────────────────────────

    /**
     * US finance basics for newcomers, including ITIN-aware guidance (#2178).
     */
    private val newcomerBasicsPath = LearningPath(
        id = "newcomer-us-basics",
        title = "US Finance Basics for Newcomers",
        description = "Plain-language basics for building your financial life in the US — even before you have an SSN.",
        icon = "🗽",
        isPremium = false,
        estimatedMinutes = 22,
        level = LearningLevel.BEGINNER,
        modules = listOf(
            LearningModule(
                id = "nc-1",
                title = "SSN vs ITIN: Which Do You Have?",
                content = "A Social Security Number (SSN) is issued to citizens and work-authorized residents. If you can't get an SSN yet, the IRS can issue an Individual Taxpayer Identification Number (ITIN) so you can file taxes and, at many banks, open an account and even build credit. An ITIN is nine digits and always starts with a 9. You apply with IRS Form W-7, usually alongside your first tax return. Having an ITIN does not affect your immigration status — it exists only for tax purposes.",
                keyTakeaways = listOf(
                    "An ITIN lets you file taxes and often open accounts without an SSN",
                    "Apply with IRS Form W-7, typically with your first tax return",
                    "An ITIN starts with 9 and is for taxes only — it isn't work authorization",
                ),
                quiz = QuizQuestion(
                    question = "What is an ITIN used for?",
                    options = listOf(
                        "Proving work authorization",
                        "Filing taxes when you can't get an SSN",
                        "Replacing a passport",
                        "Qualifying for a green card",
                    ),
                    correctIndex = 1,
                    explanation = "An ITIN is a tax processing number for people who need to file US taxes but aren't eligible for an SSN. It doesn't grant work authorization or change immigration status.",
                ),
                estimatedMinutes = 5,
            ),
            LearningModule(
                id = "nc-2",
                title = "Reading a W-2 and a 1099",
                content = "When you work, your employer reports your pay to you and the IRS. If you're an employee, you get a W-2 in January showing your yearly wages and the taxes already withheld. If you did independent or gig work, you may instead get a 1099 (such as a 1099-NEC), which shows what you were paid with no taxes withheld — meaning you're responsible for those taxes yourself. Keep every W-2 and 1099; you need them to file an accurate tax return.",
                keyTakeaways = listOf(
                    "A W-2 is for employees and shows taxes already withheld",
                    "A 1099 is for contract/gig income with no taxes withheld",
                    "Save every form — you need them to file your taxes",
                ),
                quiz = QuizQuestion(
                    question = "You received a 1099-NEC. What does that usually mean?",
                    options = listOf(
                        "Your taxes were already withheld",
                        "You were paid as a contractor and owe the taxes yourself",
                        "You are exempt from taxes",
                        "You cannot file a return",
                    ),
                    correctIndex = 1,
                    explanation = "A 1099 reports income paid without withholding, so a contractor is responsible for paying the associated taxes when filing.",
                ),
                estimatedMinutes = 5,
            ),
            LearningModule(
                id = "nc-3",
                title = "Where Did My Paycheck Go? Withholding",
                content = "Your take-home pay is smaller than your salary because of withholding — money your employer sends to the government on your behalf for federal income tax, and often Social Security, Medicare, and state tax. When you start a job you fill out a Form W-4 that tells your employer how much to withhold. If too much is withheld you get a refund at tax time; if too little, you owe. The goal is to withhold close to what you actually owe.",
                keyTakeaways = listOf(
                    "Withholding is tax taken out of each paycheck in advance",
                    "Your W-4 controls how much is withheld",
                    "A refund means you overpaid during the year — not free money",
                ),
                estimatedMinutes = 4,
            ),
            LearningModule(
                id = "nc-4",
                title = "What Is a 401(k)?",
                content = "A 401(k) is a retirement savings account many US employers offer. You choose a percentage of each paycheck to save, and it goes in before you ever see it. Many employers 'match' part of what you put in — that's free money you should try not to leave behind. The money grows over the years and is meant to be used in retirement, so there are penalties for taking it out early. Even small contributions add up over decades.",
                keyTakeaways = listOf(
                    "A 401(k) is a workplace retirement account funded from your paycheck",
                    "An employer match is free money — contribute enough to get it",
                    "It's for the long term, so early withdrawals are penalized",
                ),
                quiz = QuizQuestion(
                    question = "Why is an employer 401(k) match valuable?",
                    options = listOf(
                        "It doubles your salary",
                        "It's extra money your employer adds to your retirement savings",
                        "It removes all taxes",
                        "It guarantees stock gains",
                    ),
                    correctIndex = 1,
                    explanation = "A match means your employer contributes additional money based on what you save — turning it down leaves free retirement money on the table.",
                ),
                estimatedMinutes = 4,
            ),
            LearningModule(
                id = "nc-5",
                title = "Budgeting on Uneven Income",
                content = "Many newcomers start with hourly, seasonal, or gig work where income changes week to week. Budget from your lowest typical month, not your best one. Cover needs first — housing, food, transport — then set aside a little for taxes if you're a contractor, and save whatever is left in good months to cover slow ones. A small buffer smooths out the ups and downs so a slow week doesn't become a crisis.",
                keyTakeaways = listOf(
                    "Plan around your lowest typical income, not your highest",
                    "Set aside money for taxes if you're paid on a 1099",
                    "Save in strong months to cover the slow ones",
                ),
                estimatedMinutes = 4,
            ),
        ),
    )

    /**
     * Beginner-friendly path for building credit from zero (#2174).
     */
    private val buildingCreditPath = LearningPath(
        id = "building-credit",
        title = "Building Credit From Zero",
        description = "Start your US credit history from scratch — secured cards, utilization, and steady on-time habits.",
        icon = "🌟",
        isPremium = false,
        estimatedMinutes = 24,
        level = LearningLevel.BEGINNER,
        modules = listOf(
            LearningModule(
                id = "bc-1",
                title = "What Credit and a FICO Score Are",
                content = "Credit is a lender's trust that you'll pay back money you borrow. Your credit history is a record of how you've handled that trust, and a FICO score (usually 300–850) summarizes it into a single number. Lenders, landlords, and even some employers look at it. When you're new to the country you often have no score at all — that's normal, and this path shows you how to build one from zero.",
                keyTakeaways = listOf(
                    "A credit score summarizes how reliably you repay borrowed money",
                    "FICO scores typically range from 300 to 850",
                    "Having no score yet is normal — it can be built over time",
                ),
                quiz = QuizQuestion(
                    question = "What does a FICO score mainly measure?",
                    options = listOf(
                        "How much money you have saved",
                        "How reliably you repay borrowed money",
                        "Your yearly income",
                        "How many bank accounts you have",
                    ),
                    correctIndex = 1,
                    explanation = "A credit score reflects your track record of repaying debt on time, not how much money or income you have.",
                ),
                estimatedMinutes = 4,
            ),
            LearningModule(
                id = "bc-2",
                title = "Secured Cards: Your First Card",
                content = "If no one will give you a regular credit card yet, a secured card is the usual starting point. You put down a refundable deposit — say $200 — and that becomes your credit limit. You use it like a normal card and pay it off each month. The bank reports your on-time payments to the credit bureaus, which builds your history. After several months of good behaviour many issuers refund your deposit and 'graduate' you to a regular card.",
                keyTakeaways = listOf(
                    "A secured card is backed by a refundable deposit",
                    "It builds credit because payments are reported to the bureaus",
                    "Good habits can graduate you to a regular card and refund the deposit",
                ),
                quiz = QuizQuestion(
                    question = "What makes a secured card 'secured'?",
                    options = listOf(
                        "It has extra fraud insurance",
                        "You provide a refundable deposit as collateral",
                        "It can only be used online",
                        "It has no spending limit",
                    ),
                    correctIndex = 1,
                    explanation = "A secured card is backed by a cash deposit that usually equals your credit limit, which lowers the lender's risk while you build history.",
                ),
                estimatedMinutes = 4,
            ),
            LearningModule(
                id = "bc-3",
                title = "Credit Utilization",
                content = "Utilization is how much of your available credit you're using. If your limit is $200 and your balance is $60, your utilization is 30%. Lower is better — keeping it under about 30%, and ideally under 10%, helps your score. High utilization signals you may be stretched thin. A simple trick: make small purchases and pay them off before the statement closes so a low balance gets reported.",
                keyTakeaways = listOf(
                    "Utilization is your balance divided by your credit limit",
                    "Aim to keep it under 30%, ideally under 10%",
                    "Paying down before the statement date lowers reported utilization",
                ),
                quiz = QuizQuestion(
                    question = "Your limit is $500 and your balance is $150. What's your utilization?",
                    options = listOf("15%", "30%", "50%", "3%"),
                    correctIndex = 1,
                    explanation = "150 divided by 500 is 0.30, or 30% utilization — right at the upper edge of what's considered healthy.",
                ),
                estimatedMinutes = 4,
            ),
            LearningModule(
                id = "bc-4",
                title = "Statement Date vs Due Date",
                content = "Two dates matter on a credit card. The statement (closing) date is when the bank totals up your billing cycle and reports your balance to the credit bureaus. The due date, usually a few weeks later, is when your payment must arrive to avoid interest and late fees. Paying your full statement balance by the due date means you pay zero interest. Paying a bit before the statement date also lowers the balance that gets reported.",
                keyTakeaways = listOf(
                    "The statement date is when your balance is reported",
                    "The due date is when payment must arrive to avoid interest",
                    "Paying the full statement balance by the due date avoids all interest",
                ),
                quiz = QuizQuestion(
                    question = "How do you avoid paying any interest on a credit card?",
                    options = listOf(
                        "Pay only the minimum each month",
                        "Pay the full statement balance by the due date",
                        "Never use the card",
                        "Pay after the due date",
                    ),
                    correctIndex = 1,
                    explanation = "Paying the entire statement balance by the due date means the bank charges no interest on your purchases.",
                ),
                estimatedMinutes = 4,
            ),
            LearningModule(
                id = "bc-5",
                title = "Inquiries and Your Credit Report",
                content = "When you apply for credit, the lender does a 'hard inquiry,' which can lower your score by a few points for a short time — so don't apply for many cards at once. Checking your own credit is a 'soft inquiry' and never hurts you. You're entitled to free credit reports from the major bureaus; review them for mistakes, because errors can drag down a score you worked hard to build.",
                keyTakeaways = listOf(
                    "Hard inquiries from applications can dip your score briefly",
                    "Checking your own credit is a soft inquiry and is harmless",
                    "Review your free credit reports for errors regularly",
                ),
                estimatedMinutes = 4,
            ),
            LearningModule(
                id = "bc-6",
                title = "Your Build-Credit Checklist",
                content = "Put it together: open one secured or starter card, use it for a small recurring expense, keep utilization low, and pay the full statement balance on time every single month. Set up autopay so you never miss a due date — payment history is the biggest factor in your score. Be patient: a few months of steady, boring, on-time payments is exactly what builds a strong credit history.",
                keyTakeaways = listOf(
                    "One starter card used lightly is enough to begin",
                    "Autopay the full balance so you never miss a due date",
                    "On-time payment history is the single biggest score factor",
                ),
                quiz = QuizQuestion(
                    question = "What has the biggest impact on your credit score?",
                    options = listOf(
                        "How many cards you own",
                        "Paying on time, every time",
                        "Your account's age in days",
                        "How often you check your score",
                    ),
                    correctIndex = 1,
                    explanation = "Payment history is the largest component of a FICO score, so consistent on-time payments matter most.",
                ),
                estimatedMinutes = 4,
            ),
        ),
    )

    /**
     * First-job / teen beginner path in plain language, no investing or tax
     * complexity (#2209).
     */
    private val firstJobPath = LearningPath(
        id = "first-job-money",
        title = "Your First Paycheck",
        description = "Just started your first job? Learn the money basics — paychecks, cards, and saving for what you want.",
        icon = "🎓",
        isPremium = false,
        estimatedMinutes = 18,
        level = LearningLevel.BEGINNER,
        modules = listOf(
            LearningModule(
                id = "fj-1",
                title = "Understanding Your First Paycheck",
                content = "Your first paycheck can be a surprise — it's smaller than your hourly rate times your hours. That's because some money is taken out for taxes before you get paid. The amount you actually receive is your 'take-home pay.' Your pay stub lists what you earned and what was taken out. It's worth a look so you know exactly what you're bringing home.",
                keyTakeaways = listOf(
                    "Take-home pay is less than your total earnings because of taxes",
                    "Your pay stub shows what you earned and what was deducted",
                    "Knowing your take-home pay helps you plan",
                ),
                quiz = QuizQuestion(
                    question = "Why is your paycheck smaller than your hourly rate times hours worked?",
                    options = listOf(
                        "The bank keeps some",
                        "Taxes and deductions come out first",
                        "It's a mistake",
                        "You get the rest next year",
                    ),
                    correctIndex = 1,
                    explanation = "Taxes and other deductions are taken out before you're paid, so your take-home pay is less than your gross earnings.",
                ),
                estimatedMinutes = 4,
            ),
            LearningModule(
                id = "fj-2",
                title = "Debit Cards and Avoiding Fees",
                content = "A debit card spends money you already have in your account — unlike a credit card, which borrows it. Debit cards are a safe way to start because you can't spend money you don't have. Watch out for fees: overdraft fees if you spend more than your balance, and ATM fees for using the wrong machine. Checking your balance before you spend keeps you in control and fee-free.",
                keyTakeaways = listOf(
                    "A debit card spends your own money, not borrowed money",
                    "Overdraft and out-of-network ATM fees are avoidable",
                    "Check your balance before spending",
                ),
                quiz = QuizQuestion(
                    question = "What's the main difference between a debit and a credit card?",
                    options = listOf(
                        "Debit borrows money; credit uses your own",
                        "Debit uses your own money; credit borrows it",
                        "They are exactly the same",
                        "Credit cards can't be used online",
                    ),
                    correctIndex = 1,
                    explanation = "A debit card draws from money you already have, while a credit card borrows money you pay back later.",
                ),
                estimatedMinutes = 4,
            ),
            LearningModule(
                id = "fj-3",
                title = "Needs, Wants, and Saving for Later",
                content = "Every time you get paid, split it in your head three ways: needs (things you must pay for, like a phone bill or bus fare), wants (fun stuff like games or eating out), and savings (money you keep for later). You don't need fancy rules — even saving a small slice of each paycheck first, before you spend on wants, builds a habit that pays off for the rest of your life.",
                keyTakeaways = listOf(
                    "Split money into needs, wants, and savings",
                    "Save a little first, before spending on wants",
                    "The habit matters more than the amount",
                ),
                estimatedMinutes = 3,
            ),
            LearningModule(
                id = "fj-4",
                title = "Beating Impulse Spending",
                content = "Stores and apps are designed to make you buy right now. A simple defense is the 24-hour rule: when you want something that isn't a need, wait a day. Often the urge fades and you keep your money. Another trick is to keep your savings in a separate account so it's a little harder to touch. Small pauses lead to big savings over a year.",
                keyTakeaways = listOf(
                    "Wait 24 hours before buying non-essential things",
                    "Keep savings separate so it's harder to spend",
                    "Small pauses add up to big savings",
                ),
                quiz = QuizQuestion(
                    question = "What's the 24-hour rule?",
                    options = listOf(
                        "Spend within 24 hours or lose the deal",
                        "Wait a day before buying something you don't need",
                        "Check your balance every 24 hours",
                        "Pay bills within 24 hours",
                    ),
                    correctIndex = 1,
                    explanation = "Waiting a day before a non-essential purchase gives the impulse time to fade, helping you avoid regret spending.",
                ),
                estimatedMinutes = 3,
            ),
            LearningModule(
                id = "fj-5",
                title = "Saving for Something Big",
                content = "Want a car, a laptop, or a trip? Big goals feel out of reach until you break them down. Pick the price, pick a date, and divide: a $1,200 goal in 12 months is $100 a month, or about $25 a week. Put that amount aside first each time you get paid and watch it grow. Seeing the total climb toward your goal is what keeps saving fun instead of feeling like a chore.",
                keyTakeaways = listOf(
                    "Break a big goal into a weekly or monthly amount",
                    "Set the money aside first, before spending on wants",
                    "Tracking progress keeps saving motivating",
                ),
                quiz = QuizQuestion(
                    question = "You want to save $1,200 in 12 months. About how much per month?",
                    options = listOf("$50", "$100", "$200", "$1,200"),
                    correctIndex = 1,
                    explanation = "$1,200 divided by 12 months is $100 per month — breaking a big goal into small steps makes it reachable.",
                ),
                estimatedMinutes = 4,
            ),
        ),
    )
}
