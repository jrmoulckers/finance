// SPDX-License-Identifier: BUSL-1.1

/**
 * Financial education content and glossary utilities.
 *
 * Provides a built-in financial term glossary, contextual "explain this"
 * content, difficulty-level filtering, related-term linking, and
 * content completion tracking.
 *
 * References: #1770
 */

import type {
  FinancialTerm,
  EducationContent,
  ContentCompletion,
  EducationProgress,
  DifficultyLevel,
} from './types';

// ---------------------------------------------------------------------------
// Built-in glossary
// ---------------------------------------------------------------------------

/** Built-in financial terms glossary. */
export const FINANCIAL_GLOSSARY: readonly FinancialTerm[] = [
  {
    id: 'compound_interest',
    term: 'Compound Interest',
    definition:
      'Interest calculated on both the initial principal and the accumulated interest from previous periods. Your money earns interest on its interest.',
    difficulty: 'beginner',
    relatedTermIds: ['apr', 'apy', 'simple_interest'],
    category: 'investing',
  },
  {
    id: 'simple_interest',
    term: 'Simple Interest',
    definition:
      'Interest calculated only on the original principal amount. Unlike compound interest, it does not earn interest on previously accrued interest.',
    difficulty: 'beginner',
    relatedTermIds: ['compound_interest', 'apr'],
    category: 'investing',
  },
  {
    id: 'apr',
    term: 'APR (Annual Percentage Rate)',
    definition:
      'The yearly interest rate charged for borrowing, expressed as a percentage. Does not account for compounding within the year.',
    difficulty: 'beginner',
    relatedTermIds: ['apy', 'compound_interest'],
    category: 'credit',
  },
  {
    id: 'apy',
    term: 'APY (Annual Percentage Yield)',
    definition:
      'The effective annual rate of return taking into account the effect of compounding interest. Higher than APR when compounding occurs more than once per year.',
    difficulty: 'beginner',
    relatedTermIds: ['apr', 'compound_interest'],
    category: 'investing',
  },
  {
    id: 'amortization',
    term: 'Amortization',
    definition:
      'The process of spreading a loan into a series of fixed payments over time. Each payment covers both interest and principal, with the interest portion decreasing over time.',
    difficulty: 'intermediate',
    relatedTermIds: ['principal', 'compound_interest'],
    category: 'credit',
  },
  {
    id: 'principal',
    term: 'Principal',
    definition:
      'The original sum of money borrowed or invested, before interest or returns. Loan payments reduce the principal balance over time.',
    difficulty: 'beginner',
    relatedTermIds: ['amortization', 'compound_interest'],
    category: 'credit',
  },
  {
    id: 'net_worth',
    term: 'Net Worth',
    definition:
      'The total value of all assets minus all liabilities. A snapshot of your overall financial position at a point in time.',
    difficulty: 'beginner',
    relatedTermIds: ['asset_allocation', 'liquidity'],
    category: 'budgeting',
  },
  {
    id: 'asset_allocation',
    term: 'Asset Allocation',
    definition:
      'The strategy of dividing investments among different asset categories such as stocks, bonds, and cash to balance risk and reward.',
    difficulty: 'intermediate',
    relatedTermIds: ['diversification', 'net_worth'],
    category: 'investing',
  },
  {
    id: 'diversification',
    term: 'Diversification',
    definition:
      'Spreading investments across various financial instruments, industries, and categories to reduce exposure to any single risk.',
    difficulty: 'intermediate',
    relatedTermIds: ['asset_allocation'],
    category: 'investing',
  },
  {
    id: 'liquidity',
    term: 'Liquidity',
    definition:
      'How quickly and easily an asset can be converted to cash without significantly affecting its value. Cash is the most liquid asset.',
    difficulty: 'intermediate',
    relatedTermIds: ['net_worth', 'emergency_fund'],
    category: 'budgeting',
  },
  {
    id: 'emergency_fund',
    term: 'Emergency Fund',
    definition:
      'Money set aside to cover unexpected expenses or financial emergencies, typically 3-6 months of living expenses kept in an easily accessible account.',
    difficulty: 'beginner',
    relatedTermIds: ['liquidity', 'net_worth'],
    category: 'budgeting',
  },
  {
    id: 'inflation',
    term: 'Inflation',
    definition:
      'The rate at which the general level of prices for goods and services rises, eroding purchasing power over time.',
    difficulty: 'beginner',
    relatedTermIds: ['compound_interest', 'apy'],
    category: 'investing',
  },
  {
    id: 'credit_score',
    term: 'Credit Score',
    definition:
      'A numerical expression based on analysis of your credit history, representing your creditworthiness. Ranges from 300 to 850 in the FICO model.',
    difficulty: 'beginner',
    relatedTermIds: ['apr', 'credit_utilization'],
    category: 'credit',
  },
  {
    id: 'credit_utilization',
    term: 'Credit Utilization',
    definition:
      'The percentage of your available credit that you are currently using. Keeping it below 30% is generally recommended for a good credit score.',
    difficulty: 'intermediate',
    relatedTermIds: ['credit_score', 'apr'],
    category: 'credit',
  },
  {
    id: 'dollar_cost_averaging',
    term: 'Dollar-Cost Averaging',
    definition:
      'An investment strategy of regularly investing a fixed dollar amount regardless of market conditions, reducing the impact of volatility over time.',
    difficulty: 'advanced',
    relatedTermIds: ['diversification', 'asset_allocation'],
    category: 'investing',
  },
  {
    id: 'tax_deferred',
    term: 'Tax-Deferred',
    definition:
      'An investment or account where taxes on earnings are postponed until the money is withdrawn, such as a traditional IRA or 401(k).',
    difficulty: 'advanced',
    relatedTermIds: ['compound_interest'],
    category: 'investing',
  },
] as const;

