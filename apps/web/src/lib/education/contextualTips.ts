import type { ContextualTipKey, EducationEntry } from './types';

export const contextualTips: Record<ContextualTipKey, EducationEntry> = {
  budget503020Rule: {
    term: '50/30/20 Rule',
    definition:
      'The 50/30/20 rule is a simple budgeting guideline: about 50% for needs, 30% for wants, and 20% for savings or debt payoff.',
    example:
      'With $4,000 of take-home pay, that could mean roughly $2,000 for essentials, $1,200 for lifestyle spending, and $800 toward goals.',
    whyItMatters:
      'It gives you a quick way to check whether your spending plan feels balanced, even before you build a detailed category budget.',
  },
  budgetSinkingFund: {
    term: 'Why use a sinking fund?',
    definition:
      'Budget categories often work best when irregular costs have their own mini savings plan.',
    example:
      'Setting aside money each month for holidays, annual subscriptions, or car maintenance keeps those expenses from feeling like emergencies.',
    whyItMatters:
      'A sinking fund keeps predictable bills from blowing up a single month of your budget.',
  },
  aprVsApy: {
    term: 'APR vs. APY',
    definition:
      'APR usually describes the cost of borrowing, while APY usually describes the growth of savings after compounding.',
    example: 'A card might charge 22% APR, while a savings account might earn 4.25% APY.',
    whyItMatters:
      'Seeing both side by side helps you compare the cost of debt with the benefit of saving or investing.',
  },
  goodSavingsRate: {
    term: 'What is a good savings rate?',
    definition:
      'A healthy savings rate depends on your goals, income, and debt, but many people aim for 15% to 20% over time.',
    example:
      'Someone paying off expensive debt may start lower, then raise savings after the debt is under control.',
    whyItMatters:
      'Tracking your rate shows whether your plan is moving you toward emergencies, retirement, and other long-term goals.',
  },
  goalCompoundInterest: {
    term: 'Compound interest and goals',
    definition: 'The earlier you save for a goal, the more time growth has to build on itself.',
    example:
      'Starting a vacation or home down payment fund months earlier can mean needing to contribute less from each paycheck.',
    whyItMatters:
      'Time can do part of the work for you, so consistent early contributions matter more than perfect timing.',
  },
  assetsVsLiabilities: {
    term: 'Assets vs. liabilities',
    definition: 'Assets add value to your balance sheet, while liabilities subtract from it.',
    example:
      'Cash and investments increase net worth, while a car loan or credit card balance pulls it down.',
    whyItMatters:
      'Knowing the difference helps you interpret your net worth instead of only looking at one account balance.',
  },
  cashFlowHabits: {
    term: 'Cash flow habits',
    definition:
      'Cash flow improves when you consistently spend less than you earn and plan for timing gaps between bills and paychecks.',
    example:
      'Reviewing transaction patterns can show whether subscription renewals or weekend spending are squeezing the month.',
    whyItMatters:
      'Good cash flow habits make everyday budgeting less stressful and reduce the need for short-term borrowing.',
  },
  diversificationBasics: {
    term: 'Diversification basics',
    definition:
      'A diversified portfolio spreads money across many holdings instead of relying on a single winner.',
    example:
      'A total market fund plus bonds is usually more diversified than owning one tech stock.',
    whyItMatters: 'Diversification can make investing more resilient when one asset class drops.',
  },
  fixedVsVariableExpenses: {
    term: 'Fixed vs. variable expenses',
    definition:
      'Fixed expenses are more predictable, while variable expenses move around based on usage and choices.',
    example:
      'Rent may stay the same, but groceries, rideshares, and dining out can change every month.',
    whyItMatters:
      'Separating the two helps you decide what is flexible when you need to adjust your spending plan.',
  },
};

export function getContextualTip(key: ContextualTipKey): EducationEntry {
  return contextualTips[key];
}
