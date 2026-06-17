import type { EducationEntry, GlossaryKey } from './types';

export const financialGlossary: Record<GlossaryKey, EducationEntry> = {
  budget: {
    term: 'Budget',
    definition: 'A budget is a plan for where your money will go before you spend it.',
    example:
      'If you bring home $3,000 this month, you might plan $1,200 for housing, $500 for groceries, $300 for savings, and the rest for other needs.',
    whyItMatters:
      'A budget helps you give every dollar a job so you can avoid surprises and make progress on goals.',
  },
  sinkingFund: {
    term: 'Sinking Fund',
    definition:
      'A sinking fund is money you set aside little by little for a known future expense.',
    example:
      'If car insurance costs $600 every six months, saving $100 each month builds a sinking fund to cover it.',
    whyItMatters:
      'Sinking funds turn large, predictable bills into smaller monthly savings goals so they do not wreck your cash flow.',
  },
  emergencyFund: {
    term: 'Emergency Fund',
    definition:
      'An emergency fund is cash saved for true surprises like job loss, medical bills, or urgent repairs.',
    example:
      'Keeping three to six months of essential expenses in a savings account can help cover a layoff or a major car repair.',
    whyItMatters:
      'It can keep you from relying on high-interest debt when life does not go as planned.',
  },
  apr: {
    term: 'APR',
    definition:
      'APR, or annual percentage rate, is the yearly cost of borrowing money, usually without counting compounding on interest charges.',
    example:
      'A credit card with a 24% APR charges interest based on that yearly rate when you carry a balance.',
    whyItMatters:
      'APR helps you compare loans and credit cards so you can spot which debt is more expensive.',
  },
  apy: {
    term: 'APY',
    definition:
      'APY, or annual percentage yield, is the yearly return on savings after accounting for compounding.',
    example:
      'A high-yield savings account with a 4.50% APY earns a little more than a simple 4.50% rate because interest is added back to the balance.',
    whyItMatters:
      'APY gives a clearer picture of how fast savings can grow when interest compounds.',
  },
  compoundInterest: {
    term: 'Compound Interest',
    definition:
      'Compound interest means you earn or owe interest on both the original amount and the interest that has already built up.',
    example:
      'Saving $100 per month and earning returns on past growth can make the balance rise faster over time.',
    whyItMatters:
      'Compounding can speed up wealth building, but it can also make debt more expensive when balances are not paid down.',
  },
  netWorth: {
    term: 'Net Worth',
    definition: 'Net worth is what you own minus what you owe.',
    example: 'If you have $50,000 in assets and $20,000 in debts, your net worth is $30,000.',
    whyItMatters:
      'It shows your overall financial position better than income alone and helps you track long-term progress.',
  },
  asset: {
    term: 'Asset',
    definition: 'An asset is something you own that has financial value.',
    example: 'Cash, retirement accounts, investments, and home equity are all examples of assets.',
    whyItMatters:
      'Growing assets builds financial stability and gives you more options in the future.',
  },
  liability: {
    term: 'Liability',
    definition: 'A liability is money you owe to someone else.',
    example: 'Credit card balances, student loans, car loans, and a mortgage are liabilities.',
    whyItMatters:
      'Liabilities reduce your net worth and can limit how much cash you have available each month.',
  },
  savingsRate: {
    term: 'Savings Rate',
    definition: 'Your savings rate is the share of your income that you keep instead of spend.',
    example: 'If you earn $4,000 and save or invest $800, your savings rate is 20%.',
    whyItMatters:
      'A higher savings rate usually gives you more room to build an emergency fund, invest, or pay off debt faster.',
  },
  cashFlow: {
    term: 'Cash Flow',
    definition: 'Cash flow is the money coming in minus the money going out over a period of time.',
    example: 'If you earn $5,000 this month and spend $4,200, you have positive cash flow of $800.',
    whyItMatters: 'Positive cash flow makes it easier to save, invest, and stay current on bills.',
  },
  discretionarySpending: {
    term: 'Discretionary Spending',
    definition: 'Discretionary spending is money spent on wants rather than essential needs.',
    example: 'Dining out, concerts, and streaming add-ons are common discretionary expenses.',
    whyItMatters:
      'This is often the easiest category to adjust when you need to free up money for goals.',
  },
  fixedExpense: {
    term: 'Fixed Expense',
    definition: 'A fixed expense is a bill that stays mostly the same from month to month.',
    example: 'Rent, a phone plan, or a car payment are usually fixed expenses.',
    whyItMatters:
      'Knowing your fixed costs helps you understand the minimum amount you need each month.',
  },
  variableExpense: {
    term: 'Variable Expense',
    definition: 'A variable expense changes from one month to the next.',
    example: 'Groceries, gas, utilities, and entertainment spending can all vary month by month.',
    whyItMatters:
      'Variable expenses are where budgeting and tracking can have the biggest short-term impact.',
  },
  debtToIncomeRatio: {
    term: 'Debt-to-Income Ratio',
    definition:
      'Debt-to-income ratio compares your required monthly debt payments to your gross monthly income.',
    example:
      'If you earn $5,000 per month before taxes and owe $1,500 in monthly debt payments, your debt-to-income ratio is 30%.',
    whyItMatters:
      'Lenders use it to judge affordability, and it is a useful warning sign if debt payments are crowding out other priorities.',
  },
  creditUtilization: {
    term: 'Credit Utilization',
    definition:
      'Credit utilization is the percentage of your available revolving credit that you are currently using.',
    example: 'Using $900 of a $3,000 credit card limit means 30% utilization.',
    whyItMatters:
      'Lower utilization can help your credit score and signals that you are not overextended.',
  },
  amortization: {
    term: 'Amortization',
    definition:
      'Amortization is the schedule that shows how each loan payment is split between interest and principal over time.',
    example:
      'Early mortgage payments often go more toward interest, while later payments go more toward the balance itself.',
    whyItMatters:
      'Understanding amortization helps you see how extra payments can shorten payoff time and cut interest.',
  },
  dollarCostAveraging: {
    term: 'Dollar-Cost Averaging',
    definition:
      'Dollar-cost averaging means investing the same amount on a regular schedule instead of trying to time the market.',
    example: 'Putting $200 into an index fund every payday is a dollar-cost averaging strategy.',
    whyItMatters:
      'It can reduce the pressure to guess the best time to invest and helps build consistency.',
  },
  expenseRatio: {
    term: 'Expense Ratio',
    definition:
      'An expense ratio is the yearly fee a fund charges, shown as a percentage of the money you have invested in it.',
    example:
      'A fund with a 0.10% expense ratio would charge about $10 per year for every $10,000 invested.',
    whyItMatters:
      'Even small fees can quietly reduce long-term returns, especially over many years.',
  },
  diversification: {
    term: 'Diversification',
    definition:
      'Diversification means spreading money across different investments so one weak area hurts less.',
    example:
      'Owning a mix of stock funds, bond funds, and cash is more diversified than owning one single stock.',
    whyItMatters:
      'Diversification can lower risk and make your results less dependent on one company, sector, or market move.',
  },
};

export function getGlossaryEntry(key: GlossaryKey): EducationEntry {
  return financialGlossary[key];
}
