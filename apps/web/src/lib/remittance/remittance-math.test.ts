// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for remittance FX / fee / received-amount math (issue #2170).
 *
 * Covers: additive vs inclusive fee models, reference-rate cost analysis,
 * deterministic round-half-up behaviour, cross-precision currencies
 * (USD/MXN 2dp, JPY 0dp), clamping, and input validation.
 */

import { describe, it, expect } from 'vitest';

import {
  amountReceivedMinor,
  convertMinorUnits,
  effectiveFxRate,
  quoteRemittance,
  roundHalfUp,
  totalCostMinor,
} from './remittance-math';
import type { RemittanceQuoteInput } from './remittance-types';

describe('roundHalfUp', () => {
  it('rounds halves up toward +infinity', () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(16.5)).toBe(17);
  });

  it('rounds non-halves to the nearest integer', () => {
    expect(roundHalfUp(2.4)).toBe(2);
    expect(roundHalfUp(2.6)).toBe(3);
    expect(roundHalfUp(1.4999)).toBe(1);
  });

  it('documents the negative-tie behaviour (toward +infinity)', () => {
    // -0.5 ties up to 0 (Math.round yields -0, which is === 0).
    expect(roundHalfUp(-0.5) === 0).toBe(true);
    expect(roundHalfUp(-2.5)).toBe(-2);
  });
});

describe('convertMinorUnits', () => {
  it('converts same-precision currencies (USD->MXN, 2dp)', () => {
    // 500.00 USD at 17.0 -> 8500.00 MXN
    expect(convertMinorUnits(50_000, 17.0, 2, 2)).toBe(850_000);
  });

  it('converts to a 0dp currency (USD->JPY)', () => {
    // 100.00 USD at 149.5 -> 14950 JPY
    expect(convertMinorUnits(10_000, 149.5, 2, 0)).toBe(14_950);
  });

  it('converts from a 0dp currency (JPY->USD)', () => {
    // 10000 JPY at 0.0067 -> 67.00 USD
    expect(convertMinorUnits(10_000, 0.0067, 0, 2)).toBe(6_700);
  });

  it('rounds ties up (half-up) at minor-unit resolution', () => {
    expect(convertMinorUnits(1, 16.5, 2, 2)).toBe(17); // 16.5 -> 17
    expect(convertMinorUnits(5, 0.5, 2, 2)).toBe(3); // 2.5 -> 3
    expect(convertMinorUnits(100, 0.5, 2, 0)).toBe(1); // 0.5 -> 1
  });
});

describe('quoteRemittance — additive fee model', () => {
  const input: RemittanceQuoteInput = {
    sendAmountMinor: 50_000, // $500.00
    feeMinor: 500, // $5.00
    fxRate: 17.0,
    feeModel: 'ADDITIVE',
    sourceCurrency: 'USD',
    destCurrency: 'MXN',
    referenceRate: 17.5,
  };

  it('converts the full send amount and charges the fee on top', () => {
    const q = quoteRemittance(input);
    expect(q.principalMinor).toBe(50_000);
    expect(q.totalPaidMinor).toBe(50_500); // send + fee
    expect(q.receivedMinor).toBe(850_000); // 500 * 17.0 = 8500.00 MXN
  });

  it('computes the effective (after-fee) rate below the applied rate', () => {
    const q = quoteRemittance(input);
    expect(q.appliedRate).toBe(17.0);
    // 8500 / 505 = 16.8316...
    expect(q.effectiveRate).toBeCloseTo(16.831683, 5);
    expect(q.effectiveRate).toBeLessThan(q.appliedRate);
  });

  it('computes fee + FX-spread cost against the mid-market reference', () => {
    const q = quoteRemittance(input);
    expect(q.midMarketReceivedMinor).toBe(883_750); // 505 * 17.5
    expect(q.shortfallInDestMinor).toBe(33_750);
    expect(q.totalCostMinor).toBe(1_929); // 337.50 MXN / 17.5 -> $19.29
    expect(q.fxSpreadCostMinor).toBe(1_429); // total cost minus the $5 fee
  });
});

describe('quoteRemittance — inclusive fee model', () => {
  const input: RemittanceQuoteInput = {
    sendAmountMinor: 50_000, // $500.00 total leaves the sender
    feeMinor: 500, // $5.00 taken out first
    fxRate: 17.0,
    feeModel: 'INCLUSIVE',
    sourceCurrency: 'USD',
    destCurrency: 'MXN',
    referenceRate: 17.5,
  };

  it('deducts the fee before converting and pays exactly the send amount', () => {
    const q = quoteRemittance(input);
    expect(q.principalMinor).toBe(49_500); // 500 - 5 = 495 converted
    expect(q.totalPaidMinor).toBe(50_000); // sender pays exactly $500
    expect(q.receivedMinor).toBe(841_500); // 495 * 17.0 = 8415.00 MXN
  });

  it('receives less than the additive model for the same fee', () => {
    const additive = quoteRemittance({ ...input, feeModel: 'ADDITIVE' });
    const inclusive = quoteRemittance(input);
    expect(inclusive.receivedMinor).toBeLessThan(additive.receivedMinor);
  });

  it('computes cost against the mid-market reference', () => {
    const q = quoteRemittance(input);
    expect(q.midMarketReceivedMinor).toBe(875_000); // 500 * 17.5
    expect(q.shortfallInDestMinor).toBe(33_500);
    expect(q.totalCostMinor).toBe(1_914); // 335.00 MXN / 17.5 -> $19.14 (rounded)
    expect(q.fxSpreadCostMinor).toBe(1_414);
  });
});