// ---------------------------------------------------------------------------
// Built-in education content
// ---------------------------------------------------------------------------

/** Built-in contextual education content entries. */
export const EDUCATION_CONTENT: readonly EducationContent[] = [
  {
    id: 'edu_compound_interest',
    conceptKey: 'compound_interest',
    title: 'Understanding Compound Interest',
    shortExplanation:
      'Compound interest means you earn interest on your interest, causing your money to grow exponentially over time.',
    fullExplanation:
      "When you earn compound interest, each period's interest is added to your principal. In the next period, you earn interest on the new, larger balance. Over long periods, this creates exponential growth — which is why starting to save early makes such a big difference.",
    example:
      "If you invest $1,000 at 5% annual compound interest, after 1 year you have $1,050. After 2 years, you earn 5% on $1,050 (not just $1,000), giving you $1,102.50. After 30 years, you'd have $4,321.94 — more than quadrupling your money.",
    difficulty: 'beginner',
    relatedTermIds: ['compound_interest', 'apy', 'simple_interest'],
  },
  {
    id: 'edu_apr_vs_apy',
    conceptKey: 'apr_vs_apy',
    title: "APR vs APY: What's the Difference?",
    shortExplanation:
      'APR is the simple annual rate; APY includes the effect of compounding. APY is always equal to or higher than APR.',
    fullExplanation:
      'APR (Annual Percentage Rate) tells you the base interest rate per year without compounding. APY (Annual Percentage Yield) shows the effective rate after compounding is factored in. For savings, look at APY to see what you actually earn. For loans, APR is typically shown but actual cost may be higher due to compounding.',
    example:
      'A savings account with 5% APR compounded monthly has an APY of about 5.12%. You earn slightly more than 5% because interest compounds each month.',
    difficulty: 'beginner',
    relatedTermIds: ['apr', 'apy', 'compound_interest'],
  },
  {
    id: 'edu_amortization',
    conceptKey: 'amortization',
    title: 'How Loan Amortization Works',
    shortExplanation:
      'Amortization spreads your loan into equal payments where early payments are mostly interest and later payments are mostly principal.',
    fullExplanation:
      'With an amortized loan (like a mortgage), your monthly payment stays the same, but the split between interest and principal changes. Early on, most of each payment goes to interest because the balance is high. Over time, as the balance decreases, more goes to principal. This is why extra payments early in a loan save the most interest.',
    example:
      'On a $200,000 30-year mortgage at 6%, your first payment splits roughly $1,000 to interest and $200 to principal. By year 20, it flips to about $400 interest and $800 principal.',
    difficulty: 'intermediate',
    relatedTermIds: ['amortization', 'principal', 'compound_interest'],
  },
  {
    id: 'edu_emergency_fund',
    conceptKey: 'emergency_fund',
    title: 'Building Your Emergency Fund',
    shortExplanation:
      'An emergency fund is 3-6 months of expenses in a liquid, accessible account for unexpected costs.',
    fullExplanation:
      "An emergency fund protects you from going into debt when unexpected expenses arise — car repairs, medical bills, or job loss. Keep it in a high-yield savings account where it's accessible but earning interest. Start with a $1,000 mini emergency fund, then build to 3-6 months of essential expenses.",
    example:
      "If your monthly essential expenses are $3,000, aim for $9,000-$18,000 in your emergency fund. At $500/month saved, you'd reach $9,000 in 18 months.",
    difficulty: 'beginner',
    relatedTermIds: ['emergency_fund', 'liquidity'],
  },
  {
    id: 'edu_credit_utilization',
    conceptKey: 'credit_utilization',
    title: 'Credit Utilization and Your Score',
    shortExplanation:
      'Credit utilization — the percentage of your credit limit you use — is one of the biggest factors in your credit score.',
    fullExplanation:
      'Credit utilization is calculated by dividing your total credit card balances by your total credit limits. It accounts for about 30% of your FICO score. Keeping utilization below 30% is good; below 10% is excellent. You can improve utilization by paying down balances, requesting credit limit increases, or spreading purchases across cards.',
    example:
      'If you have two cards with $5,000 limits each ($10,000 total) and carry a $2,000 balance, your utilization is 20%. Paying down to $1,000 drops it to 10%.',
    difficulty: 'intermediate',
    relatedTermIds: ['credit_utilization', 'credit_score'],
  },
  {
    id: 'edu_dollar_cost_averaging',
    conceptKey: 'dollar_cost_averaging',
    title: 'Dollar-Cost Averaging Strategy',
    shortExplanation:
      'Investing a fixed amount regularly regardless of price reduces the impact of market volatility on your portfolio.',
    fullExplanation:
      'Dollar-cost averaging (DCA) means investing the same dollar amount at regular intervals. When prices are low, you buy more shares; when high, fewer shares. Over time, this tends to lower your average cost per share compared to trying to time the market. Most 401(k) contributions naturally use DCA.',
    example:
      'Investing $500/month: at $50/share you buy 10 shares, at $25/share you buy 20 shares. After 2 months, you have 30 shares for $1,000 — average cost of $33.33/share rather than $37.50.',
    difficulty: 'advanced',
    relatedTermIds: ['dollar_cost_averaging', 'diversification'],
  },
] as const;

