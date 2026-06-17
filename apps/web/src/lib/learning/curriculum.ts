// SPDX-License-Identifier: BUSL-1.1

import type { LearningLesson, LearningModule } from './types';

function createLesson(moduleId: string, lesson: Omit<LearningLesson, 'moduleId'>): LearningLesson {
  return { ...lesson, moduleId };
}

const budgetingLessons: readonly LearningLesson[] = [
  createLesson('budgeting-basics', {
    id: 'budget-foundations',
    title: 'Start With a Simple Spending Plan',
    summary:
      'Build a starter budget by separating income, fixed bills, flexible spending, and goals.',
    difficulty: 'beginner',
    estimatedMinutes: 8,
    learningObjectives: [
      'Name the four buckets every starter budget needs.',
      'Spot the difference between fixed and variable expenses.',
      'Turn income minus expenses into a monthly plan.',
    ],
    content: [
      'A budget works best when it starts with take-home pay, not wishful thinking. Begin with the income you actually expect this month.',
      'List fixed expenses first, then estimate variable expenses like groceries and gas. This shows what is truly flexible when money gets tight.',
      'If your plan leaves money over, give it a job such as savings, debt payoff, or a sinking fund instead of letting it disappear.',
    ],
    example: {
      title: 'Monthly reset',
      scenario:
        'Jamie brings home $3,800. Rent and utilities are $1,550, groceries and gas are planned at $650, and $500 is reserved for savings and debt. The remaining dollars are split across everyday categories before the month begins.',
      takeaway: 'The plan is realistic because every dollar is assigned before spending starts.',
    },
    glossaryKeys: ['budget', 'cashFlow', 'fixedExpense', 'variableExpense'],
    contextualTipKeys: ['fixedVsVariableExpenses', 'cashFlowHabits'],
    quiz: [
      {
        id: 'budget-foundations-q1',
        prompt: 'Which part of a budget is usually the easiest to adjust mid-month?',
        options: [
          { id: 'a', text: 'Fixed expenses like rent' },
          { id: 'b', text: 'Variable expenses like dining out' },
          { id: 'c', text: 'Take-home pay from your employer' },
        ],
        correctOptionId: 'b',
        explanation:
          'Variable expenses change based on habits and choices, so they are usually the first place to make adjustments.',
      },
    ],
  }),
  createLesson('budgeting-basics', {
    id: 'envelope-method',
    title: 'Use the Envelope Method for Guardrails',
    summary:
      'Create spending limits by giving categories their own envelopes before the month begins.',
    difficulty: 'beginner',
    estimatedMinutes: 7,
    learningObjectives: [
      'Explain how envelope budgeting limits overspending.',
      'Choose categories that work well with envelopes.',
      'Know when to stop spending from a category.',
    ],
    content: [
      'The envelope method works by pre-allocating money to categories such as groceries, dining out, or fun money. When the envelope is empty, spending pauses.',
      'Digital envelopes work the same way as cash. The key behavior is checking category balances before spending, not after.',
      'This approach is especially useful for categories that tend to drift upward because it creates a visible limit before swiping a card.',
    ],
    example: {
      title: 'Dining out cap',
      scenario:
        'Taylor sets a $160 dining out envelope for the month. After using $120 in the first two weeks, Taylor knows only $40 remains and shifts the next meal plan toward groceries.',
      takeaway:
        'Envelope balances create an early warning signal while there is still time to adjust.',
    },
    glossaryKeys: ['budget', 'discretionarySpending'],
    contextualTipKeys: ['budgetSinkingFund'],
    quiz: [
      {
        id: 'envelope-method-q1',
        prompt: 'What should happen when an envelope category reaches zero?',
        options: [
          { id: 'a', text: 'Keep spending and fix it next month' },
          { id: 'b', text: 'Pause spending or move money intentionally from another category' },
          { id: 'c', text: 'Raise your income immediately' },
        ],
        correctOptionId: 'b',
        explanation:
          'Envelope budgeting works because the limit changes behavior. When a category is empty, you pause or reallocate on purpose.',
      },
    ],
  }),
  createLesson('budgeting-basics', {
    id: 'fifty-thirty-twenty',
    title: 'Apply the 50/30/20 Rule',
    summary: 'Use a fast ratio check to see if needs, wants, and goals are roughly balanced.',
    difficulty: 'beginner',
    estimatedMinutes: 6,
    learningObjectives: [
      'Break spending into needs, wants, and goals.',
      'Use ratios as a checkpoint instead of a rigid law.',
      'Decide what to tune when the mix feels off balance.',
    ],
    content: [
      'The 50/30/20 rule is a quick diagnostic: about 50% for needs, 30% for wants, and 20% for savings or debt payoff.',
      'Real life rarely fits those exact numbers. The value is in noticing whether essentials are crowding out goals or wants are consuming the margin.',
      'If housing or debt is high, use the rule as a direction, not a grade. Adjust one category at a time to move closer to a sustainable mix.',
    ],
    example: {
      title: 'Ratio checkpoint',
      scenario:
        'Morgan takes home $4,200. Needs consume $2,450, wants are $1,250, and only $500 goes to goals. The ratio check shows wants are slightly high and savings can improve.',
      takeaway: 'A quick ratio view helps prioritize which category to adjust first.',
    },
    glossaryKeys: ['savingsRate', 'discretionarySpending'],
    contextualTipKeys: ['budget503020Rule', 'goodSavingsRate'],
    quiz: [
      {
        id: 'fifty-thirty-twenty-q1',
        prompt: 'In the 50/30/20 rule, the 20% bucket is typically used for:',
        options: [
          { id: 'a', text: 'Groceries and rent only' },
          { id: 'b', text: 'Savings and debt payoff' },
          { id: 'c', text: 'Entertainment and travel only' },
        ],
        correctOptionId: 'b',
        explanation:
          'The final 20% is usually directed toward building savings, investing, or paying down debt faster.',
      },
    ],
  }),
  createLesson('budgeting-basics', {
    id: 'zero-based-budgeting',
    title: 'Give Every Dollar a Job With Zero-Based Budgeting',
    summary: 'Assign all planned income so the budget ends at zero before the month starts.',
    difficulty: 'intermediate',
    estimatedMinutes: 9,
    learningObjectives: [
      'Describe what a zero-based budget means.',
      'Assign leftover cash to goals intentionally.',
      'Use the method without confusing it with draining your bank balance to zero.',
    ],
    content: [
      'A zero-based budget means planned income minus planned expenses equals zero. It does not mean your checking account should hit zero.',
      'The power of the method is intentionality. Surplus money is assigned to savings, investing, or debt before impulse spending can claim it.',
      'Zero-based budgeting works best with a monthly reset and short weekly check-ins so category drift gets corrected early.',
    ],
    example: {
      title: 'Intentional leftovers',
      scenario:
        'After assigning bills and regular spending, Priya still has $420. Instead of leaving it unassigned, Priya sends $220 to an emergency fund and $200 to a credit card payoff plan.',
      takeaway:
        'Unassigned money is easy to spend accidentally; assigned money reinforces priorities.',
    },
    glossaryKeys: ['budget', 'sinkingFund', 'savingsRate'],
    contextualTipKeys: ['cashFlowHabits'],
    quiz: [
      {
        id: 'zero-based-budgeting-q1',
        prompt: 'What does zero-based budgeting mean?',
        options: [
          { id: 'a', text: 'Your bank account balance should be zero at month end' },
          { id: 'b', text: 'Income minus planned spending and goals equals zero on paper' },
          { id: 'c', text: 'Only cash can be used for monthly expenses' },
        ],
        correctOptionId: 'b',
        explanation:
          'Zero-based budgeting is about giving every planned dollar a purpose, not draining your real cash balance to zero.',
      },
    ],
  }),
];

