// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { ReportClosedTaxLot } from './capital-gains-reporting';
import { mapBroker1099BRows, reconcileBroker1099B } from './broker-1099b-reconciliation';

const appLots: ReportClosedTaxLot[] = [
  {
    saleId: 'sale-1',
    lotId: 'lot-1',
    symbol: 'AAPL',
    acquiredDate: '2024-01-01',
    soldDate: '2025-02-01',
    shares: 2,
    proceeds: 300_00,
    costBasis: 200_00,
    gainLoss: 100_00,
    term: 'LONG_TERM',
    saleFeesAllocated: 5_00,
    taxableGainLoss: 90_00,
    washSaleDisallowedLoss: 10_00,
  },
  {
    saleId: 'sale-2',
    lotId: 'lot-2',
    symbol: 'MSFT',
    acquiredDate: '2024-03-01',
    soldDate: '2025-03-01',
    shares: 1,
    proceeds: 150_00,
    costBasis: 100_00,
    gainLoss: 50_00,
    term: 'SHORT_TERM',
    saleFeesAllocated: 0,
    taxableGainLoss: 50_00,
    washSaleDisallowedLoss: 0,
  },
];

describe('broker-1099b-reconciliation', () => {
  it('maps broker CSV rows including covered status, fees, and wash-sale adjustments', () => {
    const rows = mapBroker1099BRows(
      [
        {
          SaleId: 'sale-1',
          Symbol: 'aapl',
          LotId: 'lot-1',
          Acquired: '2024-01-01',
          Sold: '2025-02-01',
          Shares: '2',
          Proceeds: '$300.00',
          Basis: '$200.00',
          Fees: '$5.00',
          Covered: 'covered',
          Wash: '$10.00',
        },
      ],
      {
        saleId: 'SaleId',
        symbol: 'Symbol',
        lotId: 'LotId',
        acquiredDate: 'Acquired',
        soldDate: 'Sold',
        shares: 'Shares',
        proceedsCents: 'Proceeds',
        costBasisCents: 'Basis',
        feesCents: 'Fees',
        covered: 'Covered',
        washSaleAdjustmentCents: 'Wash',
      },
    );

    expect(rows[0]).toMatchObject({
      symbol: 'AAPL',
      proceedsCents: 300_00,
      feesCents: 5_00,
      covered: true,
      washSaleAdjustmentCents: 10_00,
    });
  });

  it('reconciles matching lots and highlights variances', () => {
    const brokerLots = mapBroker1099BRows(
      [
        {
          SaleId: 'sale-1',
          Symbol: 'AAPL',
          LotId: 'lot-1',
          Acquired: '2024-01-01',
          Sold: '2025-02-01',
          Shares: '2',
          Proceeds: '30000',
          Basis: '21000',
          Fees: '500',
          Wash: '1000',
        },
        {
          SaleId: 'sale-3',
          Symbol: 'TSLA',
          LotId: 'lot-3',
          Acquired: '2024-01-01',
          Sold: '2025-03-01',
          Shares: '1',
          Proceeds: '9000',
          Basis: '8000',
          Fees: '0',
          Wash: '0',
        },
      ],
      {
        saleId: 'SaleId',
        symbol: 'Symbol',
        lotId: 'LotId',
        acquiredDate: 'Acquired',
        soldDate: 'Sold',
        shares: 'Shares',
        proceedsCents: 'Proceeds',
        costBasisCents: 'Basis',
        feesCents: 'Fees',
        washSaleAdjustmentCents: 'Wash',
      },
    );

    const reconciliation = reconcileBroker1099B({ appLots, brokerLots });

    expect(reconciliation.find((row) => row.key === 'sale-1:lot-1')).toMatchObject({
      status: 'variance',
      differences: [
        { field: 'costBasisCents', appValue: 200_00, brokerValue: 210_00, variance: 10_00 },
      ],
    });
    expect(reconciliation.find((row) => row.key === 'sale-2:lot-2')?.status).toBe(
      'missing-in-broker',
    );
    expect(reconciliation.find((row) => row.key === 'sale-3:lot-3')?.status).toBe('missing-in-app');
  });
});
