// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.learning

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
 */
data class LearningPath(
    val id: String,
    val title: String,
    val description: String,
    val icon: String,
    val modules: List<LearningModule>,
    val isPremium: Boolean,
    val estimatedMinutes: Int,
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

    private val paths = listOf(
        LearningPath(
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
        ),
        LearningPath(
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
        ),
        LearningPath(
            id = "investing-101",
            title = "Investing 101",
            description = "Understand the basics of growing your wealth through investing.",
            icon = "📈",
            isPremium = true,
            estimatedMinutes = 20,
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
        ),
        LearningPath(
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
        ),
    )
}