const savingLessons: readonly LearningLesson[] = [
  createLesson('saving-emergency-funds', {
    id: 'mini-emergency-fund',
    title: 'Build a Starter Emergency Fund',
    summary:
      'Start with a reachable first milestone so a surprise expense does not become new debt.',
    difficulty: 'beginner',
    estimatedMinutes: 6,
    learningObjectives: [
      'Set a starter emergency target that feels reachable.',
      'Know which expenses count as a real emergency.',
      'Use the starter fund before chasing bigger goals.',
    ],
    content: [
      'A small emergency fund creates breathing room for sudden expenses like urgent car repairs, prescriptions, or a short income gap.',
      'Starting with a manageable first target builds momentum faster than aiming at a huge number on day one.',
      'Keep the money separate from daily spending so it remains available when life goes sideways.',
    ],
    example: {
      title: 'Unexpected repair',
      scenario:
        'A $650 brake repair appears in the middle of the month. Because Alex has a starter emergency fund, the repair is paid in cash instead of going on a high-interest card.',
      takeaway: 'Even a modest emergency cushion can interrupt the debt cycle.',
    },
    glossaryKeys: ['emergencyFund', 'cashFlow'],
    contextualTipKeys: ['goodSavingsRate'],
    quiz: [
      {
        id: 'mini-emergency-fund-q1',
        prompt: 'What is the main purpose of a starter emergency fund?',
        options: [
          { id: 'a', text: 'To maximize long-term investment returns' },
          { id: 'b', text: 'To cover unexpected essentials without new debt' },
          { id: 'c', text: 'To replace a detailed monthly budget' },
        ],
        correctOptionId: 'b',
        explanation:
          'A starter emergency fund is meant to absorb true surprises so they do not turn into new borrowing.',
      },
    ],
  }),
  createLesson('saving-emergency-funds', {
    id: 'high-yield-savings',
    title: 'Pick the Right Home for Cash',
    summary:
      'Use a high-yield savings account to keep emergency money safe, liquid, and earning more than a checking account.',
    difficulty: 'beginner',
    estimatedMinutes: 7,
    learningObjectives: [
      'Explain why liquidity matters for emergency cash.',
      'Compare APY with convenience and access.',
      'Avoid locking short-term cash into volatile assets.',
    ],
    content: [
      'Emergency funds should be easy to reach and hard to lose. A high-yield savings account balances access with a better return than most checking accounts.',
      'When comparing accounts, APY matters, but so do transfer speed, fees, minimum balances, and account protections.',
      'Cash for emergencies should not depend on market timing. Investments can drop right when you need the money most.',
    ],
    example: {
      title: 'Safety before yield chasing',
      scenario:
        'Chris keeps emergency money in a savings account earning 4.25% APY instead of investing it in stocks. The cash stays available even during a market dip.',
      takeaway: 'Emergency cash needs stability and access more than maximum growth.',
    },
    glossaryKeys: ['apy', 'emergencyFund'],
    contextualTipKeys: ['aprVsApy'],
    quiz: [
      {
        id: 'high-yield-savings-q1',
        prompt:
          'Why is a high-yield savings account often a better emergency fund home than stocks?',
        options: [
          { id: 'a', text: 'Stocks are easier to access immediately' },
          { id: 'b', text: 'Savings accounts keep cash stable and liquid' },
          { id: 'c', text: 'Savings accounts always outperform stocks long term' },
        ],
        correctOptionId: 'b',
        explanation:
          'Emergency money should be stable and accessible. A high-yield savings account does that better than volatile investments.',
      },
    ],
  }),
  createLesson('saving-emergency-funds', {
    id: 'saving-automation',
    title: 'Automate Savings So It Happens First',
    summary: 'Use recurring transfers to remove willpower from your savings plan.',
    difficulty: 'intermediate',
    estimatedMinutes: 8,
    learningObjectives: [
      'Set up savings automation around payday timing.',
      'Choose an amount that is consistent, not heroic.',
      'Use automation to protect progress during busy months.',
    ],
    content: [
      'Automation turns saving into a system instead of a decision. Moving money right after payday makes it less likely to be spent elsewhere.',
      'Start with an amount that can survive normal life. Consistency beats an aggressive transfer that gets reversed every month.',
      'As income rises or debt falls, raise the transfer gradually so the habit scales with your capacity.',
    ],
    example: {
      title: 'Payday autopilot',
      scenario:
        'Every payday, $125 moves automatically into a savings account before day-to-day spending begins. After a year, the habit creates a $3,250 buffer without manual effort.',
      takeaway: 'Automated transfers make progress repeatable even when motivation is low.',
    },
    glossaryKeys: ['savingsRate', 'cashFlow'],
    contextualTipKeys: ['goodSavingsRate', 'goalCompoundInterest'],
    quiz: [
      {
        id: 'saving-automation-q1',
        prompt: 'Why is an automated transfer scheduled near payday helpful?',
        options: [
          { id: 'a', text: 'It reduces the chance of spending the money first' },
          { id: 'b', text: 'It guarantees a higher APY' },
          { id: 'c', text: 'It eliminates the need for an emergency fund target' },
        ],
        correctOptionId: 'a',
        explanation:
          'Automating close to payday treats savings like a bill and lowers the odds that the cash gets absorbed by everyday spending.',
      },
    ],
  }),
  createLesson('saving-emergency-funds', {
    id: 'emergency-fund-targets',
    title: 'Set an Emergency Fund Target That Fits Your Life',
    summary:
      'Translate essential monthly expenses into a savings target measured in months of coverage.',
    difficulty: 'intermediate',
    estimatedMinutes: 9,
    learningObjectives: [
      'Estimate essential monthly expenses.',
      'Convert monthly costs into a multi-month target.',
      'Adjust the target for income stability and dependents.',
    ],
    content: [
      'Emergency funds are often expressed as months of essential expenses, not a random round number. That keeps the goal tied to your real life.',
      'People with variable income, dependents, or a single household income may prefer the higher end of the range.',
      'Once the emergency fund is full, the same savings habit can be redirected toward investing, sinking funds, or debt payoff.',
    ],
    example: {
      title: 'Months of runway',
      scenario:
        'Essential expenses total $2,700 per month. A three-month starter target is $8,100, while a six-month cushion would be $16,200.',
      takeaway: 'Using monthly essentials produces a target that is personal and practical.',
    },
    glossaryKeys: ['emergencyFund', 'fixedExpense', 'variableExpense'],
    contextualTipKeys: ['fixedVsVariableExpenses'],
    quiz: [
      {
        id: 'emergency-fund-targets-q1',
        prompt: 'How is an emergency fund target usually estimated?',
        options: [
          { id: 'a', text: 'By multiplying essential monthly expenses by several months' },
          { id: 'b', text: 'By matching your credit card limit' },
          { id: 'c', text: 'By saving one year of gross income for everyone' },
        ],
        correctOptionId: 'a',
        explanation:
          'Emergency funds are often sized as a number of months of essential expenses because that reflects real living costs.',
      },
    ],
  }),
];

