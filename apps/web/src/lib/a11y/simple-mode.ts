// SPDX-License-Identifier: BUSL-1.1

export type SimpleModeSurface =
  'dashboard' | 'transactions' | 'budgets' | 'bills' | 'goals' | 'reports' | 'settings';

export interface SimpleModePlan {
  surface: SimpleModeSurface;
  heading: string;
  primaryAction: string;
  visibleRegions: readonly string[];
  collapsedRegions: readonly string[];
  suppressedPatterns: readonly string[];
}

const SIMPLE_MODE_PLANS: Record<SimpleModeSurface, SimpleModePlan> = {
  dashboard: {
    surface: 'dashboard',
    heading: 'Today at a glance',
    primaryAction: 'Add transaction',
    visibleRegions: ['balance summary', 'upcoming bills', 'recent transactions'],
    collapsedRegions: ['trend charts', 'gamification', 'advanced insights'],
    suppressedPatterns: ['promotional prompt', 'non-critical celebration'],
  },
  transactions: {
    surface: 'transactions',
    heading: 'Transactions',
    primaryAction: 'Add transaction',
    visibleRegions: ['search', 'recent transaction cards', 'filters summary'],
    collapsedRegions: ['bulk tools', 'advanced filters', 'import diagnostics'],
    suppressedPatterns: ['duplicate nudge'],
  },
  budgets: {
    surface: 'budgets',
    heading: 'Budget check-in',
    primaryAction: 'Review over-budget items',
    visibleRegions: ['month status', 'needs attention', 'planned spending'],
    collapsedRegions: ['variance analytics', 'forecast chart'],
    suppressedPatterns: ['streak prompt'],
  },
  bills: {
    surface: 'bills',
    heading: 'Bills',
    primaryAction: 'Mark bill paid',
    visibleRegions: ['due soon', 'overdue', 'autopay status'],
    collapsedRegions: ['provider analytics', 'historical payment chart'],
    suppressedPatterns: ['upsell prompt'],
  },
  goals: {
    surface: 'goals',
    heading: 'Goals',
    primaryAction: 'Update progress',
    visibleRegions: ['active goals', 'next contribution', 'recent milestone'],
    collapsedRegions: ['projection details', 'celebration effects'],
    suppressedPatterns: ['non-critical celebration'],
  },
  reports: {
    surface: 'reports',
    heading: 'Reports',
    primaryAction: 'Choose report',
    visibleRegions: ['plain-language summary', 'saved reports'],
    collapsedRegions: ['comparison charts', 'export automation'],
    suppressedPatterns: ['advanced insight'],
  },
  settings: {
    surface: 'settings',
    heading: 'Settings',
    primaryAction: 'Review accessibility preferences',
    visibleRegions: ['accessibility', 'privacy', 'account'],
    collapsedRegions: ['developer diagnostics', 'sync internals'],
    suppressedPatterns: ['beta promotion'],
  },
};

const PLAIN_LANGUAGE_TERMS: Record<string, string> = {
  variance: 'difference from plan',
  reconciliation: 'match records',
  liquidity: 'money available soon',
  amortization: 'loan payoff schedule',
  allocation: 'how money is split',
  principal: 'amount you borrowed',
  accrued: 'built up',
  delinquent: 'past due',
  disbursement: 'money paid out',
  installment: 'scheduled payment',
  overdraft: 'spending past zero',
  utilization: 'how much credit you use',
};

export function getSimpleModePlan(surface: SimpleModeSurface): SimpleModePlan {
  return SIMPLE_MODE_PLANS[surface];
}

export function simplifyFinancialCopy(copy: string): string {
  return Object.entries(PLAIN_LANGUAGE_TERMS).reduce((result, [term, replacement]) => {
    const pattern = new RegExp(`\\b${term}\\b`, 'gi');
    return result.replace(pattern, replacement);
  }, copy);
}

export function shouldSuppressInSimpleMode(notificationText: string): boolean {
  const normalized = notificationText.toLowerCase();
  return Object.values(SIMPLE_MODE_PLANS).some((plan) =>
    plan.suppressedPatterns.some((pattern) => normalized.includes(pattern)),
  );
}

// ---------------------------------------------------------------------------
// Cognitive-accessibility persona validation (#2505, follow-up to #2280)
//
// Simple-mode copy is validated against representative cognitive-accessibility
// personas: plain-language replacements, progressive disclosure (one primary
// action + collapsed advanced regions), and low-cognitive-load sentences on
// high-stakes flows. The helpers below make that validation executable so the
// checks run in CI instead of only living in a review checklist.
// ---------------------------------------------------------------------------

export interface CognitiveAccessibilityPersona {
  id: string;
  name: string;
  summary: string;
  needs: readonly string[];
  highStakesFlows: readonly string[];
}