// ---------------------------------------------------------------------------
// Glossary functions
// ---------------------------------------------------------------------------

/**
 * Look up a financial term by ID.
 *
 * @param termId - Term identifier
 * @param glossary - Glossary to search (defaults to built-in)
 * @returns The term or undefined
 */
export function lookupTerm(
  termId: string,
  glossary: readonly FinancialTerm[] = FINANCIAL_GLOSSARY,
): FinancialTerm | undefined {
  return glossary.find((t) => t.id === termId);
}

/**
 * Search the glossary by keyword (case-insensitive match in term or definition).
 *
 * @param query - Search query string
 * @param glossary - Glossary to search (defaults to built-in)
 * @returns Matching terms
 */
export function searchGlossary(
  query: string,
  glossary: readonly FinancialTerm[] = FINANCIAL_GLOSSARY,
): FinancialTerm[] {
  const lower = query.toLowerCase();
  return glossary.filter(
    (t) => t.term.toLowerCase().includes(lower) || t.definition.toLowerCase().includes(lower),
  );
}

/**
 * Filter glossary by difficulty level.
 *
 * @param difficulty - Difficulty to filter by
 * @param glossary - Glossary to search (defaults to built-in)
 * @returns Matching terms
 */
export function filterByDifficulty(
  difficulty: DifficultyLevel,
  glossary: readonly FinancialTerm[] = FINANCIAL_GLOSSARY,
): FinancialTerm[] {
  return glossary.filter((t) => t.difficulty === difficulty);
}

/**
 * Filter glossary by category.
 *
 * @param category - Category to filter by
 * @param glossary - Glossary to search (defaults to built-in)
 * @returns Matching terms
 */
export function filterByCategory(
  category: string,
  glossary: readonly FinancialTerm[] = FINANCIAL_GLOSSARY,
): FinancialTerm[] {
  return glossary.filter((t) => t.category === category);
}

/**
 * Get related terms for a given term.
 *
 * @param termId - Term identifier to find relations for
 * @param glossary - Glossary to search (defaults to built-in)
 * @returns Array of related terms
 */