const debtLessons: readonly LearningLesson[] = [
  createLesson('debt-management', {
    id: 'debt-inventory',
    title: 'Create a Debt Snapshot Before You Accelerate Payoff',
    summary:
      'List balances, rates, minimum payments, and due dates so payoff decisions are based on facts.',
    difficulty: 'beginner',
    estimatedMinutes: 8,
    learningObjectives: [
      'Capture the numbers that matter for debt decisions.',
      'See how required payments affect monthly cash flow.',
      'Identify the debts that are most urgent.',
    ],
    content: [
      'Before choosing a payoff strategy, gather each balance, APR, minimum payment, and due date into one view.',
      'A debt inventory makes tradeoffs visible. You can see which payments are crowding out savings or which balances carry the highest borrowing cost.',
      'The goal is not shame; it is clarity. Accurate numbers create better decisions and faster progress.',
    ],
    example: {
      title: 'One-sheet debt map',
      scenario:
        'Sam lists a credit card at 24% APR, an auto loan at 6%, and a student loan at 4.5%. Seeing them together makes the expensive balance obvious.',
      takeaway: 'A debt inventory turns vague stress into concrete next steps.',
    },
    glossaryKeys: ['apr', 'debtToIncomeRatio'],
    contextualTipKeys: ['aprVsApy'],
    quiz: [
      {
        id: 'debt-inventory-q1',
        prompt: 'Which detail is most useful when deciding which debt is most expensive?',
        options: [
          { id: 'a', text: 'APR' },
          { id: 'b', text: 'The card color' },
          { id: 'c', text: 'The original welcome email' },
        ],
        correctOptionId: 'a',
        explanation:
          'APR shows the annual cost of borrowing and helps identify which debts are draining the most money through interest.',
      },
    ],
  }),
  createLesson('debt-management', {
    id: 'snowball-vs-avalanche',
    title: 'Choose Between Snowball and Avalanche',
    summary: 'Understand the tradeoff between quick wins and minimizing interest cost.',
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    learningObjectives: [
      'Describe how the snowball strategy works.',
      'Describe how the avalanche strategy works.',
      'Pick the strategy that fits your motivation and math.',
    ],
    content: [
      'The snowball strategy pays extra toward the smallest balance first to create quick wins. The avalanche strategy pays extra toward the highest rate first to save more interest.',
      'Both strategies require making minimum payments on every debt while focusing extra money on one target debt at a time.',
      'The best strategy is the one you will sustain. Behavioral momentum matters, but so does the cost of carrying high-rate balances.',
    ],
    example: {
      title: 'Behavior vs. math',
      scenario:
        'A person with one tiny store card and one large high-rate card may prefer the snowball for momentum, while someone focused on minimizing interest may choose avalanche first.',
      takeaway: 'Either strategy can work if extra payments stay consistent.',
    },
    glossaryKeys: ['apr', 'amortization'],
    contextualTipKeys: ['aprVsApy'],
    quiz: [
      {
        id: 'snowball-vs-avalanche-q1',
        prompt: 'Which strategy usually saves the most interest over time?',
        options: [
          { id: 'a', text: 'Debt avalanche' },
          { id: 'b', text: 'Debt snowball' },
          { id: 'c', text: 'Paying all debts randomly' },
        ],
        correctOptionId: 'a',
        explanation:
          'Avalanche prioritizes the highest rate debt first, which usually minimizes total interest paid.',
      },
    ],
  }),
  createLesson('debt-management', {
    id: 'refinancing-basics',
    title: 'Know When Refinancing Can Help',
    summary:
      'Lowering rate, shortening term, or simplifying payments can help, but only if fees and discipline make the math work.',
    difficulty: 'intermediate',
    estimatedMinutes: 8,
    learningObjectives: [
      'Identify the main reasons to refinance.',
      'Compare rate savings against fees and term changes.',
      'Avoid using consolidation as permission to re-borrow.',
    ],
    content: [
      'Refinancing can reduce interest cost, lower a monthly payment, or simplify multiple debts into one bill. It is a tool, not a cure-all.',
      'Always compare the new rate, any fees, and the total cost over the life of the debt. A lower monthly payment is not automatically cheaper if the term stretches out.',
      'Refinancing works best when the spending habits that created the balance are also being addressed.',
    ],
    example: {
      title: 'Look past the monthly payment',
      scenario:
        'Jordan is offered a lower monthly payment by extending a loan term. The payment drops, but the added years mean more total interest unless extra payments continue.',
      takeaway:
        'A refinance should be judged on total cost and flexibility, not just the new payment.',
    },
    glossaryKeys: ['apr', 'amortization', 'creditUtilization'],
    contextualTipKeys: ['aprVsApy'],
    quiz: [
      {
        id: 'refinancing-basics-q1',
        prompt:
          'What is the biggest risk of focusing only on the new monthly payment when refinancing?',
        options: [
          { id: 'a', text: 'You may ignore a longer term and higher total interest' },
          { id: 'b', text: 'You will automatically improve your credit utilization' },
          { id: 'c', text: 'You might accidentally create an emergency fund' },
        ],
        correctOptionId: 'a',
        explanation:
          'A lower payment can look attractive while increasing total interest if the debt lasts much longer.',
      },
    ],
  }),
  createLesson('debt-management', {
    id: 'payoff-calculator-thinking',
    title: 'Use a Payoff Calculator to Test Scenarios',
    summary:
      'Small extra payments can cut payoff time and interest dramatically when modeled before you commit.',
    difficulty: 'advanced',
    estimatedMinutes: 9,
    learningObjectives: [
      'See how extra payments change payoff timelines.',
      'Estimate tradeoffs between debt payoff and savings goals.',
      'Use scenario thinking to stay motivated.',
    ],
    content: [
      'Payoff calculators make progress visible by showing how extra payments affect interest and time. This turns an abstract goal into a concrete plan.',
      'Testing multiple scenarios helps you balance competing priorities, such as building an emergency fund first or splitting money between debt and retirement.',
      'The point is not perfection. The point is seeing how even small extra payments can change the finish line.',
    ],
    example: {
      title: 'Small extra, big effect',
      scenario:
        'Adding $75 a month to a high-rate card shortens payoff by many months and cuts interest, which can be more motivating than staring at the original balance.',
      takeaway:
        'Scenario modeling reveals leverage that is easy to miss when you only look at minimum payments.',
    },
    glossaryKeys: ['amortization', 'debtToIncomeRatio'],
    contextualTipKeys: ['cashFlowHabits'],
    quiz: [
      {
        id: 'payoff-calculator-thinking-q1',
        prompt: 'Why is a payoff calculator useful before increasing debt payments?',
        options: [
          { id: 'a', text: 'It shows how extra payments affect time and interest' },
          { id: 'b', text: 'It guarantees lenders will lower your APR' },
          { id: 'c', text: 'It replaces the need for a budget' },
        ],
        correctOptionId: 'a',
        explanation:
          'A payoff calculator helps you compare scenarios and see the impact of extra payments before you rearrange your budget.',
      },
    ],
  }),
];