export const COGNITIVE_PERSONAS: readonly CognitiveAccessibilityPersona[] = [
  {
    id: 'maria-early-dementia',
    name: 'Maria, early-stage memory changes',
    summary:
      'Recently diagnosed with mild cognitive impairment; manages her own money but tires quickly with dense screens.',
    needs: [
      'one clear next action per screen',
      'plain-language labels without financial jargon',
      'no time pressure or surprise state changes',
    ],
    highStakesFlows: ['bills', 'transactions'],
  },
  {
    id: 'devon-adhd',
    name: 'Devon, ADHD and executive-function load',
    summary:
      'Easily overwhelmed by competing prompts; abandons tasks when non-essential nudges interrupt a decision.',
    needs: [
      'suppressed promotional and celebration prompts',
      'progressive disclosure of advanced analytics',
      'short sentences that keep the primary decision in view',
    ],
    highStakesFlows: ['budgets', 'goals'],
  },
  {
    id: 'sam-low-numeracy',
    name: 'Sam, low numeracy and reading anxiety',
    summary:
      'Finds financial vocabulary intimidating; relies on plain summaries before trusting a number or report.',
    needs: [
      'plain-language summaries ahead of charts',
      'reading level around grade 8 or lower on key copy',
      'consistent single primary action wording',
    ],
    highStakesFlows: ['reports', 'dashboard'],
  },
];

export interface CopyValidationIssue {
  kind: 'jargon' | 'long-sentence' | 'multi-step-without-disclosure';
  detail: string;
}

export interface CopyValidationResult {
  original: string;
  simplified: string;
  readingGradeEstimate: number;
  issues: CopyValidationIssue[];
  passed: boolean;
}

const JARGON_TERMS = Object.keys(PLAIN_LANGUAGE_TERMS);
const MAX_WORDS_PER_SENTENCE = 18;

function splitSentences(copy: string): string[] {
  return copy
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function estimateReadingGrade(copy: string): number {
  const sentences = splitSentences(copy);
  const words = copy.split(/\s+/).filter((word) => word.length > 0);
  if (sentences.length === 0 || words.length === 0) {
    return 0;
  }
  const avgWordsPerSentence = words.length / sentences.length;
  const longWords = words.filter((word) => word.replace(/[^A-Za-z]/g, '').length >= 9).length;
  const longWordRatio = longWords / words.length;
  // Lightweight readability proxy: longer sentences and more long words raise
  // the estimated grade. Not a formal Flesch-Kincaid score, just a guardrail.
  return Number((0.5 * avgWordsPerSentence + 12 * longWordRatio).toFixed(1));
}

export function validateSimpleModeCopy(copy: string): CopyValidationResult {
  const simplified = simplifyFinancialCopy(copy);
  const issues: CopyValidationIssue[] = [];
  const lowerOriginal = copy.toLowerCase();

  const remainingJargon = JARGON_TERMS.filter((term) =>
    new RegExp(`\\b${term}\\b`, 'i').test(lowerOriginal),
  );
  if (remainingJargon.length > 0) {
    issues.push({
      kind: 'jargon',
      detail: `Replace jargon with plain language: ${remainingJargon.join(', ')}.`,
    });
  }

  for (const sentence of splitSentences(simplified)) {
    const wordCount = sentence.split(/\s+/).filter((word) => word.length > 0).length;
    if (wordCount > MAX_WORDS_PER_SENTENCE) {
      issues.push({
        kind: 'long-sentence',
        detail: `Sentence has ${wordCount} words (limit ${MAX_WORDS_PER_SENTENCE}): "${sentence}".`,
      });
    }
  }

  const thenSteps = (lowerOriginal.match(/\bthen\b/g) ?? []).length;
  const hasStepMarkers = /\bstep\s*\d/i.test(copy) || /(^|\n)\s*\d+[.)]/.test(copy);
  if (thenSteps >= 2 && !hasStepMarkers) {
    issues.push({
      kind: 'multi-step-without-disclosure',
      detail: 'Multi-step instructions should use numbered steps or progressive disclosure.',
    });
  }

  return {
    original: copy,
    simplified,
    readingGradeEstimate: estimateReadingGrade(simplified),
    issues,
    passed: issues.length === 0,
  };
}

export interface PersonaSurfaceValidation {
  persona: string;
  surface: SimpleModeSurface;
  singlePrimaryAction: boolean;
  progressiveDisclosure: boolean;
  plainLanguageHeading: boolean;
  passed: boolean;
}

export function validatePersonaCoverage(): PersonaSurfaceValidation[] {
  const results: PersonaSurfaceValidation[] = [];
  for (const persona of COGNITIVE_PERSONAS) {
    for (const surface of persona.highStakesFlows as readonly SimpleModeSurface[]) {
      const plan = getSimpleModePlan(surface);
      const singlePrimaryAction =
        plan.primaryAction.trim().length > 0 && !plan.primaryAction.includes(' and ');
      const progressiveDisclosure = plan.collapsedRegions.length > 0;
      const plainLanguageHeading = validateSimpleModeCopy(plan.heading).passed;
      results.push({
        persona: persona.id,
        surface,
        singlePrimaryAction,
        progressiveDisclosure,
        plainLanguageHeading,
        passed: singlePrimaryAction && progressiveDisclosure && plainLanguageHeading,
      });
    }
  }
  return results;
}
