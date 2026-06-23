// SPDX-License-Identifier: BUSL-1.1

/**
 * Plain-language beginner explainers for people who are new to the US pay and
 * tax system.
 *
 * Many newcomers file taxes with an ITIN instead of an SSN, work a mix of W-2
 * and 1099 jobs, and are learning ideas like tax withholding and 401(k)
 * retirement accounts for the first time. The copy here is deliberately clear,
 * non-judgmental, and reading-level friendly. It never assumes a salaried
 * worker with an SSN.
 *
 * This is educational content only — not tax, legal, or financial advice.
 *
 * References: issue #2178
 */

export interface NewcomerExplainer {
  /** Stable identifier used for surfacing and tailoring. */
  id: NewcomerExplainerKey;
  /** Short, human-friendly title (for the dialog heading). */
  title: string;
  /** Question-style label for the button that opens the explainer. */
  linkLabel: string;
  /** Plain-language description of the concept. */
  body: string;
  /** Why it matters to the person's money, in everyday terms. */
  whyItMatters: string;
}

/**
 * Canonical order for newcomer explainers. Tailoring always returns explainers
 * in this order so the UI is predictable for keyboard and screen-reader users.
 */
export const NEWCOMER_EXPLAINER_KEYS = [
  'w2',
  'form1099',
  'taxWithholding',
  'retirement401k',
  'itinBasics',
] as const;

export type NewcomerExplainerKey = (typeof NEWCOMER_EXPLAINER_KEYS)[number];

export const newcomerExplainers: Record<NewcomerExplainerKey, NewcomerExplainer> = {
  w2: {
    id: 'w2',
    title: 'W-2 income',
    linkLabel: 'What is a W-2?',
    body: 'A W-2 job is one where your employer takes taxes out of each paycheck for you. After the year ends, they send you a form called a W-2 that totals what you earned and what was withheld.',
    whyItMatters:
      'Because taxes are already taken out, your take-home pay is usually steady and easier to budget. The W-2 form is the paperwork you use to file your taxes.',
  },
  form1099: {
    id: 'form1099',
    title: '1099 income',
    linkLabel: 'What is a 1099?',
    body: 'A 1099 is the form you may get for contract, gig, or freelance work where no taxes are taken out of your pay. You receive the full amount, and you are responsible for the taxes on it later.',
    whyItMatters:
      'Since nothing is withheld for you, it helps to set aside roughly a quarter to a third of each payment for taxes so a tax bill later does not catch you by surprise.',
  },
  taxWithholding: {
    id: 'taxWithholding',
    title: 'Tax withholding',
    linkLabel: 'What is tax withholding?',
    body: 'Withholding is the part of your pay that an employer sends to the government for taxes before you ever see it. It is like paying your taxes a little at a time across the year.',
    whyItMatters:
      'Withholding decides how much lands in your bank account each payday. If too little is withheld you may owe at tax time; if too much is withheld you may get a refund.',
  },
  retirement401k: {
    id: 'retirement401k',
    title: '401(k) retirement account',
    linkLabel: 'What is a 401(k)?',
    body: 'A 401(k) is a savings account for retirement that some jobs offer. You choose an amount to take from each paycheck, and it goes into the account to invest for the future.',
    whyItMatters:
      'Many employers add extra money when you contribute, which is often called a match. That match is added pay for your future, so it is usually worth checking whether your job offers one.',
  },
  itinBasics: {
    id: 'itinBasics',
    title: 'ITIN (Individual Taxpayer Identification Number)',
    linkLabel: 'Using an ITIN',
    body: 'An ITIN is a number the tax agency gives to people who need to file taxes but do not have a Social Security Number. It is used only for taxes and does not change your immigration status or give work permission.',
    whyItMatters:
      'You can file taxes, budget, and save with an ITIN. Many banks and credit unions also open accounts for ITIN holders, so it is worth asking which documents a bank accepts.',
  },
};

/** Returns the explainer for a single key. */
export function getNewcomerExplainer(key: NewcomerExplainerKey): NewcomerExplainer {
  return newcomerExplainers[key];
}

/**
 * Returns the requested explainers in canonical order with duplicates removed.
 * When no keys are provided, returns every explainer in canonical order.
 */
export function listNewcomerExplainers(
  keys?: readonly NewcomerExplainerKey[],
): NewcomerExplainer[] {
  const requested = keys ? new Set(keys) : null;
  return NEWCOMER_EXPLAINER_KEYS.filter((key) => requested === null || requested.has(key)).map(
    (key) => newcomerExplainers[key],
  );
}