const investingLessons: readonly LearningLesson[] = [
  createLesson('investing-fundamentals', {
    id: 'compound-growth',
    title: 'Let Compound Growth Do Some of the Work',
    summary: 'Time in the market matters because gains can start earning gains of their own.',
    difficulty: 'beginner',
    estimatedMinutes: 8,
    learningObjectives: [
      'Define compound growth in plain language.',
      'See why starting earlier matters.',
      'Connect consistent contributions with long-term growth.',
    ],
    content: [
      'Compound growth means returns can build on previous returns over time. That makes early contributions disproportionately valuable.',
      'You do not need a huge starting balance. The combination of time, consistency, and reinvested growth does most of the heavy lifting.',
      'This is why delaying investing can be costly even when you plan to contribute more later.',
    ],
    example: {
      title: 'Time advantage',
      scenario:
        'Jordan contributes smaller amounts starting at 25, while Casey waits until 35 and contributes more. Jordan may still end up ahead because the money had more years to compound.',
      takeaway: 'Starting early often matters more than contributing perfectly.',
    },
    glossaryKeys: ['compoundInterest', 'dollarCostAveraging'],
    contextualTipKeys: ['goalCompoundInterest'],
    quiz: [
      {
        id: 'compound-growth-q1',
        prompt: 'Why does starting earlier often help investors?',
        options: [
          { id: 'a', text: 'Because earlier money has more time to compound' },
          { id: 'b', text: 'Because markets only rise for young investors' },
          { id: 'c', text: 'Because taxes disappear after age 25' },
        ],
        correctOptionId: 'a',
        explanation:
          'Starting earlier gives contributions more years to earn returns on prior returns.',
      },
    ],
  }),
  createLesson('investing-fundamentals', {
    id: 'diversification-basics',
    title: 'Reduce Concentration Risk With Diversification',
    summary: 'Spread risk across many holdings so one weak investment matters less.',
    difficulty: 'beginner',
    estimatedMinutes: 8,
    learningObjectives: [
      'Define diversification simply.',
      'Understand why one-stock portfolios are fragile.',
      'Connect diversified funds with lower concentration risk.',
    ],
    content: [
      'Diversification means owning different assets so one setback does not dominate your outcome.',
      'It cannot remove market risk entirely, but it can reduce the danger of relying on a single company, sector, or idea.',
      'Broad index funds often provide instant diversification because they hold many securities at once.',
    ],
    example: {
      title: 'Single stock vs. broad fund',
      scenario:
        'Owning one employer stock creates company-specific risk. Owning a broad market fund spreads exposure across hundreds or thousands of companies.',
      takeaway: 'Diversification helps prevent one bad outcome from becoming a portfolio crisis.',
    },
    glossaryKeys: ['diversification', 'asset', 'netWorth'],
    contextualTipKeys: ['diversificationBasics'],
    quiz: [
      {
        id: 'diversification-basics-q1',
        prompt: 'What is the main goal of diversification?',
        options: [
          { id: 'a', text: 'Guarantee positive returns every month' },
          { id: 'b', text: 'Reduce exposure to any single investment risk' },
          { id: 'c', text: 'Avoid all market volatility forever' },
        ],
        correctOptionId: 'b',
        explanation:
          'Diversification lowers the damage a single investment can do, even though it cannot eliminate all risk.',
      },
    ],
  }),
  createLesson('investing-fundamentals', {
    id: 'index-funds',
    title: 'Why Many Beginners Start With Index Funds',
    summary:
      'Index funds offer broad exposure, low maintenance, and usually lower fees than trying to pick winners one by one.',
    difficulty: 'intermediate',
    estimatedMinutes: 9,
    learningObjectives: [
      'Understand what an index fund tracks.',
      'Connect fees with long-term results.',
      'See why simplicity helps beginner investors stay consistent.',
    ],
    content: [
      'An index fund aims to track a market index instead of beat it through active stock selection.',
      'Because these funds are typically rules-based and broad, they are often cheaper and easier to stick with than constantly trading individual names.',
      'Low fees matter because every dollar paid in expenses is a dollar no longer compounding for you.',
    ],
    example: {
      title: 'Simplicity scales',
      scenario:
        'Riley chooses a low-cost total market index fund for long-term retirement savings rather than guessing which few stocks will win next year.',
      takeaway:
        'A simple strategy is easier to maintain through both excitement and market stress.',
    },
    glossaryKeys: ['diversification', 'expenseRatio', 'dollarCostAveraging'],
    contextualTipKeys: ['diversificationBasics'],
    quiz: [
      {
        id: 'index-funds-q1',
        prompt: 'Why can a low expense ratio matter so much over decades?',
        options: [
          { id: 'a', text: 'Lower fees leave more money invested and compounding' },
          { id: 'b', text: 'Funds with low fees never decline in value' },
          { id: 'c', text: 'Expense ratios only matter for bonds' },
        ],
        correctOptionId: 'a',
        explanation:
          'Lower fees preserve more of your return, and that saved money can continue compounding over time.',
      },
    ],
  }),
  createLesson('investing-fundamentals', {
    id: 'investing-consistently',
    title: 'Invest Consistently Instead of Timing the Market',
    summary:
      'Regular investing beats waiting for perfect conditions that may never feel obvious in the moment.',
    difficulty: 'advanced',
    estimatedMinutes: 8,
    learningObjectives: [
      'Explain dollar-cost averaging in practice.',
      'See why consistency beats prediction for most people.',
      'Build a simple rule for ongoing contributions.',
    ],
    content: [
      'Regular investing turns market uncertainty into a routine instead of a decision crisis. You buy more shares when prices are lower and fewer when prices are higher.',
      'Trying to wait for the perfect entry often leads to long periods of sitting in cash and missing compounding.',
      'A repeatable contribution schedule works especially well when paired with broad, diversified funds.',
    ],
    example: {
      title: 'Payday investing rule',
      scenario:
        'Every paycheck, Lee invests the same amount into a diversified retirement account. Some buys happen at highs, some at lows, but the habit keeps going.',
      takeaway: 'Consistency removes the pressure to predict short-term market moves.',
    },
    glossaryKeys: ['dollarCostAveraging', 'diversification', 'compoundInterest'],
    contextualTipKeys: ['goalCompoundInterest', 'diversificationBasics'],
    quiz: [
      {
        id: 'investing-consistently-q1',
        prompt: 'What is one benefit of dollar-cost averaging?',
        options: [
          { id: 'a', text: 'It guarantees buying at the market bottom' },
          { id: 'b', text: 'It builds an investing habit without relying on market timing' },
          { id: 'c', text: 'It removes all risk from investing' },
        ],
        correctOptionId: 'b',
        explanation:
          'Dollar-cost averaging supports consistent investing without requiring you to predict short-term prices.',
      },
    ],
  }),
];