describe('quoteRemittance — without a reference rate', () => {
  it('returns null cost fields but still computes received + effective rate', () => {
    const q = quoteRemittance({
      sendAmountMinor: 50_000,
      feeMinor: 500,
      fxRate: 17.0,
      feeModel: 'ADDITIVE',
      sourceCurrency: 'USD',
      destCurrency: 'MXN',
    });
    expect(q.receivedMinor).toBe(850_000);
    expect(q.referenceRate).toBeNull();
    expect(q.midMarketReceivedMinor).toBeNull();
    expect(q.shortfallInDestMinor).toBeNull();
    expect(q.totalCostMinor).toBeNull();
    expect(q.fxSpreadCostMinor).toBeNull();
  });
});

describe('quoteRemittance — edge cases', () => {
  it('with a zero fee, the effective rate equals the applied rate', () => {
    const q = quoteRemittance({
      sendAmountMinor: 10_000,
      feeMinor: 0,
      fxRate: 18.0,
      feeModel: 'ADDITIVE',
      sourceCurrency: 'USD',
      destCurrency: 'MXN',
    });
    expect(q.effectiveRate).toBeCloseTo(q.appliedRate, 10);
    expect(q.receivedMinor).toBe(180_000);
  });

  it('clamps the principal to zero when an inclusive fee meets the send amount', () => {
    const q = quoteRemittance({
      sendAmountMinor: 500,
      feeMinor: 500,
      fxRate: 17.0,
      feeModel: 'INCLUSIVE',
      sourceCurrency: 'USD',
      destCurrency: 'MXN',
    });
    expect(q.principalMinor).toBe(0);
    expect(q.receivedMinor).toBe(0);
    expect(q.effectiveRate).toBe(0);
  });

  it('clamps the principal to zero when an inclusive fee exceeds the send amount', () => {
    const q = quoteRemittance({
      sendAmountMinor: 500,
      feeMinor: 800,
      fxRate: 17.0,
      feeModel: 'INCLUSIVE',
      sourceCurrency: 'USD',
      destCurrency: 'MXN',
    });
    expect(q.principalMinor).toBe(0);
    expect(q.receivedMinor).toBe(0);
  });

  it('handles a 0dp destination currency (USD->JPY) with rounding', () => {
    const q = quoteRemittance({
      sendAmountMinor: 10_000, // $100.00
      feeMinor: 0,
      fxRate: 149.567,
      feeModel: 'ADDITIVE',
      sourceCurrency: 'USD',
      destCurrency: 'JPY',
    });
    // 100 * 149.567 = 14956.7 -> 14957 yen (round half up at integer yen)
    expect(q.receivedMinor).toBe(14_957);
  });

  it('records a favourable margin as a negative FX-spread cost', () => {
    // Provider rate (17.6) beats the reference (17.5).
    const q = quoteRemittance({
      sendAmountMinor: 50_000,
      feeMinor: 0,
      fxRate: 17.6,
      feeModel: 'ADDITIVE',
      sourceCurrency: 'USD',
      destCurrency: 'MXN',
      referenceRate: 17.5,
    });
    expect(q.fxSpreadCostMinor).not.toBeNull();
    expect(q.fxSpreadCostMinor!).toBeLessThan(0);
  });
});

describe('quoteRemittance — validation', () => {
  const base: RemittanceQuoteInput = {
    sendAmountMinor: 50_000,
    feeMinor: 500,
    fxRate: 17.0,
    feeModel: 'ADDITIVE',
    sourceCurrency: 'USD',
    destCurrency: 'MXN',
  };

  it('rejects non-integer minor amounts', () => {
    expect(() => quoteRemittance({ ...base, sendAmountMinor: 100.5 })).toThrow(RangeError);
    expect(() => quoteRemittance({ ...base, feeMinor: 4.2 })).toThrow(RangeError);
  });

  it('rejects negative amounts', () => {
    expect(() => quoteRemittance({ ...base, sendAmountMinor: -1 })).toThrow(RangeError);
    expect(() => quoteRemittance({ ...base, feeMinor: -1 })).toThrow(RangeError);
  });

  it('rejects non-positive or non-finite rates', () => {
    expect(() => quoteRemittance({ ...base, fxRate: 0 })).toThrow(RangeError);
    expect(() => quoteRemittance({ ...base, fxRate: -1 })).toThrow(RangeError);
    expect(() => quoteRemittance({ ...base, fxRate: Number.NaN })).toThrow(RangeError);
    expect(() => quoteRemittance({ ...base, referenceRate: 0 })).toThrow(RangeError);
    expect(() => quoteRemittance({ ...base, referenceRate: -2 })).toThrow(RangeError);
  });
});

describe('focused helper wrappers', () => {
  const input: RemittanceQuoteInput = {
    sendAmountMinor: 50_000,
    feeMinor: 500,
    fxRate: 17.0,
    feeModel: 'ADDITIVE',
    sourceCurrency: 'USD',
    destCurrency: 'MXN',
    referenceRate: 17.5,
  };

  it('amountReceivedMinor matches the quote', () => {
    expect(amountReceivedMinor(input)).toBe(quoteRemittance(input).receivedMinor);
  });

  it('effectiveFxRate matches the quote', () => {
    expect(effectiveFxRate(input)).toBe(quoteRemittance(input).effectiveRate);
  });

  it('totalCostMinor matches the quote and is null without a reference rate', () => {
    expect(totalCostMinor(input)).toBe(quoteRemittance(input).totalCostMinor);
    const noRef: RemittanceQuoteInput = {
      sendAmountMinor: 50_000,
      feeMinor: 500,
      fxRate: 17.0,
      feeModel: 'ADDITIVE',
      sourceCurrency: 'USD',
      destCurrency: 'MXN',
    };
    expect(totalCostMinor(noRef)).toBeNull();
  });
});
