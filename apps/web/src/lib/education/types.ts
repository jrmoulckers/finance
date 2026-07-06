export interface EducationEntry {
  term: string;
  definition: string;
  example: string;
  whyItMatters: string;
}

export const GLOSSARY_KEYS = [
  'budget',
  'sinkingFund',
  'emergencyFund',
  'apr',
  'apy',
  'compoundInterest',
  'netWorth',
  'asset',
  'liability',
  'savingsRate',
  'cashFlow',
  'discretionarySpending',
  'fixedExpense',
  'variableExpense',
  'debtToIncomeRatio',
  'creditUtilization',
  'amortization',
  'dollarCostAveraging',
  'expenseRatio',
  'diversification',
  'exchangeRate',
  'fxMargin',
  'midMarketRate',
  'remittance',
  'wireTransfer',
] as const;

export type GlossaryKey = (typeof GLOSSARY_KEYS)[number];

export const CONTEXTUAL_TIP_KEYS = [
  'budget503020Rule',
  'budgetSinkingFund',
  'aprVsApy',
  'goodSavingsRate',
  'goalCompoundInterest',
  'assetsVsLiabilities',
  'cashFlowHabits',
  'diversificationBasics',
  'fixedVsVariableExpenses',
] as const;

export type ContextualTipKey = (typeof CONTEXTUAL_TIP_KEYS)[number];