const taxLessons: readonly LearningLesson[] = [
  createLesson('tax-planning', {
    id: 'tax-brackets-101',
    title: 'Understand Marginal Tax Brackets',
    summary: 'A higher bracket does not mean all income is taxed at that higher rate.',
    difficulty: 'beginner',
    estimatedMinutes: 8,
    learningObjectives: [
      'Describe how marginal brackets work.',
      'Avoid the common bracket misconception.',
      'Connect tax planning with your next dollar earned.',
    ],
    content: [
      'Tax brackets are progressive. Different slices of income are taxed at different rates rather than applying one rate to every dollar you earn.',
      'That is why moving into a higher bracket does not make all prior income suddenly taxed at the higher rate.',
      'Understanding marginal rates helps you compare deductions, retirement contributions, and side-income decisions more clearly.',
    ],
    example: {
      title: 'Only the top slice changes',
      scenario:
        'A raise can push only the last portion of income into a higher bracket. Earlier income still fills the lower brackets first.',
      takeaway: 'Bracket changes affect the margin, not every dollar equally.',
    },
    glossaryKeys: ['cashFlow'],
    contextualTipKeys: [],
    quiz: [
      {
        id: 'tax-brackets-101-q1',
        prompt: 'If part of your income enters a higher tax bracket, what usually happens?',
        options: [
          { id: 'a', text: 'All income is taxed at the higher rate' },
          { id: 'b', text: 'Only the income in that bracket is taxed at the higher rate' },
          { id: 'c', text: 'No taxes apply to the raise at all' },
        ],
        correctOptionId: 'b',
        explanation:
          'Tax brackets are marginal, so only the income that falls into a bracket is taxed at that bracket rate.',
      },
    ],
  }),
  createLesson('tax-planning', {
    id: 'deductions-vs-credits',
    title: 'Know the Difference Between Deductions and Credits',
    summary: 'Deductions reduce taxable income, while credits reduce the tax bill itself.',
    difficulty: 'intermediate',
    estimatedMinutes: 8,
    learningObjectives: [
      'Define deductions and credits clearly.',
      'Know why credits are often more powerful dollar-for-dollar.',
      'Use the distinction when reviewing tax opportunities.',
    ],
    content: [
      'A deduction lowers the amount of income that gets taxed. A credit directly lowers the taxes you owe.',
      'That means a $1,000 credit generally has a stronger effect on your bill than a $1,000 deduction, because the deduction only saves taxes at your marginal rate.',
      'When planning ahead, always ask whether an opportunity changes taxable income or reduces tax owed directly.',
    ],
    example: {
      title: 'Not the same lever',
      scenario:
        'A taxpayer compares a deduction from a retirement contribution with a credit tied to eligibility rules. Both help, but they lower taxes in different ways.',
      takeaway: 'Knowing which lever you are using helps set realistic expectations.',
    },
    glossaryKeys: ['cashFlow'],
    contextualTipKeys: [],
    quiz: [
      {
        id: 'deductions-vs-credits-q1',
        prompt: 'Which statement is correct?',
        options: [
          { id: 'a', text: 'Credits reduce taxable income only' },
          { id: 'b', text: 'Deductions reduce taxable income, credits reduce tax owed' },
          { id: 'c', text: 'Deductions and credits always work the same way' },
        ],
        correctOptionId: 'b',
        explanation:
          'Deductions lower the income that is taxed, while credits directly lower the resulting tax bill.',
      },
    ],
  }),
  createLesson('tax-planning', {
    id: 'retirement-tax-benefits',
    title: 'Use Retirement Accounts for Tax Efficiency',
    summary:
      'Traditional and Roth accounts offer different tax tradeoffs, but both can support long-term compounding.',
    difficulty: 'intermediate',
    estimatedMinutes: 9,
    learningObjectives: [
      'Compare upfront and later tax treatment.',
      'Understand why contribution timing matters.',
      'Connect retirement accounts with long-term compounding.',
    ],
    content: [
      'Traditional retirement contributions may lower taxable income now, while Roth contributions are generally made after tax in exchange for tax-free qualified withdrawals later.',
      'The better fit depends on expected future tax rates, cash flow, and plan options. Either way, tax-advantaged space is valuable.',
      'These accounts can boost long-term outcomes because taxes do not interrupt compounding in the same way as a regular taxable account.',
    ],
    example: {
      title: 'Today vs. tomorrow',
      scenario:
        'Morgan prefers traditional contributions while income is high today, but uses Roth contributions in earlier, lower-income years to diversify future tax treatment.',
      takeaway: 'Tax diversification can be as useful as investment diversification.',
    },
    glossaryKeys: ['compoundInterest', 'savingsRate'],
    contextualTipKeys: ['goalCompoundInterest'],
    quiz: [
      {
        id: 'retirement-tax-benefits-q1',
        prompt: 'What is one core benefit of using retirement accounts for long-term investing?',
        options: [
          { id: 'a', text: 'They can offer tax advantages around contributions or withdrawals' },
          { id: 'b', text: 'They guarantee positive returns every year' },
          { id: 'c', text: 'They remove the need to diversify investments' },
        ],
        correctOptionId: 'a',
        explanation:
          'Retirement accounts are valuable because they can improve after-tax outcomes through contribution or withdrawal tax benefits.',
      },
    ],
  }),
  createLesson('tax-planning', {
    id: 'annual-tax-checkup',
    title: 'Run a Simple Year-End Tax Checkup',
    summary:
      'Review withholding, deductions, credits, and account contributions before the calendar closes.',
    difficulty: 'advanced',
    estimatedMinutes: 10,
    learningObjectives: [
      'Build a repeatable annual tax review checklist.',
      'Spot tax items worth checking before year end.',
      'Connect tax planning with cash flow and investing decisions.',
    ],
    content: [
      'A short year-end review helps you catch opportunities while there is still time to act. Examples include retirement contributions, estimated payments, and charitable giving records.',
      'The goal is not to memorize tax law. The goal is to create a repeatable process that keeps your taxes aligned with your broader financial plan.',
      'Tax planning works best when it is coordinated with savings, debt, and investing decisions instead of treated as a one-day scramble.',
    ],
    example: {
      title: 'Quarter-four review',
      scenario:
        'In November, Dana checks withholding, retirement contributions, HSA funding, and expected deductions so there is time to make targeted adjustments before year end.',
      takeaway:
        'A calendar reminder can turn tax planning into a system instead of a last-minute stress event.',
    },
    glossaryKeys: ['cashFlow', 'savingsRate'],
    contextualTipKeys: [],
    quiz: [
      {
        id: 'annual-tax-checkup-q1',
        prompt: 'Why is a year-end tax checkup useful?',
        options: [
          { id: 'a', text: 'It gives you time to make eligible adjustments before deadlines pass' },
          { id: 'b', text: 'It guarantees you will owe zero tax' },
          { id: 'c', text: 'It replaces recordkeeping during the year' },
        ],
        correctOptionId: 'a',
        explanation:
          'A year-end review is helpful because many tax-related moves only help if you make them before the relevant deadline.',
      },
    ],
  }),
];

