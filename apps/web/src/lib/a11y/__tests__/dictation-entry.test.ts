// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  applyDictationCorrection,
  buildDictationControlProps,
  buildDictationParsingFeedback,
  buildVoiceInputQaMatrix,
  getVoiceInputTools,
} from '../dictation-entry';

describe('dictation entry helpers', () => {
  it('keeps visible labels at the start of accessible names', () => {
    expect(
      buildDictationControlProps({
        id: 'transaction-amount',
        visibleLabel: 'Amount',
        context: 'transaction entry',
        hint: 'Say an amount such as twelve dollars',
      }),
    ).toEqual({
      id: 'transaction-amount',
      name: 'transaction-amount',
      label: 'Amount',
      'aria-label': 'Amount, transaction entry',
      'aria-describedby': 'transaction-amount-hint',
    });
  });

  it('builds parsing feedback for review and correction', () => {
    expect(
      buildDictationParsingFeedback({
        parsedFields: ['payee', 'amount'],
        missingFields: ['date'],
        suggestions: ['Try saying today for the date'],
      }),
    ).toBe('Parsed payee, amount. Missing: date. Suggestions: Try saying today for the date.');
  });

  it('updates a dictated field without clearing other draft fields', () => {
    const result = applyDictationCorrection(
      { payee: 'Coffee shop', amount: '4.50' },
      'amount',
      '5.25',
    );

    expect(result.draft).toEqual({ payee: 'Coffee shop', amount: '5.25' });
    expect(result.focusField).toBe('amount');
    expect(result.announcement).toBe('amount updated to 5.25. Focus remains on amount.');
  });
});

describe('voice-input transaction-entry QA matrix (#2504)', () => {
  it('covers all five mainstream voice tools', () => {
    const tools = buildVoiceInputQaMatrix().map((qaCase) => qaCase.tool);

    expect(tools).toEqual(getVoiceInputTools());
    expect(new Set(tools).size).toBe(5);
  });

  it('exercises activation by spoken label and correction without focus loss', () => {
    for (const qaCase of buildVoiceInputQaMatrix()) {
      const controlProps = buildDictationControlProps({
        id: `transaction-${qaCase.activationField}`,
        visibleLabel: qaCase.activationField,
        context: 'transaction entry',
      });
      // Spoken (visible) label must lead the accessible name so the tool can
      // activate the control by its on-screen label.
      expect(controlProps['aria-label']).toBe(`${qaCase.activationField}, transaction entry`);

      const correction = applyDictationCorrection(
        { payee: 'Coffee shop' },
        qaCase.correctionField,
        qaCase.correctionValue,
      );
      // Correction keeps focus on the field it edited.
      expect(correction.focusField).toBe(qaCase.correctionField);
      expect(correction.announcement).toContain('Focus remains on');
    }
  });
});