export function getRelatedTerms(
  termId: string,
  glossary: readonly FinancialTerm[] = FINANCIAL_GLOSSARY,
): FinancialTerm[] {
  const term = lookupTerm(termId, glossary);
  if (!term) return [];
  return term.relatedTermIds
    .map((id) => lookupTerm(id, glossary))
    .filter((t): t is FinancialTerm => t !== undefined);
}

// ---------------------------------------------------------------------------
// Education content functions
// ---------------------------------------------------------------------------

/**
 * Look up education content by concept key.
 *
 * @param conceptKey - Concept key (e.g., "compound_interest")
 * @param content - Content array (defaults to built-in)
 * @returns Matching content or undefined
 */
export function getContentByConceptKey(
  conceptKey: string,
  content: readonly EducationContent[] = EDUCATION_CONTENT,
): EducationContent | undefined {
  return content.find((c) => c.conceptKey === conceptKey);
}

/**
 * Filter education content by difficulty level.
 *
 * @param difficulty - Difficulty level
 * @param content - Content array (defaults to built-in)
 * @returns Matching content
 */
export function filterContentByDifficulty(
  difficulty: DifficultyLevel,
  content: readonly EducationContent[] = EDUCATION_CONTENT,
): EducationContent[] {
  return content.filter((c) => c.difficulty === difficulty);
}

// ---------------------------------------------------------------------------
// Completion tracking
// ---------------------------------------------------------------------------

/**
 * Mark a content item as viewed.
 *
 * @param completions - Current completions
 * @param contentId - Content ID to mark viewed
 * @param date - View date (ISO string)
 * @returns Updated completions array
 */
export function markViewed(
  completions: readonly ContentCompletion[],
  contentId: string,
  date: string,
): ContentCompletion[] {
  const existing = completions.find((c) => c.contentId === contentId);
  if (existing) {
    return completions.map((c) =>
      c.contentId === contentId ? { ...c, viewed: true, viewedDate: c.viewedDate ?? date } : c,
    );
  }
  return [...completions, { contentId, viewed: true, viewedDate: date, understood: false }];
}

/**
 * Mark a content item as understood.
 *
 * @param completions - Current completions
 * @param contentId - Content ID to mark understood
 * @param date - Date (ISO string)
 * @returns Updated completions array
 */
export function markUnderstood(
  completions: readonly ContentCompletion[],
  contentId: string,
  date: string,
): ContentCompletion[] {
  const existing = completions.find((c) => c.contentId === contentId);
  if (existing) {
    return completions.map((c) =>
      c.contentId === contentId
        ? { ...c, viewed: true, viewedDate: c.viewedDate ?? date, understood: true }
        : c,
    );
  }
  return [...completions, { contentId, viewed: true, viewedDate: date, understood: true }];
}

/**
 * Calculate education progress from completions and content.
 *
 * @param completions - User's content completions
 * @param content - All available content (defaults to built-in)
 * @returns Education progress summary
 */
export function calculateEducationProgress(
  completions: readonly ContentCompletion[],
  content: readonly EducationContent[] = EDUCATION_CONTENT,
): EducationProgress {
  const totalItems = content.length;
  if (totalItems === 0) {
    return {
      totalItems: 0,
      viewedCount: 0,
      understoodCount: 0,
      completionPercent: 0,
      byDifficulty: {
        beginner: { total: 0, viewed: 0 },
        intermediate: { total: 0, viewed: 0 },
        advanced: { total: 0, viewed: 0 },
      },
    };
  }

  const completionMap = new Map(completions.map((c) => [c.contentId, c]));
  const viewedCount = completions.filter((c) => c.viewed).length;
  const understoodCount = completions.filter((c) => c.understood).length;

  const byDifficulty: Record<DifficultyLevel, { total: number; viewed: number }> = {
    beginner: { total: 0, viewed: 0 },
    intermediate: { total: 0, viewed: 0 },
    advanced: { total: 0, viewed: 0 },
  };

  for (const item of content) {
    byDifficulty[item.difficulty].total++;
    const completion = completionMap.get(item.id);
    if (completion?.viewed) {
      byDifficulty[item.difficulty].viewed++;
    }
  }

  return {
    totalItems,
    viewedCount,
    understoodCount,
    completionPercent: Math.round((viewedCount / totalItems) * 100),
    byDifficulty,
  };
}