export const LEARNING_MODULES: readonly LearningModule[] = [
  {
    id: 'budgeting-basics',
    title: 'Budgeting Basics',
    topic: 'budgeting',
    difficulty: 'beginner',
    description: 'Master simple systems for planning cash flow and giving every dollar a purpose.',
    whyItMatters:
      'Budgeting creates the breathing room that makes saving, debt payoff, and investing possible.',
    estimatedHours: 0.5,
    lessons: budgetingLessons,
  },
  {
    id: 'saving-emergency-funds',
    title: 'Saving & Emergency Funds',
    topic: 'saving',
    difficulty: 'beginner',
    description:
      'Build cash reserves, automate progress, and size an emergency fund around real expenses.',
    whyItMatters: 'Savings give you resilience so setbacks do not become expensive debt.',
    estimatedHours: 0.5,
    lessons: savingLessons,
  },
  {
    id: 'debt-management',
    title: 'Debt Management',
    topic: 'debt',
    difficulty: 'intermediate',
    description:
      'Compare payoff strategies, evaluate refinancing, and use scenario thinking to reduce debt faster.',
    whyItMatters:
      'Debt decisions influence cash flow, stress, and how quickly you can build wealth.',
    estimatedHours: 0.6,
    lessons: debtLessons,
  },
  {
    id: 'investing-fundamentals',
    title: 'Investing Fundamentals',
    topic: 'investing',
    difficulty: 'intermediate',
    description:
      'Learn the core habits behind long-term investing, diversification, and low-cost index funds.',
    whyItMatters:
      'Investing helps your money grow faster than cash alone and supports long-term goals.',
    estimatedHours: 0.6,
    lessons: investingLessons,
  },
  {
    id: 'tax-planning',
    title: 'Tax Planning',
    topic: 'tax',
    difficulty: 'advanced',
    description:
      'Understand brackets, deductions, credits, and tax-advantaged accounts so more of your progress sticks.',
    whyItMatters:
      'Taxes influence take-home pay, investing outcomes, and the efficiency of nearly every financial decision.',
    estimatedHours: 0.6,
    lessons: taxLessons,
  },
] as const;

export const LEARNING_LESSONS: readonly LearningLesson[] = LEARNING_MODULES.flatMap(
  (module) => module.lessons,
);

export function getLearningModule(moduleId: string): LearningModule | undefined {
  return LEARNING_MODULES.find((module) => module.id === moduleId);
}

export function getLearningLesson(lessonId: string): LearningLesson | undefined {
  return LEARNING_LESSONS.find((lesson) => lesson.id === lessonId);
}

export function getModulesByDifficulty(difficulty: LearningModule['difficulty']): LearningModule[] {
  return LEARNING_MODULES.filter((module) => module.difficulty === difficulty);
}
